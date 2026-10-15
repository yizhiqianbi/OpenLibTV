import { describe, expect, it } from 'vitest';
import {
  clipTimelinePlaybackSpeed,
  copyClipTimelineSelection,
  deleteClipTimelineTransition,
  describeClipTimelineTransitions,
  finishClipTimelineTrackInsertion,
  insertPreparedClipTimelineMedia,
  moveClipTimelineRealtime,
  pasteClipTimelineSelection,
  pickClipTimelineVideoAtTime,
  reorderClipTimelineVideo,
  resolvePreparedClipTimelineBounds,
  setClipTimelineClipGain,
  setClipTimelineTransition,
  splitClipTimelineAtPlayhead,
  trimClipTimelineAtPlayhead,
  trimClipTimelineRealtime,
} from './timeline-edit-model.js';

function document(clips, patch = {}) {
  return {
    videoSourceNodeIds: ['source-main', 'source-next', 'source-overlay'],
    audioSourceNodeIds: ['source-audio'],
    clipsAuthoritative: true,
    clips,
    videoTrackCount: 2,
    totalDuration: 60,
    currentTime: 2,
    scale: 100,
    scrollX: 1000,
    videoAudioMuted: false,
    videoAudioMutedPerTrack: [true, false],
    videoTrackHiddenPerTrack: [false, false],
    videoAudioVolume: 0.7,
    audioTrackMuted: false,
    audioTrackMutedPerTrack: [true],
    audioTrackHiddenPerTrack: [false],
    audioTrackVolume: 0.6,
    cropRange: { start: 0, end: 4 },
    overlayHtmlUrl: '/overlay.html',
    subtitlesHtml: { 'source-main': { contractVersion: 4, extra: true } },
    futureDocument: { keep: ['a', 8] },
    ...patch,
  };
}
function mediaClips() {
  return [
    {
      id: 'main',
      sourceNodeId: 'source-main',
      type: 'video',
      zIndex: 1,
      startTime: 0,
      duration: 4,
      sourceOffset: 1,
      sourceDuration: 20,
      width: 1920,
      height: 1080,
      speed: 2,
      transitionIn: { type: 'fade', duration: 0.3 },
      transform: { x: 0.2, scale: 0.9 },
      futureClip: { retain: true },
    },
    {
      id: 'next',
      sourceNodeId: 'source-next',
      type: 'video',
      zIndex: 1,
      startTime: 4,
      duration: 3,
      sourceOffset: 0,
      sourceDuration: 10,
      width: 1280,
      height: 720,
    },
    {
      id: 'overlay',
      sourceNodeId: 'source-overlay',
      type: 'image',
      zIndex: 0,
      startTime: 10,
      duration: 3,
      sourceOffset: 0,
      sourceDuration: 20,
    },
    {
      id: 'sound',
      sourceNodeId: 'source-audio',
      type: 'audio',
      zIndex: 2,
      startTime: 0,
      duration: 5,
      sourceOffset: 2,
      sourceDuration: 20,
      speed: 1.5,
      linkedVideoClipId: 'main',
      decibel: -4,
      futureAudio: { retain: true },
    },
  ];
}
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

describe('original speed and visible playhead selection', () => {
  it.each([
    [undefined, 1],
    [null, 1],
    ['2', 1],
    [0, 1],
    [-1, 1],
    [NaN, 1],
    [Infinity, 1],
    [0.001, 0.0625],
    [2, 2],
    [9000, 8192],
  ])('resolves source speed %s to %s', (speed, expected) => {
    expect(clipTimelinePlaybackSpeed({ speed })).toBe(expected);
  });

  it('picks the low-z overlay through original descending sort and last-element selection', () => {
    const timeline = document(mediaClips());
    timeline.clips[2].startTime = 1;
    expect(pickClipTimelineVideoAtTime(timeline, 2).id).toBe('overlay');
    timeline.videoTrackHiddenPerTrack[0] = true;
    expect(pickClipTimelineVideoAtTime(timeline, 2).id).toBe('main');
  });

  it('uses later start and lexical ID within the same visible track, including endpoint', () => {
    const timeline = document([
      { id: 'a', type: 'video', zIndex: 0, startTime: 0, duration: 5 },
      { id: 'b', type: 'video', zIndex: 0, startTime: 1, duration: 4 },
      { id: 'z', type: 'video', zIndex: 0, startTime: 1, duration: 4 },
    ]);
    expect(pickClipTimelineVideoAtTime(timeline, 5).id).toBe('z');
    expect(pickClipTimelineVideoAtTime(timeline, 5.01)).toBeNull();
  });
});

describe('source-shaped local clip clipboard', () => {
  it('copies one video clip as immutable metadata and rejects audio or multi-select', () => {
    const timeline = document(mediaClips());
    const copied = copyClipTimelineSelection(timeline, { selectedClipIds: ['main'] });
    expect(copied.status).toBe('copied');
    expect(copied.clipboard).toMatchObject({ kind: 'video-clip', sourceNodeId: 'source-main' });
    expect(copied.clipboard.clip).toEqual(timeline.clips[0]);
    expect(copied.clipboard.clip).not.toBe(timeline.clips[0]);
    expect(copyClipTimelineSelection(timeline, { selectedClipIds: ['sound'] }).status).toBe(
      'video-only',
    );
    expect(copyClipTimelineSelection(timeline, { selectedClipIds: ['main', 'next'] }).status).toBe(
      'no-selection',
    );
  });

  it('pastes a trimmed video at the playhead with a fresh id, preserving source fields and shifting the main track', () => {
    const timeline = document(mediaClips(), { currentTime: 2 });
    const copied = copyClipTimelineSelection(timeline, { selectedClipIds: ['main'] }).clipboard;
    const result = pasteClipTimelineSelection(timeline, {
      clipboard: copied,
      id: 'pasted',
      media: {
        url: '/main.mp4',
        name: '主片',
        metadata: { url: '/main.mp4', sourceDuration: 20, width: 1920, height: 1080 },
      },
    });
    expect(result.status).toBe('pasted');
    expect(result.selectedClipIds).toEqual(['pasted']);
    const pasted = result.timeline.clips.find((clip) => clip.id === 'pasted');
    expect(pasted).toMatchObject({
      sourceNodeId: 'source-main',
      sourceOffset: 1,
      duration: 4,
      sourceDuration: 20,
      speed: 2,
      futureClip: { retain: true },
    });
    expect(result.timeline.clips.filter((clip) => clip.type !== 'audio')).toHaveLength(4);
    expect(result.timeline.totalDuration).toBe(13);
    expect(result.timeline.clips.find((clip) => clip.id === 'main').id).toBe('main');
  });

  it('does not paste without URL-matched prepared metadata or duplicate ids', () => {
    const timeline = document(mediaClips());
    const clipboard = copyClipTimelineSelection(timeline, { selectedClipIds: ['main'] }).clipboard;
    expect(
      pasteClipTimelineSelection(timeline, { clipboard, id: 'x', media: { url: '/x.mp4' } }).status,
    ).toBe('media-unavailable');
    expect(
      pasteClipTimelineSelection(timeline, {
        clipboard,
        id: 'main',
        media: {
          url: '/main.mp4',
          metadata: { url: '/main.mp4', sourceDuration: 20, width: 1, height: 1 },
        },
      }).status,
    ).toBe('invalid-id');
  });
});

