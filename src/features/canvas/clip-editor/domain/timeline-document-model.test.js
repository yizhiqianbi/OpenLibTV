import { describe, expect, it } from 'vitest';
import {
  CLIP_EDITOR_HISTORY_LIMIT,
  clipTimelineSourceDifferences,
  cloneClipTimelineDocument,
  createClipTimelineDocument,
  createClipTimelineHistory,
  deleteClipTimelineSelection,
  hasAuthoritativeClipTimeline,
  pushClipTimelineHistory,
  restoreClipTimelineSnapshot,
  seekClipTimelineDocument,
  setClipTimelineTrackControl,
  setClipTimelineView,
  shouldUseAuthoritativeClipTimeline,
  stepClipTimelineHistory,
} from './timeline-document-model.js';

function originalDocument() {
  return {
    videoSourceNodeIds: ['source-a', 'source-b', 'source-a', 'overlay'],
    audioSourceNodeIds: ['audio', 'audio'],
    clipsAuthoritative: true,
    videoTrackCount: 2,
    clips: [
      {
        id: 'main-b',
        sourceNodeId: 'source-b',
        type: 'video',
        zIndex: 1,
        startTime: 12,
        duration: 4,
        sourceOffset: 2,
        sourceDuration: 20,
        width: 1920,
        height: 1080,
        speed: 1.25,
        transform: { x: 0.2, y: 0.4, scale: 0.9, rotation: 4 },
        maskShape: 'circle',
        decibel: -3,
        embedAudioMuted: true,
        subtitleUrl: '/subtitles/b.vtt',
        subtitleHtmlUrl: '/subtitles/b.html',
        transitionIn: { type: 'fade', duration: 0.4 },
        futureClipField: { safe: true },
      },
      {
        id: 'overlay',
        sourceNodeId: 'overlay',
        type: 'image',
        zIndex: 0,
        startTime: 15,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
      },
      {
        id: 'main-a',
        sourceNodeId: 'source-a',
        type: 'video',
        zIndex: 1,
        startTime: 3,
        duration: 3,
        sourceOffset: 1,
        sourceDuration: 8,
      },
      {
        id: 'audio',
        sourceNodeId: 'audio',
        type: 'audio',
        zIndex: 2,
        startTime: 12,
        duration: 4,
        sourceOffset: 0,
        sourceDuration: 30,
        linkedVideoClipId: 'main-b',
        decibel: -6,
      },
    ],
    overlayHtmlUrl: '/overlay.html',
    overlayHtmlInline: '<div data-future="1">Overlay</div>',
    totalDuration: 60,
    currentTime: 50,
    scale: 100,
    scrollX: 3000,
    videoAudioMuted: false,
    videoAudioMutedPerTrack: [true, false],
    videoTrackHiddenPerTrack: [true, false],
    videoAudioVolume: 0.7,
    audioTrackMuted: true,
    audioTrackMutedPerTrack: [false],
    audioTrackHiddenPerTrack: [true],
    audioTrackVolume: 0.4,
    cropRange: { start: 3.5, end: 5 },
    subtitles: { contractVersion: 4, rawVtt: 'WEBVTT\n', unknown: { keep: 1 } },
    subtitlesHtml: { 'source-a': { contractVersion: 4, arbitrary: [1, 2] } },
    futureTimelineField: { nested: ['keep', { unchanged: true }] },
  };
}

