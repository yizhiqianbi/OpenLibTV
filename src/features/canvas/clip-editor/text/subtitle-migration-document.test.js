import { describe, expect, it } from 'vitest';
import { migrateSubtitleDocuments } from './subtitle-migration-document.js';
import { readSubtitleHtml } from './html-document.js';
import { readHtmlSubtitleStyle } from './subtitle-style-document.js';
import { mergeSubtitleSourcesWithOrigins } from '../domain/subtitle-vtt.js';
const clip = {
  id: 'clip',
  sourceNodeId: 'video',
  type: 'video',
  startTime: 0,
  sourceOffset: 10,
  duration: 4,
  speed: 2,
  width: 320,
  height: 180,
  sourceDuration: 20,
};
const outputSize = { width: 640, height: 360 };
const input = (cues = [{ id: 'one', startTime: 0, endTime: 1, text: '文字' }]) => ({
  currentTrack: { visible: true, cues },
  sources: [{ nodeId: 'video', track: { visible: true, cues: [] } }],
  clips: [clip],
  origins: [],
  outputSize,
});
describe('VTT migration documents and atomic fallback', () => {
  it('creates source-time canonical archives, preserves media URLs and round-trips style/layout', () => {
    const f = input();
    f.currentTrack.defaultStyle = {
      fontSizePx: 36,
      color: '#123456',
      strokeColor: 'rgb(10,20,30)',
      strokeOpacity: 37,
      strokeWidthPx: 2,
    };
    f.currentTrack.cues[0].settings = 'line:70% position:20% size:40% align:left';
    const r = migrateSubtitleDocuments(f);
    expect(r.ok).toBe(true);
    const model = readSubtitleHtml(r.layers[0].html);
    expect(model.cues[0]).toMatchObject({ start: 10, duration: 2, clipId: 'clip', text: '文字' });
    expect(readHtmlSubtitleStyle(model, model.cues[0].cueId, outputSize)).toMatchObject({
      fontSizePx: 36,
      color: '#123456',
      strokeColor: 'rgba(10, 20, 30, 0.37)',
      xPct: 40,
      yPct: 70,
      widthPct: 40,
    });
    expect(r.layers[0].archive.bindingClipIds).toEqual(['clip']);
    expect(f.clips[0]).toBe(clip);
  });
  it('keeps language markup and class overrides without replacing other properties', () => {
    const f = input([
      {
        id: 'one',
        startTime: 0,
        endTime: 1,
        text: '中文\nEnglish',
        textParts: [
          { text: '中文', className: 'cn' },
          { text: 'English', className: 'en' },
        ],
      },
    ]);
    f.currentTrack.classStyles = { cn: { color: '#ff0000' }, en: { fontSizePx: 40 } };
    const r = migrateSubtitleDocuments(f),
      m = readSubtitleHtml(r.layers[0].html);
    expect(m.cues[0].text).toBe('中文\nEnglish');
    const spans = m.cues[0].element.querySelectorAll('[data-lang]');
    expect(spans[0].style.getPropertyValue('--libtvSubtitleColor')).toBe('#ff0000');
    expect(spans[0].style.getPropertyValue('--libtvSubtitleFontSize')).toBe('');
    expect(spans[1].style.getPropertyValue('--libtvSubtitleFontSize')).toBe('20px');
  });
  it('preserves hidden cues and whole-track visibility rather than dropping them', () => {
    const f = input([{ id: 'one', startTime: 0, endTime: 1, text: '隐藏原句', hidden: true }]);
    f.currentTrack.visible = false;
    const r = migrateSubtitleDocuments(f),
      m = readSubtitleHtml(r.layers[0].html);
    expect(m.cues[0]).toMatchObject({ hidden: true, trackHidden: true, text: '隐藏原句' });
    expect(r.layers[0].archive.trackVisible).toBe(false);
  });
  it('keeps a selected repeated instance bound to its corresponding materialized copy', () => {
    const clips = [
        { ...clip, speed: 1 },
        { ...clip, id: 'second', startTime: 6, speed: 1 },
      ],
      track = { visible: true, cues: [{ id: 'old', startTime: 9, endTime: 15, text: '重复' }] },
      merged = mergeSubtitleSourcesWithOrigins(
        clips.map((c) => ({ clipId: c.id, track })),
        clips,
      );
    const r = migrateSubtitleDocuments({
      currentTrack: merged.track,
      sources: clips.map((c) => ({ nodeId: 'video', clipId: c.id, track })),
      clips,
      origins: merged.origins,
      outputSize,
    });
    expect(r.ok).toBe(true);
    expect(r.timelineCueIdMap.get(merged.track.cues[1].id).clipId).toBe('second');
    const m = readSubtitleHtml(r.layers[0].html);
    expect(m.cues).toHaveLength(2);
    expect(m.cues.every((c) => c.start === 9 && c.duration === 6)).toBe(true);
  });
  it('writes an explicit recoverable empty archive after deleting all source instances', () => {
    const track = {
        visible: true,
        cues: [{ id: 'old', startTime: 10, endTime: 12, text: '删除' }],
      },
      merged = mergeSubtitleSourcesWithOrigins([{ clipId: clip.id, track }], [clip]);
    const r = migrateSubtitleDocuments({
      currentTrack: { ...merged.track, cues: [] },
      sources: [{ nodeId: 'video', clipId: clip.id, track }],
      clips: [clip],
      origins: merged.origins,
      outputSize,
    });
    expect(r.ok).toBe(true);
    expect(r.layers[0].archive).toMatchObject({ userCleared: true, bindingClipIds: ['clip'] });
    expect(readSubtitleHtml(r.layers[0].html).cues).toHaveLength(0);
  });
  it('allocates overlapping cues to at most four rows, respects reservations and rejects a fifth without retiming', () => {
    const f = input(
      Array.from({ length: 4 }, (_, i) => ({
        id: `c${i}`,
        startTime: 0,
        endTime: 1,
        text: `原句${i}`,
      })),
    );
    f.reservedTrackIndexes = [0, 2];
    let r = migrateSubtitleDocuments(f);
    expect(r.ok).toBe(true);
    expect(readSubtitleHtml(r.layers[0].html).trackIndexes).toEqual([1, 3, 4, 5]);
    f.currentTrack.cues.push({ id: 'fifth', startTime: 0, endTime: 1, text: '第五句' });
    expect(migrateSubtitleDocuments(f)).toEqual({ ok: false, reason: 'conversion-loss' });
  });
  it('does not clamp a valid VTT vh size to HTML inspector limits and rejects empty content without mutation', () => {
    const f = input();
    f.outputSize = { width: 3840, height: 2160 };
    f.currentTrack.defaultStyle = { fontSizeVh: 30 };
    const r = migrateSubtitleDocuments(f),
      m = readSubtitleHtml(r.layers[0].html);
    expect(readHtmlSubtitleStyle(m, m.cues[0].cueId, f.outputSize).fontSizePx).toBe(648);
    f.currentTrack.cues[0].text = ' ';
    const before = structuredClone(f);
    expect(migrateSubtitleDocuments(f).reason).toBe('empty-cue');
    expect(f).toEqual(before);
  });
});