describe('source-shaped clip transitions', () => {
  it('uses the preceding cut for a middle clip and never retargets a stale inspector selection', () => {
    const clips = mediaClips();
    const before = document([
      ...clips,
      { ...clips[1], id: 'third', startTime: 7, transitionIn: undefined },
    ]);
    const middle = setClipTimelineTransition(before, { selectedClipIds: ['next'] });
    expect(middle.transition.rightClipId).toBe('next');
    expect(middle.timeline.clips.find((clip) => clip.id === 'third').transitionIn).toBeUndefined();
    expect(setClipTimelineTransition(before, { selectedClipIds: ['overlay'] }).status).toBe(
      'not-main-video',
    );
    expect(setClipTimelineTransition(before, { selectedClipIds: ['missing'] }).status).toBe(
      'no-selection',
    );
    expect(deleteClipTimelineTransition(before, { rightClipId: 'missing' }).timeline).toBe(before);
    expect(setClipTimelineTransition({ ...before, currentTime: 50 }).status).toBe('no-selection');
    const explicit = setClipTimelineTransition(before, {
      rightClipId: 'third',
      duration: 0,
      inspectorDuration: true,
    });
    expect(explicit.transition).toMatchObject({ rightClipId: 'third', duration: 2 });
    expect(
      setClipTimelineTransition(before, {
        rightClipId: 'third',
        duration: 0.1,
        inspectorDuration: true,
      }).transition.duration,
    ).toBe(0.2);
    expect(
      setClipTimelineTransition(explicit.timeline, {
        rightClipId: 'third',
        duration: 0.26,
        inspectorDuration: true,
      }).transition.duration,
    ).toBe(0.3);
  });
  it('adds a bounded fade transition to the cut after the selected main clip', () => {
    const before = document(mediaClips());
    const result = setClipTimelineTransition(before, {
      selectedClipIds: ['main'],
      type: 'crossfade',
      duration: 9,
    });
    expect(result.status).toBe('edited');
    expect(result.timeline.clips.find((clip) => clip.id === 'next').transitionIn).toEqual({
      type: 'fade',
      duration: 6,
    });
    expect(before.clips.find((clip) => clip.id === 'next').transitionIn).toBeUndefined();
    expect(describeClipTimelineTransitions(result.timeline)).toEqual([
      expect.objectContaining({
        type: 'fade',
        duration: 6,
        cutIndex: 0,
        leftClipId: 'main',
        rightClipId: 'next',
        cutTime: 4,
      }),
    ]);
  });

  it('updates an existing transition without replacing unknown clip fields', () => {
    const before = document(mediaClips(), {
      clips: mediaClips().map((clip) =>
        clip.id === 'next'
          ? { ...clip, transitionIn: { type: 'fadeblack', duration: 0.4 }, future: { keep: 1 } }
          : clip,
      ),
    });
    const result = setClipTimelineTransition(before, {
      selectedClipIds: ['next'],
      type: 'fadewhite',
      duration: 0.8,
    });
    expect(result.status).toBe('edited');
    expect(result.timeline.clips.find((clip) => clip.id === 'next')).toEqual(
      expect.objectContaining({
        transitionIn: { type: 'fadewhite', duration: 0.8 },
        future: { keep: 1 },
      }),
    );
  });

  it('deletes only the selected cut transition and gates timelines without two video clips', () => {
    const withTransition = setClipTimelineTransition(document(mediaClips()), {
      selectedClipIds: ['main'],
      duration: 0.4,
    }).timeline;
    const result = deleteClipTimelineTransition(withTransition, { selectedClipIds: ['next'] });
    expect(result.status).toBe('deleted');
    expect(result.timeline.clips.find((clip) => clip.id === 'next').transitionIn).toBeUndefined();
    expect(
      deleteClipTimelineTransition(document([mediaClips()[0]]), { selectedClipIds: ['main'] })
        .status,
    ).toBe('no-next-clip');
    expect(
      setClipTimelineTransition(document(mediaClips()), { selectedClipIds: ['sound'] }).status,
    ).toBe('not-video');
  });
});

describe('source-shaped clip volume fader', () => {
  it('persists a bounded clip decibel value while preserving unknown fields', () => {
    const before = document(
      mediaClips().map((clip) =>
        clip.id === 'main' ? { ...clip, futureVolumeField: { keep: true } } : clip,
      ),
    );
    const result = setClipTimelineClipGain(before, { clipId: 'main', position: 0.3 });
    expect(result.status).toBe('edited');
    expect(result.selectedClipIds).toEqual(['main']);
    expect(result.timeline.clips.find((clip) => clip.id === 'main')).toEqual(
      expect.objectContaining({ decibel: 0, futureVolumeField: { keep: true } }),
    );
    expect(result.timeline.clips.find((clip) => clip.id === 'main')).toMatchObject({
      audioFaderDb: undefined,
      audioFaderT: undefined,
      audioVolume: undefined,
    });
    expect(setClipTimelineClipGain(before, { clipId: 'missing', position: 0.4 }).status).toBe(
      'missing',
    );
    expect(
      setClipTimelineClipGain(before, { clipId: 'main', position: 9 }).timeline.clips[0].decibel,
    ).toBe(20);
  });
});