function deletedLiteralDocument() {
  return {
    videoSourceNodeIds: ['source-a', 'source-b', 'source-a', 'overlay'],
    audioSourceNodeIds: ['audio', 'audio'],
    clipsAuthoritative: true,
    videoTrackCount: 2,
    clips: [
      {
        id: 'main-b',
        sourceNodeId: 'source-b',
        type: 'video',
        zIndex: 1,
        startTime: 0,
        duration: 4,
        sourceOffset: 2,
        sourceDuration: 20,
        width: 1920,
        height: 1080,
        speed: 1.25,
        transform: { x: 0.2, y: 0.4, scale: 0.9, rotation: 4 },
        maskShape: 'circle',
        decibel: -3,
        embedAudioMuted: true,
        subtitleUrl: '/subtitles/b.vtt',
        subtitleHtmlUrl: '/subtitles/b.html',
        transitionIn: { type: 'fade', duration: 0.4 },
        futureClipField: { safe: true },
      },
      {
        id: 'overlay',
        sourceNodeId: 'overlay',
        type: 'image',
        zIndex: 0,
        startTime: 15,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
      },
      {
        id: 'audio',
        sourceNodeId: 'audio',
        type: 'audio',
        zIndex: 2,
        startTime: 12,
        duration: 4,
        sourceOffset: 0,
        sourceDuration: 30,
        linkedVideoClipId: 'main-b',
        decibel: -6,
      },
    ],
    overlayHtmlUrl: '/overlay.html',
    overlayHtmlInline: '<div data-future="1">Overlay</div>',
    totalDuration: 17,
    currentTime: 17,
    scale: 100,
    scrollX: 1322,
    videoAudioMuted: false,
    videoAudioMutedPerTrack: [true, false],
    videoTrackHiddenPerTrack: [true, false],
    videoAudioVolume: 0.7,
    audioTrackMuted: false,
    audioTrackMutedPerTrack: [false],
    audioTrackHiddenPerTrack: [true],
    audioTrackVolume: 0.4,
    cropRange: null,
    subtitles: { contractVersion: 4, rawVtt: 'WEBVTT\n', unknown: { keep: 1 } },
    subtitlesHtml: { 'source-a': { contractVersion: 4, arbitrary: [1, 2] } },
    futureTimelineField: { nested: ['keep', { unchanged: true }] },
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

describe('original clip editor document contract', () => {
  it('uses the original explicit timeline authority or non-null agentEditing gate', () => {
    expect(hasAuthoritativeClipTimeline({ clipsAuthoritative: true })).toBe(true);
    expect(hasAuthoritativeClipTimeline({ clipsAuthoritative: 'true' })).toBe(false);
    expect(
      shouldUseAuthoritativeClipTimeline({ clipTimelineData: { clipsAuthoritative: true } }),
    ).toBe(true);
    expect(shouldUseAuthoritativeClipTimeline({ agentEditing: false })).toBe(true);
    expect(shouldUseAuthoritativeClipTimeline({ agentEditing: {} })).toBe(true);
    expect(shouldUseAuthoritativeClipTimeline({ agentEditing: null })).toBe(false);
    expect(shouldUseAuthoritativeClipTimeline(undefined)).toBe(false);
  });
  it('keeps every existing document field and clones nested extensions independently', () => {
    const initial = originalDocument();
    const next = createClipTimelineDocument(initial);
    expect(next).toEqual(originalDocument());
    next.futureTimelineField.nested[1].unchanged = false;
    next.clips[0].futureClipField.safe = false;
    expect(initial).toEqual(originalDocument());
  });

  it('creates the source empty defaults without a simplified clip schema', () => {
    expect(createClipTimelineDocument()).toEqual({
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
      clips: [],
      videoTrackCount: 0,
      totalDuration: 60,
      currentTime: 0,
      scale: 100,
      scrollX: 0,
      videoAudioMuted: false,
      videoAudioMutedPerTrack: [],
      videoTrackHiddenPerTrack: [],
      videoAudioVolume: 1,
      audioTrackMuted: false,
      audioTrackMutedPerTrack: [],
      audioTrackHiddenPerTrack: [],
      audioTrackVolume: 1,
    });
  });

  it('rejects malformed clips instead of silently overwriting the saved document', () => {
    expect(() => createClipTimelineDocument({ clips: { corrupt: true }, future: 8 })).toThrow(
      TypeError,
    );
    expect(() => createClipTimelineDocument({ clips: null })).toThrow(TypeError);
  });

  it('does not normalize authored tracks or strip explicit undefined and NaN during cloning', () => {
    const data = {
      clips: [{ id: 'legacy', audioTrack: 8, zIndex: 12, future: undefined }],
      currentTime: NaN,
    };
    expect(cloneClipTimelineDocument(data)).toEqual(data);
    expect(Object.hasOwn(cloneClipTimelineDocument(data).clips[0], 'future')).toBe(true);
  });

  it('deletes a main fragment with literal complete schema, kept transition and independent audio timing', () => {
    const before = freezeDeep(originalDocument());
    const result = deleteClipTimelineSelection(before, ['main-a'], {
      selectedClipIds: ['main-a'],
      viewportWidth: 390,
    });
    expect(result).toEqual({
      status: 'deleted',
      timeline: deletedLiteralDocument(),
      selectedClipIds: [],
      deletedSourceNodeIds: ['source-a'],
    });
    expect(before).toEqual(originalDocument());
  });

  it('does not infer the main track from track zero', () => {
    const doc = deletedLiteralDocument();
    const result = deleteClipTimelineSelection(doc, ['main-b', 'audio', 'overlay'], {
      selectedClipIds: ['main-b', 'audio', 'overlay'],
    });
    expect(result).toEqual({
      status: 'main-track-protected',
      timeline: deletedLiteralDocument(),
      selectedClipIds: ['main-b', 'audio', 'overlay'],
      deletedSourceNodeIds: [],
    });
    expect(result.timeline).toBe(doc);
  });

  it('rejects a mixed selection that removes every primary clip atomically', () => {
    const before = originalDocument();
    expect(deleteClipTimelineSelection(before, ['main-a', 'main-b', 'audio'])).toEqual({
      status: 'main-track-protected',
      timeline: originalDocument(),
      selectedClipIds: [],
      deletedSourceNodeIds: [],
    });
  });

  it('allows deleting an overlay while protecting the remaining primary clip', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 2,
      clips: [
        {
          id: 'primary',
          sourceNodeId: 'primary',
          type: 'video',
          zIndex: 1,
          startTime: 7,
          duration: 5,
        },
        {
          id: 'overlay',
          sourceNodeId: 'overlay',
          type: 'video',
          zIndex: 0,
          startTime: 12,
          duration: 1,
        },
      ],
    });
    const result = deleteClipTimelineSelection(before, ['overlay']);
    expect(result.status).toBe('deleted');
    expect(result.timeline).toEqual({
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
      clips: [
        {
          id: 'primary',
          sourceNodeId: 'primary',
          type: 'video',
          zIndex: 0,
          startTime: 0,
          duration: 5,
        },
      ],
      videoTrackCount: 1,
      totalDuration: 5,
      currentTime: 0,
      scale: 100,
      scrollX: 0,
      videoAudioMuted: false,
      videoAudioMutedPerTrack: [false],
      videoTrackHiddenPerTrack: [false],
      videoAudioVolume: 1,
      audioTrackMuted: false,
      audioTrackMutedPerTrack: [],
      audioTrackHiddenPerTrack: [],
      audioTrackVolume: 1,
      cropRange: undefined,
    });
    expect(result.deletedSourceNodeIds).toEqual(['overlay']);
  });

  it('calls source deletion only for the final occurrence across both video and audio', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 1,
      clips: [
        { id: 'a1', sourceNodeId: 'same', type: 'video', zIndex: 0, startTime: 0, duration: 2 },
        { id: 'a2', sourceNodeId: 'same', type: 'video', zIndex: 0, startTime: 2, duration: 2 },
        { id: 'b', sourceNodeId: 'other', type: 'video', zIndex: 0, startTime: 4, duration: 2 },
        { id: 'sound', sourceNodeId: 'same', type: 'audio', zIndex: 1, startTime: 0, duration: 6 },
      ],
    });
    const first = deleteClipTimelineSelection(before, ['a1']);
    expect(first.deletedSourceNodeIds).toEqual([]);
    const second = deleteClipTimelineSelection(first.timeline, ['a2']);
    expect(second.deletedSourceNodeIds).toEqual([]);
    const final = deleteClipTimelineSelection(second.timeline, ['sound']);
    expect(final.deletedSourceNodeIds).toEqual(['same']);
  });

  it('retains source arrays, ordering and duplicate IDs when clips are removed', () => {
    const result = deleteClipTimelineSelection(originalDocument(), ['main-a']);
    expect(result.timeline.videoSourceNodeIds).toEqual([
      'source-a',
      'source-b',
      'source-a',
      'overlay',
    ]);
    expect(result.timeline.audioSourceNodeIds).toEqual(['audio', 'audio']);
  });

  it('keeps a single-delete crop but clears a selected-delete crop contained by the removed clip', () => {
    const before = originalDocument();
    expect(
      deleteClipTimelineSelection(before, ['main-a'], { selectionMode: 'single' }).timeline
        .cropRange,
    ).toEqual({ start: 3.5, end: 5 });
    expect(
      deleteClipTimelineSelection(before, ['main-a'], { selectionMode: 'selected' }).timeline
        .cropRange,
    ).toBeNull();
  });

  it('resets crop to a remaining selected fragment after primary compaction', () => {
    const before = originalDocument();
    before.cropRange = { start: 12, end: 14 };
    expect(
      deleteClipTimelineSelection(before, ['main-a'], { selectedClipIds: ['main-a', 'main-b'] })
        .timeline.cropRange,
    ).toEqual({ start: 0, end: 4 });
  });

  it('is a no-op for empty selection and missing single fragment', () => {
    const before = originalDocument();
    expect(deleteClipTimelineSelection(before, [])).toEqual({
      status: 'unchanged',
      timeline: originalDocument(),
      selectedClipIds: [],
      deletedSourceNodeIds: [],
    });
    expect(
      deleteClipTimelineSelection(before, ['missing'], { selectionMode: 'single' }).timeline,
    ).toBe(before);
  });

  it('orders same-time fragments by their original ID and preserves all unedited clip fields', () => {
    const before = createClipTimelineDocument({
      clips: [
        { id: 'z', type: 'video', zIndex: 0, startTime: 5, duration: 2, unknown: 8 },
        { id: 'a', type: 'video', zIndex: 0, startTime: 5, duration: 3, unknown: 9 },
        { id: 'removed', type: 'audio', zIndex: 1, startTime: 0, duration: 1 },
      ],
      videoTrackCount: 1,
    });
    expect(deleteClipTimelineSelection(before, ['removed']).timeline.clips).toEqual([
      { id: 'a', type: 'video', zIndex: 0, startTime: 0, duration: 3, unknown: 9 },
      { id: 'z', type: 'video', zIndex: 0, startTime: 3, duration: 2, unknown: 8 },
    ]);
  });

  it('uses editor 0.05 extent rather than Canvas disconnect 60-second fallback', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 1,
      clips: [
        { id: 'tiny', type: 'video', zIndex: 0, startTime: 0, duration: 0.01 },
        { id: 'sound', type: 'audio', zIndex: 1, startTime: 0, duration: 1 },
      ],
    });
    expect(deleteClipTimelineSelection(before, ['sound']).timeline.totalDuration).toBe(0.05);
  });

  it('keeps legacy global audio mute after all clips disappear, matching the empty compact branch', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 0,
      clips: [
        {
          id: 'sound',
          sourceNodeId: 'sound-source',
          type: 'audio',
          zIndex: 0,
          startTime: 4,
          duration: 2,
        },
      ],
      audioTrackMuted: true,
      audioTrackMutedPerTrack: [true],
      currentTime: 70,
      cropRange: { start: 4, end: 6 },
    });
    expect(deleteClipTimelineSelection(before, ['sound'])).toEqual({
      status: 'deleted',
      selectedClipIds: [],
      deletedSourceNodeIds: ['sound-source'],
      timeline: {
        videoSourceNodeIds: [],
        audioSourceNodeIds: [],
        clips: [],
        videoTrackCount: 0,
        totalDuration: 60,
        currentTime: 60,
        scale: 100,
        scrollX: 0,
        videoAudioMuted: false,
        videoAudioMutedPerTrack: [],
        videoTrackHiddenPerTrack: [],
        videoAudioVolume: 1,
        audioTrackMuted: true,
        audioTrackMutedPerTrack: [true],
        audioTrackHiddenPerTrack: [],
        audioTrackVolume: 1,
        cropRange: null,
      },
    });
  });

  it('keeps a reserved empty main track when the last overlay is deleted', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 2,
      clips: [{ id: 'overlay', type: 'video', zIndex: 0, startTime: 1, duration: 3 }],
      videoAudioMuted: true,
      videoAudioMutedPerTrack: [false, true],
      videoTrackHiddenPerTrack: [true, false],
    });
    const result = deleteClipTimelineSelection(before, ['overlay']);
    expect(result.timeline).toEqual({
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
      clips: [],
      videoTrackCount: 1,
      totalDuration: 60,
      currentTime: 0,
      scale: 100,
      scrollX: 0,
      videoAudioMuted: false,
      videoAudioMutedPerTrack: [false],
      videoTrackHiddenPerTrack: [true],
      videoAudioVolume: 1,
      audioTrackMuted: false,
      audioTrackMutedPerTrack: [],
      audioTrackHiddenPerTrack: [],
      audioTrackVolume: 1,
      cropRange: null,
    });
  });

  it('uses the exact second normalize remap for audio controls after authored track gaps', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 1,
      clips: [
        { id: 'main', type: 'video', zIndex: 0, startTime: 0, duration: 2 },
        { id: 'remove', type: 'audio', zIndex: 1, startTime: 0, duration: 1 },
        { id: 'retained', type: 'audio', zIndex: 4, audioTrack: 3, startTime: 4, duration: 1 },
      ],
      audioTrackMutedPerTrack: [true, false, false, false],
      audioTrackHiddenPerTrack: [false, false, false, true],
    });
    const result = deleteClipTimelineSelection(before, ['remove']);
    expect(result.timeline.clips).toEqual([
      { id: 'main', type: 'video', zIndex: 0, startTime: 0, duration: 2 },
      { id: 'retained', type: 'audio', zIndex: 1, startTime: 4, duration: 1 },
    ]);
    expect(result.timeline.audioTrackMutedPerTrack).toEqual([true]);
    expect(result.timeline.audioTrackHiddenPerTrack).toEqual([false]);
  });

  it('preserves unresolved linked audio IDs and first-primary transition', () => {
    const before = originalDocument();
    before.clips[3].linkedVideoClipId = 'main-a';
    const result = deleteClipTimelineSelection(before, ['main-a']);
    expect(result.timeline.clips[0].transitionIn).toEqual({ type: 'fade', duration: 0.4 });
    expect(result.timeline.clips[2]).toEqual({
      id: 'audio',
      sourceNodeId: 'audio',
      type: 'audio',
      zIndex: 2,
      startTime: 12,
      duration: 4,
      sourceOffset: 0,
      sourceDuration: 30,
      linkedVideoClipId: 'main-a',
      decibel: -6,
    });
  });

  it('remaps video controls from authored tracks without resetting mute or hidden states', () => {
    const before = createClipTimelineDocument({
      videoTrackCount: 4,
      clips: [
        { id: 'main', type: 'video', zIndex: 3, startTime: 7, duration: 2 },
        { id: 'remove', type: 'video', zIndex: 0, startTime: 0, duration: 1 },
        { id: 'overlay', type: 'video', zIndex: 2, startTime: 9, duration: 3 },
      ],
      videoAudioMutedPerTrack: [false, false, true, false],
      videoTrackHiddenPerTrack: [true, false, false, true],
    });
    const result = deleteClipTimelineSelection(before, ['remove']);
    expect(result.timeline.videoTrackCount).toBe(2);
    expect(result.timeline.videoAudioMutedPerTrack).toEqual([true, false]);
    expect(result.timeline.videoTrackHiddenPerTrack).toEqual([false, true]);
  });
});

