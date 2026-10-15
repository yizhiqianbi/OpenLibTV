import { describe, expect, it } from 'vitest';
import {
  clipGainForPlayback,
  describeClipTimelinePlayback,
  normalizeClipTransform,
} from './playback-model.js';
import { clipAudioFaderDbForPosition, clipAudioFaderPosition } from './audio-gain-model.js';

// Literal source gold:613429 eq,28845 visible order,740349 transforms and123721
// fader constants. Expected tuples, clocks,rects andgains are independentvalues.
const video = (id, fields = {}) => ({
  id,
  type: 'video',
  assetId: `asset-${id}`,
  sourceNodeId: `source-${id}`,
  zIndex: 0,
  startTime: 0,
  duration: 10,
  sourceOffset: 2,
  sourceDuration: 100,
  width: 1920,
  height: 1080,
  ...fields,
});
const audio = (id, fields = {}) => ({
  id,
  type: 'audio',
  assetId: `asset-${id}`,
  sourceNodeId: `source-${id}`,
  zIndex: 1,
  startTime: 0,
  duration: 10,
  sourceOffset: 0,
  sourceDuration: 100,
  ...fields,
});

describe('Clip source fader gain rather than nativevolume limits', () => {
  it('shares the source fader curve with clip-level timeline controls', () => {
    expect(clipAudioFaderPosition({})).toBeCloseTo(0.3, 10);
    expect(clipAudioFaderPosition({ decibel: -60 })).toBeCloseTo(0.02, 10);
    expect(clipAudioFaderPosition({ decibel: 20 })).toBe(1);
    expect(clipAudioFaderDbForPosition(0.3)).toBeCloseTo(0, 10);
    expect(clipAudioFaderDbForPosition(0)).toBe(-60);
  });
  it.each([
    [-100, 0],
    [-60, 0],
    [-59, 0.001122018454301963],
    [-6, 0.5011872336272722],
    [0, 1],
    [10, 3],
    [20, 5],
    [60, 5],
  ])('maps decibel%s to original gain%s', (decibel, expected) => {
    expect(clipGainForPlayback({ decibel })).toBeCloseTo(expected, 10);
  });

  it('uses decibel/nullish audioFaderDb precedence and source legacy slider/default behavior', () => {
    expect(clipGainForPlayback({ decibel: 0, audioFaderDb: 20 })).toBeCloseTo(1, 10);
    expect(clipGainForPlayback({ decibel: null, audioFaderDb: 20 })).toBeCloseTo(5, 10);
    expect(clipGainForPlayback({ decibel: Infinity, audioFaderDb: 20 })).toBeCloseTo(1, 10);
    expect(clipGainForPlayback({ audioFaderT: 0.02 })).toBe(0);
    expect(clipGainForPlayback({ audioFaderT: 0 })).toBe(0);
    expect(clipGainForPlayback({ audioFaderT: 0.3 })).toBeCloseTo(1, 10);
    expect(clipGainForPlayback({ audioFaderT: 1 })).toBeCloseTo(5, 10);
    expect(clipGainForPlayback({ audioVolume: 0 })).toBeCloseTo(1, 10);
    expect(clipGainForPlayback({ audioVolume: 2 })).toBeCloseTo(2.2041199826559246, 10);
    expect(clipGainForPlayback({})).toBeCloseTo(1, 10);
  });

  it('preserves source NaN fader result for capability reporting instead of inventing a neutral gain', () => {
    expect(clipGainForPlayback({ audioFaderT: NaN })).toBeNaN();
    expect(
      describeClipTimelinePlayback({ clips: [video('v', { audioFaderT: NaN })] }, 1)
        .unsupportedFlags,
    ).toEqual(['invalid-audio-gain']);
  });
});