describe('video and audio split at actual playhead', () => {
  it('splits the full literal video schema and duplicates original transition/unknown fields', () => {
    const before = freezeDeep(document(mediaClips()));
    expect(
      splitClipTimelineAtPlayhead(before, {
        leftId: 'left',
        rightId: 'right',
        selectedClipIds: ['next'],
      }),
    ).toEqual({
      status: 'edited',
      pauseRequired: true,
      selectedClipIds: ['right'],
      timeline: document(
        [
          {
            id: 'left',
            sourceNodeId: 'source-main',
            type: 'video',
            zIndex: 1,
            startTime: 0,
            duration: 2,
            sourceOffset: 1,
            sourceDuration: 20,
            width: 1920,
            height: 1080,
            speed: 2,
            transitionIn: { type: 'fade', duration: 0.3 },
            transform: { x: 0.2, scale: 0.9 },
            futureClip: { retain: true },
          },
          {
            id: 'right',
            sourceNodeId: 'source-main',
            type: 'video',
            zIndex: 1,
            startTime: 2,
            duration: 2,
            sourceOffset: 5,
            sourceDuration: 20,
            width: 1920,
            height: 1080,
            speed: 2,
            transitionIn: { type: 'fade', duration: 0.3 },
            transform: { x: 0.2, scale: 0.9 },
            futureClip: { retain: true },
          },
          {
            id: 'next',
            sourceNodeId: 'source-next',
            type: 'video',
            zIndex: 1,
            startTime: 4,
            duration: 3,
            sourceOffset: 0,
            sourceDuration: 10,
            width: 1280,
            height: 720,
          },
          {
            id: 'overlay',
            sourceNodeId: 'source-overlay',
            type: 'image',
            zIndex: 0,
            startTime: 10,
            duration: 3,
            sourceOffset: 0,
            sourceDuration: 20,
          },
          {
            id: 'sound',
            sourceNodeId: 'source-audio',
            type: 'audio',
            zIndex: 2,
            startTime: 0,
            duration: 5,
            sourceOffset: 2,
            sourceDuration: 20,
            speed: 1.5,
            linkedVideoClipId: 'main',
            decibel: -4,
            futureAudio: { retain: true },
          },
        ],
        { totalDuration: 13, cropRange: null },
      ),
    });
    expect(before).toEqual(document(mediaClips()));
  });

  it('splits audio, clears both linked-video bindings, and injects a distinct right source', () => {
    const before = document(mediaClips());
    const result = splitClipTimelineAtPlayhead(before, {
      kind: 'audio',
      selectedClipIds: ['sound'],
      leftId: 'a-left',
      rightId: 'a-right',
      rightSegmentSourceNodeId: 'new-audio',
    });
    expect(result.timeline.clips).toEqual([
      ...mediaClips().slice(0, 3),
      {
        id: 'a-left',
        sourceNodeId: 'source-audio',
        type: 'audio',
        zIndex: 2,
        startTime: 0,
        duration: 2,
        sourceOffset: 2,
        sourceDuration: 20,
        speed: 1.5,
        decibel: -4,
        futureAudio: { retain: true },
      },
      {
        id: 'a-right',
        sourceNodeId: 'new-audio',
        type: 'audio',
        zIndex: 2,
        startTime: 2,
        duration: 3,
        sourceOffset: 5,
        sourceDuration: 20,
        speed: 1.5,
        decibel: -4,
        futureAudio: { retain: true },
      },
    ]);
    expect(result.selectedClipIds).toEqual(['a-right']);
    expect(result.timeline.audioSourceNodeIds).toEqual(['source-audio']);
  });

  it('requires exactly one selected audio clip, unlike video current-time selection', () => {
    expect(
      splitClipTimelineAtPlayhead(document(mediaClips()), {
        kind: 'audio',
        selectedClipIds: ['sound', 'main'],
        leftId: 'l',
        rightId: 'r',
      }).status,
    ).toBe('unavailable');
    expect(
      splitClipTimelineAtPlayhead(document(mediaClips()), {
        kind: 'audio',
        selectedClipIds: [],
        leftId: 'l',
        rightId: 'r',
      }).status,
    ).toBe('unavailable');
  });

  it.each([0, 0.001, 0.4, 3.6, 3.999, 4])(
    'rejects edge/minimum split at %s without changes or history requirement',
    (time) => {
      const timeline = document(mediaClips(), { currentTime: time });
      const result = splitClipTimelineAtPlayhead(timeline, { leftId: 'l', rightId: 'r' });
      expect(result.status).toBe('invalid-range');
      expect(result.timeline).toBe(timeline);
      expect(result.pauseRequired).toBe(false);
    },
  );

  it('accepts exact .5-second minimum and rejects source duration overflow using effective speed', () => {
    expect(
      splitClipTimelineAtPlayhead(document(mediaClips(), { currentTime: 0.5 }), {
        leftId: 'l',
        rightId: 'r',
      }).status,
    ).toBe('edited');
    const timeline = document(mediaClips());
    timeline.clips[0].sourceDuration = 8.9;
    expect(splitClipTimelineAtPlayhead(timeline, { leftId: 'l', rightId: 'r' }).status).toBe(
      'source-overflow',
    );
    timeline.clips[0].sourceDuration = 8.999;
    expect(splitClipTimelineAtPlayhead(timeline, { leftId: 'l', rightId: 'r' }).status).toBe(
      'edited',
    );
  });

  it('blocks loading/sentinel media and thirty-video limit', () => {
    const timeline = document(mediaClips());
    timeline.clips[0].loading = true;
    expect(splitClipTimelineAtPlayhead(timeline, { leftId: 'l', rightId: 'r' }).status).toBe(
      'unavailable',
    );
    timeline.clips[0].loading = false;
    timeline.clips[0].assetId = '__timeline_loading__';
    expect(splitClipTimelineAtPlayhead(timeline, { leftId: 'l', rightId: 'r' }).status).toBe(
      'unavailable',
    );
    const limit = document(
      Array.from({ length: 30 }, (_, index) => ({
        id: `v${index}`,
        type: 'video',
        zIndex: 1,
        startTime: index * 4,
        duration: 4,
        sourceOffset: 0,
        sourceDuration: 4,
      })),
    );
    expect(splitClipTimelineAtPlayhead(limit, { leftId: 'l', rightId: 'r' }).status).toBe(
      'video-limit',
    );
  });

  it('requires injected distinct IDs rather than generating random IDs or overwriting existing clips', () => {
    expect(splitClipTimelineAtPlayhead(document(mediaClips()), {}).status).toBe('invalid-id');
    expect(
      splitClipTimelineAtPlayhead(document(mediaClips()), { leftId: 'next', rightId: 'r' }).status,
    ).toBe('invalid-id');
    expect(
      splitClipTimelineAtPlayhead(document(mediaClips()), { leftId: 'x', rightId: 'x' }).status,
    ).toBe('invalid-id');
  });

  it('only clears crop when it straddles the split, preserving exact-boundary crop', () => {
    const result = splitClipTimelineAtPlayhead(
      document(mediaClips(), { cropRange: { start: 2, end: 3 } }),
      { leftId: 'l', rightId: 'r' },
    );
    expect(result.timeline.cropRange).toEqual({ start: 2, end: 3 });
  });
});

