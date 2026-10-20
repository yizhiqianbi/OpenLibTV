import { StrictMode, useRef, useState } from 'react';
import { webcrypto } from 'node:crypto';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasClipEditor } from './useCanvasClipEditor.js';
import { useCanvasGraphActions } from '../hooks/useCanvasGraphActions.js';
import { useCanvasDrafts } from '../hooks/useCanvasDrafts.js';
import { useCanvasAutosave } from '../hooks/useCanvasDocument.js';
import { createClipTextTools } from './text/controls.js';
import { readTextOverlayHtml } from './text/html-document.js';
import { readTextStyle } from './text/document-model.js';
import { createSubtitleHtml, readSubtitleHtml } from './text/html-document.js';
import { htmlSubtitleLoadPlan } from './domain/html-subtitle-sources.js';
import { readHtmlSubtitleStyle } from './text/subtitle-style-document.js';
import { materializeHtmlSubtitles } from './text/subtitle-materialization.js';
import { subtitleMigrationSourcePlan } from './domain/subtitle-migration-model.js';
import { mergeSubtitleSources } from './domain/subtitle-vtt.js';

const storageKey = 'clip-review-document';
const initialTimeline = {
  clips: [
    {
      id: 'saved-1',
      sourceNodeId: 'video-1',
      type: 'video',
      zIndex: 0,
      startTime: 0,
      duration: 10,
      sourceOffset: 0,
      sourceDuration: 10,
      width: 1920,
      height: 1080,
    },
  ],
  videoSourceNodeIds: ['video-1'],
  audioSourceNodeIds: [],
  videoTrackCount: 1,
  totalDuration: 10,
  currentTime: 0,
  scale: 100,
  scrollX: 0,
};
const source = (id, url) => ({
  id,
  type: 'video',
  position: { x: 0, y: 0 },
  data: { type: 'video', url: [url], name: id },
});
const clip = (id, timelineFields = {}) => ({
  id,
  type: 'video-clip',
  position: { x: 400, y: 0 },
  data: {
    type: 'video-clip',
    name: id,
    clipTimelineData: { ...structuredClone(initialTimeline), ...timelineFields },
  },
});
const metadata = (url) => ({ url, sourceDuration: 10, width: 1920, height: 1080, hasAudio: false });

function harness({ authoritative = false, strict = false, synchronizeSavedDrafts = false } = {}) {
  let serial = 0;
  const notify = vi.fn(),
    uploadFiles = vi.fn().mockResolvedValue([]),
    makeId = () => `review-${++serial}`;
  const initial = {
    documentKey: storageKey,
    ready: true,
    readonly: false,
    models: [],
    nodes: [
      clip('clip-a', authoritative ? { clipsAuthoritative: true } : {}),
      clip('clip-b'),
      source('video-1', '/one.mp4'),
    ],
    edges: [
      { id: 'a-edge', source: 'video-1', target: 'clip-a' },
      { id: 'b-edge', source: 'video-1', target: 'clip-b' },
    ],
  };
  return renderHook(
    ({ documentKey = storageKey, readonly = false, ready = true }) => {
      const [graph, setGraph] = useState(initial);
      const currentDocument = useRef(graph);
      currentDocument.current = { ...graph, documentKey, readonly, ready };
      const drafts = useCanvasDrafts({ storageKey: documentKey, nodes: graph.nodes, ready });
      const graphActions = useCanvasGraphActions({
        documentKey,
        currentDocument,
        setNodes: (nodes) => setGraph((previous) => ({ ...previous, nodes })),
        setEdges: (edges) => setGraph((previous) => ({ ...previous, edges })),
        recordSnapshot: vi.fn(),
        notify,
        projectGraph: (value, options) =>
          drafts.project({ ...value, storageKey: documentKey }, options),
        consumeDrafts: drafts.consume,
      });
      const autosave = useCanvasAutosave(
        {
          ...graph,
          storageKey: documentKey,
          key: 'clip-review',
          title: 'clip review',
          view: { x: 0, y: 0, z: 1 },
        },
        {
          loaded: ready,
          readonly,
          user: { uuid: 'local-review' },
          setSaved: vi.fn(),
          notify,
          projectDrafts: drafts.project,
          acknowledgeDrafts: (saved) => {
            // Mirror NodeCanvas's actual successful-save publication, including
            // a playback frame advancing before React commits the saved graph.
            if (synchronizeSavedDrafts) {
              const current = currentDocument.current;
              const projected = drafts.project({ ...current, storageKey: documentKey });
              if (projected.nodes !== current.nodes) {
                currentDocument.current = { ...current, nodes: projected.nodes };
                setGraph((previous) => ({ ...previous, nodes: projected.nodes }));
              }
            }
            drafts.acknowledge(saved);
          },
        },
      );
      const controller = useCanvasClipEditor({
        documentKey,
        ready,
        readonly,
        nodes: graph.nodes,
        edges: graph.edges,
        getDocument: () => currentDocument.current,
        commitGraph: graphActions.commitGraph,
        flushGraph: autosave.flushGraph,
        registerDraft: drafts.register,
        board: { current: null },
        viewRef: { current: { x: 0, y: 0, z: 1 } },
        focusView: vi.fn(),
        setSelected: vi.fn(),
        cancelOtherGestures: vi.fn(),
        uploadFiles,
        notify,
        makeId,
      });
      return {
        controller,
        graph,
        setGraph,
        notify,
        uploadFiles,
        projectDrafts: () =>
          drafts.project({ ...currentDocument.current, storageKey: documentKey }),
        flushGraph: () => autosave.flushGraph(currentDocument.current),
        commitGraph: (next) =>
          graphActions.commitGraph(next, {
            expectedGraph: currentDocument.current,
            historyWriter: () => {},
          }),
      };
    },
    {
      initialProps: { documentKey: storageKey, readonly: false, ready: true },
      wrapper: strict ? ({ children }) => <StrictMode>{children}</StrictMode> : undefined,
    },
  );
}

function openReady(result, id) {
  act(() => expect(result.current.controller.open(id)).toBe(true));
  act(() => result.current.controller.onMetadata('video-1', metadata('/one.mp4')));
  act(() =>
    result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
  );
  expect(result.current.controller.state.ready).toBe(true);
}

beforeEach(() => localStorage.clear());

describe('VTT migration through real graph, pending input and history', () => {
  const setup = (hydrate = false) => {
    const suite = harness({ synchronizeSavedDrafts: true });
    const sourceTrack = {
      visible: true,
      cues: [{ id: 'origin', startTime: 1, endTime: 3, text: '原始VTT' }],
    };
    const clips = [
      { ...initialTimeline.clips[0], ...(hydrate ? { subtitleUrl: '/origin.vtt' } : {}) },
    ];
    const track = hydrate
      ? mergeSubtitleSources([{ clipId: clips[0].id, track: sourceTrack }], clips)
      : { visible: true, cues: [{ id: 'vtt', startTime: 1, endTime: 3, text: '原始VTT' }] };
    act(() =>
      suite.result.current.setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? {
                ...node,
                data: {
                  ...node.data,
                  clipTimelineData: {
                    ...node.data.clipTimelineData,
                    clips,
                    subtitles: track,
                    videoAudioMutedPerTrack: [false],
                    videoTrackHiddenPerTrack: [false],
                  },
                },
              }
            : node,
        ),
      })),
    );
    openReady(suite.result, 'clip-a');
    act(() => suite.result.current.controller.installTextTools(createClipTextTools));
    act(() => suite.result.current.controller.onSubtitleLoaded('ready'));
    act(() =>
      expect(suite.result.current.controller.onSelectSubtitle(track.cues[0].id)).toBe(true),
    );
    const plan = subtitleMigrationSourcePlan(suite.result.current.controller.state.timeline.clips);
    const loaded = () =>
      suite.result.current.controller.onSubtitleMigrationSources(plan.key, 'ready', [
        { ...plan.sources[0], track: sourceTrack },
      ]);
    return { ...suite, id: track.cues[0].id, plan, loaded };
  };
  const change = (result, id, text) => {
    act(() => result.current.controller.onSubtitleTextChange(id, text));
    act(() => expect(result.current.controller.onCommitSubtitleText()).toBe(true));
  };
  it('converts an edited manual VTT in the same history transaction, preserving VTT and exact undo/redo', () => {
    const { result, unmount, id } = setup();
    const before = structuredClone(result.current.controller.state.timeline);
    change(result, id, '迁移后的正文');
    const after = structuredClone(savedClipTimeline(result));
    expect(after.subtitles.cues[0].text).toBe('迁移后的正文');
    expect(readSubtitleHtml(after.subtitlesHtml['video-1'].htmlInline).cues[0]).toMatchObject({
      text: '迁移后的正文',
      clipId: 'saved-1',
      start: 1,
      duration: 2,
    });
    expect(result.current.controller.state.selectedHtmlSubtitle.key).toBe('video-1');
    expect(result.current.controller.state.history.past).toHaveLength(1);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(before);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(after);
    unmount();
  });
  it('keeps edits writable while sources load, captures an unblurred autosaved last input and amends just one history entry', () => {
    const { result, unmount, id, loaded } = setup(true);
    const before = structuredClone(result.current.controller.state.timeline);
    change(result, id, '等待来源的正文');
    expect(result.current.controller.state.subtitleMigrationPhase).toBe('pending');
    expect(savedClipTimeline(result).subtitlesHtml).toBeUndefined();
    act(() => result.current.controller.onSubtitleTextChange(id, '最后未失焦输入'));
    act(() => expect(result.current.flushGraph()).toBe(true));
    act(() => expect(loaded()).toBe(true));
    const after = structuredClone(savedClipTimeline(result));
    expect(readSubtitleHtml(after.subtitlesHtml['video-1'].htmlInline).cues[0].text).toBe(
      '最后未失焦输入',
    );
    expect(result.current.controller.state.subtitleTextDraft).toBeNull();
    expect(result.current.controller.state.history.past).toHaveLength(1);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(before);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(after);
    unmount();
  });
  it('does not complete a queued migration after undo or after an unrelated edit changed its history owner', () => {
    const { result, unmount, id, loaded } = setup(true);
    change(result, id, '已保存VTT');
    act(() =>
      result.current.controller.onSetTrackControl({
        kind: 'video',
        control: 'muted',
        trackIndex: 0,
        value: true,
      }),
    );
    expect(result.current.controller.state.pendingVttMigration).toBeNull();
    act(() => loaded());
    expect(savedClipTimeline(result).subtitlesHtml).toBeUndefined();
    expect(savedClipTimeline(result).videoAudioMutedPerTrack).toEqual([true]);
    expect(result.current.controller.state.history.past).toHaveLength(2);
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('已保存VTT');
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('原始VTT');
    unmount();
  });
  it('retains VTT and a current draft on hydration failure instead of writing partial HTML', () => {
    const { result, unmount, id, plan } = setup(true);
    change(result, id, '已保存');
    act(() => result.current.controller.onSubtitleTextChange(id, '仍在输入'));
    act(() => result.current.controller.onSubtitleMigrationSources(plan.key, 'failed'));
    expect(savedClipTimeline(result).subtitlesHtml).toBeUndefined();
    expect(result.current.controller.state.subtitleTextDraft.text).toBe('仍在输入');
    act(() => expect(result.current.controller.onCommitSubtitleText()).toBe(true));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('仍在输入');
    unmount();
  });
  it('migrates a VTT gesture at release and restores its original source time with one undo', () => {
    const { result, unmount, id } = setup();
    const before = structuredClone(result.current.controller.state.timeline);
    act(() => expect(result.current.controller.onBeginEdit()).toBe(true));
    act(() =>
      expect(
        result.current.controller.onEditPreview('subtitle', {
          kind: 'gesture',
          cueId: id,
          mode: 'move',
          delta: 1,
        }),
      ).toBe(true),
    );
    act(() => expect(result.current.controller.onEndEdit()).toBe(true));
    expect(
      readSubtitleHtml(savedClipTimeline(result).subtitlesHtml['video-1'].htmlInline).cues[0].start,
    ).toBe(2);
    expect(result.current.controller.state.history.past).toHaveLength(1);
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result)).toEqual(before);
    unmount();
  });
});

