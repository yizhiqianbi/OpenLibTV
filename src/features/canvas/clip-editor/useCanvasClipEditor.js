import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { createClipSubtitleControls } from './clip-subtitle-controls.js';
import { TEXT_TOOL_ACTIONS } from './text/tool-api.js';
import {
  effectiveSubtitleTimeline,
  projectSubtitleTextDraft,
  prepareSubtitleEdit,
} from './domain/subtitle-document-model.js';
import { canvasNodeSize, canvasWorldPosition } from '../domain/groups.js';
import { recalculateCanvasIncomingTarget } from '../generator/reference-recalculation-model.js';
import { collectVideoClipIncomingData } from './domain/incoming-model.js';
import {
  collectVideoClipIncomingSources,
  resolveVideoClipNodePresentation,
} from './domain/node-presentation-model.js';
import {
  createClipTimelineDocument,
  createClipTimelineHistory,
  pushClipTimelineHistory,
  stepClipTimelineHistory,
  deleteClipTimelineSelection,
  seekClipTimelineDocument,
  setClipTimelineView,
  setClipTimelineTrackControl,
  clipTimelineSourceDifferences,
  shouldUseAuthoritativeClipTimeline,
} from './domain/timeline-document-model.js';
import {
  copyClipTimelineSelection,
  deleteClipTimelineTransition,
  describeClipTimelineTransitions,
  finishClipTimelineTrackInsertion,
  insertPreparedClipTimelineMedia,
  moveClipTimelineRealtime,
  pasteClipTimelineSelection,
  reorderClipTimelineVideo,
  resolvePreparedClipTimelineBounds,
  setClipTimelineClipGain,
  setClipTimelineTransition,
  splitClipTimelineAtPlayhead,
  trimClipTimelineAtPlayhead,
  trimClipTimelineRealtime,
} from './domain/timeline-edit-model.js';
const loadEmbeddedAudioExtractor = (...args) =>
  import('./audio-extraction.js').then(({ extractEmbeddedAudioAsWav }) =>
    extractEmbeddedAudioAsWav(...args),
  );

const fingerprint = (value) => JSON.stringify(value ?? null);
// The video/audio editor's hg is 72 + 28 + 68 + 40. Text/cue rows are
// separate capabilities and must provide their real measured height later.
const editorMinimumHeight = (timeline) => 208 + (timeline?.subtitles ? 28 : 0);

function incomingMedia(node, graph, previous = new Map()) {
  const incomingData = collectVideoClipIncomingData({ node, ...graph });
  const sources = collectVideoClipIncomingSources(incomingData);
  const byId = new Map(graph.nodes.map((item) => [item.id, item]));
  const media = new Map();
  for (const kind of ['video', 'audio'])
    for (const source of incomingData[kind + 'List']) {
      if (!source.url || media.has(source.nodeId)) continue;
      const retained = previous.get(source.nodeId);
      media.set(source.nodeId, {
        url: source.url,
        kind,
        name: source.label?.trim() || '',
        poster: byId.get(source.nodeId)?.data?.poster,
        ...(retained?.url === source.url ? { metadata: retained.metadata } : {}),
      });
    }
  return { incomingData, sources, media };
}