describe('trim playhead and realtime crop rules', () => {
  it('left-trims video, packs the primary track, preserves audio time and seeks the new start', () => {
    const before = freezeDeep(document(mediaClips()));
    const result = trimClipTimelineAtPlayhead(before, {
      side: 'left',
      selectedClipIds: ['overlay'],
      viewportWidth: 390,
    });
    expect(result).toEqual({
      status: 'edited',
      pauseRequired: true,
      selectedClipIds: ['main'],
      timeline: document(
        [
          {
            id: 'main',
            sourceNodeId: 'source-main',
            type: 'video',
            zIndex: 1,
            startTime: 0,
            duration: 2,
            sourceOffset: 5,
            sourceDuration: 20,
            width: 1920,
            height: 1080,
            speed: 2,
            transitionIn: { type: 'fade', duration: 0.3 },
            transform: { x: 0.2, scale: 0.9 },
            futureClip: { retain: true },
          },
          {
            id: 'next',
            sourceNodeId: 'source-next',
            type: 'video',
            zIndex: 1,
            startTime: 2,
            duration: 3,
            sourceOffset: 0,
            sourceDuration: 10,
            width: 1280,
            height: 720,
          },
          {
            id: 'overlay',
            sourceNodeId: 'source-overlay',
            type: 'image',
            zIndex: 0,
            startTime: 10,
            duration: 3,
            sourceOffset: 0,
            sourceDuration: 20,
          },
          {
            id: 'sound',
            sourceNodeId: 'source-audio',
            type: 'audio',
            zIndex: 2,
            startTime: 0,
            duration: 5,
            sourceOffset: 2,
            sourceDuration: 20,
            speed: 1.5,
            linkedVideoClipId: 'main',
            decibel: -4,
            futureAudio: { retain: true },
          },
        ],
        { totalDuration: 13, currentTime: 0, cropRange: null, scrollX: 922 },
      ),
    });
  });

  it('right-trims video and keeps seek at the old playhead after compacting', () => {
    const result = trimClipTimelineAtPlayhead(document(mediaClips()), {
      side: 'right',
      viewportWidth: 390,
    });
    expect(result.timeline.clips[0]).toEqual({ ...mediaClips()[0], duration: 2 });
    expect(result.timeline.clips[1]).toEqual({ ...mediaClips()[1], startTime: 2 });
    expect(result.timeline.currentTime).toBe(2);
    expect(result.timeline.cropRange).toBeNull();
  });

  it('audio trim detaches linked video and preserves absolute start when compacting', () => {
    const left = trimClipTimelineAtPlayhead(document(mediaClips()), {
      kind: 'audio',
      side: 'left',
      selectedClipIds: ['sound'],
    });
    expect(left.timeline.clips[3]).toEqual({
      id: 'sound',
      sourceNodeId: 'source-audio',
      type: 'audio',
      zIndex: 2,
      startTime: 2,
      duration: 3,
      sourceOffset: 5,
      sourceDuration: 20,
      speed: 1.5,
      decibel: -4,
      futureAudio: { retain: true },
    });
    expect(left.timeline.currentTime).toBe(2);
    const right = trimClipTimelineAtPlayhead(document(mediaClips()), {
      kind: 'audio',
      side: 'right',
      selectedClipIds: ['sound'],
    });
    expect(right.timeline.clips[3]).toEqual({
      id: 'sound',
      sourceNodeId: 'source-audio',
      type: 'audio',
      zIndex: 2,
      startTime: 0,
      duration: 2,
      sourceOffset: 2,
      sourceDuration: 20,
      speed: 1.5,
      decibel: -4,
      futureAudio: { retain: true },
    });
  });

  it('rejects playhead trim at endpoints, below minimum and beyond source range', () => {
    expect(
      trimClipTimelineAtPlayhead(document(mediaClips(), { currentTime: 4 }), { side: 'right' })
        .status,
    ).toBe('invalid-range');
    expect(
      trimClipTimelineAtPlayhead(document(mediaClips(), { currentTime: 0.4 }), { side: 'right' })
        .status,
    ).toBe('invalid-range');
    const timeline = document(mediaClips());
    timeline.clips[0].sourceDuration = 4;
    expect(trimClipTimelineAtPlayhead(timeline, { side: 'right' }).status).toBe('source-overflow');
  });

  it('right realtime trim shifts all later clips in only the same video track and clamps scroll', () => {
    const before = freezeDeep(document(mediaClips()));
    expect(
      trimClipTimelineRealtime(before, {
        edge: 'crop-right',
        time: 6,
        selectedClipIds: ['main'],
        viewportWidth: 390,
      }),
    ).toEqual({
      status: 'edited',
      pauseRequired: false,
      selectedClipIds: ['main'],
      timeline: document(
        [
          { ...mediaClips()[0], duration: 6 },
          { ...mediaClips()[1], startTime: 6 },
          mediaClips()[2],
          mediaClips()[3],
        ],
        { totalDuration: 13, scrollX: 922, cropRange: { start: 0, end: 6 } },
      ),
    });
  });

  it('left realtime trim changes source offset but does not move later same-track clips', () => {
    const result = trimClipTimelineRealtime(document(mediaClips()), {
      edge: 'crop-left',
      time: 1,
      selectedClipIds: ['main'],
      viewportWidth: 390,
    });
    expect(result.timeline).toEqual(
      document(
        [
          { ...mediaClips()[0], startTime: 1, duration: 3, sourceOffset: 3 },
          mediaClips()[1],
          mediaClips()[2],
          mediaClips()[3],
        ],
        { totalDuration: 13, scrollX: 922, cropRange: { start: 1, end: 4 } },
      ),
    );
  });

  it('resolves realtime selected clip in document order, not selection insertion order', () => {
    const result = trimClipTimelineRealtime(document(mediaClips()), {
      edge: 'crop-right',
      time: 2,
      selectedClipIds: ['next', 'main'],
    });
    expect(result.timeline.clips[0].duration).toBe(2);
    expect(result.timeline.clips[1].startTime).toBe(2);
  });

  it('falls back to crop start/overlap when no clip is selected', () => {
    const result = trimClipTimelineRealtime(document(mediaClips()), {
      edge: 'crop-right',
      time: 3,
    });
    expect(result.timeline.clips[0].duration).toBe(3);
    expect(result.timeline.clips[1].startTime).toBe(3);
  });

  it('audio right realtime trim ripples only its own audio track and keeps the link', () => {
    const clips = mediaClips();
    clips.push({
      id: 'later-sound',
      type: 'audio',
      zIndex: 2,
      startTime: 5,
      duration: 2,
      sourceOffset: 0,
      sourceDuration: 3,
    });
    clips.push({
      id: 'other-sound',
      type: 'audio',
      zIndex: 3,
      startTime: 5,
      duration: 2,
      sourceOffset: 0,
      sourceDuration: 3,
    });
    const result = trimClipTimelineRealtime(document(clips), {
      edge: 'crop-right',
      time: 3,
      selectedClipIds: ['sound'],
    });
    expect(result.timeline.clips[3]).toEqual({ ...mediaClips()[3], duration: 3 });
    expect(result.timeline.clips[4].startTime).toBe(3);
    expect(result.timeline.clips[5].startTime).toBe(5);
  });

  it('keeps document unchanged for missing crop and invalid source offset/length', () => {
    const emptyCrop = document(mediaClips(), { cropRange: null });
    expect(trimClipTimelineRealtime(emptyCrop, { edge: 'crop-right', time: 3 }).timeline).toBe(
      emptyCrop,
    );
    const original = document(mediaClips());
    expect(
      trimClipTimelineRealtime(original, { edge: 'crop-left', time: -2, selectedClipIds: ['main'] })
        .status,
    ).toBe('source-overflow');
    expect(
      trimClipTimelineRealtime(original, {
        edge: 'crop-right',
        time: 11,
        selectedClipIds: ['main'],
      }).status,
    ).toBe('source-overflow');
    expect(
      trimClipTimelineRealtime(original, {
        edge: 'crop-right',
        time: 0.2,
        selectedClipIds: ['main'],
      }).status,
    ).toBe('invalid-range');
  });
});

