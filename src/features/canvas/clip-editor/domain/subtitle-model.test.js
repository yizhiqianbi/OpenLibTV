import { describe, expect, it } from 'vitest';
import {
  editSubtitleTrack,
  normalizeSubtitleStyle,
  normalizeSubtitleTrack,
  planTimedTextEntry,
} from './subtitle-model.js';
import {
  effectiveSubtitleTimeline,
  projectSubtitleTextDraft,
  subtitleLoadPlan,
} from './subtitle-document-model.js';
import { mergeSubtitleSources, parseSubtitleVtt, serializeSubtitleVtt } from './subtitle-vtt.js';
import { describeSubtitleOverlay, subtitleOutputRect } from './subtitle-layout-model.js';

const timeline = () => ({ clips: [], currentTime: 4, totalDuration: 5, future: 9 });
const track = () => ({
  visible: true,
  future: 'keep',
  cues: [
    {
      id: 'one',
      startTime: 1,
      endTime: 3,
      text: 'first',
      futureCue: 7,
      style: { color: '#FF0000' },
      settings: 'line:70% position:20% size:40% align:left vertical:rl',
    },
    { id: 'two', startTime: 4, endTime: 6, text: 'second' },
  ],
});
describe('source basic VTT branch', () => {
  it('selects cues at start but inserts at end, and asks for a track on ambiguous multi-row hits', () => {
    const rows = [
      { rowId: 'ordinary:0', kind: 'subtitle', cues: [{ cueId: 'a', startTime: 1, endTime: 2 }] },
    ];
    expect(planTimedTextEntry({ kind: 'subtitle', currentTime: 1, rows })).toMatchObject({
      type: 'select-cue',
      cueId: 'a',
    });
    expect(planTimedTextEntry({ kind: 'subtitle', currentTime: 2, rows })).toMatchObject({
      type: 'insert-cue',
    });
    const multiple = [...rows, { ...rows[0], rowId: 'ordinary:1' }];
    expect(planTimedTextEntry({ kind: 'subtitle', currentTime: 1, rows: multiple }).type).toBe(
      'request-track-choice',
    );
    expect(
      planTimedTextEntry({
        kind: 'subtitle',
        currentTime: 1,
        rows: multiple,
        activeRowId: 'ordinary:1',
      }).rowId,
    ).toBe('ordinary:1');
    expect(
      planTimedTextEntry({ kind: 'subtitle', currentTime: 1, rows: [...rows, rows[0]] }).type,
    ).toBe('unavailable');
  });
  it('adds two seconds, inserts after the requested cue and preserves the original document', () => {
    const before = { ...timeline(), subtitles: track() };
    const result = editSubtitleTrack(before, { kind: 'add', afterId: 'two' });
    expect(result.timeline.subtitles.cues.at(-1)).toMatchObject({
      id: 'subtitle-3',
      startTime: 6,
      endTime: 6.2,
      text: '默认文本',
    });
    expect(before.subtitles.cues).toHaveLength(2);
    expect(result.timeline.future).toBe(9);
    expect(result.timeline.subtitles.future).toBe('keep');
    expect(editSubtitleTrack(timeline(), { kind: 'add' }).timeline.subtitles.cues[0]).toMatchObject(
      { startTime: 4, endTime: 6 },
    );
  });
  it('clamps drag/trim to the source 0.2-second rule and keeps unknown cue data', () => {
    const before = { ...timeline(), subtitles: track() };
    const moved = editSubtitleTrack(before, {
      kind: 'gesture',
      cueId: 'one',
      mode: 'move',
      delta: -8,
    });
    expect(moved.timeline.subtitles.cues[0]).toMatchObject({
      startTime: 0,
      endTime: 2,
      futureCue: 7,
    });
    const trimmed = editSubtitleTrack(before, {
      kind: 'gesture',
      cueId: 'one',
      mode: 'resize-end',
      delta: -9,
    });
    expect(trimmed.timeline.subtitles.cues[0].endTime).toBe(1.2);
    expect(
      editSubtitleTrack(before, { kind: 'gesture', cueId: 'missing', delta: 1 }).timeline,
    ).toBe(before);
  });
  it('edits VTT styles globally, clears per-cue styles on apply-all and leaves video data alone', () => {
    const before = {
      ...timeline(),
      subtitles: { ...track(), classStyles: { red: { color: '#FF0000' } } },
    };
    const styled = editSubtitleTrack(before, {
      kind: 'style',
      cueId: 'one',
      style: { fontSizePx: 200, letterSpacingPx: -2, color: '#FFFF00' },
    });
    expect(styled.timeline.subtitles.defaultStyle).toEqual({ fontSizePx: 72, color: '#FFFF00' });
    expect(styled.timeline.clips).toBe(before.clips);
    const all = editSubtitleTrack(styled.timeline, { kind: 'apply-all', cueId: 'one' });
    expect(all.timeline.subtitles.classStyles).toBeUndefined();
    expect(
      all.timeline.subtitles.cues.every((cue) => !cue.style && cue.settings.includes('line:70%')),
    ).toBe(true);
    expect(all.timeline.subtitles.cues[0].futureCue).toBe(7);
  });
  it('keeps an intentional empty track instead of reloading the original source after delete', () => {
    const before = {
      ...timeline(),
      subtitles: { visible: false, sourceUrl: '/old.vtt', cues: [track().cues[0]] },
    };
    const removed = editSubtitleTrack(before, { kind: 'delete', cueId: 'one' });
    expect(removed.timeline.subtitles).toMatchObject({
      userCleared: true,
      sourceUrl: '/old.vtt',
      cues: [],
    });
    expect(subtitleLoadPlan(removed.timeline).ready).toBe(true);
    expect(normalizeSubtitleStyle({ fontSizeVh: 4, strokeOpacity: 0 })).toEqual({
      fontSizeVh: 4,
      strokeOpacity: 0,
    });
  });

  it('keeps source clip ownership and supports per-clip visibility and deletion', () => {
    const before = {
      ...timeline(),
      subtitles: {
        visible: true,
        cues: [
          { id: 'main-cue', clipId: 'main', startTime: 0, endTime: 1, text: '主片' },
          { id: 'next-cue', clipId: 'next', startTime: 1, endTime: 2, text: '下一片' },
        ],
      },
    };
    const hidden = editSubtitleTrack(before, {
      kind: 'clip-visible',
      clipId: 'main',
      visible: false,
    });
    expect(hidden.timeline.subtitles.cues).toEqual([
      { ...before.subtitles.cues[0], hidden: true },
      before.subtitles.cues[1],
    ]);
    const shown = editSubtitleTrack(hidden.timeline, {
      kind: 'clip-visible',
      clipId: 'main',
      visible: true,
    });
    expect(shown.timeline.subtitles.cues[0]).toEqual(before.subtitles.cues[0]);
    const deleted = editSubtitleTrack(before, { kind: 'clip-delete', clipId: 'main' });
    expect(deleted.timeline.subtitles.cues).toEqual([before.subtitles.cues[1]]);
  });
  it('parses real VTT timing/styles/class parts and never interprets arbitrary HTML as DOM', () => {
    const raw =
      'WEBVTT\n\nSTYLE\n::cue { font-size: 33px; color: #FFFF00; }\n::cue(.red) { color: red; }\n\nline-id\n00:00:01.000 --> 00:00:03.000 line:80%\n<c.red>你好</c>\nworld\n\nNOTE ignored\ncomment\n';
    const parsed = parseSubtitleVtt(raw, '/captured.vtt');
    expect(parsed).toMatchObject({
      sourceUrl: '/captured.vtt',
      rawVtt: raw,
      defaultStyle: { fontSizePx: 33, color: '#FFFF00' },
    });
    expect(parsed.cues[0]).toMatchObject({
      id: 'line-id',
      startTime: 1,
      endTime: 3,
      text: '你好\nworld',
      settings: 'line:80%',
    });
    expect(parsed.cues[0].textParts[0].className).toBe('red');
    const exported = serializeSubtitleVtt(parsed);
    expect(exported).not.toContain('::cue(.red)');
    expect(exported).toContain('font-weight: 600;');
    expect(exported).toContain('background: transparent;');
    expect(exported).toContain('00:00:01.000 --> 00:00:03.000 line:80%');
    expect(exported).not.toContain('line-id\n');
    expect(parseSubtitleVtt(exported).cues[0].text).toBe('你好\nworld');
    const mixed = parseSubtitleVtt(raw.replace('world', 'world\n<c.red>第三行</c>'));
    expect(mixed.cues[0].text).toBe('你好\nworld\n第三行');
    expect(parseSubtitleVtt(serializeSubtitleVtt(mixed)).cues[0].text).toBe(mixed.cues[0].text);
    expect(() => normalizeSubtitleTrack({ cues: 'broken' })).toThrow('原数据已保留');
  });
  it('maps each split clip through source offset/speed and discards frames cut out of the picture', () => {
    const clips = [
      { id: 'left', sourceNodeId: 'v', startTime: 0, duration: 2, sourceOffset: 2, speed: 2 },
      { id: 'right', sourceNodeId: 'v', startTime: 4, duration: 3, sourceOffset: 6, speed: 1 },
    ];
    const source = { visible: true, cues: [{ id: 's', text: 'source', startTime: 3, endTime: 8 }] };
    const merged = mergeSubtitleSources(
      clips.map((clip) => ({ clipId: clip.id, track: source })),
      clips,
    );
    expect(merged.cues.map((cue) => [cue.startTime, cue.endTime])).toEqual([
      [0.5, 2],
      [4, 6],
    ]);
    expect(merged.cues.map((cue) => cue.clipId)).toEqual(['left', 'right']);
    expect(new Set(merged.cues.map((cue) => cue.id)).size).toBe(2);
    const raw = { ...timeline(), clips, subtitles: undefined };
    const session = {
      timeline: raw,
      subtitleSourceTrack: merged,
      subtitleTextDraft: { cueId: merged.cues[0].id, text: 'last input' },
    };
    expect(effectiveSubtitleTimeline(session).subtitles).toBe(merged);
    expect(projectSubtitleTextDraft(session).subtitles.cues[0].text).toBe('last input');
    expect(raw.subtitles).toBeUndefined();
  });
  it('positions cues through a letterboxed frame and interpolates the content rect during transitions', () => {
    const output = { width: 1000, height: 500 };
    const clips = [
      { id: 'left', width: 500, height: 500 },
      { id: 'right', width: 1000, height: 500 },
    ];
    const rect = subtitleOutputRect(
      { activeVideos: [], transition: { leftClipId: 'left', rightClipId: 'right', progress: 0.5 } },
      { clips },
      output,
    );
    expect(rect).toEqual({ left: 125, top: 0, width: 750, height: 500 });
    const cues = describeSubtitleOverlay(track(), 1, output, rect, 0.5);
    expect(cues[0].style).toMatchObject({
      left: '27.5%',
      top: '70%',
      fontSize: '14px',
      transform: 'translate(0, -50%)',
    });
    expect(describeSubtitleOverlay(track(), 3, output, rect, 1)).toHaveLength(0);
    expect(
      describeSubtitleOverlay({ ...track(), visible: false }, 1, output, rect, 1),
    ).toHaveLength(0);
  });
});
