import { describe, expect, it } from 'vitest';
import { normalizeClipTrackZIndexes } from './track-model.js';
import { disconnectClipTimelineSource } from './timeline-model.js';
import { isClipAgentEditingActive, resolveCanvasClipDisconnect } from './disconnect-model.js';

function complexTimeline() {
  return {
    videoSourceNodeIds: ['remove', 'overlay', 'keep', 'overlay', 'old-unused'],
    audioSourceNodeIds: ['sound'],
    videoTrackCount: 8,
    currentTime: 150,
    totalDuration: 999,
    mutedClipIds: ['deleted', 'lost-audio'],
    hiddenTrackIndices: [7],
    arbitrary: { nested: 'retain' },
    clips: [
      {
        id: 'overlay-late',
        type: 'video',
        sourceNodeId: 'overlay',
        startTime: 7,
        duration: 2,
        zIndex: 2,
        transitionIn: 'overlay-late-transition',
      },
      {
        id: 'main-later',
        type: 'video',
        sourceNodeId: 'keep',
        startTime: 50,
        duration: 5,
        zIndex: 7,
        transitionIn: 'later-transition',
      },
      {
        id: 'deleted',
        type: 'video',
        sourceNodeId: 'remove',
        startTime: 0,
        duration: 4,
        zIndex: 7,
      },
      {
        id: 'overlay-early',
        type: 'video',
        sourceNodeId: 'overlay',
        startTime: 1,
        duration: 3,
        zIndex: 2,
        transitionIn: 'overlay-early-transition',
      },
      {
        id: 'main-first',
        type: 'video',
        sourceNodeId: 'keep',
        startTime: 20,
        duration: 2,
        zIndex: 7,
        transitionIn: 'first-transition',
      },
      {
        id: 'linked-audio',
        type: 'audio',
        sourceNodeId: 'sound',
        startTime: 80,
        duration: 1,
        zIndex: 9,
        audioTrack: 3,
        linkedVideoClipId: 'main-first',
        volume: 0.5,
      },
      {
        id: 'lost-audio',
        type: 'audio',
        sourceNodeId: 'recovered-sound',
        startTime: 100,
        duration: 4,
        zIndex: 10,
        audioTrack: 8,
        linkedVideoClipId: 'deleted',
      },
      {
        id: 'same-source-audio',
        type: 'audio',
        sourceNodeId: 'remove',
        startTime: 12,
        duration: 1,
        zIndex: 8,
        audioTrack: 0,
      },
      { id: 'orphan', type: 'video', startTime: 400, duration: 200, zIndex: 0 },
    ],
  };
}