describe('video/audio move, reorder and explicit track insertion', () => {
  it('moves only the first selection and retains linked audio metadata', () => {
    const result = moveClipTimelineRealtime(document(mediaClips()), {
      kind: 'audio',
      time: 8,
      trackIndex: 1,
      selectedClipIds: ['sound', 'main'],
    });
    expect(result.timeline).toEqual(
      document(
        [
          mediaClips()[0],
          mediaClips()[1],
          mediaClips()[2],
          { ...mediaClips()[3], startTime: 8, zIndex: 3 },
        ],
        {
          totalDuration: 13,
          cropRange: { start: 8, end: 13 },
          audioTrackMutedPerTrack: [true, false],
          audioTrackHiddenPerTrack: [false, false],
        },
      ),
    );
  });

  it('protects moving the final primary clip out of the main track', () => {
    const timeline = document(mediaClips().filter((clip) => clip.id !== 'next'));
    const result = moveClipTimelineRealtime(timeline, {
      time: 2,
      trackIndex: 0,
      selectedClipIds: ['main'],
    });
    expect(result).toEqual({
      status: 'main-track-protected',
      timeline,
      selectedClipIds: ['main'],
      pauseRequired: false,
    });
  });

  it('moves one of multiple primary clips to another track while preserving other positions', () => {
    const result = moveClipTimelineRealtime(document(mediaClips()), {
      time: 8,
      trackIndex: 0,
      selectedClipIds: ['main'],
    });
    expect(result.timeline.clips).toEqual([
      { ...mediaClips()[0], startTime: 8, zIndex: 0 },
      ...mediaClips().slice(1),
    ]);
    expect(result.timeline.videoTrackCount).toBe(2);
    expect(result.timeline.cropRange).toEqual({ start: 8, end: 12 });
  });

  it('keeps drag base video count and expands a requested inserted track without shifting audio prematurely', () => {
    const result = moveClipTimelineRealtime(document(mediaClips()), {
      time: 9,
      trackIndex: 2,
      selectedClipIds: ['overlay'],
      videoDragBaseTrackCount: 2,
      dragInsertVideoTrackIdx: 2,
    });
    expect(result.timeline.videoTrackCount).toBe(3);
    expect(result.timeline.clips[2]).toEqual({ ...mediaClips()[2], startTime: 9, zIndex: 2 });
    expect(result.timeline.clips[3].zIndex).toBe(2);
  });

  it('reorders main-track clips contiguously using the requested index without moving linked audio', () => {
    const result = reorderClipTimelineVideo(document(mediaClips()), {
      clipId: 'next',
      index: 0,
      selectedClipIds: ['next'],
      viewportWidth: 390,
    });
    expect(result.timeline.clips).toEqual([
      mediaClips()[2],
      { ...mediaClips()[1], startTime: 0 },
      { ...mediaClips()[0], startTime: 3 },
      mediaClips()[3],
    ]);
    expect(result.timeline.cropRange).toEqual({ start: 0, end: 3 });
    expect(result.timeline.totalDuration).toBe(13);
    expect(result.timeline.scrollX).toBe(922);
  });

  it('does not apply primary reorder packing to overlays', () => {
    const result = reorderClipTimelineVideo(document(mediaClips()), {
      clipId: 'overlay',
      index: 0,
    });
    expect(result.timeline.clips).toEqual(mediaClips());
    expect(result.timeline.cropRange).toEqual({ start: 0, end: 4 });
  });

  it('inserts a video track with literal control/position/audio-index restoration', () => {
    const before = document(mediaClips());
    const result = finishClipTimelineTrackInsertion(before, {
      selectedClipIds: ['overlay'],
      insertTrackIndex: 0,
      videoDragBaseTrackCount: 2,
      viewportWidth: 390,
    });
    expect(result.timeline).toEqual(
      document(
        [{ ...mediaClips()[0], zIndex: 1 }, mediaClips()[1], mediaClips()[2], mediaClips()[3]],
        {
          totalDuration: 13,
          scrollX: 922,
          cropRange: { start: 10, end: 13 },
          videoAudioMutedPerTrack: [false, true],
          videoTrackHiddenPerTrack: [false, false],
        },
      ),
    );
    expect(result.status).toBe('edited');
  });

  it('inserts audio track row and shifts existing audio controls with the clip', () => {
    const clips = mediaClips();
    clips.push({
      id: 'other-audio',
      type: 'audio',
      zIndex: 3,
      startTime: 4,
      duration: 2,
      sourceOffset: 0,
      sourceDuration: 2,
    });
    const before = document(clips, {
      audioTrackMutedPerTrack: [true, false],
      audioTrackHiddenPerTrack: [false, true],
    });
    const result = finishClipTimelineTrackInsertion(before, {
      kind: 'audio',
      selectedClipIds: ['other-audio'],
      insertTrackIndex: 0,
    });
    expect(result.timeline.clips[3]).toEqual({ ...mediaClips()[3], zIndex: 3 });
    expect(result.timeline.clips[4]).toEqual({ ...clips[4], zIndex: 2 });
    expect(result.timeline.audioTrackMutedPerTrack).toEqual([false, true]);
    expect(result.timeline.audioTrackHiddenPerTrack).toEqual([false, false]);
  });

  it('compresses emptied audio track gaps after ordinary movement even without explicit insertion', () => {
    const moved = moveClipTimelineRealtime(document(mediaClips()), {
      kind: 'audio',
      time: 8,
      trackIndex: 2,
      selectedClipIds: ['sound'],
    });
    const result = finishClipTimelineTrackInsertion(moved.timeline, {
      kind: 'audio',
      selectedClipIds: ['sound'],
    });
    expect(result.timeline).toEqual(
      document(
        [
          mediaClips()[0],
          mediaClips()[1],
          mediaClips()[2],
          { ...mediaClips()[3], startTime: 8, zIndex: 2 },
        ],
        {
          totalDuration: 13,
          cropRange: { start: 8, end: 13 },
          audioTrackMutedPerTrack: [false],
          audioTrackHiddenPerTrack: [false],
        },
      ),
    );
  });

  it('returns unavailable for missing/wrong-kind drag/reorder selection', () => {
    const timeline = document(mediaClips());
    expect(
      moveClipTimelineRealtime(timeline, { kind: 'video', time: 1, selectedClipIds: ['sound'] })
        .status,
    ).toBe('unavailable');
    expect(reorderClipTimelineVideo(timeline, { clipId: 'sound', index: 0 }).status).toBe(
      'unavailable',
    );
    expect(finishClipTimelineTrackInsertion(timeline, { selectedClipIds: [] }).status).toBe(
      'unavailable',
    );
  });
});