describe('mixed subtitle ownership in the real graph/history controller', () => {
  const setupMixed = (partial = false, synchronizeSavedDrafts = false) => {
    const suite = harness({ authoritative: true, synchronizeSavedDrafts });
    act(() =>
      suite.result.current.setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id !== 'clip-a'
            ? node
            : {
                ...node,
                data: {
                  ...node.data,
                  clipTimelineData: {
                    ...node.data.clipTimelineData,
                    clips: [
                      {
                        ...initialTimeline.clips[0],
                        subtitleHtmlUrl: '/caption.html',
                        subtitleUrl: '/caption.vtt',
                      },
                      ...(partial
                        ? [
                            {
                              ...initialTimeline.clips[0],
                              id: 'second',
                              startTime: 5,
                              duration: 5,
                              subtitleHtmlUrl: '/bad.html',
                            },
                          ]
                        : []),
                    ],
                    subtitles: {
                      visible: true,
                      cues: [{ id: 'vtt', startTime: 0, endTime: 2, text: '原VTT正文' }],
                    },
                  },
                },
              },
        ),
      })),
    );
    openReady(suite.result, 'clip-a');
    act(() => suite.result.current.controller.installTextTools(createClipTextTools));
    act(() => suite.result.current.controller.onSubtitleLoaded('ready'));
    const plan = htmlSubtitleLoadPlan(suite.result.current.controller.state.timeline);
    const html = createSubtitleHtml({
      compositionId: 'source-subtitle',
      width: 1920,
      height: 1080,
      duration: 10,
      cues: [
        {
          cueId: 'html',
          clipId: 'saved-1',
          start: 0,
          duration: 2,
          trackIndex: 0,
          text: '原HTML正文',
        },
      ],
    });
    return { ...suite, plan, layer: { ...plan.layers[0], html, sourceHtml: html } };
  };

  it('blocks stale VTT selection, edits and gestures while HTML owns editing and preserves VTT through HTML undo/redo', () => {
    const { result, unmount, plan, layer } = setupMixed();
    const original = structuredClone(savedClipTimeline(result).subtitles);
    act(() => {
      expect(result.current.controller.onSelectSubtitle('vtt')).toBe(false);
      expect(result.current.controller.onAddSubtitle({ force: true })).toBe(false);
      expect(result.current.controller.onEditSubtitle({ kind: 'delete', cueId: 'vtt' })).toBe(
        false,
      );
      expect(result.current.controller.onBeginEdit()).toBe(true);
      expect(
        result.current.controller.onEditPreview('subtitle', {
          kind: 'gesture',
          cueId: 'vtt',
          mode: 'move',
          delta: 1,
        }),
      ).toBe(false);
      expect(result.current.controller.onEndEdit()).toBe(true);
    });
    expect(savedClipTimeline(result).subtitles).toEqual(original);
    act(() => result.current.controller.onHtmlSubtitleLoaded(plan.key, [layer]));
    act(() =>
      expect(
        result.current.controller.onSelectHtmlSubtitle({
          key: layer.key,
          cueId: 'html',
          clipId: 'saved-1',
        }),
      ).toBe(true),
    );
    act(() => result.current.controller.onHtmlSubtitleTextChange('仅编辑HTML正文'));
    act(() => expect(result.current.controller.onCommitHtmlSubtitle()).toBe(true));
    expect(savedClipTimeline(result).subtitles).toEqual(original);
    expect(
      readSubtitleHtml(savedClipTimeline(result).subtitlesHtml[layer.key].htmlInline).cues[0].text,
    ).toBe('仅编辑HTML正文');
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).subtitlesHtml).toBeUndefined();
    expect(savedClipTimeline(result).subtitles).toEqual(original);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(
      readSubtitleHtml(savedClipTimeline(result).subtitlesHtml[layer.key].htmlInline).cues[0].text,
    ).toBe('仅编辑HTML正文');
    expect(savedClipTimeline(result).subtitles).toEqual(original);
    unmount();
  });

  it('falls back after all remote rejections and commits the last VTT draft before a retry reclaims ownership', () => {
    const { result, unmount, plan, layer } = setupMixed(false, true);
    act(() =>
      result.current.controller.onHtmlSubtitleLoaded(
        plan.key,
        [],
        [{ key: layer.key, nodeId: layer.nodeId, error: '远程字幕不可读取' }],
      ),
    );
    act(() => expect(result.current.controller.onSelectSubtitle('vtt')).toBe(true));
    act(() => result.current.controller.onSubtitleTextChange('vtt', '最后的VTT输入'));
    act(() => expect(result.current.flushGraph()).toBe(true));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('最后的VTT输入');
    act(() => result.current.controller.onRetryHtmlSubtitles());
    expect(result.current.controller.state.subtitleTextDraft).toBeNull();
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('最后的VTT输入');
    act(() => result.current.controller.onHtmlSubtitleLoadStatus(plan.key));
    act(() =>
      expect(result.current.controller.onEditSubtitle({ kind: 'delete', cueId: 'vtt' })).toBe(
        false,
      ),
    );
    act(() => result.current.controller.onHtmlSubtitleLoaded(plan.key, [layer]));
    expect(savedClipTimeline(result).subtitlesHtml).toBeUndefined();
    act(() => expect(result.current.controller.onSelectSubtitle('vtt')).toBe(false));
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('原VTT正文');
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('最后的VTT输入');
    unmount();
  });

  it('keeps a successful layer editable when another URL fails without serializing load receipts or dropping failed sources', () => {
    const { result, unmount, plan, layer } = setupMixed(true);
    expect(plan.layers).toHaveLength(2);
    act(() =>
      result.current.controller.onHtmlSubtitleLoaded(
        plan.key,
        [layer],
        [{ key: plan.layers[1].key, nodeId: layer.nodeId, error: '另一个HTML失败' }],
      ),
    );
    act(() =>
      expect(
        result.current.controller.onSelectHtmlSubtitle({
          key: layer.key,
          cueId: 'html',
          clipId: 'saved-1',
        }),
      ).toBe(true),
    );
    act(() =>
      expect(result.current.controller.onEditHtmlSubtitle({ fields: { color: '#00ff00' } })).toBe(
        true,
      ),
    );
    expect(
      savedClipTimeline(result).clips.find((clip) => clip.id === 'second').subtitleHtmlUrl,
    ).toBe('/bad.html');
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('原VTT正文');
    expect(savedClipTimeline(result)).not.toHaveProperty('htmlSubtitleSourceStates');
    expect(
      result.current.controller.state.htmlSubtitleSourceStates.map((state) => state.status),
    ).toEqual(['ready', 'rejected']);
    unmount();
  });
});