describe('Clip transform tuple normalization', () => {
  it('chooses first finite scale, ignores shear, preserves actual pixel translation and returns independent tuples', () => {
    const raw = [
      [2, 0.8, 125],
      [-0.8, 3, -40],
    ];
    expect(normalizeClipTransform(raw)).toEqual([
      [2, 0, 125],
      [0, 2, -40],
    ]);
    expect(raw).toEqual([
      [2, 0.8, 125],
      [-0.8, 3, -40],
    ]);
    expect(
      normalizeClipTransform([
        [NaN, 0, 5],
        [0, 0.2, 6],
      ]),
    ).toEqual([
      [0.2, 0, 5],
      [0, 0.2, 6],
    ]);
    expect(
      normalizeClipTransform([
        ['2', 0, '5'],
        [0, 2, Infinity],
      ]),
    ).toEqual([
      [2, 0, 0],
      [0, 2, 0],
    ]);
    expect(normalizeClipTransform(undefined)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(normalizeClipTransform({ scale: 3, x: 99 })).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('clamps uniform scale to.05–10 while a malformed second row resets the whole matrix', () => {
    expect(
      normalizeClipTransform([
        [0, 0, 10],
        [0, 8, 20],
      ]),
    ).toEqual([
      [0.05, 0, 10],
      [0, 0.05, 20],
    ]);
    expect(
      normalizeClipTransform([
        [100, 0, 10],
        [0, 8, 20],
      ]),
    ).toEqual([
      [10, 0, 10],
      [0, 10, 20],
    ]);
    expect(normalizeClipTransform([[2, 0, 10], null])).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
  });
});

describe('Visible timeline layers and source clocks', () => {
  it('orders all visible layers by zIndex descending/time/id, leaving the last layer visually on top', () => {
    const clips = [
      video('same-z-b', { zIndex: 1 }),
      video('upper', { zIndex: 0 }),
      video('background', { zIndex: 3 }),
      video('same-z-a', { zIndex: 1 }),
      video('later', { zIndex: 1, startTime: 1 }),
    ];
    const before = structuredClone(clips);
    const result = describeClipTimelinePlayback({ clips, videoTrackCount: 4 }, 3);
    expect(result.activeVideos.map((entry) => entry.id)).toEqual([
      'background',
      'same-z-a',
      'same-z-b',
      'later',
      'upper',
    ]);
    expect(result.videoTrackCount).toBe(4);
    expect(result.audioTrackCount).toBe(0);
    expect(result.activeVideos.map((entry) => entry.sourceTime)).toEqual([5, 5, 5, 4, 5]);
    expect(result.unsupportedFlags).toEqual([]);
    expect(clips).toEqual(before);
  });

  it('keeps inclusive video endpoint by default/null and strict audio endpoint, with explicit playback-exclusive video mode', () => {
    const timeline = {
      clips: [video('end'), video('next', { startTime: 10 }), audio('audio-end')],
      videoTrackCount: 1,
    };
    expect(
      describeClipTimelinePlayback(timeline, 10).activeVideos.map((entry) => entry.id),
    ).toEqual(['end', 'next']);
    expect(
      describeClipTimelinePlayback(timeline, 10, { includeEnd: null }).activeVideos.map(
        (entry) => entry.id,
      ),
    ).toEqual(['end', 'next']);
    expect(
      describeClipTimelinePlayback(timeline, 10, { includeEnd: false }).activeVideos.map(
        (entry) => entry.id,
      ),
    ).toEqual(['next']);
    expect(describeClipTimelinePlayback(timeline, 10).activeAudios).toEqual([]);
    expect(describeClipTimelinePlayback(timeline, -0.1).activeVideos).toEqual([]);
  });

  it('removes only strict hidden tracks while retaining their track-count contribution', () => {
    const timeline = {
      clips: [
        video('visible'),
        video('hidden', { zIndex: 1 }),
        video('truthy', { zIndex: 2 }),
        audio('hidden-a', { zIndex: 3 }),
        audio('visible-a', { zIndex: 4 }),
      ],
      videoTrackHiddenPerTrack: [false, true, 1],
      audioTrackHiddenPerTrack: [true, false],
    };
    const result = describeClipTimelinePlayback(timeline, 2);
    expect(result.videoTrackCount).toBe(3);
    expect(result.audioTrackCount).toBe(2);
    expect(result.activeVideos.map((entry) => entry.id)).toEqual(['truthy', 'visible']);
    expect(result.activeAudios.map((entry) => entry.id)).toEqual(['visible-a']);
  });

  it('uses globalzIndex first and the first original audio clip on each track without sorting overlaps', () => {
    const timeline = {
      videoTrackCount: 2,
      clips: [
        video('v'),
        audio('first', { zIndex: 2, audioTrack: 7, startTime: 2 }),
        audio('earlier-start', { zIndex: 2, startTime: 0 }),
        audio('second', { zIndex: 3 }),
        audio('legacy', { zIndex: NaN, audioTrack: 2 }),
      ],
    };
    const result = describeClipTimelinePlayback(timeline, 3);
    expect(result.videoTrackCount).toBe(2);
    expect(result.audioTrackCount).toBe(3);
    expect(
      result.activeAudios.map((entry) => [entry.id, entry.trackIndex, entry.sourceTime]),
    ).toEqual([
      ['first', 0, 1],
      ['second', 1, 3],
      ['legacy', 2, 3],
    ]);
  });

  it('preserves source offset and clamp8192 clock speed while reporting native media limits separately', () => {
    const result = describeClipTimelinePlayback(
      {
        clips: [
          video('fast', { speed: 20, startTime: 2, sourceOffset: 7 }),
          video('max', { speed: 90_000 }),
          video('min', { speed: 0.001 }),
          video('invalid', { speed: Infinity }),
        ],
      },
      3,
    );
    expect(
      result.activeVideos.map((entry) => [
        entry.id,
        entry.speed,
        entry.sourceTime,
        entry.nativePlaybackRate,
        entry.nativeRateSupported,
      ]),
    ).toEqual([
      ['invalid', 1, 5, 1, true],
      ['max', 8192, 24578, 16, false],
      ['min', 0.0625, 2.1875, 0.0625, true],
      ['fast', 20, 27, 16, false],
    ]);
    expect(result.unsupportedFlags).toEqual(['native-high-speed']);
  });

  it('maps currentclock/outputfit/matrix fields without turning timeline nodesizes into media metadata', () => {
    const v = video('v', {
      startTime: 4,
      speed: 2,
      sourceOffset: 10,
      transform: [
        [1.5, 0, 50],
        [0, 1.5, -20],
      ],
      maskShape: 'circle',
    });
    const result = describeClipTimelinePlayback({ clips: [v], videoAudioVolume: 0.4 }, 6, {
      outputSize: { width: 1000, height: 1000 },
    });
    expect(result.activeVideos[0]).toMatchObject({
      id: 'v',
      sourceNodeId: 'source-v',
      assetId: 'asset-v',
      trackIndex: 0,
      speed: 2,
      sourceTime: 14,
      nativePlaybackRate: 2,
      nativeRateSupported: true,
      globalVolume: 0.4,
      muted: false,
      hidden: false,
      audioEligible: true,
      transform: [
        [1.5, 0, 50],
        [0, 1.5, -20],
      ],
      maskShape: 'circle',
      contentFitRect: { dx: 0, dy: 219, dw: 1000, dh: 563 },
    });
    expect(result.activeVideos[0].clip).toBe(v);
    expect(result.activeVideos[0].gain).toBeCloseTo(0.4, 10);
    const portrait = describeClipTimelinePlayback(
      { clips: [video('p', { width: 1080, height: 1920 })] },
      2,
      { outputSize: { width: 1920, height: 1080 } },
    );
    expect(portrait.activeVideos[0].contentFitRect).toEqual({ dx: 656, dy: 0, dw: 608, dh: 1080 });
  });
});

describe('Clip global volume/mute and supported preview boundaries', () => {
  it('supports positive gain above1 and nonempty pertrack mute override without altering source fields', () => {
    const result = describeClipTimelinePlayback(
      {
        clips: [video('v', { decibel: 20 }), audio('a', { decibel: -6 })],
        videoAudioVolume: 0.4,
        videoAudioMuted: true,
        videoAudioMutedPerTrack: [false],
        audioTrackVolume: 0.5,
        audioTrackMuted: true,
        audioTrackMutedPerTrack: [false],
      },
      2,
    );
    expect(result.activeVideos[0]).toMatchObject({
      clipGain: 5,
      globalVolume: 0.4,
      gain: 2,
      muted: false,
      audioEligible: true,
    });
    expect(result.activeAudios[0].gain).toBeCloseTo(0.2505936168136361, 10);
    expect(result.activeAudios[0].muted).toBe(false);
  });

  it('keeps embedded audio mute independent from video visibility and linked separate audio', () => {
    const v = video('v', { embedAudioMuted: true });
    const a = audio('a', { linkedVideoClipId: 'v' });
    const result = describeClipTimelinePlayback({ clips: [v, a] }, 2);
    expect(result.activeVideos).toHaveLength(1);
    expect(result.activeVideos[0]).toMatchObject({ muted: true, gain: 0, audioEligible: false });
    expect(result.activeAudios[0]).toMatchObject({
      linkedVideoClipId: 'v',
      muted: false,
      audioEligible: true,
    });
    const hidden = describeClipTimelinePlayback(
      { clips: [v, a], videoTrackHiddenPerTrack: [true] },
      2,
    );
    expect(hidden.activeVideos).toEqual([]);
    expect(hidden.activeAudios[0].audioEligible).toBe(true);
  });

  it('defaults missing pertrack entries false when array exists and uses legacy global when absent', () => {
    const timeline = {
      videoTrackCount: 2,
      clips: [video('v', { zIndex: 1 }), audio('a', { zIndex: 3 })],
      videoAudioMuted: true,
      audioTrackMuted: true,
      videoAudioMutedPerTrack: [false],
      audioTrackMutedPerTrack: [false],
    };
    const current = describeClipTimelinePlayback(timeline, 1);
    expect(current.activeVideos[0].muted).toBe(false);
    expect(current.activeAudios[0].muted).toBe(false);
    const legacy = describeClipTimelinePlayback(
      { ...timeline, videoAudioMutedPerTrack: [], audioTrackMutedPerTrack: [] },
      1,
    );
    expect(legacy.activeVideos[0].muted).toBe(true);
    expect(legacy.activeAudios[0].muted).toBe(true);
  });

  it('takes known no-audio metadata without hiding video and handles caller audio suppression separately', () => {
    const timeline = { clips: [video('v'), audio('a')], videoAudioVolume: 1 };
    const known = describeClipTimelinePlayback(timeline, 2, {
      knownVideoAudio: new Map([['asset-v', false]]),
    });
    expect(known.activeVideos[0]).toMatchObject({ muted: false, audioEligible: false });
    expect(known.activeAudios[0].audioEligible).toBe(true);
    const unknown = describeClipTimelinePlayback(timeline, 2, {
      knownVideoAudio: { 'asset-v': undefined },
    });
    expect(unknown.activeVideos[0].audioEligible).toBe(true);
    const suppressed = describeClipTimelinePlayback(timeline, 2, { audioOutputSuppressed: true });
    expect(suppressed.activeVideos[0]).toMatchObject({
      muted: true,
      gain: 0,
      audioEligible: false,
    });
    expect(suppressed.activeAudios[0]).toMatchObject({
      muted: true,
      gain: 0,
      audioEligible: false,
    });
  });

  it('clamps globalvolume only, and does not invent mute or consume readiness/graph metadata', () => {
    const result = describeClipTimelinePlayback(
      {
        clips: [video('v', { decibel: 20 }), audio('a')],
        videoAudioVolume: 9,
        audioTrackVolume: -1,
      },
      2,
    );
    expect(result.activeVideos[0]).toMatchObject({ globalVolume: 1, clipGain: 5, gain: 5 });
    expect(result.activeAudios[0]).toMatchObject({
      globalVolume: 0,
      gain: 0,
      muted: false,
      audioEligible: false,
    });
    const clip = video('unknown', {
      width: undefined,
      height: undefined,
      measured: { width: 566, height: 350 },
    });
    expect(
      describeClipTimelinePlayback({ clips: [clip] }, 2).activeVideos[0].contentFitRect,
    ).toBeNull();
    expect(describeClipTimelinePlayback({ clips: [clip] }, 2).unsupportedFlags).toEqual([
      'unknown-media-size',
    ]);
  });

  it('reports actual unsupported stored effects while preserving original full document and futurefields', () => {
    const timeline = {
      clips: [
        video('v', {
          subtitleUrl: '/v.vtt',
          subtitleHtmlUrl: '/v.html',
          transition: { type: 'dissolve', duration: 0.5 },
          future: { opaque: ['keep'] },
        }),
      ],
      subtitles: { cues: [{ text: '字幕' }] },
      subtitlesHtml: { source: { htmlInline: '<p>字幕</p>' } },
      overlayHtmlInline: '<p>文字</p>',
      totalDuration: 10,
      currentTime: 2,
      future: { untouched: true },
    };
    const before = structuredClone(timeline);
    expect(describeClipTimelinePlayback(timeline, 2).unsupportedFlags).toEqual([
      'subtitle-vtt',
      'subtitle-html',
      'overlay-html',
      'transition-preview',
    ]);
    expect(timeline).toEqual(before);
  });

  it('reports unsupported native speed/shape/type and invalid data without treating partial capability as fullready', () => {
    const clips = [
      video('v', {
        type: 'other',
        speed: 17,
        maskShape: 'star',
        sourceOffset: NaN,
        audioFaderT: NaN,
        width: undefined,
      }),
    ];
    expect(
      describeClipTimelinePlayback({ clips }, NaN, { outputSize: { width: 0, height: 500 } })
        .unsupportedFlags,
    ).toEqual([
      'invalid-playhead',
      'invalid-output-size',
      'native-high-speed',
      'invalid-audio-gain',
      'invalid-clip-clock',
      'unknown-media-size',
      'unsupported-clip-type',
      'unsupported-mask-shape',
    ]);
  });

  it('describes an empty/gap timeline without supplying a substitute video or fakeaudio', () => {
    expect(describeClipTimelinePlayback({ clips: [], videoTrackCount: 1 }, 2)).toEqual({
      time: 2,
      transition: null,
      videoTrackCount: 1,
      audioTrackCount: 0,
      activeVideos: [],
      activeAudios: [],
      unsupportedFlags: [],
    });
    const gap = describeClipTimelinePlayback(
      { clips: [video('future', { startTime: 5 }), audio('past', { startTime: 0, duration: 1 })] },
      3,
    );
    expect(gap.activeVideos).toEqual([]);
    expect(gap.activeAudios).toEqual([]);
  });
});