/** Owns one loaded document's clip editing session and its separate ten-entry history. */
export function useCanvasClipEditor({
  documentKey,
  ready,
  readonly,
  nodes,
  edges,
  getDocument,
  commitGraph,
  flushGraph,
  registerDraft,
  board,
  viewRef,
  focusView,
  setSelected,
  cancelOtherGestures,
  uploadFiles,
  notify,
  extractAudio = loadEmbeddedAudioExtractor,
  makeId = createLocalId,
}) {
  const owner = useMemo(() => ({ documentKey, ready, readonly }), [documentKey, ready, readonly]);
  const latest = useRef(null);
  const active = useRef(false);
  const request = useRef(null);
  const edit = useRef(null);
  const timer = useRef(null);
  const playbackRef = useRef(null);
  const subtitleInputRef = useRef(null);
  const listeners = useRef(new Set());
  const pendingUploads = useRef(new Set());
  const recovery = useRef(null);
  // Keep validated media metadata for the lifetime of this editor controller.
  // A source can temporarily leave the graph during an undo and return with
  // the same URL; it should not force the whole timeline back through metadata
  // discovery in that case.
  const mediaCache = useRef(new Map());
  const clipClipboard = useRef(null);
  const textTools = useRef(null);
  const audioDetach = useRef(null);
  const projectedDrafts = useRef(new WeakMap());
  const [state, setState] = useState(null);
  latest.current = {
    owner,
    documentKey,
    ready,
    readonly,
    getDocument,
    commitGraph,
    flushGraph,
    registerDraft,
    board,
    viewRef,
    focusView,
    setSelected,
    cancelOtherGestures,
    uploadFiles,
    notify,
    extractAudio,
    makeId,
  };
  const publish = useCallback((value) => {
    if (value && textTools.current && value.draftSession === textTools.current.session)
      value = textTools.current.normalizeUI(value);
    if (
      value?.selectedSubtitleId &&
      !effectiveSubtitleTimeline(value).subtitles?.cues?.some(
        (cue) => cue.id === value.selectedSubtitleId,
      )
    )
      value = { ...value, selectedSubtitleId: null, subtitleTextDraft: null };
    if (
      value &&
      value.height <
        editorMinimumHeight(value.timeline) +
          28 * ((value.textTrackCount || 0) + (value.htmlSubtitleTrackCount || 0))
    )
      value = {
        ...value,
        height:
          editorMinimumHeight(value.timeline) +
          28 * ((value.textTrackCount || 0) + (value.htmlSubtitleTrackCount || 0)),
      };
    if (
      value?.selectedTransitionRightClipId &&
      !value.timeline.clips.some(
        (clip) => clip.id === value.selectedTransitionRightClipId && clip.transitionIn,
      )
    )
      value = { ...value, selectedTransitionRightClipId: null };
    const previous = request.current;
    if (previous?.draftSession !== value?.draftSession || value?.conflicted) {
      for (const controller of pendingUploads.current) controller.abort();
      pendingUploads.current.clear();
    }
    if (value?.draftSession) value.draftSession.latest = value;
    request.current = value;
    // Playback frames belong to the editor subscription. Only shell changes
    // need to render every Canvas node again.
    if (
      previous?.draftSession !== value?.draftSession ||
      previous?.previewExpanded !== value?.previewExpanded ||
      previous?.height !== value?.height ||
      Boolean(previous) !== Boolean(value)
    )
      setState(value);
    for (const listener of listeners.current) listener();
  }, []);
  const getState = useCallback(() => request.current, []);
  const subscribe = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);
  const projectEditorDraft = useCallback((captured) => {
    const transaction =
      edit.current?.request.draftSession === captured?.draftSession ? edit.current : null;
    const base = transaction
      ? transaction.projectOnPersist?.(captured.timeline) || transaction.timeline
      : captured?.timeline;
    const timeline = projectSubtitleTextDraft(captured && { ...captured, timeline: base });
    return captured && textTools.current && captured.draftSession === textTools.current.session
      ? textTools.current.projectDraft({ ...captured, timeline })
      : timeline;
  }, []);
  const matchesProjectedDraft = useCallback(
    (captured, actualFingerprint, actualTimeline) => {
      const receipt = projectedDrafts.current.get(actualTimeline);
      return Boolean(
        (receipt?.session === captured.draftSession &&
          receipt?.baseFingerprint === captured.baseFingerprint &&
          receipt?.valueFingerprint === actualFingerprint) ||
        ((captured.textDraft ||
          captured.subtitleTextDraft ||
          captured.htmlSubtitleDraft ||
          edit.current?.projectOnPersist) &&
          fingerprint(projectEditorDraft(captured)) === actualFingerprint),
      );
    },
    [projectEditorDraft],
  );
  const current = useCallback(
    (captured = request.current) => {
      const value = latest.current;
      const graph = value.getDocument();
      if (
        !active.current ||
        captured !== request.current ||
        !captured ||
        captured.owner !== value.owner ||
        value.owner !== owner ||
        !value.ready ||
        value.readonly ||
        graph?.documentKey !== documentKey ||
        !graph.ready ||
        graph.readonly
      )
        return null;
      const node = graph.nodes.find(
        (item) => item.id === captured.nodeId && item.type === 'video-clip',
      );
      if (!node) return null;
      const presentation = resolveVideoClipNodePresentation({
        nodeId: node.id,
        data: node.data,
        incomingData: collectVideoClipIncomingData({ node, ...graph }),
        readonly: graph.readonly,
        nowMs: Date.now(),
        editingClipPreviewExpanded: captured.previewExpanded,
        editingClipNodeId: node.id,
      });
      return presentation.agentBusy ? null : { value, graph, node, request: captured };
    },
    [owner, documentKey],
  );
  const persist = useCallback(
    (captured = request.current, nextTimeline = captured?.timeline, updateSources = false) => {
      clearTimeout(timer.current);
      const context = current(captured);
      if (!context) return false;
      if (!captured.initialized || !captured.ready) {
        if (
          (captured.sourceNodeIdsOverride || captured.pendingSourceNodeIds?.length) &&
          (!captured.initialized || !captured.ready)
        ) {
          publish({
            ...captured,
            error: captured.pendingSourceNodeIds?.length
              ? '拖入素材仍在准备媒体，请等待准备完成后再关闭。'
              : '恢复副本仍在准备媒体，请等待准备完成后再关闭。',
            playing: false,
          });
          return false;
        }
        return true;
      }
      const { value, graph, node } = context;
      const baseline = fingerprint(node.data?.clipTimelineData);
      // Another legitimate graph action may already have projected this exact
      // pending input. Rebase its CAS baseline while retaining the pre-edit
      // timeline for the eventual single undo step.
      if (
        baseline !== captured.baseFingerprint &&
        matchesProjectedDraft(captured, baseline, node.data?.clipTimelineData)
      )
        captured.baseFingerprint = baseline;
      if (baseline !== captured.baseFingerprint && baseline !== fingerprint(captured.timeline)) {
        publish({
          ...captured,
          error: '时间轴已被其他操作更新。当前编辑仍保留，请重新打开最新时间轴后继续。',
          conflicted: true,
          playing: false,
        });
        return false;
      }
      let nextEdges = graph.edges;
      if (updateSources) {
        const override = captured.sourceNodeIdsOverride
          ? new Set(captured.sourceNodeIdsOverride)
          : null;
        const differences = override
          ? { restoredSourceNodeIds: [...override], deletedSourceNodeIds: [] }
          : clipTimelineSourceDifferences(captured.timeline, nextTimeline);
        const removed = new Set(differences.deletedSourceNodeIds);
        nextEdges = graph.edges.filter((edge) => {
          if (edge.target !== node.id) return true;
          return override ? override.has(edge.source) : !removed.has(edge.source);
        });
        for (const sourceId of differences.restoredSourceNodeIds)
          if (
            graph.nodes.some((item) => item.id === sourceId) &&
            !nextEdges.some((edge) => edge.target === node.id && edge.source === sourceId)
          )
            nextEdges = [...nextEdges, { id: value.makeId(), source: sourceId, target: node.id }];
      }
      const nextSources = collectVideoClipIncomingSources(
        collectVideoClipIncomingData({ node, nodes: graph.nodes, edges: nextEdges }),
      );
      const serializedTimeline = {
        ...nextTimeline,
        videoSourceNodeIds: nextSources.usableVideoSourceNodeIds,
        audioSourceNodeIds: nextSources.usableAudioSourceNodeIds,
      };
      let updatedNode = { ...node, data: { ...node.data, clipTimelineData: serializedTimeline } };
      const nextNodes = graph.nodes.map((item) => (item === node ? updatedNode : item));
      if (nextEdges !== graph.edges) {
        const reconciled = recalculateCanvasIncomingTarget({
          nodes: nextNodes,
          edges: nextEdges,
          target: updatedNode,
        });
        updatedNode = reconciled;
      }
      const accepted = value.commitGraph(
        {
          ...graph,
          nodes: nextNodes.map((item) => (item.id === node.id ? updatedNode : item)),
          edges: nextEdges,
        },
        { expectedGraph: graph, historyWriter: () => {}, consumePromptDrafts: true },
      );
      if (!accepted) return false;
      captured.timeline = serializedTimeline;
      captured.persistedTimeline = serializedTimeline;
      captured.baseFingerprint = fingerprint(
        value.getDocument().nodes.find((item) => item.id === node.id)?.data?.clipTimelineData,
      );
      if (captured.sourceNodeIdsOverride) delete captured.sourceNodeIdsOverride;
      return true;
    },
    [current, publish, matchesProjectedDraft],
  );
  const schedule = () => {
    clearTimeout(timer.current);
    const captured = request.current;
    timer.current = setTimeout(() => {
      if (current(captured) && !edit.current) persist(captured);
    }, 300);
  };
  const settlePendingInput = useCallback(() => {
    const transaction = edit.current,
      captured = request.current;
    if (!transaction?.projectOnPersist) return true;
    if (!current(captured)) return false;
    const timeline = transaction.projectOnPersist(captured.timeline);
    edit.current = null;
    if (fingerprint(timeline) === fingerprint(transaction.timeline)) return true;
    if (!persist(captured, timeline, true)) {
      edit.current = transaction;
      return false;
    }
    publish({
      ...captured,
      timeline: captured.persistedTimeline || timeline,
      history: pushClipTimelineHistory(
        transaction.history,
        transaction.timeline,
        transaction.selectedClipIds,
      ),
    });
    return true;
  }, [current, persist, publish]);
  useLayoutEffect(() => {
    active.current = true;
    recovery.current = null;
    mediaCache.current = new Map();
    clipClipboard.current = null;
    publish(null);
    const pending = pendingUploads.current;
    return () => {
      clearTimeout(timer.current);
      audioDetach.current?.controller?.abort();
      audioDetach.current = null;
      for (const controller of pending) controller.abort();
      pending.clear();
      const captured = request.current;
      if (current(captured)) persist(captured);
      active.current = false;
      edit.current = null;
      request.current = null;
    };
  }, [owner, current, persist, publish]);
  const open = (nodeId) => {
    const value = latest.current;
    let graph = value.getDocument();
    if (
      !active.current ||
      value.owner !== owner ||
      !value.ready ||
      value.readonly ||
      graph?.documentKey !== documentKey ||
      !graph.ready ||
      graph.readonly
    )
      return false;
    let node = graph.nodes.find((item) => item.id === nodeId && item.type === 'video-clip');
    if (!node) return false;
    let incoming = incomingMedia(node, graph, mediaCache.current);
    const presentation = resolveVideoClipNodePresentation({
      nodeId,
      data: node.data,
      incomingData: incoming.incomingData,
      readonly: false,
      nowMs: Date.now(),
      editingClipPreviewExpanded: true,
    });
    if (!presentation.canOpenEditor) return false;
    if (request.current?.nodeId === nodeId && current()) return true;
    if (request.current && (!persist() || value.flushGraph(value.getDocument()) === false))
      return false;
    graph = value.getDocument();
    if (value.flushGraph(graph) === false) return false;
    graph = value.getDocument();
    node = graph.nodes.find((item) => item.id === nodeId && item.type === 'video-clip');
    if (!node) return false;
    incoming = incomingMedia(node, graph, mediaCache.current);
    value.cancelOtherGestures?.();
    recovery.current = null;
    let timeline;
    try {
      timeline = createClipTimelineDocument(node.data?.clipTimelineData || {});
    } catch {
      value.notify?.('时间轴数据无法读取，原画布数据已保留');
      return false;
    }
    const minimum = editorMinimumHeight(timeline);
    const originalView = request.current?.originalView || value.viewRef.current;
    publish({
      owner,
      draftSession: { latest: null },
      nodeId,
      nodeSubtitleHtmlUrl: node.data?.subtitleHtmlUrl,
      timeline,
      history: createClipTimelineHistory(),
      selectedClipIds: [],
      transitionPanelOpen: false,
      selectedTransitionRightClipId: null,
      subtitlePanelOpen: false,
      selectedSubtitleId: null,
      subtitleTextDraft: null,
      subtitleStatus: 'idle',
      subtitleError: '',
      textPanelOpen: false,
      selectedTextCueId: null,
      textDraft: null,
      textStatus: 'idle',
      textError: '',
      mediaBySourceId: incoming.media,
      sources: incoming.sources,
      baseFingerprint: fingerprint(node.data?.clipTimelineData),
      originalView: { ...originalView },
      previewExpanded: true,
      height: Math.max(minimum, Math.round(window.innerHeight * 0.35)),
      playing: false,
      ready: false,
      preparing: incoming.media.size > 0,
      initialized: false,
      error: incoming.media.size ? '' : '当前没有可读取的视频素材，原时间轴数据已保留。',
      conflicted: false,
      unsupportedFeatures: [],
      authoritative: shouldUseAuthoritativeClipTimeline(node.data),
      timelineSnapEnabled: true,
      pendingSourceNodeIds: [],
      clipClipboard: clipClipboard.current,
      audioDetach: null,
    });
    return true;
  };
  const close = () => {
    const captured = request.current;
    const context = current(captured);
    if (!context) return false;
    if (edit.current) {
      captured.timeline = edit.current.timeline;
      edit.current = null;
    }
    const persisted = persist(captured, captured.timeline, Boolean(captured.sourceNodeIdsOverride));
    if (!persisted || context.value.flushGraph(context.value.getDocument()) === false) {
      if (request.current === captured && !captured.conflicted && !captured.error)
        publish({
          ...captured,
          error: '本机保存失败，当前时间轴仍保留，请重试保存。',
          playing: false,
        });
      return false;
    }
    playbackRef.current?.pause();
    context.value.focusView(captured.originalView, { duration: 300 });
    recovery.current = null;
    publish(null);
    return true;
  };
  const initialize = useCallback(
    (captured) => {
      if (!current(captured) || captured.initialized) return;
      const records = [...captured.mediaBySourceId];
      if (
        !records.length ||
        !records.every(
          ([, record]) => record.metadata?.url === record.url && record.metadata.sourceDuration > 0,
        )
      )
        return;
      let timeline = captured.timeline;
      const pendingSourceNodeIds = new Set(captured.pendingSourceNodeIds || []);
      const consumedPendingSourceNodeIds = new Set();
      let addedPendingSource = false;
      if (timeline.clips.length) {
        if (timeline.clips.some((clip) => !captured.mediaBySourceId.has(clip.sourceNodeId))) {
          publish({
            ...captured,
            error: '部分时间轴素材的来源已失效。原片段与数据已保留，请恢复相应素材后重试。',
            preparing: false,
          });
          return;
        }
        const clips = timeline.clips.map((clip) => {
          const actualMetadata = captured.mediaBySourceId.get(clip.sourceNodeId).metadata;
          const metadata =
            clip.type === 'audio' ? { ...actualMetadata, width: 0, height: 0 } : actualMetadata;
          const bounds = resolvePreparedClipTimelineBounds(
            { ...metadata, duration: metadata.sourceDuration, sourceOffset: 0 },
            clip,
            clip.speed,
            { followFullSourceWhenChanged: !captured.authoritative },
          );
          const { timelineBoundsChanged: _changed, ...values } = bounds;
          return { ...clip, ...values };
        });
        const totalDuration = Math.max(
          0.05,
          ...clips.map((clip) => clip.startTime + clip.duration),
        );
        timeline = seekClipTimelineDocument(
          { ...timeline, clips, totalDuration },
          timeline.currentTime,
        );
      }
      if (!captured.authoritative || !timeline.clips.length || pendingSourceNodeIds.size > 0) {
        for (const [sourceNodeId, record] of records) {
          if (
            timeline.clips.some(
              (clip) =>
                clip.sourceNodeId === sourceNodeId &&
                (record.kind === 'audio' ? clip.type === 'audio' : clip.type !== 'audio'),
            )
          ) {
            if (pendingSourceNodeIds.has(sourceNodeId))
              consumedPendingSourceNodeIds.add(sourceNodeId);
            continue;
          }
          const result = insertPreparedClipTimelineMedia(timeline, {
            kind: record.kind,
            id: latest.current.makeId(),
            sourceNodeId,
            url: record.url,
            name: record.name,
            metadata: record.metadata,
          });
          if (result.status === 'added') {
            timeline = result.timeline;
            if (pendingSourceNodeIds.has(sourceNodeId)) {
              consumedPendingSourceNodeIds.add(sourceNodeId);
              addedPendingSource = true;
            }
          }
        }
      }
      const restoredSourceNodeIds = captured.sourceNodeIdsOverride
        ? new Set([...captured.sourceNodeIdsOverride, ...pendingSourceNodeIds])
        : null;
      timeline = {
        ...timeline,
        videoSourceNodeIds: restoredSourceNodeIds
          ? [...restoredSourceNodeIds].filter(
              (sourceNodeId) => captured.mediaBySourceId.get(sourceNodeId)?.kind === 'video',
            )
          : captured.sources.usableVideoSourceNodeIds,
        audioSourceNodeIds: restoredSourceNodeIds
          ? [...restoredSourceNodeIds].filter(
              (sourceNodeId) => captured.mediaBySourceId.get(sourceNodeId)?.kind === 'audio',
            )
          : captured.sources.usableAudioSourceNodeIds,
      };
      publish({
        ...captured,
        timeline,
        initialized: true,
        pendingSourceNodeIds: [...pendingSourceNodeIds].filter(
          (sourceNodeId) => !consumedPendingSourceNodeIds.has(sourceNodeId),
        ),
        ...(captured.sourceNodeIdsOverride && restoredSourceNodeIds
          ? { sourceNodeIdsOverride: [...restoredSourceNodeIds] }
          : {}),
        history: addedPendingSource
          ? pushClipTimelineHistory(captured.history, captured.timeline, captured.selectedClipIds)
          : captured.history,
      });
    },
    [current, publish],
  );
  const reloadLatestTimeline = () => {
    const captured = request.current;
    const context = current(captured);
    if (!context || !captured.conflicted) return false;
    let timeline;
    try {
      timeline = createClipTimelineDocument(context.node.data?.clipTimelineData || {});
    } catch {
      context.value.notify?.('最新时间轴无法读取，当前编辑与原数据仍保留');
      return false;
    }
    const incoming = incomingMedia(
      context.node,
      context.graph,
      new Map([...mediaCache.current, ...captured.mediaBySourceId]),
    );
    const backup = {
      documentKey,
      nodeId: captured.nodeId,
      timeline: structuredClone(projectEditorDraft(captured)),
      history: structuredClone(captured.history),
      selectedClipIds: [...captured.selectedClipIds],
    };
    clearTimeout(timer.current);
    playbackRef.current?.pause();
    edit.current = null;
    recovery.current = backup;
    const updated = {
      ...captured,
      draftSession: { latest: null },
      timeline,
      history: createClipTimelineHistory(),
      selectedClipIds: [],
      selectedTextCueId: null,
      textDraft: null,
      textSourceHtml: null,
      textStatus: 'idle',
      textPreviewReady: undefined,
      textPreviewError: '',
      selectedHtmlSubtitle: null,
      htmlSubtitleDraft: null,
      htmlSubtitleLayers: null,
      htmlSubtitleSourceStates: null,
      htmlSubtitleLoadKey: undefined,
      htmlSubtitleStatus: 'idle',
      htmlSubtitleError: '',
      htmlSubtitlePreviewReady: undefined,
      htmlSubtitlePreviewError: '',
      htmlSubtitleTrackChoice: null,
      mediaBySourceId: incoming.media,
      sources: incoming.sources,
      baseFingerprint: fingerprint(context.node.data?.clipTimelineData),
      persistedTimeline: undefined,
      ready: false,
      preparing: incoming.media.size > 0,
      initialized: false,
      error: '',
      mediaError: '',
      conflicted: false,
      playing: false,
      recoveryDraft: backup,
      authoritative: shouldUseAuthoritativeClipTimeline(context.node.data),
      pendingSourceNodeIds: [],
    };
    publish(updated);
    initialize(updated);
    return true;
  };
  const restoreRecoveryTimeline = () => {
    const captured = request.current;
    const context = current(captured);
    const backup = recovery.current;
    if (
      !context ||
      captured.conflicted ||
      !backup ||
      backup.documentKey !== documentKey ||
      backup.nodeId !== captured.nodeId
    )
      return false;
    const incoming = incomingMedia(
      context.node,
      context.graph,
      new Map([...mediaCache.current, ...captured.mediaBySourceId]),
    );
    const sourceNodeIds = [
      ...new Set(
        backup.timeline.clips
          .map((clip) => clip.sourceNodeId)
          .filter((sourceNodeId) => sourceNodeId),
      ),
    ];
    if (sourceNodeIds.some((sourceNodeId) => !incoming.media.has(sourceNodeId))) {
      context.value.notify?.('副本中的素材已断开，请先恢复相应素材；副本仍保留在当前页面');
      return false;
    }
    const hasRestoredMedia = sourceNodeIds.length > 0;
    const updated = {
      ...captured,
      draftSession: { latest: null },
      timeline: structuredClone(backup.timeline),
      history: structuredClone(backup.history),
      selectedClipIds: [...backup.selectedClipIds],
      selectedHtmlSubtitle: null,
      htmlSubtitleDraft: null,
      htmlSubtitleLayers: null,
      htmlSubtitleSourceStates: null,
      htmlSubtitleLoadKey: undefined,
      htmlSubtitleStatus: 'idle',
      htmlSubtitleError: '',
      htmlSubtitlePreviewReady: undefined,
      htmlSubtitlePreviewError: '',
      htmlSubtitleTrackChoice: null,
      baseFingerprint: fingerprint(context.node.data?.clipTimelineData),
      mediaBySourceId: incoming.media,
      sources: incoming.sources,
      sourceNodeIdsOverride: sourceNodeIds,
      persistedTimeline: undefined,
      playing: false,
      ready: !hasRestoredMedia,
      preparing: hasRestoredMedia,
      initialized: !hasRestoredMedia,
      error: '',
      mediaError: '',
      // The local edited layout must survive preparing this explicit restore.
      authoritative: true,
      recoveryDraft: backup,
    };
    playbackRef.current?.pause();
    publish(updated);
    initialize(updated);
    return true;
  };
  useLayoutEffect(() => {
    const captured = request.current;
    if (!captured || captured.owner !== owner) return;
    const context = current(captured);
    if (!context) {
      clearTimeout(timer.current);
      playbackRef.current?.pause();
      edit.current = null;
      publish(null);
      return;
    }
    const incoming = incomingMedia(
      context.node,
      context.graph,
      new Map([...mediaCache.current, ...captured.mediaBySourceId]),
    );
    const actualTimeline = fingerprint(context.node.data?.clipTimelineData);
    if (
      actualTimeline !== captured.baseFingerprint &&
      matchesProjectedDraft(captured, actualTimeline, context.node.data?.clipTimelineData)
    )
      captured.baseFingerprint = actualTimeline;
    if (
      actualTimeline !== captured.baseFingerprint &&
      actualTimeline !== fingerprint(captured.timeline)
    ) {
      if (!captured.conflicted)
        publish({
          ...captured,
          conflicted: true,
          playing: false,
          error: '时间轴已被其他操作更新。当前编辑仍保留，请重新打开最新时间轴后继续。',
        });
      return;
    }
    const mediaSignature = (media) =>
      fingerprint(
        [...media].map(([id, record]) => [id, record.url, record.kind, record.name, record.poster]),
      );
    if (mediaSignature(incoming.media) !== mediaSignature(captured.mediaBySourceId)) {
      const incomingPrepared =
        incoming.media.size > 0 &&
        [...incoming.media.values()].every(
          (record) =>
            record.metadata?.url === record.url && Number(record.metadata?.sourceDuration) > 0,
        );
      const updated = {
        ...captured,
        sources: incoming.sources,
        mediaBySourceId: incoming.media,
        initialized: false,
        ready: captured.ready && incomingPrepared,
        preparing: true,
      };
      publish(updated);
      initialize(updated);
    }
  }, [nodes, edges, owner, current, publish, initialize, matchesProjectedDraft]);
  const draftSession = state?.draftSession;
  const editingNodeId = state?.nodeId;
  useLayoutEffect(() => {
    if (!draftSession) return;
    const session = draftSession;
    return registerDraft?.(
      documentKey,
      editingNodeId,
      () => {
        const captured = session.latest;
        const value = projectEditorDraft(captured);
        // Saving can publish this exact object while playback has already
        // advanced. Remember its baseline without accepting arbitrary old
        // snapshots or retaining every playback frame in memory.
        if (captured === request.current && captured?.ready && !captured.conflicted && value)
          projectedDrafts.current.set(value, {
            session,
            baseFingerprint: captured.baseFingerprint,
            valueFingerprint: fingerprint(value),
          });
        return {
          kind: 'clip-timeline',
          writable: captured?.ready && !captured.conflicted,
          baseFingerprint: captured?.baseFingerprint,
          basePrompt: null,
          value,
        };
      },
      'clip-timeline',
    );
  }, [documentKey, editingNodeId, draftSession, registerDraft, projectEditorDraft]);
  useEffect(() => {
    const leaving = () => {
      let captured = request.current;
      if (!current(captured)) return;
      if (!settlePendingInput()) return;
      captured = request.current;
      if (edit.current) {
        captured.timeline = edit.current.timeline;
        edit.current = null;
      }
      if (persist(captured)) latest.current.flushGraph(latest.current.getDocument());
    };
    window.addEventListener('pagehide', leaving);
    return () => window.removeEventListener('pagehide', leaving);
  }, [owner, current, persist, settlePendingInput]);
  const publishTimeline = (timeline, patch = {}) => {
    const captured = request.current;
    if (!current(captured)) return false;
    publish({ ...captured, ...patch, timeline });
    schedule();
    return true;
  };
  const acceptEdit = (result, operation) => {
    const captured = request.current;
    if (operation && textTools.current?.session === captured?.draftSession) {
      result = textTools.current.transformTimelineEdit(captured, result, operation);
      if (result.error) {
        latest.current.notify?.(result.error);
        return false;
      }
    }
    if (
      !current(captured) ||
      !captured.ready ||
      captured.conflicted ||
      (result.timeline === captured.timeline &&
        (!result.historyTimeline ||
          fingerprint(result.historyTimeline) === fingerprint(captured.timeline)))
    ) {
      if (result.status === 'main-track-protected')
        latest.current.notify?.('主轨至少需要保留一个视频片段');
      return false;
    }
    // persist canonicalizes the live document after a successful graph commit.
    // Capture the pre-edit state before that mutation, including the selection.
    const amendMigration =
      result.migrationToken &&
      captured.pendingVttMigration?.token === result.migrationToken &&
      captured.pendingVttMigration.history === captured.history &&
      result.amendHistory === captured.history;
    const history = amendMigration
      ? captured.history
      : pushClipTimelineHistory(
          captured.history,
          result.historyTimeline || captured.timeline,
          captured.selectedClipIds,
        );
    if (!persist(captured, result.timeline, true)) return false;
    publish({
      ...captured,
      timeline: captured.persistedTimeline || result.timeline,
      history,
      selectedClipIds: result.selectedClipIds || captured.selectedClipIds,
      playing: result.pauseRequired ? false : captured.playing,
    });
    return true;
  };
  const onMetadata = (sourceNodeId, metadata) => {
    const captured = request.current;
    if (!current(captured)) return;
    const original = captured.mediaBySourceId.get(sourceNodeId);
    if (
      !original ||
      original.url !== metadata.url ||
      !Number.isFinite(metadata.sourceDuration) ||
      metadata.sourceDuration <= 0
    )
      return;
    mediaCache.current.set(sourceNodeId, { ...original, metadata });
    const media = new Map(captured.mediaBySourceId);
    media.set(sourceNodeId, { ...original, metadata });
    const updated = { ...captured, mediaBySourceId: media };
    publish(updated);
    initialize(updated);
  };
  const togglePreview = () => {
    const captured = request.current;
    const context = current(captured);
    if (!context) return;
    const expanded = !captured.previewExpanded;
    publish({
      ...captured,
      previewExpanded: expanded,
      transitionPanelOpen: expanded && captured.transitionPanelOpen,
    });
    if (!expanded) {
      focusEditorNode(context);
    }
  };
  /** Focuses the clip node after a collapsed preview is moved back into Canvas. */
  const focusEditorNode = (capturedContext = current(request.current)) => {
    if (!capturedContext) return false;
    const { value, graph, node } = capturedContext;
    const bounds = value.board.current?.getBoundingClientRect();
    if (!bounds) return false;
    value.setSelected([node.id]);
    const position = canvasWorldPosition(node, graph.nodes);
    const size = {
      ...canvasNodeSize(node),
      width: 350,
      height: node.data?.embedContentHeight ?? 260,
    };
    const zoom = value.viewRef.current.z;
    value.focusView(
      {
        x: bounds.width / 2 - (position.x + size.width / 2) * zoom,
        y: Math.max(100, bounds.height - 220) / 2 - (position.y + size.height / 2) * zoom,
        z: zoom,
      },
      { duration: 300 },
    );
    return true;
  };
  const beginEdit = ({ ownerToken, projectOnPersist } = {}) => {
    const captured = request.current;
    if (!current(captured) || !captured.ready || captured.conflicted || edit.current) return false;
    playbackRef.current?.pause();
    edit.current = {
      request: captured,
      timeline: captured.timeline,
      baseFingerprint: captured.baseFingerprint,
      history: captured.history,
      selectedClipIds: captured.selectedClipIds,
      ownerToken,
      projectOnPersist,
    };
    publish({ ...captured, playing: false });
    return true;
  };
  const isVttEditingBlocked = () => {
    const session = request.current;
    if (
      textTools.current?.session === session?.draftSession &&
      textTools.current?.isVttEditingBlocked
    )
      return textTools.current.isVttEditingBlocked();
    // Before the lazy tools are installed, known HTML stays reserved rather than becoming writable VTT.
    return Boolean(
      session?.nodeSubtitleHtmlUrl ||
      Object.keys(session?.timeline.subtitlesHtml || {}).length ||
      session?.timeline.clips.some((clip) => clip.type !== 'audio' && clip.subtitleHtmlUrl),
    );
  };
  const previewEdit = (operation, options) => {
    const captured = request.current;
    if (!current(captured) || !edit.current || captured.conflicted) return false;
    if (operation === 'subtitle' && isVttEditingBlocked()) return false;
    const base =
      operation === 'insert-track'
        ? captured.timeline
        : {
            ...edit.current.timeline,
            scale: captured.timeline.scale,
            scrollX: captured.timeline.scrollX,
          };
    const subtitleBase =
      operation === 'subtitle' &&
      !base.subtitles?.cues?.length &&
      !base.subtitles?.userCleared &&
      captured.subtitleSourceTrack
        ? { ...base, subtitles: captured.subtitleSourceTrack }
        : base;
    const method = {
      move: moveClipTimelineRealtime,
      trim: trimClipTimelineRealtime,
      reorder: reorderClipTimelineVideo,
      'insert-track': finishClipTimelineTrackInsertion,
      'audio-gain': setClipTimelineClipGain,
      subtitle: prepareSubtitleEdit,
      'text-overlay': textTools.current?.prepareEdit,
      'html-subtitle': textTools.current?.prepareSubtitleEdit,
    }[operation];
    if (!method) return false;
    const result = method(subtitleBase, { ...options, selectedClipIds: captured.selectedClipIds });
    if (result.error || result.status === 'no-slot') return false;
    edit.current.operation = operation;
    return publishTimeline(
      result.timeline,
      result.selectedClipIds ? { selectedClipIds: result.selectedClipIds } : {},
    );
  };
  const endEdit = (ownerToken) => {
    if (ownerToken !== undefined && edit.current?.ownerToken !== ownerToken) return false;
    const transaction = edit.current;
    edit.current = null;
    const captured = request.current;
    if (!transaction || !current(captured)) return false;
    if (fingerprint(captured.timeline) === fingerprint(transaction.timeline)) return true;
    if (
      transaction.operation === 'subtitle' &&
      textTools.current?.session === captured.draftSession
    )
      return textTools.current.commitVttEdit(
        { timeline: captured.timeline, historyTimeline: transaction.timeline },
        captured.selectedSubtitleId,
      );
    if (!persist(captured, captured.timeline, true)) return false;
    publish({
      ...captured,
      timeline: captured.persistedTimeline || captured.timeline,
      history: pushClipTimelineHistory(
        transaction.history,
        transaction.timeline,
        transaction.selectedClipIds,
      ),
    });
    return true;
  };
  const cancelEdit = (ownerToken) => {
    if (ownerToken !== undefined && edit.current?.ownerToken !== ownerToken) return false;
    const transaction = edit.current;
    edit.current = null;
    const captured = request.current,
      context = current(captured);
    if (transaction && context) {
      if (
        transaction.projectOnPersist &&
        captured.baseFingerprint !== transaction.baseFingerprint &&
        fingerprint(context.node.data?.clipTimelineData) === captured.baseFingerprint
      )
        if (!persist(captured, transaction.timeline, true)) return false;
      publish({
        ...captured,
        timeline: transaction.timeline,
        history: transaction.history,
        selectedClipIds: transaction.selectedClipIds,
      });
      return true;
    }
    return false;
  };
  const historyStep = (direction) => {
    const captured = request.current;
    if (!current(captured) || !captured.ready || captured.conflicted || edit.current) return false;
    const restored = stepClipTimelineHistory(
      captured.history,
      direction,
      captured.timeline,
      captured.selectedClipIds,
    );
    if (
      !restored ||
      restored.timeline === captured.timeline ||
      !persist(captured, restored.timeline, true)
    )
      return false;
    publish({
      ...captured,
      ...restored,
      timeline: captured.persistedTimeline || restored.timeline,
      playing: false,
    });
    playbackRef.current?.pause();
    return true;
  };
  const subtitle = createClipSubtitleControls({
    getSession: () => request.current,
    current,
    publish,
    acceptEdit,
    seek: (time) => {
      publishTimeline(seekClipTimelineDocument(request.current.timeline, time));
      playbackRef.current
        ?.seekAndWait(time)
        .catch((error) => latest.current.notify?.(error.message));
    },
    notify: (message) => latest.current.notify?.(message),
    isVttEditingBlocked,
    commitVttEdit: (result, selectedId) =>
      textTools.current?.session === request.current?.draftSession
        ? textTools.current.commitVttEdit(result, selectedId)
        : acceptEdit(result),
  });
  const flushBefore = new Set([
    'close',
    'onSelectClip',
    'onDelete',
    'onCopyClip',
    'onPasteClip',
    'onSplit',
    'onTrim',
    'onAddTransition',
    'onSelectTransition',
    'onToggleTransitionPanel',
    'onDetachAudio',
    'onVocalSplit',
    'onSeek',
    'onUndo',
    'onRedo',
    'onBeginEdit',
    'onPlayToggle',
    'onCompose',
    'onTogglePreview',
    'onAddSubtitle',
    'onSelectSubtitle',
    'onSeekSubtitle',
    'onEditSubtitle',
    'onAddText',
    'onSelectText',
    'onSeekText',
    'onEditText',
    'onApplyTextToAll',
    'onBeginTextStyle',
    'onCloseTextPanel',
    'onAddHtmlSubtitle',
    'onSelectHtmlSubtitle',
    'onSeekHtmlSubtitle',
    'onEditHtmlSubtitle',
    'onApplyHtmlSubtitleToAll',
    'onBeginHtmlSubtitleStyle',
    'onCloseHtmlSubtitles',
    'onRetryHtmlSubtitles',
  ]);
  const guardSession =
    (action, name) =>
    (...args) => {
      if (request.current?.draftSession !== state?.draftSession) return false;
      if (flushBefore.has(name) && !settlePendingInput()) return false;
      if (flushBefore.has(name) && !subtitle.flushDraft()) return false;
      if (
        flushBefore.has(name) &&
        textTools.current &&
        request.current?.draftSession === textTools.current.session &&
        !textTools.current.flushDraft()
      )
        return false;
      return action(...args);
    };
  const selectTransition = (rightClipId) => {
    const captured = request.current;
    if (!current(captured) || !captured.ready || captured.conflicted) return false;
    const transition = describeClipTimelineTransitions(captured.timeline).find(
      (entry) => entry.rightClipId === rightClipId,
    );
    if (!transition) return false;
    publishTimeline(
      { ...seekClipTimelineDocument(captured.timeline, transition.cutTime), cropRange: null },
      {
        selectedClipIds: [],
        selectedTransitionRightClipId: rightClipId,
        selectedSubtitleId: null,
        subtitlePanelOpen: false,
        textPanelOpen: false,
        selectedTextCueId: null,
        transitionPanelOpen: true,
        previewExpanded: true,
      },
    );
    playbackRef.current
      ?.seekAndWait(transition.cutTime)
      .catch((error) => latest.current.notify?.(error.message));
    return true;
  };
  const editTransition = (options = {}) => {
    const captured = request.current;
    if (!current(captured) || !captured.ready || captured.conflicted) return false;
    const result = setClipTimelineTransition(captured.timeline, {
      ...options,
      rightClipId: options.rightClipId ?? captured.selectedTransitionRightClipId ?? undefined,
      selectedClipIds: captured.selectedClipIds,
    });
    const errors = {
      'not-video': '请选择一个视频片段',
      'not-main-video': '请选择主视频轨上的视频片段',
      'no-next-clip': '当前视频后面没有可添加转场的视频',
      'no-selection': '请选择主视频轨上的视频片段',
    };
    if (errors[result.status]) {
      latest.current.notify?.(errors[result.status]);
      return false;
    }
    if (result.status !== 'unchanged' && !acceptEdit(result)) return false;
    return selectTransition(result.transition.rightClipId);
  };
  const deleteTransition = (rightClipId = request.current?.selectedTransitionRightClipId) => {
    const captured = request.current;
    if (
      !current(captured) ||
      !rightClipId ||
      rightClipId !== captured.selectedTransitionRightClipId
    )
      return false;
    return acceptEdit(deleteClipTimelineTransition(captured.timeline, { rightClipId }));
  };
  const getAudioSeparationStatus = (clipId) => {
    const captured = request.current;
    if (audioDetach.current?.clipId === clipId)
      return { allowed: false, reason: '正在提取内嵌音轨，请稍候' };
    const context = current(captured);
    if (!context) return { allowed: false, reason: '时间轴尚未准备完成' };
    const clip = captured.timeline.clips.find((item) => item.id === clipId);
    const sourceNode = context.graph.nodes.find((item) => item.id === clip?.sourceNodeId);
    const media = clip?.sourceNodeId ? captured.mediaBySourceId.get(clip.sourceNodeId) : null;
    const allowed = Boolean(
      clip &&
      clip.type !== 'audio' &&
      clip.loading !== true &&
      clip.embedAudioMuted !== true &&
      sourceNode?.data?.videoHasAudioTrack !== false &&
      media?.url,
    );
    const reason = allowed ? null : '当前片段暂不可分离';
    return { allowed: !reason, reason };
  };
  const vocalSplitAction = () => {
    latest.current.notify?.('人声分离服务尚未连接');
    return false;
  };
  const detachAudio = async (clipId) => {
    const captured = request.current;
    const context = current(captured);
    const status = getAudioSeparationStatus(clipId);
    if (!context || !status.allowed) {
      if (status.reason) latest.current.notify?.(status.reason);
      return false;
    }
    if (audioDetach.current) return false;
    const clip = captured.timeline.clips.find((item) => item.id === clipId);
    const media = captured.mediaBySourceId.get(clip.sourceNodeId);
    const session = captured.draftSession;
    const controller = new AbortController();
    audioDetach.current = { clipId, controller };
    publish({ ...captured, audioDetach: { clipId, status: 'extracting' } });
    const isCurrentSession = () =>
      !controller.signal.aborted &&
      request.current?.draftSession === session &&
      request.current?.nodeId === captured.nodeId &&
      !request.current?.conflicted;
    try {
      publish({ ...request.current, audioDetach: { clipId, status: 'uploading' } });
      const { runDetachedAudioOperation } = await import('./audio-separation-controller.js');
      const outcome = await runDetachedAudioOperation({
        clipId,
        captured,
        media,
        session,
        signal: controller.signal,
        extractAudio: latest.current.extractAudio,
        uploadFiles: latest.current.uploadFiles,
        getState: () => request.current,
        subscribe,
        isCurrentSession,
        acceptEdit,
      });
      if (outcome.ok) {
        publish({ ...request.current, audioDetach: null });
        latest.current.notify?.('音视频已分离，原声已静音并添加音频轨');
        return true;
      }
      if (!outcome.cancelled && isCurrentSession()) {
        publish({ ...request.current, audioDetach: null });
        latest.current.notify?.(outcome.message || '分离音轨失败，请重试');
      }
      return false;
    } catch (error) {
      if (!controller.signal.aborted && isCurrentSession()) {
        publish({ ...request.current, audioDetach: null });
        latest.current.notify?.(error.message || '分离音轨失败，请重试');
      }
      return false;
    } finally {
      if (audioDetach.current?.controller === controller) audioDetach.current = null;
    }
  };
  const controls = {
    ...Object.fromEntries(
      TEXT_TOOL_ACTIONS.map((name) => [
        name,
        (...args) => {
          if (
            !textTools.current ||
            !request.current ||
            textTools.current.session !== request.current.draftSession
          )
            return false;
          return textTools.current.controls[name]?.(...args);
        },
      ]),
    ),
    installTextTools: (factory) => {
      const captured = request.current;
      if (!current(captured)) return false;
      if (
        textTools.current?.session === captured.draftSession &&
        textTools.current.factory === factory
      )
        return true;
      const session = captured.draftSession;
      textTools.current = {
        ...factory({
          getSession: () => request.current,
          current: (value) => value?.draftSession === session && current(value),
          publish,
          acceptEdit,
          beginStyle: (ownerToken, projectOnPersist) => beginEdit({ ownerToken, projectOnPersist }),
          previewStyle: (ownerToken, options, operation = 'text-overlay') =>
            edit.current?.ownerToken === ownerToken && previewEdit(operation, options),
          endStyle: endEdit,
          cancelStyle: cancelEdit,
          pause: () => playbackRef.current?.pause(),
          seek: (time) => {
            publishTimeline(seekClipTimelineDocument(request.current.timeline, time));
            playbackRef.current
              ?.seekAndWait(time)
              .catch((error) => latest.current.notify?.(error.message));
          },
          makeId: () => latest.current.makeId(),
          notify: (message) => latest.current.notify?.(message),
          getSubtitleInputSelection: () => {
            const input = subtitleInputRef.current;
            return input && input.ownerDocument.activeElement === input
              ? {
                  start: input.selectionStart,
                  end: input.selectionEnd,
                  direction: input.selectionDirection,
                }
              : null;
          },
        }),
        session,
        factory,
      };
      return true;
    },
    ...subtitle.controls,
    subscribe,
    getState,
    playbackRef,
    subtitleInputRef,
    open,
    close,
    locked: Boolean(state?.previewExpanded),
    nodeId: state?.nodeId ?? null,
    previewExpanded: state?.previewExpanded ?? true,
    onMetadata,
    onReloadLatestTimeline: reloadLatestTimeline,
    onRestoreRecoveryTimeline: restoreRecoveryTimeline,
    onRetryPreparation: () => {
      if (current())
        return playbackRef.current
          ?.seekAndWait(request.current.timeline.currentTime)
          .catch((error) => latest.current.notify?.(error.message));
    },
    onContentHeightRequired: (height) => {
      const context = current();
      if (
        !context ||
        !Number.isFinite(height) ||
        height <= 0 ||
        context.node.data?.embedContentHeight === height
      )
        return false;
      return context.value.commitGraph(
        {
          ...context.graph,
          nodes: context.graph.nodes.map((node) =>
            node === context.node
              ? { ...node, data: { ...node.data, embedContentHeight: height } }
              : node,
          ),
        },
        { expectedGraph: context.graph, historyWriter: () => {} },
      );
    },
    onPreparationChange: (preparation) => {
      const captured = request.current;
      if (current(captured)) {
        const keepPreparedEditor =
          captured.ready && preparation.preparing === true && !preparation.error;
        publish({
          ...captured,
          ready: (preparation.ready === true && captured.initialized) || keepPreparedEditor,
          preparing: preparation.preparing === true,
          mediaError: preparation.error || '',
          unsupportedFeatures: preparation.unsupportedFeatures || [],
        });
      }
    },
    onTimeChange: (time) => {
      if (current() && request.current.ready && Number.isFinite(time))
        publishTimeline(seekClipTimelineDocument(request.current.timeline, time));
    },
    onPlayingChange: (playing) => {
      if (current()) publish({ ...request.current, playing: playing === true });
    },
    onPlayToggle: () => {
      if (!current() || !request.current.ready || request.current.conflicted) return;
      if (!request.current.playing && textTools.current?.isPlaybackBlocked?.()) return false;
      if (
        !request.current.playing &&
        (request.current.timeline.overlayHtmlInline || request.current.timeline.overlayHtmlUrl) &&
        (request.current.textStatus !== 'ready' || request.current.textPreviewReady !== true)
      )
        return false;
      const nextPlaying = !request.current.playing;
      // Publish the intent before native media preparation. Otherwise the
      // playback hook receives a stale `playing=false` during the async
      // metadata/frame wait and can cancel a legitimate user click.
      publish({ ...request.current, playing: nextPlaying });
      if (nextPlaying) playbackRef.current?.play();
      else playbackRef.current?.pause();
    },
    onSeek: (time) => {
      if (current() && Number.isFinite(time)) {
        publishTimeline(seekClipTimelineDocument(request.current.timeline, time));
        playbackRef.current
          ?.seekAndWait(time)
          .catch((error) => latest.current.notify?.(error.message));
      }
    },
    onSelectClip: (id) => {
      const clip = request.current?.timeline.clips.find((item) => item.id === id);
      if (current() && clip)
        publishTimeline(
          {
            ...request.current.timeline,
            cropRange: { start: clip.startTime, end: clip.startTime + clip.duration },
          },
          {
            selectedClipIds: [id],
            selectedTransitionRightClipId: null,
            selectedSubtitleId: null,
            selectedTextCueId: null,
          },
        );
    },
    onDelete: () => {
      if (request.current?.htmlSubtitlePanelOpen && request.current.selectedHtmlSubtitle)
        return textTools.current?.controls.onDeleteHtmlSubtitle();
      if (request.current?.textPanelOpen && request.current.selectedTextCueId)
        return textTools.current?.controls.onDeleteText();
      if (request.current?.selectedSubtitleId)
        return subtitle.controls.onEditSubtitle({
          kind: 'delete',
          cueId: request.current.selectedSubtitleId,
        });
      if (request.current?.selectedTransitionRightClipId) return deleteTransition();
      if (current())
        acceptEdit(
          deleteClipTimelineSelection(request.current.timeline, request.current.selectedClipIds, {
            selectedClipIds: request.current.selectedClipIds,
            viewportWidth: window.innerWidth - 72,
          }),
        );
    },
    onCopyClip: (clipId) => {
      const captured = request.current;
      if (!current(captured)) return false;
      const selectedClipIds = clipId ? [clipId] : captured.selectedClipIds;
      const result = copyClipTimelineSelection(captured.timeline, { selectedClipIds });
      if (result.status === 'video-only') {
        latest.current.notify?.('只能复制视频轨片段');
        return false;
      }
      if (result.status !== 'copied') {
        latest.current.notify?.('请先选择一个视频片段');
        return false;
      }
      clipClipboard.current = result.clipboard;
      publish({ ...captured, clipClipboard: result.clipboard });
      return true;
    },
    onPasteClip: () => {
      const captured = request.current;
      if (!current(captured) || !clipClipboard.current) {
        latest.current.notify?.('剪贴板为空');
        return false;
      }
      const copied = clipClipboard.current.clip;
      const media = captured.mediaBySourceId.get(copied.sourceNodeId);
      const result = pasteClipTimelineSelection(captured.timeline, {
        clipboard: clipClipboard.current,
        id: latest.current.makeId(),
        media,
        atTime: captured.timeline.currentTime,
        selectedClipIds: captured.selectedClipIds,
      });
      if (result.status === 'media-unavailable') {
        latest.current.notify?.('剪贴板中的视频素材仍未准备完成');
        return false;
      }
      if (result.status === 'video-limit') {
        latest.current.notify?.('视频片段数量已达到上限');
        return false;
      }
      return acceptEdit(result, { kind: 'duplicate', sourceClipId: copied.id });
    },
    onUndo: () => historyStep('undo'),
    onRedo: () => historyStep('redo'),
    onSplit: (kind) => {
      if (current())
        acceptEdit(
          splitClipTimelineAtPlayhead(request.current.timeline, {
            kind,
            selectedClipIds: request.current.selectedClipIds,
            leftId: makeId(),
            rightId: makeId(),
          }),
          { kind: 'split' },
        );
    },
    onTrim: (kind, side) => {
      if (current())
        acceptEdit(
          trimClipTimelineAtPlayhead(request.current.timeline, {
            kind,
            side,
            selectedClipIds: request.current.selectedClipIds,
            viewportWidth: window.innerWidth - 72,
          }),
        );
    },
    onAddTransition: editTransition,
    onSelectTransition: selectTransition,
    onDeleteTransition: deleteTransition,
    onSetTransitionDuration: (duration, rightClipId) => {
      if (!rightClipId || rightClipId !== request.current?.selectedTransitionRightClipId)
        return false;
      return editTransition({ duration, rightClipId, inspectorDuration: true });
    },
    onToggleTransitionPanel: () => {
      const captured = request.current;
      if (!current(captured) || !captured.ready || captured.conflicted) return false;
      publish({
        ...captured,
        transitionPanelOpen: !captured.transitionPanelOpen,
        subtitlePanelOpen: false,
        textPanelOpen: false,
        selectedTextCueId: null,
        previewExpanded: true,
      });
      return true;
    },
    onCloseTransitionPanel: () => {
      if (!current()) return false;
      publish({ ...request.current, transitionPanelOpen: false });
      return true;
    },
    onCanDetachAudio: getAudioSeparationStatus,
    onDetachAudio: detachAudio,
    onVocalSplit: vocalSplitAction,
    onSetTrackControl: (control) => {
      if (current()) {
        const timeline = setClipTimelineTrackControl(request.current.timeline, control);
        if (fingerprint(timeline) !== fingerprint(request.current.timeline))
          acceptEdit({ timeline });
      }
    },
    onSetView: (view) => {
      if (current()) publishTimeline(setClipTimelineView(request.current.timeline, view));
    },
    onBeginEdit: beginEdit,
    onEditPreview: previewEdit,
    onEndEdit: endEdit,
    onCancelEdit: cancelEdit,
    onTogglePreview: togglePreview,
    onReturnToNode: () => focusEditorNode(),
    onResizeHeight: (height) => {
      if (current())
        publish({
          ...request.current,
          height: Math.min(
            Math.floor(window.innerHeight * 0.6),
            Math.max(editorMinimumHeight(request.current.timeline), height),
          ),
        });
    },
    onToggleSnap: () => {
      if (current())
        publish({ ...request.current, timelineSnapEnabled: !request.current.timelineSnapEnabled });
    },
    onDropFiles: async (files) => {
      const captured = request.current;
      if (
        !current(captured) ||
        !captured.ready ||
        captured.conflicted ||
        !files?.length ||
        !latest.current.uploadFiles
      )
        return false;
      const controller = new AbortController();
      pendingUploads.current.add(controller);
      try {
        const uploaded = await latest.current.uploadFiles(files, {
          targetId: captured.nodeId,
          signal: controller.signal,
          isCurrent: () =>
            !controller.signal.aborted &&
            request.current?.draftSession === captured.draftSession &&
            !request.current.conflicted &&
            current() !== null,
        });
        const activeRequest = request.current;
        if (
          uploaded?.length &&
          activeRequest?.draftSession === captured.draftSession &&
          !activeRequest.conflicted
        ) {
          const pending = [
            ...new Set([
              ...(activeRequest.pendingSourceNodeIds || []),
              ...uploaded.map((item) => item.id),
            ]),
          ];
          const graph = latest.current.getDocument();
          const activeNode = graph?.nodes.find((node) => node.id === activeRequest.nodeId);
          const incoming =
            graph && activeNode ? incomingMedia(activeNode, graph, mediaCache.current) : null;
          const next = {
            ...activeRequest,
            pendingSourceNodeIds: pending,
            ...(incoming
              ? {
                  mediaBySourceId: incoming.media,
                  sources: incoming.sources,
                  initialized: false,
                  ready: false,
                  preparing: incoming.media.size > 0,
                }
              : {}),
            ...(activeRequest.sourceNodeIdsOverride
              ? {
                  sourceNodeIdsOverride: [
                    ...new Set([...activeRequest.sourceNodeIdsOverride, ...pending]),
                  ],
                }
              : {}),
          };
          publish(next);
          initialize(next);
        }
        return uploaded;
      } finally {
        pendingUploads.current.delete(controller);
      }
    },
    onCompose: () => {
      if (
        current() &&
        request.current.ready &&
        persist() &&
        latest.current.flushGraph(latest.current.getDocument()) !== false
      )
        latest.current.notify?.('视频合成服务尚未连接，时间轴已保存在本机');
    },
    notify: (message) => latest.current.notify?.(message),
  };
  for (const name of Object.keys(controls))
    if (typeof controls[name] === 'function' && !['open', 'subscribe', 'getState'].includes(name))
      controls[name] = guardSession(controls[name], name);
  Object.defineProperty(controls, 'state', { enumerable: true, get: getState });
  Object.defineProperty(controls, 'recoveryDraft', {
    enumerable: true,
    get: () => recovery.current,
  });
  return controls;
}
