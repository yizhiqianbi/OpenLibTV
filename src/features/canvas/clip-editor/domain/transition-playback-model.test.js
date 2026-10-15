import { describe, expect, it } from 'vitest';
import { describeClipTransitionPlayback } from './transition-playback-model.js';
import { describeClipTimelinePlayback } from './playback-model.js';

const timeline = () => ({
  videoTrackCount: 1,
  clips: [
    {
      id: 'left',
      sourceNodeId: 'a',
      type: 'video',
      zIndex: 0,
      startTime: 0,
      duration: 5,
      sourceOffset: 3,
      sourceDuration: 20,
      speed: 2,
    },
    {
      id: 'right',
      sourceNodeId: 'b',
      type: 'video',
      zIndex: 0,
      startTime: 5,
      duration: 5,
      sourceOffset: 7,
      sourceDuration: 20,
      transitionIn: { type: 'crossfade', duration: 2 },
    },
  ],
});

describe('source centered transition visual clocks, independent from ordinary audio', () => {
  it.each([
    [4, 0, 11, 7, 'from'],
    [4.5, 0.25, 12, 7, 'from'],
    [5, 0.5, 12.998, 7, 'to'],
    [5.5, 0.75, 12.998, 7.5, 'to'],
    [5.999, 0.9995, 12.998, 7.999, 'to'],
  ])('at %s uses progress %s and source clocks %s/%s', (time, progress, from, to, phase) => {
    const frame = describeClipTransitionPlayback(timeline(), time);
    expect(frame).toMatchObject({ type: 'fade', startTime: 4, endTime: 6, phase });
    expect(frame.progress).toBeCloseTo(progress, 8);
    expect(frame.from.time).toBeCloseTo(from, 8);
    expect(frame.to.time).toBeCloseTo(to, 8);
  });

  it('holds the opposite half and does not shift the ordinary audio/clip clock', () => {
    const value = timeline();
    const early = describeClipTimelinePlayback(value, 4.5);
    expect(early.transition.from.rate).toBeCloseTo(2);
    expect(early.transition.to.rate).toBe(0);
    const late = describeClipTimelinePlayback(value, 5.5);
    expect(late.transition.from.rate).toBe(0);
    expect(late.transition.to.rate).toBeCloseTo(1);
    expect(late.activeVideos.map((entry) => [entry.id, entry.sourceTime])).toEqual([
      ['right', 7.5],
    ]);
    expect(late.unsupportedFlags).not.toContain('transition-preview');
    expect(value).toEqual(timeline());
  });

  it.each([3.999, 6, 9, NaN, Infinity])(
    'is inactive outside the half-open window at %s',
    (time) => {
      expect(describeClipTransitionPlayback(timeline(), time)).toBeNull();
    },
  );

  it('clamps source clocks to the prepared source extent and trimmed end', () => {
    const value = timeline();
    value.clips[0].sourceDuration = 12;
    value.clips[1].sourceDuration = 7.2;
    const frame = describeClipTransitionPlayback(value, 5.5);
    expect(frame.from.time).toBe(11.999);
    expect(frame.to.time).toBeCloseTo(7.199);
    expect(frame.from.rate).toBe(0);
    expect(frame.to.rate).toBe(0);
  });

  it.each([0, -2, NaN, Infinity])(
    'uses the source 2s default for an invalid duration %s',
    (duration) => {
      const value = timeline();
      value.clips[1].transitionIn.duration = duration;
      expect(describeClipTransitionPlayback(value, 5)).toMatchObject({
        duration: 2,
        startTime: 4,
        endTime: 6,
      });
    },
  );

  it('uses a shortened start window and main track ordering while excluding audio/other track cuts', () => {
    const value = timeline();
    value.videoTrackCount = 2;
    value.clips[0].zIndex = value.clips[1].zIndex = 1;
    value.clips[0].duration = 0.5;
    value.clips[1].startTime = 0.5;
    value.clips[1].transitionIn.duration = 10;
    value.clips.unshift({ ...value.clips[1], id: 'overlay', zIndex: 0 });
    value.clips.push({ ...value.clips[1], id: 'audio', type: 'audio', zIndex: 2 });
    const frame = describeClipTransitionPlayback(value, 0.5);
    expect(frame).toMatchObject({
      leftClipId: 'left',
      rightClipId: 'right',
      duration: 1,
      startTime: 0,
      endTime: 1,
      progress: 0.5,
    });
  });
});