describe('clip editor viewport and per-track controls', () => {
  it('clamps seek to source timeline extent without rewriting media or viewport', () => {
    const before = originalDocument();
    expect(seekClipTimelineDocument(before, -5)).toEqual({ ...originalDocument(), currentTime: 0 });
    expect(seekClipTimelineDocument(before, 100)).toEqual({
      ...originalDocument(),
      currentTime: 60,
    });
    expect(seekClipTimelineDocument(before, 0)).toEqual({ ...originalDocument(), currentTime: 0 });
  });

  it('clamps zoom to source 2–500 and scroll to zero', () => {
    const before = originalDocument();
    expect(setClipTimelineView(before, { scale: 1, scrollX: -1 })).toEqual({
      ...originalDocument(),
      scale: 2,
      scrollX: 0,
    });
    expect(setClipTimelineView(before, { scale: 900 })).toEqual({
      ...originalDocument(),
      scale: 500,
    });
  });

  it('expands video per-track mute from the legacy global state', () => {
    const before = originalDocument();
    before.videoAudioMuted = true;
    before.videoAudioMutedPerTrack = [];
    expect(
      setClipTimelineTrackControl(before, {
        kind: 'video',
        control: 'muted',
        trackIndex: 1,
        value: false,
      }),
    ).toEqual({ ...before, videoAudioMuted: false, videoAudioMutedPerTrack: [true, false] });
  });

  it('does not apply the old global audio mute to newly created per-track audio controls', () => {
    const before = originalDocument();
    before.audioTrackMutedPerTrack = [];
    expect(
      setClipTimelineTrackControl(before, {
        kind: 'audio',
        control: 'muted',
        trackIndex: 2,
        value: true,
      }),
    ).toEqual({ ...before, audioTrackMuted: false, audioTrackMutedPerTrack: [false, false, true] });
  });

  it('changes video/audio visibility only, preserving all mute and content fields', () => {
    const before = freezeDeep(originalDocument());
    expect(
      setClipTimelineTrackControl(before, {
        kind: 'video',
        control: 'hidden',
        trackIndex: 1,
        value: true,
      }),
    ).toEqual({ ...originalDocument(), videoTrackHiddenPerTrack: [true, true] });
    expect(
      setClipTimelineTrackControl(before, {
        kind: 'audio',
        control: 'hidden',
        trackIndex: 0,
        value: false,
      }),
    ).toEqual({ ...originalDocument(), audioTrackHiddenPerTrack: [false] });
  });

  it('rejects unrecognized control types', () => {
    expect(() =>
      setClipTimelineTrackControl(originalDocument(), {
        kind: 'picture',
        control: 'muted',
        trackIndex: 0,
        value: true,
      }),
    ).toThrow(TypeError);
    expect(() =>
      setClipTimelineTrackControl(originalDocument(), {
        kind: 'video',
        control: 'speed',
        trackIndex: 0,
        value: true,
      }),
    ).toThrow(TypeError);
  });
});