describe('HTML subtitle integration with the real graph/draft/history controller', () => {
  const add = (result) => {
    act(() => result.current.controller.installTextTools(createClipTextTools));
    act(() =>
      result.current.controller.onHtmlSubtitleLoaded(
        htmlSubtitleLoadPlan(result.current.controller.state.timeline).key,
        [],
      ),
    );
    act(() => expect(result.current.controller.onAddHtmlSubtitle()).toBe(true));
    return result.current.controller.state.selectedHtmlSubtitle;
  };
  const document = (result) => {
    const archives = savedClipTimeline(result).subtitlesHtml;
    return readSubtitleHtml(Object.values(archives)[0].htmlInline);
  };

  it('reads and upgrades a legacy remote source without saving until editing, then keeps one-step history after actual autosave acknowledgement', () => {
    const { result, unmount } = harness({ synchronizeSavedDrafts: true });
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? {
                ...node,
                data: {
                  ...node.data,
                  clipTimelineData: {
                    ...node.data.clipTimelineData,
                    videoAudioMutedPerTrack: [false],
                    videoTrackHiddenPerTrack: [false],
                    clips: node.data.clipTimelineData.clips.map((clip) => ({
                      ...clip,
                      subtitleHtmlUrl: '/legacy.html',
                    })),
                  },
                },
              }
            : node,
        ),
      })),
    );
    openReady(result, 'clip-a');
    act(() => result.current.controller.installTextTools(createClipTextTools));
    const plan = htmlSubtitleLoadPlan(result.current.controller.state.timeline);
    const raw =
      '<html><body><div id="root" data-width="1920" data-height="1080"><p data-start="0" data-duration="2"><span data-libtv-text>旧字幕正文</span></p></div></body></html>';
    const layer = {
      ...plan.layers[0],
      sourceHtml: raw,
      html: materializeHtmlSubtitles(
        { ...plan.layers[0], html: raw },
        result.current.controller.state.timeline.clips,
        result.current.controller.state.timeline.clips,
      ),
    };
    act(() => result.current.controller.onHtmlSubtitleLoaded(plan.key, [layer]));
    const before = structuredClone(result.current.controller.state.timeline);
    expect(before.subtitlesHtml).toBeUndefined();
    const cue = readSubtitleHtml(layer.html).cues[0];
    expect(readSubtitleHtml(layer.html).contractVersion).toBe(4);
    act(() =>
      expect(
        result.current.controller.onSelectHtmlSubtitle({
          key: layer.key,
          cueId: cue.cueId,
          clipId: 'saved-1',
        }),
      ).toBe(true),
    );
    act(() => result.current.controller.onHtmlSubtitleTextChange('旧字幕最后输入'));
    act(() => expect(result.current.flushGraph()).toBe(true));
    expect(document(result).cues[0].text).toBe('旧字幕最后输入');
    act(() => expect(result.current.controller.onCommitHtmlSubtitle()).toBe(true));
    const after = structuredClone(savedClipTimeline(result));
    expect(document(result).cues[0]).toMatchObject({
      cueId: cue.cueId,
      clipId: 'saved-1',
      start: 0,
      duration: 2,
    });
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(before);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result)).toEqual(after);
    expect(raw).not.toContain('libtv-subtitle/4');
    unmount();
  });

  it('persists a source word-highlight toggle without clearing its preset and undoes the whole change once', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const identity = add(result);
    act(() =>
      expect(
        result.current.controller.onEditHtmlSubtitle({
          preset: { id: 'gold', fields: { color: '#00ff00' } },
        }),
      ).toBe(true),
    );
    act(() =>
      expect(
        result.current.controller.onEditHtmlSubtitle({ fields: { wordHighlightEnabled: true } }),
      ).toBe(true),
    );
    expect(readHtmlSubtitleStyle(document(result), identity.cueId).wordHighlightEnabled).toBe(true);
    expect(document(result).cues[0].element.getAttribute('data-libtv-text-preset-id')).toBe('gold');
    expect(
      document(result).cues[0].element.querySelectorAll('[data-libtv-karaoke-unit]'),
    ).toHaveLength(4);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readHtmlSubtitleStyle(document(result), identity.cueId).wordHighlightEnabled).toBe(
      false,
    );
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(readHtmlSubtitleStyle(document(result), identity.cueId).wordHighlightEnabled).toBe(true);
    unmount();
  });

  it('applies highlight and appearance only to the selected source track, restoring other tracks and history exactly', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const identity = add(result);
    act(() =>
      expect(result.current.controller.onAddHtmlSubtitle({ force: true, trackIndex: 0 })).toBe(
        true,
      ),
    );
    const sameTrack = result.current.controller.state.selectedHtmlSubtitle;
    act(() =>
      expect(result.current.controller.onAddHtmlSubtitle({ force: true, trackIndex: 1 })).toBe(
        true,
      ),
    );
    const otherTrack = result.current.controller.state.selectedHtmlSubtitle;
    act(() => expect(result.current.controller.onSelectHtmlSubtitle(identity)).toBe(true));
    act(() =>
      expect(
        result.current.controller.onEditHtmlSubtitle({
          preset: {
            id: 'caption-style',
            fields: {
              wordHighlightEnabled: true,
              highlightTextColor: 'rgba(255, 0, 0, 0.37)',
              highlightBackgroundColor: 'rgba(0, 0, 255, 0.5)',
              cornerRadiusPx: 18,
            },
          },
        }),
      ).toBe(true),
    );
    const before = savedClipTimeline(result).subtitlesHtml;
    const otherBefore = document(result).cues.find((cue) => cue.cueId === otherTrack.cueId).element
      .outerHTML;
    act(() => expect(result.current.controller.onApplyHtmlSubtitleToAll()).toBe(true));
    expect(readHtmlSubtitleStyle(document(result), sameTrack.cueId)).toMatchObject({
      wordHighlightEnabled: true,
      highlightTextColor: 'rgba(255, 0, 0, 0.37)',
      highlightBackgroundColor: 'rgba(0, 0, 255, 0.5)',
      cornerRadiusPx: 18,
    });
    expect(
      document(result)
        .cues.find((cue) => cue.cueId === sameTrack.cueId)
        .element.getAttribute('data-libtv-text-preset-id'),
    ).toBe('caption-style');
    expect(
      document(result).cues.find((cue) => cue.cueId === otherTrack.cueId).element.outerHTML,
    ).toBe(otherBefore);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).subtitlesHtml).toEqual(before);
    unmount();
  });

  it('saves the last alpha color on pagehide and rejects its late completion without a second history entry', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const identity = add(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginHtmlSubtitleStyle({
        field: 'highlightTextColor',
        kind: 'color',
        readPending: () => 'rgba(10, 20, 30, 0.37)',
      });
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readHtmlSubtitleStyle(document(result), identity.cueId).highlightTextColor).toBe(
      'rgba(10, 20, 30, 0.37)',
    );
    act(() => expect(result.current.controller.onEndHtmlSubtitleStyle(token)).toBe(false));
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readHtmlSubtitleStyle(document(result), identity.cueId).highlightTextColor).toBe(
      '#FFFFFF',
    );
    unmount();
  });

  it('creates a canonical source-time caption, projects its final input during another graph action, and restores one undo/redo', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    expect(document(result).cues[0]).toMatchObject({
      clipId: 'saved-1',
      text: '默认文本',
      start: 0,
      duration: 2,
    });
    act(() => result.current.controller.onHtmlSubtitleTextChange('最后输入 <b>字面</b>\n第二行'));
    act(() =>
      expect(
        result.current.commitGraph({
          ...result.current.graph,
          nodes: result.current.graph.nodes.map((node) =>
            node.id === 'video-1' ? { ...node, data: { ...node.data, name: 'renamed' } } : node,
          ),
        }),
      ).toBe(true),
    );
    expect(result.current.controller.state.conflicted).toBe(false);
    expect(document(result).cues[0].text).toBe('最后输入 <b>字面</b>\n第二行');
    act(() => expect(result.current.controller.onCommitHtmlSubtitle()).toBe(true));
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(document(result).cues[0].text).toBe('默认文本');
    expect(result.current.graph.nodes.find((node) => node.id === 'video-1').data.name).toBe(
      'renamed',
    );
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(document(result).cues[0].text).toContain('<b>字面</b>');
    unmount();
  });

  it('splits timeline and full crossing captions in one history step with metadata and redo', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    const before = savedClipTimeline(result);
    act(() => result.current.controller.onSeek(1));
    act(() => result.current.controller.onSplit('video'));
    const after = savedClipTimeline(result),
      captions = document(result);
    expect(after.clips).toHaveLength(2);
    expect(captions.cues).toHaveLength(2);
    expect(captions.cues.map((cue) => [cue.start, cue.duration])).toEqual([
      [0, 2],
      [0, 2],
    ]);
    expect(new Set(captions.cues.map((cue) => cue.clipId))).toEqual(
      new Set(after.clips.map((clip) => clip.id)),
    );
    expect(captions.clipMeta).not.toHaveProperty('saved-1');
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).subtitlesHtml).toEqual(before.subtitlesHtml);
    expect(savedClipTimeline(result).clips).toHaveLength(1);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result).subtitlesHtml).toEqual(after.subtitlesHtml);
    unmount();
  });

  it('duplicates captions with a copied clip and restores the graph in one undo', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    const before = savedClipTimeline(result);
    act(() => expect(result.current.controller.onCopyClip('saved-1')).toBe(true));
    act(() => expect(result.current.controller.onPasteClip()).toBe(true));
    expect(savedClipTimeline(result).clips).toHaveLength(2);
    expect(document(result).cues).toHaveLength(2);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).subtitlesHtml).toEqual(before.subtitlesHtml);
    expect(savedClipTimeline(result).clips).toHaveLength(1);
    unmount();
  });

  it('keeps style pointer previews out of persistence and commits one guarded history entry', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginHtmlSubtitleStyle({
        field: 'xPct',
        kind: 'pointer',
      });
    });
    act(() => expect(result.current.controller.onPreviewHtmlSubtitleStyle(token, 73)).toBe(true));
    const projected = result.current.projectDrafts();
    const archive = Object.values(
      projected.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData.subtitlesHtml,
    )[0];
    expect(
      readTextStyle(
        readSubtitleHtml(archive.htmlInline),
        result.current.controller.state.selectedHtmlSubtitle.cueId,
      ).xPct,
    ).toBe(50);
    act(() => expect(result.current.controller.onEndHtmlSubtitleStyle(token)).toBe(true));
    expect(
      readTextStyle(document(result), result.current.controller.state.selectedHtmlSubtitle.cueId)
        .xPct,
    ).toBe(73);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readTextStyle(document(result), document(result).cues[0].cueId).xPct).toBe(50);
    unmount();
  });

  it('applies an injected subtitle preset atomically and clears its ID on a later direct style edit', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const identity = add(result);
    act(() =>
      expect(
        result.current.controller.onEditHtmlSubtitle({
          preset: {
            id: 'caption-style',
            fields: { color: '#00ff00', fontSizePx: 44, animationType: 'wave' },
          },
        }),
      ).toBe(true),
    );
    expect(readTextStyle(document(result), identity.cueId)).toMatchObject({
      color: '#00ff00',
      fontSizePx: 44,
      animationType: 'wave',
    });
    expect(document(result).cues[0].element.getAttribute('data-libtv-text-preset-id')).toBe(
      'caption-style',
    );
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(document(result).cues[0].element.hasAttribute('data-libtv-text-preset-id')).toBe(false);
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(document(result).cues[0].element.getAttribute('data-libtv-text-preset-id')).toBe(
      'caption-style',
    );
    act(() =>
      expect(result.current.controller.onEditHtmlSubtitle({ fields: { fontSizePx: 45 } })).toBe(
        true,
      ),
    );
    expect(document(result).cues[0].element.hasAttribute('data-libtv-text-preset-id')).toBe(false);
    unmount();
  });

  it('saves pending style input on pagehide and ignores its late blur token', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginHtmlSubtitleStyle({
        field: 'fontSizePx',
        kind: 'input',
        readPending: () => 400,
      });
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(
      readTextStyle(document(result), document(result).cues[0].cueId, { width: 1920, height: 1080 })
        .fontSizePx,
    ).toBe(400);
    act(() => expect(result.current.controller.onEndHtmlSubtitleStyle(token)).toBe(false));
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readTextStyle(document(result), document(result).cues[0].cueId).fontSizePx).toBe(56);
    unmount();
  });

  it('retains the last input in a conflict recovery copy across reload/restore', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    add(result);
    act(() => result.current.controller.onHtmlSubtitleTextChange('恢复副本最后的字幕'));
    makeConflict(result);
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    expect(result.current.controller.state.htmlSubtitleDraft).toBeNull();
    expect(result.current.controller.state.htmlSubtitleLayers).toBeNull();
    act(() => expect(result.current.controller.onRestoreRecoveryTimeline()).toBe(true));
    expect(document(result).cues[0].text).toBe('恢复副本最后的字幕');
    unmount();
  });

  it('recognizes an exact saved playback projection after a newer frame and preserves subsequent edit history', () => {
    const { result, unmount } = harness({ synchronizeSavedDrafts: true });
    openReady(result, 'clip-a');
    const identity = add(result);
    act(() => {
      result.current.controller.onTimeChange(0.1784);
      expect(result.current.flushGraph()).toBe(true);
      result.current.controller.onTimeChange(7.2799);
    });
    expect(result.current.controller.state.conflicted).toBe(false);
    expect(result.current.controller.state.timeline.currentTime).toBe(7.2799);
    const oldAccepted = result.current.graph.nodes.find((node) => node.id === 'clip-a').data
      .clipTimelineData;
    act(() => expect(result.current.controller.onDeleteHtmlSubtitle(identity)).toBe(true));
    expect(document(result).cues).toEqual([]);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(document(result).cues).toHaveLength(1);
    expect(savedClipTimeline(result).currentTime).toBe(7.2799);
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? { ...node, data: { ...node.data, clipTimelineData: oldAccepted } }
            : node,
        ),
      })),
    );
    expect(result.current.controller.state.conflicted).toBe(true);
    expect(
      result.current.graph.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData,
    ).toBe(oldAccepted);
    unmount();
  });
});