describe('prepared actual media ingestion and original source bounds', () => {
  function video(patch = {}) {
    return {
      kind: 'video',
      id: 'incoming',
      sourceNodeId: 'source-incoming',
      url: '/exact%20video.mp4?quality=raw',
      name: ' actual ',
      metadata: {
        url: '/exact%20video.mp4?quality=raw',
        sourceDuration: 2,
        width: 640,
        height: 360,
      },
      clipFields: { resourceFuture: { safe: true } },
      ...patch,
    };
  }

  it('inserts at a containing main clip start, shifts later videos, and preserves exact URL/real dimensions', () => {
    const before = freezeDeep(document(mediaClips()));
    const result = insertPreparedClipTimelineMedia(before, video(), {
      insertAtTime: 2,
      selectedClipIds: ['main'],
    });
    expect(result.timeline).toEqual(
      document(
        [
          mediaClips()[2],
          {
            resourceFuture: { safe: true },
            id: 'incoming',
            sourceNodeId: 'source-incoming',
            name: 'actual',
            zIndex: 1,
            startTime: 0,
            duration: 2,
            sourceOffset: 0,
            sourceDuration: 2,
            width: 640,
            height: 360,
          },
          { ...mediaClips()[0], startTime: 2 },
          { ...mediaClips()[1], startTime: 6 },
          mediaClips()[3],
        ],
        { totalDuration: 13 },
      ),
    );
    expect(result.mediaSource).toEqual({
      clipId: 'incoming',
      sourceNodeId: 'source-incoming',
      url: '/exact%20video.mp4?quality=raw',
      metadata: {
        url: '/exact%20video.mp4?quality=raw',
        sourceDuration: 2,
        width: 640,
        height: 360,
      },
    });
    expect(result.selectedClipIds).toEqual(['main']);
    expect(before).toEqual(document(mediaClips()));
  });

  it('inserts after matching source in its overlay track without primary compaction', () => {
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), video(), {
      afterSourceNodeId: 'source-overlay',
    });
    expect(result.timeline.clips).toEqual([
      ...mediaClips().slice(0, 3),
      {
        resourceFuture: { safe: true },
        id: 'incoming',
        sourceNodeId: 'source-incoming',
        name: 'actual',
        zIndex: 0,
        startTime: 13,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
        width: 640,
        height: 360,
      },
      mediaClips()[3],
    ]);
    expect(result.timeline.totalDuration).toBe(15);
  });

  it('appends to primary end when after-source no longer exists, ignoring insertAtTime as source does', () => {
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), video(), {
      afterSourceNodeId: 'gone',
      insertAtTime: 1,
    });
    expect(result.timeline.clips.find((clip) => clip.id === 'incoming').startTime).toBe(7);
  });

  it('keeps sparse chosen times in gaps and after the last clip instead of snapping every insertion', () => {
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), video(), {
      insertAtTime: 20,
    });
    expect(result.timeline.clips.find((clip) => clip.id === 'incoming').startTime).toBe(20);
    expect(result.timeline.totalDuration).toBe(22);
  });

  it.each([
    ['missing URL', { url: '' }],
    [
      'unmatched metadata URL',
      { metadata: { url: '/different.mp4', sourceDuration: 2, width: 640, height: 360 } },
    ],
    [
      'unknown actual duration',
      {
        metadata: {
          url: '/exact%20video.mp4?quality=raw',
          sourceDuration: undefined,
          width: 640,
          height: 360,
        },
      },
    ],
    [
      'non-finite duration',
      {
        metadata: {
          url: '/exact%20video.mp4?quality=raw',
          sourceDuration: Infinity,
          width: 640,
          height: 360,
        },
      },
    ],
    [
      'unknown video width',
      { metadata: { url: '/exact%20video.mp4?quality=raw', sourceDuration: 2, height: 360 } },
    ],
    [
      'zero video height',
      {
        metadata: {
          url: '/exact%20video.mp4?quality=raw',
          sourceDuration: 2,
          width: 640,
          height: 0,
        },
      },
    ],
  ])(
    'retains the complete document for %s rather than using node-box or stage fallback',
    (_label, patch) => {
      const before = document(mediaClips());
      expect(insertPreparedClipTimelineMedia(before, video(patch)).status).toBe('invalid-media');
      expect(insertPreparedClipTimelineMedia(before, video(patch)).timeline).toBe(before);
    },
  );

  it('retains source exact sub-.1 duration while source visible extent has its original .1 minimum', () => {
    const result = insertPreparedClipTimelineMedia(
      document([], { videoTrackCount: 0 }),
      video({
        metadata: {
          url: '/exact%20video.mp4?quality=raw',
          sourceDuration: 0.02,
          width: 1,
          height: 1,
        },
      }),
    );
    const clip = result.timeline.clips[0];
    expect(clip.sourceDuration).toBe(0.02);
    expect(clip.duration).toBe(0.1);
    expect(clip.width).toBe(1);
    expect(result.timeline.totalDuration).toBe(0.1);
  });

  it('finds a free audio track using overlap and full alignment duration, retaining original linked binding', () => {
    const audio = {
      kind: 'audio',
      id: 'audio-new',
      sourceNodeId: 'fresh-audio',
      url: '/real.wav',
      metadata: { url: '/real.wav', sourceDuration: 2 },
      clipFields: { extraAudio: true },
    };
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), audio, {
      alignStartTime: 1,
      alignDurationHint: 8,
      linkedVideoClipId: 'main',
      speed: 2,
    });
    expect(result.timeline.clips[4]).toEqual({
      extraAudio: true,
      id: 'audio-new',
      type: 'audio',
      decibel: 0,
      sourceNodeId: 'fresh-audio',
      name: 'real.wav',
      zIndex: 3,
      startTime: 0,
      duration: 2,
      sourceOffset: 0,
      sourceDuration: 4,
      width: 0,
      height: 0,
      speed: 2,
      linkedVideoClipId: 'main',
    });
    expect(result.timeline.audioTrackMutedPerTrack).toEqual([true, false]);
  });

  it('reuses audio tracks when exact endpoints only touch, and respects explicit forceAudioTrack', () => {
    const audio = {
      kind: 'audio',
      id: 'audio-new',
      url: 'blob:actual-media',
      metadata: { url: 'blob:actual-media', sourceDuration: 2 },
    };
    expect(
      insertPreparedClipTimelineMedia(document(mediaClips()), audio, { alignStartTime: 5 }).timeline
        .clips[4].zIndex,
    ).toBe(2);
    expect(
      insertPreparedClipTimelineMedia(document(mediaClips()), audio, {
        alignStartTime: 1,
        forceAudioTrack: 0,
      }).timeline.clips[4].zIndex,
    ).toBe(2);
  });

  it('hydrates linked audio to the current video start while preserving requested timeline duration', () => {
    const audio = {
      kind: 'audio',
      id: 'linked',
      sourceNodeId: 'linked-source',
      url: '/short.wav',
      metadata: { url: '/short.wav', sourceDuration: 2 },
    };
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), audio, {
      alignStartTime: 9,
      timelineDuration: 4,
      linkedVideoClipId: 'next',
      speed: 2,
    });
    expect(result.timeline.clips[4]).toEqual({
      id: 'linked',
      type: 'audio',
      decibel: 0,
      sourceNodeId: 'linked-source',
      name: 'short.wav',
      zIndex: 2,
      startTime: 4,
      duration: 4,
      sourceOffset: 0,
      sourceDuration: 8,
      width: 0,
      height: 0,
      speed: 2,
      linkedVideoClipId: 'next',
    });
    expect(result.mediaSource.metadata).toEqual({ url: '/short.wav', sourceDuration: 2 });
  });

  it('uses normal actual audio duration when the linked video is absent without erasing the old binding', () => {
    const audio = {
      kind: 'audio',
      id: 'linked',
      url: '/short.wav',
      metadata: { url: '/short.wav', sourceDuration: 2 },
    };
    const result = insertPreparedClipTimelineMedia(document(mediaClips()), audio, {
      alignStartTime: 9,
      timelineDuration: 4,
      linkedVideoClipId: 'gone',
      speed: 2,
    });
    expect(result.timeline.clips[4]).toEqual({
      id: 'linked',
      type: 'audio',
      decibel: 0,
      sourceNodeId: undefined,
      name: 'short.wav',
      zIndex: 2,
      startTime: 9,
      duration: 2,
      sourceOffset: 0,
      sourceDuration: 2,
      width: 0,
      height: 0,
      speed: 2,
      linkedVideoClipId: 'gone',
    });
  });

  it('applies source hydration duration drift to following audio clips in the forced track only', () => {
    const before = document([
      mediaClips()[0],
      mediaClips()[1],
      mediaClips()[2],
      {
        id: 'later',
        type: 'audio',
        zIndex: 2,
        startTime: 5,
        duration: 3,
        sourceOffset: 0,
        sourceDuration: 3,
      },
      {
        id: 'other',
        type: 'audio',
        zIndex: 3,
        startTime: 5,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
      },
    ]);
    const result = insertPreparedClipTimelineMedia(
      before,
      {
        kind: 'audio',
        id: 'fresh',
        url: '/long.wav',
        metadata: { url: '/long.wav', sourceDuration: 4 },
      },
      { alignStartTime: 1, timelineDuration: 2, forceAudioTrack: 0 },
    );
    expect(result.timeline.clips).toEqual([
      mediaClips()[0],
      mediaClips()[1],
      mediaClips()[2],
      {
        id: 'later',
        type: 'audio',
        zIndex: 2,
        startTime: 7,
        duration: 3,
        sourceOffset: 0,
        sourceDuration: 3,
      },
      {
        id: 'other',
        type: 'audio',
        zIndex: 3,
        startTime: 5,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
      },
      {
        id: 'fresh',
        type: 'audio',
        decibel: 0,
        sourceNodeId: undefined,
        name: 'long.wav',
        zIndex: 2,
        startTime: 1,
        duration: 4,
        sourceOffset: 0,
        sourceDuration: 4,
        width: 0,
        height: 0,
      },
    ]);
  });

  it('does not collapse media URL to a guessed format or reject blob when actual metadata is ready', () => {
    const result = insertPreparedClipTimelineMedia(
      document(mediaClips()),
      video({
        url: 'blob:real',
        metadata: { url: 'blob:real', sourceDuration: 3, width: 854, height: 480 },
      }),
    );
    expect(result.mediaSource.url).toBe('blob:real');
    expect(result.timeline.clips.find((clip) => clip.id === 'incoming').width).toBe(854);
  });

  it('rejects duplicate IDs and the real thirty-video ceiling before adding media', () => {
    expect(
      insertPreparedClipTimelineMedia(document(mediaClips()), video({ id: 'main' })).status,
    ).toBe('invalid-id');
    const limit = document(
      Array.from({ length: 30 }, (_, index) => ({
        id: `v${index}`,
        zIndex: 1,
        startTime: index,
        duration: 1,
        sourceOffset: 0,
        sourceDuration: 1,
      })),
    );
    expect(insertPreparedClipTimelineMedia(limit, video()).status).toBe('video-limit');
  });

  it('uses actual prepared dimensions and bounds resolver without replacing the existing clip object', () => {
    const existing = {
      sourceDuration: 6,
      sourceOffset: 0,
      duration: 2,
      width: 640,
      height: 360,
      speed: 1,
      unknown: true,
    };
    const saved = { sourceDuration: 10, sourceOffset: 5.9, duration: 4 };
    expect(resolvePreparedClipTimelineBounds(existing, saved, 2)).toEqual({
      duration: 0.10000000000000009,
      sourceOffset: 5.8,
      sourceDuration: 6,
      width: 640,
      height: 360,
      timelineBoundsChanged: true,
    });
    expect(existing.unknown).toBe(true);
  });

  it('preserves source full-layout duration by default and follows a replaced full source only when requested', () => {
    const existing = { sourceDuration: 20, sourceOffset: 0, duration: 10, width: 800, height: 600 };
    const saved = { sourceDuration: 10, sourceOffset: 0, duration: 10 };
    expect(resolvePreparedClipTimelineBounds(existing, saved, 1)).toEqual({
      duration: 10,
      sourceOffset: 0,
      sourceDuration: 20,
      width: 800,
      height: 600,
      timelineBoundsChanged: true,
    });
    expect(
      resolvePreparedClipTimelineBounds(existing, saved, 1, { followFullSourceWhenChanged: true }),
    ).toEqual({
      duration: 20,
      sourceOffset: 0,
      sourceDuration: 20,
      width: 800,
      height: 600,
      timelineBoundsChanged: true,
    });
  });

  it('retains existing consumed source bounds when media drift would otherwise underflow them', () => {
    const existing = {
      sourceDuration: 2,
      sourceOffset: 3,
      duration: 4,
      speed: 2,
      width: 320,
      height: 180,
    };
    expect(
      resolvePreparedClipTimelineBounds(
        existing,
        { sourceDuration: 11, sourceOffset: 3, duration: 4 },
        2,
      ),
    ).toEqual({
      duration: 4,
      sourceOffset: 3,
      sourceDuration: 11,
      width: 320,
      height: 180,
      timelineBoundsChanged: false,
    });
  });
});