describe('independent ten-entry clip editor history', () => {
  it('captures original documents independently and clears redo on a new edit', () => {
    const initial = originalDocument();
    const oldHistory = { past: [], future: [{ timeline: { clips: [] }, selectedClipIds: [] }] };
    const next = pushClipTimelineHistory(oldHistory, initial, ['main-a']);
    expect(next).toEqual({
      past: [{ timeline: originalDocument(), selectedClipIds: ['main-a'] }],
      future: [],
    });
    initial.clips[0].futureClipField.safe = false;
    expect(next.past[0].timeline).toEqual(originalDocument());
    expect(oldHistory.future).toHaveLength(1);
  });

  it('caps recording at the original engine ten snapshots', () => {
    let history = createClipTimelineHistory();
    for (let currentTime = 0; currentTime < 12; currentTime++)
      history = pushClipTimelineHistory(history, { ...originalDocument(), currentTime });
    expect(CLIP_EDITOR_HISTORY_LIMIT).toBe(10);
    expect(history.past.map((entry) => entry.timeline.currentTime)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it('restores complete literal documents, selected IDs and source set differences on undo/redo', () => {
    const initial = originalDocument();
    const changed = deletedLiteralDocument();
    const history = pushClipTimelineHistory(createClipTimelineHistory(), initial, ['main-a']);
    const undo = stepClipTimelineHistory(history, 'undo', changed, []);
    expect(undo).toEqual({
      history: { past: [], future: [{ timeline: deletedLiteralDocument(), selectedClipIds: [] }] },
      timeline: { ...originalDocument(), currentTime: 17, audioTrackMuted: false },
      selectedClipIds: ['main-a'],
      restoredSourceNodeIds: ['source-a'],
      deletedSourceNodeIds: [],
    });
    const redo = stepClipTimelineHistory(undo.history, 'redo', undo.timeline, undo.selectedClipIds);
    expect(redo).toEqual({
      history: {
        past: [
          {
            timeline: { ...originalDocument(), currentTime: 17, audioTrackMuted: false },
            selectedClipIds: ['main-a'],
          },
        ],
        future: [],
      },
      timeline: deletedLiteralDocument(),
      selectedClipIds: [],
      restoredSourceNodeIds: [],
      deletedSourceNodeIds: ['source-a'],
    });
  });

  it('keeps a current playhead in a timeline gap instead of snapping to a clip or saved time', () => {
    const snapshot = { timeline: originalDocument(), selectedClipIds: [] };
    const restored = restoreClipTimelineSnapshot(
      { ...deletedLiteralDocument(), currentTime: 20 },
      snapshot,
    );
    expect(restored.timeline.currentTime).toBe(20);
    expect(restored.timeline.currentTime).not.toBe(50);
  });

  it('clamps out-of-range history playheads and preserves NaN source behavior', () => {
    const snapshot = { timeline: deletedLiteralDocument(), selectedClipIds: [] };
    expect(
      restoreClipTimelineSnapshot({ ...originalDocument(), currentTime: 100 }, snapshot).timeline
        .currentTime,
    ).toBe(17);
    expect(
      restoreClipTimelineSnapshot({ ...originalDocument(), currentTime: -5 }, snapshot).timeline
        .currentTime,
    ).toBe(0);
    expect(
      restoreClipTimelineSnapshot({ ...originalDocument(), currentTime: NaN }, snapshot).timeline
        .currentTime,
    ).toBe(17);
  });

  it('resolves a clamped negative playhead to the end if the restored document has no clip at zero', () => {
    const snapshot = {
      timeline: {
        ...originalDocument(),
        clips: [{ id: 'late', type: 'video', startTime: 5, duration: 5, zIndex: 0 }],
        videoTrackCount: 1,
        totalDuration: 10,
      },
      selectedClipIds: [],
    };
    expect(
      restoreClipTimelineSnapshot({ ...originalDocument(), currentTime: -1 }, snapshot).timeline
        .currentTime,
    ).toBe(10);
  });

  it('restores per-track controls from global fallback without losing extensions', () => {
    const saved = originalDocument();
    delete saved.videoAudioMutedPerTrack;
    delete saved.audioTrackMutedPerTrack;
    saved.videoAudioMuted = true;
    const result = restoreClipTimelineSnapshot(deletedLiteralDocument(), {
      timeline: saved,
      selectedClipIds: ['main-b'],
    });
    expect(result.timeline.videoAudioMutedPerTrack).toEqual([true, true]);
    expect(result.timeline.audioTrackMutedPerTrack).toEqual([true]);
    expect(result.timeline.videoTrackHiddenPerTrack).toEqual([true, false]);
    expect(result.timeline.audioTrackHiddenPerTrack).toEqual([true]);
    expect(result.timeline.futureTimelineField).toEqual({ nested: ['keep', { unchanged: true }] });
  });

  it('returns no history result for empty stacks and rejects unrecognized actions', () => {
    expect(
      stepClipTimelineHistory(createClipTimelineHistory(), 'undo', originalDocument()),
    ).toBeNull();
    expect(
      stepClipTimelineHistory(createClipTimelineHistory(), 'redo', originalDocument()),
    ).toBeNull();
    expect(() =>
      stepClipTimelineHistory(createClipTimelineHistory(), 'reset', originalDocument()),
    ).toThrow(TypeError);
  });

  it('deduplicates source changes in original clip encounter order across kinds', () => {
    const before = {
      clips: [
        { sourceNodeId: 'a' },
        { sourceNodeId: 'b' },
        { sourceNodeId: 'a', type: 'audio' },
        {},
      ],
    };
    const after = {
      clips: [
        { sourceNodeId: 'c' },
        { sourceNodeId: 'b' },
        { sourceNodeId: 'd' },
        { sourceNodeId: 'c' },
      ],
    };
    expect(clipTimelineSourceDifferences(before, after)).toEqual({
      restoredSourceNodeIds: ['c', 'd'],
      deletedSourceNodeIds: ['a'],
    });
  });
});