describe('source clip timeline disconnect and mD preflight', () => {
  it('performs both normalizations, stable track grouping, main packing, audio links, transition and playhead rules with literal full expected', () => {
    const input = complexTimeline(),
      untouched = structuredClone(input);
    const output = disconnectClipTimelineSource(input, 'remove', 'video');
    expect(output).toEqual({
      videoSourceNodeIds: ['overlay', 'keep', 'overlay', 'old-unused'],
      audioSourceNodeIds: ['sound', 'recovered-sound', 'remove'],
      videoTrackCount: 2,
      currentTime: 104,
      totalDuration: 104,
      mutedClipIds: ['deleted', 'lost-audio'],
      hiddenTrackIndices: [7],
      arbitrary: { nested: 'retain' },
      clips: [
        {
          id: 'overlay-early',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: 1,
          duration: 3,
          zIndex: 0,
          transitionIn: 'overlay-early-transition',
        },
        {
          id: 'overlay-late',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: 7,
          duration: 2,
          zIndex: 0,
          transitionIn: 'overlay-late-transition',
        },
        {
          id: 'main-first',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 0,
          duration: 2,
          zIndex: 1,
        },
        {
          id: 'main-later',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 2,
          duration: 5,
          zIndex: 1,
          transitionIn: 'later-transition',
        },
        {
          id: 'linked-audio',
          type: 'audio',
          sourceNodeId: 'sound',
          startTime: 0,
          duration: 1,
          zIndex: 3,
          linkedVideoClipId: 'main-first',
          volume: 0.5,
        },
        {
          id: 'lost-audio',
          type: 'audio',
          sourceNodeId: 'recovered-sound',
          startTime: 100,
          duration: 4,
          zIndex: 4,
        },
        {
          id: 'same-source-audio',
          type: 'audio',
          sourceNodeId: 'remove',
          startTime: 12,
          duration: 1,
          zIndex: 2,
        },
      ],
    });
    expect(input).toEqual(untouched);
  });

  it('retains the old main-track slot even when empty and normalizes explicit legacy audioTrack ahead of global zIndex', () => {
    const result = normalizeClipTrackZIndexes(
      [
        { id: 'low', type: 'video', zIndex: -3 },
        { id: 'high', type: 'video', zIndex: 2.9 },
        { id: 'audio-high', type: 'audio', zIndex: 0, audioTrack: 10.9 },
        { id: 'audio-low', type: 'audio', zIndex: 11 },
      ],
      { videoTrackCount: 8 },
    );
    expect(result.clips).toEqual([
      { id: 'low', type: 'video', zIndex: 0 },
      { id: 'high', type: 'video', zIndex: 1 },
      { id: 'audio-high', type: 'audio', zIndex: 4 },
      { id: 'audio-low', type: 'audio', zIndex: 3 },
    ]);
    expect(result.videoTrackCount).toBe(3);
    expect(result.audioTrackCount).toBe(2);
    expect([...result.audioTrackRemap]).toEqual([
      [3, 0],
      [10, 1],
    ]);
    expect(result.changed).toBe(true);
  });

  it('uses finite nonnegative floored tracks, preserves input order and removes legacy audioTrack even on video', () => {
    expect(
      normalizeClipTrackZIndexes([
        { id: 'nan', type: 'video', zIndex: NaN, audioTrack: 8 },
        { id: 'inf', type: 'video', zIndex: Infinity },
        { id: 'string', type: 'audio', zIndex: '8', audioTrack: -1 },
      ]).clips,
    ).toEqual([
      { id: 'nan', type: 'video', zIndex: 0 },
      { id: 'inf', type: 'video', zIndex: 0 },
      { id: 'string', type: 'audio', zIndex: 1 },
    ]);
  });

  it('a source-list-only hit only filters that list, without packing clips or clamping the playhead', () => {
    const clips = [
      { id: 'keep', type: 'video', sourceNodeId: 'other', startTime: 20, duration: 4, zIndex: 8 },
    ];
    const input = {
      videoSourceNodeIds: ['remove', 'other', 'remove', 'other'],
      audioSourceNodeIds: ['remove'],
      clips,
      currentTime: 999,
      totalDuration: 7,
      videoTrackCount: 10,
    };
    expect(disconnectClipTimelineSource(input, 'remove', 'video')).toEqual({
      ...input,
      videoSourceNodeIds: ['other', 'other'],
    });
    expect(disconnectClipTimelineSource(input, 'remove', 'video').clips).toBe(clips);
  });

  it('preserves video clips of the same ID when deleting audio and treats every non-audio clip as video', () => {
    const input = {
      currentTime: 15,
      videoTrackCount: 1,
      totalDuration: 100,
      videoSourceNodeIds: [],
      audioSourceNodeIds: ['same'],
      clips: [
        {
          id: 'video',
          type: 'custom-kind',
          sourceNodeId: 'same',
          startTime: 10,
          duration: 3,
          zIndex: 0,
          transitionIn: 'drop',
        },
        {
          id: 'audio',
          type: 'audio',
          sourceNodeId: 'same',
          startTime: 10,
          duration: 10,
          zIndex: 1,
        },
      ],
    };
    expect(disconnectClipTimelineSource(input, 'same', 'audio')).toEqual({
      currentTime: 3,
      videoTrackCount: 1,
      totalDuration: 3,
      videoSourceNodeIds: ['same'],
      audioSourceNodeIds: [],
      clips: [
        {
          id: 'video',
          type: 'custom-kind',
          sourceNodeId: 'same',
          startTime: 0,
          duration: 3,
          zIndex: 0,
        },
      ],
    });
  });

  it('does not tie-break same-time main clips by ID and keeps later transition even when the first has no transition', () => {
    const input = {
      currentTime: 0,
      videoSourceNodeIds: ['keep', 'remove'],
      clips: [
        {
          id: 'z-first',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 9,
          duration: 2,
          zIndex: 0,
        },
        {
          id: 'a-second',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 9,
          duration: 4,
          zIndex: 0,
          transitionIn: 'retain',
        },
        {
          id: 'delete',
          type: 'video',
          sourceNodeId: 'remove',
          startTime: 30,
          duration: 3,
          zIndex: 0,
        },
      ],
    };
    expect(disconnectClipTimelineSource(input, 'remove', 'video').clips).toEqual([
      { id: 'z-first', type: 'video', sourceNodeId: 'keep', startTime: 0, duration: 2, zIndex: 0 },
      {
        id: 'a-second',
        type: 'video',
        sourceNodeId: 'keep',
        startTime: 2,
        duration: 4,
        zIndex: 0,
        transitionIn: 'retain',
      },
    ]);
  });

  it('uses 60-second empty extent rather than old duration or .05 and keeps an empty reserved main track', () => {
    expect(
      disconnectClipTimelineSource(
        {
          currentTime: 80,
          totalDuration: 500,
          videoTrackCount: 1,
          clips: [
            {
              id: 'only',
              type: 'video',
              sourceNodeId: 'remove',
              startTime: 0,
              duration: 2,
              zIndex: 0,
            },
          ],
        },
        'remove',
        'video',
      ),
    ).toEqual({
      currentTime: 60,
      totalDuration: 60,
      videoTrackCount: 1,
      clips: [],
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
    });
  });

  it('does not invent zero for a missing source currentTime', () => {
    const output = disconnectClipTimelineSource(
      { clips: [{ type: 'video', sourceNodeId: 'remove', startTime: 0, duration: 2 }] },
      'remove',
      'video',
    );
    expect(output.currentTime).toBeNaN();
    expect(output.totalDuration).toBe(60);
  });

  it('ignores nonfinite overlay ends for extent, keeps overlay times and transitions, and clamps negative playback to zero', () => {
    const input = {
      currentTime: -20,
      totalDuration: 999,
      videoTrackCount: 2,
      clips: [
        {
          id: 'remove-main',
          type: 'video',
          sourceNodeId: 'remove',
          startTime: 0,
          duration: 2,
          zIndex: 1,
        },
        {
          id: 'infinite-overlay',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: Infinity,
          duration: 3,
          zIndex: 0,
          transitionIn: 'keep',
        },
        {
          id: 'finite-overlay',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: 9,
          duration: 4,
          zIndex: 0,
          transitionIn: 'also-keep',
        },
      ],
    };
    expect(disconnectClipTimelineSource(input, 'remove', 'video')).toEqual({
      currentTime: 0,
      totalDuration: 13,
      videoTrackCount: 2,
      videoSourceNodeIds: ['overlay'],
      audioSourceNodeIds: [],
      clips: [
        {
          id: 'finite-overlay',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: 9,
          duration: 4,
          zIndex: 0,
          transitionIn: 'also-keep',
        },
        {
          id: 'infinite-overlay',
          type: 'video',
          sourceNodeId: 'overlay',
          startTime: Infinity,
          duration: 3,
          zIndex: 0,
          transitionIn: 'keep',
        },
      ],
    });
  });

  it.each(['', null, undefined])('does no work for falsy source ID %s', (id) => {
    expect(disconnectClipTimelineSource(complexTimeline(), id, 'video')).toBeNull();
  });

  it('returns null for no list or clip hit', () => {
    expect(disconnectClipTimelineSource(complexTimeline(), 'not-found', 'video')).toBeNull();
  });

  it.each([
    [{ state: 'running', startedAtMs: 0 }, 3_599_999, true],
    [{ state: 'running', startedAtMs: 0 }, 3_600_000, false],
    [{ state: 'running', startedAtMs: 0 }, 3_600_001, false],
    [{ state: 'running', startedAtMs: 500 }, 100, true],
    [{ state: 'running', startedAtMs: '0' }, 4_000_000, true],
    [{ state: 'running' }, 4_000_000, true],
    [{ state: 'running', startedAtMs: NaN }, 4_000_000, false],
    [{ state: 'running', startedAtMs: Infinity }, 4_000_000, true],
    [{ state: 'Running', startedAtMs: 0 }, 100, false],
    [null, 100, false],
  ])('preserves source active-agent typeof/hour boundary %j/%s', (editing, now, expected) => {
    expect(isClipAgentEditingActive(editing, now)).toBe(expected);
  });

  it('aggregates same-target edges once in first-target/request order, keeps duplicate IDs and handles absent timeline', () => {
    const nodes = [
      { id: 'v', type: 'video', data: {} },
      { id: 'a', type: 'audio', data: {} },
      { id: 'first', type: 'video-clip', data: {} },
      { id: 'second', data: { type: 'video-clip' } },
    ];
    const edges = [
      { id: 'v-first', source: 'v', target: 'first' },
      { id: 'a-first', source: 'a', target: 'first' },
      { id: 'v-second', source: 'v', target: 'second' },
    ];
    expect(
      resolveCanvasClipDisconnect({
        nodes,
        edges,
        edgeIds: ['v-second', 'a-first', 'missing', 'v-first', 'v-first'],
        now: 0,
      }),
    ).toEqual({
      passthroughEdgeIds: ['missing'],
      blockedEdgeIds: [],
      transactions: [
        { targetNodeId: 'second', edgeIds: ['v-second'] },
        { targetNodeId: 'first', edgeIds: ['a-first', 'v-first', 'v-first'] },
      ],
    });
  });

  it('prioritizes nullish flow type over raw data and does not require usable URLs or ready media', () => {
    const nodes = [
      { id: 'flow-image', type: 'image', data: { type: 'video', url: [] } },
      { id: 'raw-video', type: null, data: { type: 'video', url: [], ready: false } },
      { id: 'clip', type: 'video-clip', data: {} },
    ];
    const edges = [
      { id: 'ordinary', source: 'flow-image', target: 'clip' },
      { id: 'clip-edge', source: 'raw-video', target: 'clip' },
    ];
    expect(
      resolveCanvasClipDisconnect({ nodes, edges, edgeIds: ['ordinary', 'clip-edge'] }),
    ).toEqual({
      passthroughEdgeIds: ['ordinary'],
      blockedEdgeIds: [],
      transactions: [{ targetNodeId: 'clip', edgeIds: ['clip-edge'] }],
    });
  });

  it('busy keeps legal clip edges without transactions but leaves missing or unsupported edges passthrough', () => {
    const nodes = [
      { id: 'v', type: 'video' },
      {
        id: 'clip',
        type: 'video-clip',
        data: { agentEditing: { state: 'running', startedAtMs: 0 } },
      },
      { id: 'image', type: 'image' },
    ];
    const edges = [
      { id: 'clip', source: 'v', target: 'clip' },
      { id: 'other', source: 'image', target: 'clip' },
    ];
    expect(
      resolveCanvasClipDisconnect({
        nodes,
        edges,
        edgeIds: ['clip', 'other', 'missing'],
        now: 100,
      }),
    ).toEqual({
      passthroughEdgeIds: ['other', 'missing'],
      blockedEdgeIds: ['clip'],
      transactions: [],
    });
  });

  it('sequential video then audio same-target disconnection patches the final timeline only once', () => {
    const timeline = {
      currentTime: 4,
      totalDuration: 8,
      videoTrackCount: 1,
      clips: [
        { id: 'video', type: 'video', sourceNodeId: 'v', startTime: 0, duration: 2, zIndex: 0 },
        {
          id: 'audio',
          type: 'audio',
          sourceNodeId: 'a',
          startTime: 0,
          duration: 8,
          zIndex: 1,
          linkedVideoClipId: 'video',
        },
      ],
    };
    const nodes = [
      { id: 'v', type: 'video' },
      { id: 'a', type: 'audio' },
      { id: 'clip', type: 'video-clip', data: { clipTimelineData: timeline } },
    ];
    expect(
      resolveCanvasClipDisconnect({
        nodes,
        edges: [
          { id: 'v-edge', source: 'v', target: 'clip' },
          { id: 'a-edge', source: 'a', target: 'clip' },
        ],
        edgeIds: ['v-edge', 'a-edge'],
      }).transactions,
    ).toEqual([
      {
        targetNodeId: 'clip',
        edgeIds: ['v-edge', 'a-edge'],
        timelineDataPatch: {
          currentTime: 4,
          totalDuration: 60,
          videoTrackCount: 1,
          clips: [],
          videoSourceNodeIds: [],
          audioSourceNodeIds: [],
        },
      },
    ]);
  });
});