function makeConflict(result, { timeline, nodes, edges } = {}) {
  act(() => result.current.controller.onSeek(4));
  act(() =>
    result.current.setGraph((graph) => ({
      ...graph,
      nodes:
        nodes ||
        graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? {
                ...node,
                data: {
                  ...node.data,
                  externalNodeField: 'keep-latest',
                  clipTimelineData: timeline || {
                    ...node.data.clipTimelineData,
                    currentTime: 7,
                    externalRevision: 'latest',
                  },
                },
              }
            : node,
        ),
      edges: edges || graph.edges,
    })),
  );
  expect(result.current.controller.state.conflicted).toBe(true);
  expect(result.current.controller.state.timeline.currentTime).toBe(4);
}

function prepareCurrent(result, sourceId = 'video-1', url = '/one.mp4') {
  act(() => result.current.controller.onMetadata(sourceId, metadata(url)));
  act(() =>
    result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
  );
}

function savedClipTimeline(result, nodeId = 'clip-a') {
  act(() => expect(result.current.flushGraph()).toBe(true));
  const saved = JSON.parse(localStorage.getItem(storageKey));
  return saved.nodes.find((node) => node.id === nodeId).data.clipTimelineData;
}

function setTwoSourceTimeline(result) {
  const twoSourceTimeline = {
    ...structuredClone(initialTimeline),
    clips: [
      { ...structuredClone(initialTimeline.clips[0]), duration: 5, sourceDuration: 10 },
      {
        ...structuredClone(initialTimeline.clips[0]),
        id: 'saved-2',
        sourceNodeId: 'video-2',
        startTime: 5,
        duration: 5,
        sourceDuration: 10,
      },
    ],
    videoSourceNodeIds: ['video-1', 'video-2'],
    totalDuration: 10,
  };
  act(() =>
    result.current.setGraph((graph) => ({
      ...graph,
      nodes: [
        ...graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? { ...node, data: { ...node.data, clipTimelineData: twoSourceTimeline } }
            : node,
        ),
        source('video-2', '/two.mp4'),
      ],
      edges: [...graph.edges, { id: 'second-source-edge', source: 'video-2', target: 'clip-a' }],
    })),
  );
}

function openTwoSourceReady(result) {
  act(() => expect(result.current.controller.open('clip-a')).toBe(true));
  act(() => result.current.controller.onMetadata('video-1', metadata('/one.mp4')));
  act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
  act(() =>
    result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
  );
  expect(result.current.controller.state.ready).toBe(true);
}

