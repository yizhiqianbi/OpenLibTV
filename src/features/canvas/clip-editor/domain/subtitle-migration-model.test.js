import { describe, expect, it } from 'vitest';
import { planSubtitleMigration, subtitleMigrationSourcePlan } from './subtitle-migration-model.js';
import { mergeSubtitleSourcesWithOrigins } from './subtitle-vtt.js';
const clip = (id, startTime = 0) => ({
  id,
  sourceNodeId: 'video',
  type: 'video',
  startTime,
  sourceOffset: 10,
  duration: 4,
  speed: 1,
  width: 320,
  height: 180,
});
const source = {
  nodeId: 'video',
  track: {
    visible: true,
    sourceUrl: '/source.vtt',
    cues: [{ id: 'original', startTime: 9, endTime: 15, text: '完整原句' }],
  },
};
function fixture(repeated = true) {
  const clips = [clip('one'), ...(repeated ? [clip('two', 6)] : [])];
  const merged = mergeSubtitleSourcesWithOrigins(
    clips.map((clip) => ({ clipId: clip.id, track: source.track })),
    clips,
  );
  return {
    clips,
    sources: clips.map((clip) => ({ ...source, clipId: clip.id })),
    origins: merged.origins,
    currentTrack: merged.track,
  };
}
describe('lossless VTT migration mapping', () => {
  it('preserves full source clocks behind repeated trimmed timeline instances without mutating inputs', () => {
    const f = fixture(),
      before = structuredClone(f),
      result = planSubtitleMigration(f);
    expect(result.ok).toBe(true);
    expect(result.nodes[0].track.cues[0]).toMatchObject({
      startTime: 9,
      endTime: 15,
      text: '完整原句',
    });
    expect(result.nodes[0].timelineIds.values().next().value).toHaveLength(2);
    expect(f).toEqual(before);
  });
  it('accepts identical repeated edits and rejects inconsistent text, styles or partial deletion', () => {
    const f = fixture();
    f.currentTrack.cues = f.currentTrack.cues.map((cue) => ({
      ...cue,
      text: '一致修改',
      style: { color: '#00ff00' },
    }));
    expect(planSubtitleMigration(f).ok).toBe(true);
    f.currentTrack.cues[1].text = '不一致';
    expect(planSubtitleMigration(f)).toEqual({ ok: false, reason: 'repeated-instance-conflict' });
    f.currentTrack.cues.splice(1);
    expect(planSubtitleMigration(f).reason).toBe('repeated-instance-conflict');
  });
  it('removes a source cue only when all projected instances were deleted', () => {
    const f = fixture();
    f.currentTrack.cues = [];
    const result = planSubtitleMigration(f);
    expect(result.ok).toBe(true);
    expect(result.nodes[0].track.cues).toEqual([]);
  });
  it('uses the epsilon only to recognize untouched projections and refuses incompatible inverse clocks', () => {
    const f = fixture();
    f.currentTrack.cues[0].startTime += 0.001;
    expect(planSubtitleMigration(f).ok).toBe(true);
    f.currentTrack.cues[0].startTime += 0.002;
    expect(planSubtitleMigration(f).reason).toBe('repeated-instance-conflict');
  });
  it('maps a new cue only to one containing non-audio clip', () => {
    const f = fixture(false);
    f.currentTrack.cues.push({ id: 'added', startTime: 0.5, endTime: 1.5, text: '新增' });
    let r = planSubtitleMigration(f);
    expect(r.ok).toBe(true);
    expect(r.nodes[0].track.cues.at(-1)).toMatchObject({
      startTime: 10.5,
      endTime: 11.5,
      text: '新增',
    });
    f.clips.push(clip('overlap'));
    expect(planSubtitleMigration(f).reason).toBe('unmapped-cue');
  });
  it('does not pick an arbitrary side for a cue spanning adjacent clips', () => {
    const f = fixture();
    f.currentTrack.cues.push({ id: 'cross', startTime: 3, endTime: 7, text: '跨片段' });
    expect(planSubtitleMigration(f).reason).toBe('unmapped-cue');
  });
  it('compares duplicate source contents independently of URL/raw bytes and object property order', () => {
    const f = fixture();
    f.sources[1] = {
      nodeId: 'video',
      track: {
        rawVtt: 'different serialization',
        cues: structuredClone(source.track.cues),
        visible: true,
        sourceUrl: '/other.vtt',
      },
    };
    expect(planSubtitleMigration(f).ok).toBe(true);
    f.sources[1].track.defaultStyle = { color: 'red' };
    expect(planSubtitleMigration(f).reason).toBe('conflicting-source-track');
  });
  it('rejects duplicated timeline identities and keeps the source key independent of playhead/volume', () => {
    const f = fixture();
    f.currentTrack.cues[1].id = f.currentTrack.cues[0].id;
    expect(planSubtitleMigration(f).reason).toBe('duplicate-timeline-cue-id');
    const a = subtitleMigrationSourcePlan(f.clips),
      b = subtitleMigrationSourcePlan(f.clips.map((c) => ({ ...c, currentTime: 99, volume: 0 })));
    expect(b.key).toBe(a.key);
    expect(
      subtitleMigrationSourcePlan(f.clips.map((c) => ({ ...c, sourceOffset: 11 }))).key,
    ).not.toBe(a.key);
  });
});