describe('actual clip editor graph/draft/autosave review regressions', () => {
  it('keeps style pointer previews out of saves and commits one undo step on release', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginTextStyle({ field: 'xPct', kind: 'pointer' });
    });
    expect(token).toBeTruthy();
    act(() => expect(result.current.controller.onPreviewTextStyle(token, 20.125)).toBe(true));
    expect(
      readTextStyle(
        readTextOverlayHtml(result.current.controller.state.timeline.overlayHtmlInline),
        cueId,
      ).xPct,
    ).toBe(20.125);
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId).xPct,
    ).toBe(50);
    act(() => expect(result.current.controller.onEndTextStyle(token)).toBe(true));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId).xPct,
    ).toBe(20.125);
    act(() => result.current.controller.onUndo());
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId).xPct,
    ).toBe(50);
    unmount();
  });
  it('settles final typed numeric input on pagehide with one history entry and ignores its late blur', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    let pending = 45.125,
      token;
    act(() => {
      token = result.current.controller.onBeginTextStyle({
        field: 'fontSizePx',
        kind: 'input',
        readPending: () => pending,
      });
    });
    act(() => result.current.controller.onPreviewTextStyle(token, 45.125));
    pending = 400;
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId)
        .fontSizePx,
    ).toBe(400);
    act(() => expect(result.current.controller.onEndTextStyle(token)).toBe(false));
    act(() => result.current.controller.onUndo());
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId)
        .fontSizePx,
    ).toBe(56);
    act(() => result.current.controller.onRedo());
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId)
        .fontSizePx,
    ).toBe(400);
    unmount();
  });
  it('cancels a typed style already projected by another graph action without reverting that action', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginTextStyle({
        field: 'fontSizePx',
        kind: 'input',
        readPending: () => 70,
      });
    });
    act(() => result.current.controller.onPreviewTextStyle(token, 70));
    act(() =>
      expect(
        result.current.commitGraph({
          ...result.current.graph,
          nodes: result.current.graph.nodes.map((node) =>
            node.id === 'video-1' ? { ...node, data: { ...node.data, name: 'keep-rename' } } : node,
          ),
        }),
      ).toBe(true),
    );
    act(() => expect(result.current.controller.onCancelTextStyle(token)).toBe(true));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId)
        .fontSizePx,
    ).toBe(56);
    expect(result.current.graph.nodes.find((node) => node.id === 'video-1').data.name).toBe(
      'keep-rename',
    );
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).overlayHtmlInline).toBeUndefined();
    unmount();
  });
  it('does not allow an older style control to end or preview a newer interaction', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    let old, token;
    act(() => {
      old = result.current.controller.onBeginTextStyle({ field: 'fontSizePx', kind: 'keyboard' });
    });
    act(() => result.current.controller.onPreviewTextStyle(old, 60));
    act(() => result.current.controller.onEndTextStyle(old));
    act(() => {
      token = result.current.controller.onBeginTextStyle({ field: 'xPct', kind: 'pointer' });
    });
    act(() => expect(result.current.controller.onEndTextStyle(old)).toBe(false));
    act(() => expect(result.current.controller.onPreviewTextStyle(old, 999)).toBe(false));
    act(() => expect(result.current.controller.onPreviewTextStyle(token, 25)).toBe(true));
    act(() => result.current.controller.onEndTextStyle(token));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), cueId),
    ).toMatchObject({ fontSizePx: 60, xPct: 25 });
    unmount();
  });
  it('does not create a style history entry for an unchanged pending number', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    await addText(result);
    let token;
    act(() => {
      token = result.current.controller.onBeginTextStyle({
        field: 'fontSizePx',
        kind: 'input',
        readPending: () => 56,
      });
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    act(() => result.current.controller.onEndTextStyle(token));
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).overlayHtmlInline).toBeUndefined();
    unmount();
  });
  it('deletes an uncommitted body from the header in one history step without first creating a body edit', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    act(() => result.current.controller.onTextChange(cueId, '尚未提交'));
    act(() => expect(result.current.controller.onDeleteText()).toBe(true));
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues).toEqual([]);
    act(() => result.current.controller.onUndo());
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].text).toBe(
      '输入文本',
    );
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).overlayHtmlInline).toBeUndefined();
    unmount();
  });
  it('saves pending background numbers on pagehide and applies motion/styles across text cues in one undo step', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const first = await addText(result);
    act(() => result.current.controller.onSeek(4));
    const second = await addText(result);
    act(() => result.current.controller.onSelectText(first));
    act(() =>
      result.current.controller.onEditText({
        fields: { backgroundColor: '#FF0000', backgroundOpacityPct: 75, animationType: 'pulse' },
      }),
    );
    act(() =>
      result.current.controller.onTextChange(first, { field: 'cornerRadiusPx', value: '12.125' }),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), first)
        .cornerRadiusPx,
    ).toBe(12.13);
    act(() => expect(result.current.controller.onApplyTextToAll()).toBe(true));
    let model = readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline);
    expect(readTextStyle(model, second)).toMatchObject({
      backgroundColor: 'rgba(255, 0, 0, 0.75)',
      cornerRadiusPx: 12.13,
      animationType: 'pulse',
    });
    expect(model.cues.find((cue) => cue.cueId === second)).toMatchObject({
      start: 4,
      duration: 3,
      text: '输入文本',
    });
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    model = readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline);
    expect(readTextStyle(model, second)).toMatchObject({
      backgroundColor: 'transparent',
      animationType: 'none',
    });
    expect(readTextStyle(model, first).animationType).toBe('pulse');
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(
      readTextStyle(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline), second)
        .animationType,
    ).toBe('pulse');
    unmount();
  });
  it('rejects a late SHA result after switching document ownership', async () => {
    const { result, rerender, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.installTextTools(createClipTextTools));
    act(() => result.current.controller.onTextLoaded('empty', ''));
    let resolve, pending;
    vi.stubGlobal('crypto', {
      subtle: {
        digest: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
    });
    try {
      act(() => {
        pending = result.current.controller.onAddText();
      });
      expect(result.current.controller.state.textPending).toBe(true);
      const before = structuredClone(result.current.graph);
      rerender({ documentKey: 'new-owner', ready: true, readonly: false });
      await act(async () => {
        resolve(new Uint8Array(32).buffer);
        expect(await pending).toBe(false);
      });
      expect(result.current.controller.state).toBeNull();
      expect(result.current.graph).toEqual(before);
    } finally {
      vi.unstubAllGlobals();
      unmount();
    }
  });
  it('accepts its exact pending HTML projected by another graph action while preserving the pre-edit undo state', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    act(() => result.current.controller.onTextChange(cueId, '投影的最后输入'));
    act(() =>
      expect(
        result.current.commitGraph({
          ...result.current.graph,
          nodes: result.current.graph.nodes.map((node) =>
            node.id === 'video-1' ? { ...node, data: { ...node.data, name: 'renamed' } } : node,
          ),
        }),
      ).toBe(true),
    );
    expect(result.current.controller.state.conflicted).toBe(false);
    expect(
      result.current.graph.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData
        .overlayHtmlInline,
    ).toContain('投影的最后输入');
    act(() =>
      result.current.controller.onTextChange(cueId, { field: 'fontSizePx', value: '18.125' }),
    );
    act(() => expect(result.current.controller.onCommitText()).toBe(true));
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].text).toBe(
      '输入文本',
    );
    unmount();
  });
  async function addText(result) {
    act(() => result.current.controller.installTextTools(createClipTextTools));
    act(() => result.current.controller.onTextLoaded('empty', ''));
    vi.stubGlobal('crypto', webcrypto);
    try {
      await act(async () => expect(await result.current.controller.onAddText()).toBe(true));
    } finally {
      vi.unstubAllGlobals();
    }
    return result.current.controller.state.selectedTextCueId;
  }
  it('saves ordinary HTML text and decimal styles, then undoes/redoes and deletes without deleting video', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0]).toMatchObject({
      text: '输入文本',
      start: 0,
      duration: 3,
    });
    act(() => result.current.controller.onTextChange(cueId, '最后字符 <b>字面</b>'));
    act(() =>
      result.current.controller.onTextChange(cueId, { field: 'fontSizePx', value: '45.125' }),
    );
    act(() => expect(result.current.controller.onCommitText()).toBe(true));
    let parsed = readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline);
    expect(parsed.cues[0].text).toBe('最后字符 <b>字面</b>');
    expect(readTextStyle(parsed, cueId).fontSizePx).toBe(45.13);
    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].text).toBe(
      '输入文本',
    );
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].text).toBe(
      '最后字符 <b>字面</b>',
    );
    act(() => expect(result.current.controller.onDelete()).toBe(true));
    parsed = readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline);
    expect(parsed.cues).toEqual([]);
    expect(savedClipTimeline(result).clips).toHaveLength(1);
    act(() => result.current.controller.onUndo());
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].cueId).toBe(
      cueId,
    );
    unmount();
  });
  it('projects unblurred HTML text and numeric input on pagehide, preserving them through quota failure', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    act(() => result.current.controller.onTextChange(cueId, 'pagehide最后输入'));
    act(() =>
      result.current.controller.onTextChange(cueId, { field: 'letterSpacingPx', value: '-3.125' }),
    );
    const writer = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(result.current.controller.state.textDraft.text).toBe('pagehide最后输入');
    const projected = readTextOverlayHtml(
      result.current.projectDrafts().nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.overlayHtmlInline,
    );
    expect(projected.cues[0].text).toBe('pagehide最后输入');
    expect(readTextStyle(projected, cueId).letterSpacingPx).toBe(-3.12);
    writer.mockRestore();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].text).toBe(
      'pagehide最后输入',
    );
    act(() => result.current.controller.onCommitText());
    expect(result.current.controller.state.textDraft).toBeNull();
    unmount();
  });
  it('keeps HTML drag previews transient, cancellation exact and stale callbacks unable to edit another document', async () => {
    const { result, rerender, unmount } = harness();
    openReady(result, 'clip-a');
    const cueId = await addText(result);
    act(() => result.current.controller.onBeginEdit());
    act(() =>
      result.current.controller.onEditPreview('text-overlay', {
        kind: 'gesture',
        cueId,
        mode: 'move',
        delta: 2,
      }),
    );
    expect(
      readTextOverlayHtml(result.current.controller.state.timeline.overlayHtmlInline).cues[0].start,
    ).toBe(2);
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].start).toBe(0);
    act(() => result.current.controller.onCancelEdit());
    expect(
      readTextOverlayHtml(result.current.controller.state.timeline.overlayHtmlInline).cues[0].start,
    ).toBe(0);
    act(() => result.current.controller.onBeginEdit());
    act(() =>
      result.current.controller.onEditPreview('text-overlay', {
        kind: 'gesture',
        cueId,
        mode: 'resize-end',
        delta: -1,
      }),
    );
    act(() => result.current.controller.onEndEdit());
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].duration).toBe(
      2,
    );
    act(() => result.current.controller.onUndo());
    expect(readTextOverlayHtml(savedClipTimeline(result).overlayHtmlInline).cues[0].duration).toBe(
      3,
    );
    const stale = result.current.controller;
    rerender({ documentKey: 'other-text-document', ready: true, readonly: false });
    act(() => expect(stale.onTextChange(cueId, 'late')).toBe(false));
    expect(result.current.controller.state).toBeNull();
    unmount();
  });
  it('persists a split and restores the literal graph, selection, and saved timeline through undo/redo', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSeek(4));
    act(() => result.current.controller.onSelectClip('saved-1'));
    act(() => result.current.controller.onSplit('video'));

    expect(result.current.controller.state.timeline.clips).toEqual([
      expect.objectContaining({
        id: 'review-1',
        sourceNodeId: 'video-1',
        startTime: 0,
        duration: 4,
        sourceOffset: 0,
      }),
      expect.objectContaining({
        id: 'review-2',
        sourceNodeId: 'video-1',
        startTime: 4,
        duration: 6,
        sourceOffset: 4,
      }),
    ]);
    expect(result.current.controller.state.selectedClipIds).toEqual(['review-2']);
    expect(
      result.current.graph.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData.clips,
    ).toEqual(result.current.controller.state.timeline.clips);
    expect(savedClipTimeline(result).clips.map((entry) => entry.id)).toEqual([
      'review-1',
      'review-2',
    ]);

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(result.current.controller.state.timeline.clips).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        sourceNodeId: 'video-1',
        startTime: 0,
        duration: 10,
        sourceOffset: 0,
      }),
    ]);
    expect(result.current.controller.state.selectedClipIds).toEqual(['saved-1']);
    expect(
      result.current.graph.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData.clips,
    ).toEqual(result.current.controller.state.timeline.clips);
    expect(savedClipTimeline(result).clips.map((entry) => entry.id)).toEqual(['saved-1']);

    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(result.current.controller.state.timeline.clips.map((entry) => entry.id)).toEqual([
      'review-1',
      'review-2',
    ]);
    expect(result.current.controller.state.selectedClipIds).toEqual(['review-2']);
    expect(savedClipTimeline(result).clips.map((entry) => entry.id)).toEqual([
      'review-1',
      'review-2',
    ]);
    unmount();
  });

  it('persists a trim and uses undo/redo to restore the literal clip bounds and selection', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSeek(4));
    act(() => result.current.controller.onSelectClip('saved-1'));
    act(() => result.current.controller.onTrim('video', 'left'));

    expect(result.current.controller.state.timeline.clips).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        startTime: 0,
        duration: 6,
        sourceOffset: 4,
      }),
    ]);
    expect(result.current.controller.state.selectedClipIds).toEqual(['saved-1']);
    expect(savedClipTimeline(result).clips[0]).toEqual(
      result.current.controller.state.timeline.clips[0],
    );

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(result.current.controller.state.timeline.clips).toEqual([
      expect.objectContaining({
        id: 'saved-1',
        startTime: 0,
        duration: 10,
        sourceOffset: 0,
      }),
    ]);
    expect(result.current.controller.state.selectedClipIds).toEqual(['saved-1']);
    expect(savedClipTimeline(result).clips[0]).toEqual(
      result.current.controller.state.timeline.clips[0],
    );

    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(result.current.controller.state.timeline.clips[0]).toEqual(
      expect.objectContaining({ startTime: 0, duration: 6, sourceOffset: 4 }),
    );
    expect(result.current.controller.state.selectedClipIds).toEqual(['saved-1']);
    unmount();
  });

  it('persists a source-shaped clip transition through the controller history and graph CAS', () => {
    const { result, unmount } = harness();
    setTwoSourceTimeline(result);
    openTwoSourceReady(result);
    act(() => result.current.controller.onSelectClip('saved-1'));
    act(() => result.current.controller.onAddTransition({ type: 'crossfade', duration: 2 }));

    expect(result.current.controller.state.timeline.clips[1].transitionIn).toEqual({
      type: 'fade',
      duration: 2,
    });
    expect(savedClipTimeline(result).clips[1].transitionIn).toEqual({
      type: 'fade',
      duration: 2,
    });

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(result.current.controller.state.timeline.clips[1].transitionIn).toBeUndefined();
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(result.current.controller.state.timeline.clips[1].transitionIn).toEqual({
      type: 'fade',
      duration: 2,
    });
    unmount();
  });

  it('saves the last unblurred subtitle input and edits/deletes/undoes it in the clip history', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSubtitleLoaded('ready'));
    act(() => result.current.controller.onSeek(4));
    act(() => expect(result.current.controller.onAddSubtitle()).toBe(true));
    const cueId = result.current.controller.state.selectedSubtitleId;
    expect(savedClipTimeline(result).subtitles.cues[0]).toMatchObject({
      id: cueId,
      startTime: 4,
      endTime: 6,
    });
    const historySize = result.current.controller.state.history.past.length;
    act(() => result.current.controller.onSubtitleTextChange(cueId, 'first keystroke'));
    act(() => result.current.controller.onSubtitleTextChange(cueId, '最后输入'));
    expect(result.current.controller.state.history.past).toHaveLength(historySize);
    expect(
      result.current.projectDrafts().nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.subtitles.cues[0].text,
    ).toBe('最后输入');
    act(() => result.current.controller.onSelectClip('saved-1'));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('最后输入');
    expect(result.current.controller.state.history.past).toHaveLength(historySize + 1);
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('默认文本');
    act(() => result.current.controller.onRedo());
    act(() => result.current.controller.onSelectSubtitle(cueId));
    act(() =>
      result.current.controller.onEditSubtitle({
        kind: 'style',
        style: { color: '#FFFF00', fontSizePx: 40 },
      }),
    );
    expect(savedClipTimeline(result).subtitles.defaultStyle).toMatchObject({
      color: '#FFFF00',
      fontSizePx: 40,
    });
    act(() => result.current.controller.onDelete());
    expect(savedClipTimeline(result).clips).toHaveLength(1);
    expect(savedClipTimeline(result).subtitles).toMatchObject({ cues: [], userCleared: true });
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('最后输入');
    unmount();
  });

  it('keeps subtitle drag previews out of storage until one commit and rejects stale session writers', () => {
    const { result, rerender, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSubtitleLoaded('ready'));
    act(() => result.current.controller.onAddSubtitle());
    const cueId = result.current.controller.state.selectedSubtitleId;
    act(() => expect(result.current.controller.onBeginEdit()).toBe(true));
    act(() =>
      result.current.controller.onEditPreview('subtitle', {
        kind: 'gesture',
        cueId,
        mode: 'move',
        delta: 2,
      }),
    );
    act(() => result.current.controller.onCancelEdit());
    expect(result.current.controller.state.timeline.subtitles.cues[0].startTime).toBe(0);
    act(() => result.current.controller.onBeginEdit());
    act(() =>
      result.current.controller.onEditPreview('subtitle', {
        kind: 'gesture',
        cueId,
        mode: 'resize-end',
        delta: 1,
      }),
    );
    act(() => result.current.controller.onEndEdit());
    expect(savedClipTimeline(result).subtitles.cues[0].endTime).toBe(3);
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).subtitles.cues[0].endTime).toBe(2);
    const stale = result.current.controller;
    rerender({ documentKey: 'another-document', readonly: false, ready: true });
    act(() => expect(stale.onSubtitleTextChange(cueId, 'late')).toBe(false));
    expect(result.current.controller.state).toBeNull();
    unmount();
  });

  it('flushes unblurred subtitle text on pagehide and preserves it across a failed local save retry', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSubtitleLoaded('ready'));
    act(() => result.current.controller.onAddSubtitle());
    const cueId = result.current.controller.state.selectedSubtitleId;
    act(() => result.current.controller.onSubtitleTextChange(cueId, 'pagehide 最后输入'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(result.current.controller.state.subtitleTextDraft.text).toBe('pagehide 最后输入');
    expect(
      result.current.projectDrafts().nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.subtitles.cues[0].text,
    ).toBe('pagehide 最后输入');
    setItem.mockRestore();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(savedClipTimeline(result).subtitles.cues[0].text).toBe('pagehide 最后输入');
    act(() => result.current.controller.onCommitSubtitleText());
    expect(result.current.controller.state.subtitleTextDraft).toBeNull();
    unmount();
  });

  it('opens the library without editing, edits a selected cut and deletes only its transition', () => {
    const { result, unmount } = harness();
    setTwoSourceTimeline(result);
    openTwoSourceReady(result);
    const before = structuredClone(result.current.graph);
    act(() => result.current.controller.onToggleTransitionPanel());
    expect(result.current.controller.state.transitionPanelOpen).toBe(true);
    expect(result.current.graph).toEqual(before);
    expect(result.current.controller.state.history.past).toHaveLength(0);
    act(() => result.current.controller.onSelectClip('saved-1'));
    act(() => expect(result.current.controller.onAddTransition({ type: 'fadeblack' })).toBe(true));
    expect(result.current.controller.state.selectedClipIds).toEqual([]);
    expect(result.current.controller.state.selectedTransitionRightClipId).toBe('saved-2');
    expect(result.current.controller.state.timeline.cropRange).toBeNull();
    expect(result.current.controller.state.timeline.currentTime).toBe(5);
    act(() => result.current.controller.onSeek(2));
    act(() => result.current.controller.onSetTransitionDuration(0.26, 'saved-2'));
    expect(savedClipTimeline(result).clips[1].transitionIn).toEqual({
      type: 'fadeblack',
      duration: 0.3,
    });
    act(() => result.current.controller.onDelete());
    expect(savedClipTimeline(result).clips).toHaveLength(2);
    expect(savedClipTimeline(result).clips[1].transitionIn).toBeUndefined();
    expect(result.current.controller.state.selectedTransitionRightClipId).toBeNull();
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).clips[1].transitionIn).toEqual({
      type: 'fadeblack',
      duration: 0.3,
    });
    act(() => result.current.controller.onUndo());
    expect(savedClipTimeline(result).clips[1].transitionIn.duration).toBe(2);
    act(() => result.current.controller.onRedo());
    expect(savedClipTimeline(result).clips[1].transitionIn.duration).toBe(0.3);
    act(() => result.current.controller.onSelectTransition('saved-2'));
    const stale = result.current.controller;
    act(() => result.current.controller.onSelectClip('saved-1'));
    act(() => expect(stale.onSetTransitionDuration(4, 'saved-2')).toBe(false));
    expect(savedClipTimeline(result).clips[1].transitionIn.duration).toBe(0.3);
    act(() => result.current.controller.onCloseTransitionPanel());
    expect(result.current.controller.state.transitionPanelOpen).toBe(false);
    expect(result.current.controller.state.previewExpanded).toBe(true);
    unmount();
  });

  it('deletes one source, removes its graph edge, and restores both on undo before reapplying on redo', () => {
    const { result, unmount } = harness();
    setTwoSourceTimeline(result);
    openTwoSourceReady(result);
    act(() => result.current.controller.onSelectClip('saved-2'));
    act(() => result.current.controller.onDelete());

    expect(
      result.current.controller.state.timeline.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1']);
    expect(result.current.controller.state.selectedClipIds).toEqual([]);
    expect(
      result.current.graph.edges.some(
        (edge) => edge.source === 'video-2' && edge.target === 'clip-a',
      ),
    ).toBe(false);
    expect(savedClipTimeline(result).videoSourceNodeIds).toEqual(['video-1']);

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(
      result.current.controller.state.timeline.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1', 'video-2']);
    expect(result.current.controller.state.selectedClipIds).toEqual(['saved-2']);
    expect(
      result.current.graph.edges.some(
        (edge) => edge.source === 'video-2' && edge.target === 'clip-a',
      ),
    ).toBe(true);
    expect(savedClipTimeline(result).videoSourceNodeIds).toEqual(['video-1', 'video-2']);

    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(
      result.current.controller.state.timeline.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1']);
    expect(
      result.current.graph.edges.some(
        (edge) => edge.source === 'video-2' && edge.target === 'clip-a',
      ),
    ).toBe(false);
    expect(savedClipTimeline(result).videoSourceNodeIds).toEqual(['video-1']);
    unmount();
  });

  it('persists a track mute control and restores it through undo/redo without changing clips', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const originalClips = structuredClone(result.current.controller.state.timeline.clips);
    act(() =>
      result.current.controller.onSetTrackControl({
        kind: 'video',
        control: 'muted',
        trackIndex: 0,
        value: true,
      }),
    );
    expect(result.current.controller.state.timeline.clips).toEqual(originalClips);
    expect(result.current.controller.state.timeline.videoAudioMutedPerTrack).toEqual([true]);
    expect(savedClipTimeline(result).videoAudioMutedPerTrack).toEqual([true]);

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(result.current.controller.state.timeline.clips).toEqual(originalClips);
    expect(result.current.controller.state.timeline.videoAudioMutedPerTrack).toEqual([false]);
    expect(savedClipTimeline(result).videoAudioMutedPerTrack).toEqual([false]);

    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(result.current.controller.state.timeline.clips).toEqual(originalClips);
    expect(result.current.controller.state.timeline.videoAudioMutedPerTrack).toEqual([true]);
    expect(savedClipTimeline(result).videoAudioMutedPerTrack).toEqual([true]);
    unmount();
  });

  it('persists a source clip volume-line gesture and restores its gain through undo/redo', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => expect(result.current.controller.onBeginEdit()).toBe(true));
    act(() =>
      expect(
        result.current.controller.onEditPreview('audio-gain', {
          clipId: 'saved-1',
          position: 0.5,
        }),
      ).toBe(true),
    );
    act(() => expect(result.current.controller.onEndEdit()).toBe(true));
    expect(result.current.controller.state.timeline.clips[0].decibel).toBeGreaterThan(0);
    expect(savedClipTimeline(result).clips[0].decibel).toBe(
      result.current.controller.state.timeline.clips[0].decibel,
    );

    act(() => expect(result.current.controller.onUndo()).toBe(true));
    expect(savedClipTimeline(result).clips[0].decibel).toBeUndefined();
    act(() => expect(result.current.controller.onRedo()).toBe(true));
    expect(savedClipTimeline(result).clips[0].decibel).toBe(
      result.current.controller.state.timeline.clips[0].decibel,
    );
    unmount();
  });

  it('leaves the graph, saved document, and state unchanged when undo or redo history is empty', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const beforeGraph = structuredClone(result.current.graph);
    const beforeTimeline = structuredClone(result.current.controller.state.timeline);
    const beforeSaved = savedClipTimeline(result);
    act(() => expect(result.current.controller.onUndo()).toBe(false));
    act(() => expect(result.current.controller.onRedo()).toBe(false));
    expect(result.current.graph).toEqual(beforeGraph);
    expect(result.current.controller.state.timeline).toEqual(beforeTimeline);
    expect(savedClipTimeline(result)).toEqual(beforeSaved);
    unmount();
  });

  it('publishes a play intent before asynchronous native preparation and pauses on the next toggle', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const play = vi.fn();
    const pause = vi.fn();
    result.current.controller.playbackRef.current = { play, pause };
    act(() => result.current.controller.onPlayToggle());
    expect(result.current.controller.state.playing).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    act(() => result.current.controller.onPlayToggle());
    expect(result.current.controller.state.playing).toBe(false);
    expect(pause).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('forwards timeline file drops to the current clip owner with an identity guard', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const files = [new File(['video'], 'clip.mp4', { type: 'video/mp4' })];
    await act(async () => {
      await result.current.controller.onDropFiles(files);
    });
    expect(result.current.uploadFiles).toHaveBeenCalledWith(
      files,
      expect.objectContaining({
        targetId: 'clip-a',
        signal: expect.any(AbortSignal),
        isCurrent: expect.any(Function),
      }),
    );
    unmount();
  });

  it('hydrates a dropped source into an authoritative timeline and keeps it in a recovery override', async () => {
    const { result, unmount } = harness({ authoritative: true });
    openReady(result, 'clip-a');
    result.current.uploadFiles.mockImplementation(async () => {
      act(() =>
        result.current.setGraph((graph) => ({
          ...graph,
          nodes: [...graph.nodes, source('video-new', '/new.mp4')],
          edges: [...graph.edges, { id: 'new-edge', source: 'video-new', target: 'clip-a' }],
        })),
      );
      return [
        {
          id: 'video-new',
          type: 'video',
          data: { type: 'video', url: ['/new.mp4'], name: 'video-new' },
        },
      ];
    });
    await act(async () => {
      await result.current.controller.onDropFiles([
        new File(['video'], 'new.mp4', { type: 'video/mp4' }),
      ]);
    });
    act(() => result.current.controller.onMetadata('video-new', metadata('/new.mp4')));
    act(() =>
      result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
    );
    expect(
      result.current.controller.state.timeline.clips.some(
        (item) => item.sourceNodeId === 'video-new',
      ),
    ).toBe(true);
    expect(result.current.controller.state.history.past.length).toBeGreaterThan(0);
    expect(result.current.controller.state.timeline.videoSourceNodeIds).toContain('video-new');
    unmount();
  });

  it('keeps an upload owned across timeline updates and aborts it when the editor closes', async () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    let finish;
    result.current.uploadFiles.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    let task;
    act(() => {
      task = result.current.controller.onDropFiles([
        new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
      ]);
    });
    const options = result.current.uploadFiles.mock.calls[0][1];
    expect(options.isCurrent()).toBe(true);
    act(() => result.current.controller.onSeek(3));
    expect(options.isCurrent()).toBe(true);
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(options.isCurrent()).toBe(false);
    expect(options.signal.aborted).toBe(true);
    await act(async () => {
      finish([]);
      await task;
    });
    unmount();
  });

  it('keeps the editor open while a dropped source is still pending metadata', async () => {
    const { result, unmount } = harness({ authoritative: true });
    openReady(result, 'clip-a');
    result.current.uploadFiles.mockResolvedValue([
      {
        id: 'video-pending',
        type: 'video',
        data: { type: 'video', url: ['/pending.mp4'], name: 'pending' },
      },
    ]);
    await act(async () => {
      await result.current.controller.onDropFiles([
        new File(['video'], 'pending.mp4', { type: 'video/mp4' }),
      ]);
    });
    expect(result.current.controller.state.pendingSourceNodeIds).toEqual(['video-pending']);
    act(() => expect(result.current.controller.close()).toBe(false));
    expect(result.current.controller.state.error).toContain('拖入素材仍在准备媒体');
    unmount();
  });

  it('does not overwrite the freshly flushed A timeline with its pre-persist graph when opening B', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSeek(4));
    expect(result.current.controller.state.timeline.currentTime).toBe(4);
    act(() => expect(result.current.controller.open('clip-b')).toBe(true));
    expect(
      result.current.graph.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData
        .currentTime,
    ).toBe(4);
    // Actual persistence boundary, before any later debounce can conceal it.
    const saved = JSON.parse(localStorage.getItem(storageKey));
    expect(saved.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData.currentTime).toBe(
      4,
    );
    unmount();
  });

  it('adds a newly connected source to a saved non-authoritative timeline after closing and reopening', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: [...graph.nodes, source('video-2', '/two.mp4')],
        edges: [...graph.edges, { id: 'second-edge', source: 'video-2', target: 'clip-a' }],
      })),
    );
    act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
    act(() => expect(result.current.controller.close()).toBe(true));
    act(() => expect(result.current.controller.open('clip-a')).toBe(true));
    act(() => result.current.controller.onMetadata('video-1', metadata('/one.mp4')));
    act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
    expect(result.current.controller.state.authoritative).toBe(false);
    // Literal source addMedia ->applySavedClipLayout append behavior; do not
    // compute expected IDs/counts by invoking a production planner.
    expect(
      result.current.controller.state.timeline.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1', 'video-2']);
    expect(result.current.controller.state.timeline.clips[0].id).toBe('saved-1');
    unmount();
  });

  it('clears recovered mediaError while retaining actual quota/save error and the unsaved timeline until retry', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSeek(4));
    const savedBeforeFailure = localStorage.getItem(storageKey);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    });
    try {
      act(() => expect(result.current.controller.close()).toBe(false));
      expect(result.current.controller.state.error).toBe(
        '本机保存失败，当前时间轴仍保留，请重试保存。',
      );
      expect(result.current.controller.state.timeline.currentTime).toBe(4);
      expect(localStorage.getItem(storageKey)).toBe(savedBeforeFailure);
      const graphAfterFailedSave = structuredClone(result.current.graph);
      act(() =>
        result.current.controller.onPreparationChange({
          ready: false,
          preparing: false,
          error: '帧读取失败',
        }),
      );
      expect(result.current.controller.state.mediaError).toBe('帧读取失败');
      expect(result.current.controller.state.error).toBe(
        '本机保存失败，当前时间轴仍保留，请重试保存。',
      );
      act(() =>
        result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
      );
      expect(result.current.controller.state.ready).toBe(true);
      expect(result.current.controller.state.mediaError).toBe('');
      expect(result.current.controller.state.error).toBe(
        '本机保存失败，当前时间轴仍保留，请重试保存。',
      );
      expect(result.current.controller.state.timeline.currentTime).toBe(4);
      expect(result.current.graph).toEqual(graphAfterFailedSave);
      expect(localStorage.getItem(storageKey)).toBe(savedBeforeFailure);
    } finally {
      storageWrite.mockRestore();
    }
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(result.current.controller.state).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(storageKey)).nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.currentTime,
    ).toBe(4);
    unmount();
  });

  it('does not erase an actual graph conflict or replace the external timeline when mediaError recovers', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onSeek(4));
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? {
                ...node,
                data: {
                  ...node.data,
                  clipTimelineData: {
                    ...node.data.clipTimelineData,
                    currentTime: 7,
                    externalRevision: 'keep',
                  },
                },
              }
            : node,
        ),
      })),
    );
    expect(result.current.controller.state.conflicted).toBe(true);
    expect(result.current.controller.state.error).toBe(
      '时间轴已被其他操作更新。当前编辑仍保留，请重新打开最新时间轴后继续。',
    );
    const external = structuredClone(result.current.graph);
    act(() =>
      result.current.controller.onPreparationChange({
        ready: false,
        preparing: false,
        error: '帧读取失败',
      }),
    );
    expect(result.current.controller.state.mediaError).toBe('帧读取失败');
    act(() =>
      result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
    );
    expect(result.current.controller.state.mediaError).toBe('');
    expect(result.current.controller.state.conflicted).toBe(true);
    expect(result.current.controller.state.error).toBe(
      '时间轴已被其他操作更新。当前编辑仍保留，请重新打开最新时间轴后继续。',
    );
    expect(result.current.controller.state.timeline.currentTime).toBe(4);
    expect(result.current.graph).toEqual(external);
    unmount();
  });

  it('appends connected video live once metadata is ready and does not duplicate it on repeated metadata', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: [...graph.nodes, source('video-2', '/two.mp4')],
        edges: [...graph.edges, { id: 'second-edge', source: 'video-2', target: 'clip-a' }],
      })),
    );
    expect(result.current.controller.state.ready).toBe(false);
    act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
    expect(
      result.current.controller.state.timeline.clips.map((entry) => [
        entry.sourceNodeId,
        entry.startTime,
        entry.duration,
      ]),
    ).toEqual([
      ['video-1', 0, 10],
      ['video-2', 10, 10],
    ]);
    expect(result.current.controller.state.timeline.clips[0].id).toBe('saved-1');
    expect(result.current.controller.state.timeline.totalDuration).toBe(20);
    act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
    expect(
      result.current.controller.state.timeline.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1', 'video-2']);
    unmount();
  });

  it('preserves a saved authoritative video timeline without appending newly connected media', () => {
    const { result, unmount } = harness({ authoritative: true });
    openReady(result, 'clip-a');
    act(() =>
      result.current.setGraph((graph) => ({
        ...graph,
        nodes: [...graph.nodes, source('video-2', '/two.mp4')],
        edges: [...graph.edges, { id: 'second-edge', source: 'video-2', target: 'clip-a' }],
      })),
    );
    act(() => result.current.controller.onMetadata('video-2', metadata('/two.mp4')));
    expect(result.current.controller.state.authoritative).toBe(true);
    expect(
      result.current.controller.state.timeline.clips.map((entry) => [
        entry.id,
        entry.sourceNodeId,
        entry.startTime,
        entry.duration,
      ]),
    ).toEqual([['saved-1', 'video-1', 0, 10]]);
    expect(result.current.controller.state.timeline.clipsAuthoritative).toBe(true);
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(
      JSON.parse(localStorage.getItem(storageKey))
        .nodes.find((node) => node.id === 'clip-a')
        .data.clipTimelineData.clips.map((entry) => entry.sourceNodeId),
    ).toEqual(['video-1']);
    unmount();
  });

  it('copies and pastes a prepared video clip through the normal history, CAS and source reuse path', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onCopyClip('saved-1'));
    expect(result.current.controller.state.clipClipboard).toMatchObject({
      kind: 'video-clip',
      sourceNodeId: 'video-1',
    });
    act(() => result.current.controller.onSeek(4));
    act(() => expect(result.current.controller.onPasteClip()).toBe(true));
    const state = result.current.controller.state;
    expect(state.timeline.clips).toHaveLength(2);
    expect(state.timeline.clips.find((clip) => clip.id === 'review-1')).toMatchObject({
      sourceNodeId: 'video-1',
      duration: 10,
    });
    expect(state.history.past).toHaveLength(1);
    expect(state.selectedClipIds).toEqual(['review-1']);
    const saved = savedClipTimeline(result);
    expect(saved.clips.map((clip) => clip.id)).toContain('review-1');
    expect(saved.videoSourceNodeIds).toEqual(['video-1']);
    act(() => result.current.controller.onUndo());
    expect(result.current.controller.state.timeline.clips.map((clip) => clip.id)).toEqual([
      'saved-1',
    ]);
    act(() => result.current.controller.onRedo());
    expect(result.current.controller.state.timeline.clips.map((clip) => clip.id)).toContain(
      'review-1',
    );
    unmount();
  });

  it('keeps copied audio unsupported and refuses paste until the source metadata is ready', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    act(() => result.current.controller.onCopyClip('missing-audio'));
    expect(result.current.notify).toHaveBeenCalledWith('请先选择一个视频片段');
    act(() => result.current.controller.onCopyClip('saved-1'));
    act(() => {
      const current = result.current.controller.state;
      current.mediaBySourceId.delete('video-1');
    });
    act(() => expect(result.current.controller.onPasteClip()).toBe(false));
    expect(result.current.notify).toHaveBeenCalledWith('剪贴板中的视频素材仍未准备完成');
    unmount();
  });
});

describe('clip conflict recovery keeps raw graph and recoverable draft separate', () => {
  it('keeps the original conflict error on refused close and preserves the raw external graph', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result);
    const conflictError = result.current.controller.state.error;
    const external = structuredClone(result.current.graph);
    act(() => expect(result.current.controller.close()).toBe(false));
    expect(result.current.controller.state.error).toBe(conflictError);
    expect(result.current.controller.state.conflicted).toBe(true);
    expect(result.current.controller.state.timeline.currentTime).toBe(4);
    expect(result.current.graph).toEqual(external);
    unmount();
  });

  it('in StrictMode reloads raw latest7, removes old draft projection and restores backup4 only as staged editing before explicit close', () => {
    const { result, unmount } = harness({ strict: true });
    openReady(result, 'clip-a');
    makeConflict(result);
    const oldSession = result.current.controller.state.draftSession;
    const oldTimeline = result.current.controller.state.timeline;
    const oldDraft = structuredClone(oldTimeline);
    const external = structuredClone(result.current.graph);
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    expect(result.current.controller.state.draftSession).not.toBe(oldSession);
    expect(result.current.controller.state.timeline.currentTime).toBe(7);
    expect(result.current.controller.state.conflicted).toBe(false);
    expect(result.current.controller.recoveryDraft).toMatchObject({
      documentKey: storageKey,
      nodeId: 'clip-a',
      timeline: oldDraft,
    });
    expect(result.current.controller.recoveryDraft.timeline).not.toBe(oldTimeline);
    expect(result.current.controller.recoveryDraft.timeline.clips[0]).not.toBe(
      oldTimeline.clips[0],
    );
    expect(result.current.graph).toEqual(external);
    expect(
      result.current.projectDrafts().nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.currentTime,
    ).toBe(7);
    prepareCurrent(result);
    act(() => expect(result.current.flushGraph()).toBe(true));
    expect(
      JSON.parse(localStorage.getItem(storageKey)).nodes.find((node) => node.id === 'clip-a').data
        .clipTimelineData.currentTime,
    ).toBe(7);
    const savedBeforeRestore = localStorage.getItem(storageKey);
    const graphBeforeRestore = structuredClone(result.current.graph);
    act(() => expect(result.current.controller.onRestoreRecoveryTimeline()).toBe(true));
    expect(result.current.controller.state.timeline.currentTime).toBe(4);
    expect(result.current.controller.state.timeline.clips[0].id).toBe('saved-1');
    expect(result.current.controller.state.timeline.videoSourceNodeIds).toEqual(['video-1']);
    expect(result.current.controller.state.timeline.audioSourceNodeIds).toEqual([]);
    expect(result.current.graph).toEqual(graphBeforeRestore);
    expect(localStorage.getItem(storageKey)).toBe(savedBeforeRestore);
    prepareCurrent(result);
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(result.current.controller.state).toBeNull();
    const saved = JSON.parse(localStorage.getItem(storageKey)).nodes.find(
      (node) => node.id === 'clip-a',
    );
    expect(saved.data.clipTimelineData.currentTime).toBe(4);
    expect(saved.data.externalNodeField).toBe('keep-latest');
    unmount();
  });

  it('does not retire the old request or its draft when the latest raw timeline cannot be parsed', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result, {
      timeline: { clips: 'broken', currentTime: 7, externalRevision: 'keep-broken' },
    });
    const request = result.current.controller.state;
    const originalDraft = structuredClone(request.timeline);
    const external = structuredClone(result.current.graph);
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(false));
    expect(result.current.controller.state.draftSession).toBe(request.draftSession);
    expect(result.current.controller.state.timeline).toEqual(originalDraft);
    expect(result.current.controller.state.conflicted).toBe(true);
    expect(result.current.graph).toEqual(external);
    unmount();
  });

  it('rejects restoring a backup whose source edge was removed externally, preserving backup and external timeline without reconnecting', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    const replacement = {
      ...structuredClone(initialTimeline),
      clips: [{ ...initialTimeline.clips[0], id: 'external-2', sourceNodeId: 'video-2' }],
      videoSourceNodeIds: ['video-2'],
      currentTime: 7,
    };
    const nodes = [
      ...result.current.graph.nodes.map((node) =>
        node.id === 'clip-a'
          ? { ...node, data: { ...node.data, clipTimelineData: replacement } }
          : node,
      ),
      source('video-2', '/two.mp4'),
    ];
    const edges = [
      ...result.current.graph.edges.filter((edge) => edge.target !== 'clip-a'),
      { id: 'external-2-edge', source: 'video-2', target: 'clip-a' },
    ];
    makeConflict(result, { nodes, edges });
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    prepareCurrent(result, 'video-2', '/two.mp4');
    const backup = structuredClone(result.current.controller.recoveryDraft);
    const external = structuredClone(result.current.graph);
    act(() => expect(result.current.controller.onRestoreRecoveryTimeline()).toBe(false));
    expect(result.current.controller.recoveryDraft).toEqual(backup);
    expect(result.current.controller.state.timeline.clips.map((clip) => clip.sourceNodeId)).toEqual(
      ['video-2'],
    );
    expect(result.current.graph).toEqual(external);
    expect(
      result.current.graph.edges.some(
        (edge) => edge.target === 'clip-a' && edge.source === 'video-1',
      ),
    ).toBe(false);
    unmount();
  });

  it('isolates old recovery/metadata/clock callbacks after reload and across document A→B→A', () => {
    const { result, rerender, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result);
    const old = result.current.controller;
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    const newSession = result.current.controller.state.draftSession;
    act(() => {
      old.onTimeChange(9);
      old.onMetadata('video-1', { ...metadata('/one.mp4'), sourceDuration: 99 });
      expect(old.onRestoreRecoveryTimeline()).toBeFalsy();
      expect(old.onReloadLatestTimeline()).toBeFalsy();
    });
    expect(result.current.controller.state.draftSession).toBe(newSession);
    expect(result.current.controller.state.timeline.currentTime).toBe(7);
    rerender({ documentKey: 'clip-review-B', readonly: false, ready: true });
    rerender({ documentKey: storageKey, readonly: false, ready: true });
    openReady(result, 'clip-a');
    const fresh = structuredClone(result.current.controller.state.timeline);
    const graph = structuredClone(result.current.graph);
    act(() => {
      old.onTimeChange(2);
      expect(old.onRestoreRecoveryTimeline()).toBeFalsy();
      expect(old.onReloadLatestTimeline()).toBeFalsy();
    });
    expect(result.current.controller.state.timeline).toEqual(fresh);
    expect(result.current.graph).toEqual(graph);
    unmount();
  });

  it('does not allow stale restore callbacks to write a document after readonly takes over', () => {
    const { result, rerender, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result);
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    const old = result.current.controller;
    const external = structuredClone(result.current.graph);
    rerender({ documentKey: storageKey, readonly: true, ready: true });
    act(() => {
      expect(old.onRestoreRecoveryTimeline()).toBeFalsy();
      expect(old.onReloadLatestTimeline()).toBeFalsy();
    });
    expect(result.current.graph).toEqual(external);
    unmount();
  });

  it('keeps an explicit recovery copy source set and removes an extra latest edge only on close', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result, {
      nodes: [
        ...result.current.graph.nodes.map((node) =>
          node.id === 'clip-a'
            ? {
                ...node,
                data: {
                  ...node.data,
                  clipTimelineData: {
                    ...node.data.clipTimelineData,
                    currentTime: 7,
                    externalRevision: 'latest-extra',
                  },
                },
              }
            : node,
        ),
        source('video-2', '/two.mp4'),
      ],
      edges: [
        ...result.current.graph.edges,
        { id: 'latest-extra-edge', source: 'video-2', target: 'clip-a' },
      ],
    });
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    prepareCurrent(result, 'video-2', '/two.mp4');
    act(() => expect(result.current.controller.onRestoreRecoveryTimeline()).toBe(true));
    expect(result.current.graph.edges).toContainEqual({
      id: 'latest-extra-edge',
      source: 'video-2',
      target: 'clip-a',
    });
    expect(result.current.controller.state.timeline.videoSourceNodeIds).toEqual(['video-1']);
    act(() =>
      result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
    );
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(
      result.current.graph.edges.some(
        (edge) => edge.source === 'video-2' && edge.target === 'clip-a',
      ),
    ).toBe(false);
    const saved = JSON.parse(localStorage.getItem(storageKey));
    expect(
      saved.nodes.find((node) => node.id === 'clip-a').data.clipTimelineData.videoSourceNodeIds,
    ).toEqual(['video-1']);
    unmount();
  });

  it('keeps a restored copy open until native preparation completes', () => {
    const { result, unmount } = harness();
    openReady(result, 'clip-a');
    makeConflict(result);
    act(() => expect(result.current.controller.onReloadLatestTimeline()).toBe(true));
    act(() => expect(result.current.controller.onRestoreRecoveryTimeline()).toBe(true));
    expect(result.current.controller.state.ready).toBe(false);
    act(() => expect(result.current.controller.close()).toBe(false));
    expect(result.current.controller.state).not.toBeNull();
    expect(result.current.controller.state.error).toBe(
      '恢复副本仍在准备媒体，请等待准备完成后再关闭。',
    );
    act(() =>
      result.current.controller.onPreparationChange({ ready: true, preparing: false, error: '' }),
    );
    act(() => expect(result.current.controller.close()).toBe(true));
    expect(result.current.controller.state).toBeNull();
    unmount();
  });
});
