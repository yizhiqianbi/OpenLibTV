import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { probeImageDimensions } from '../../../../services/browser-image-metadata.ts';
import { unavailableRoleLibrarySource } from '../../../../services/canvas-role-library.ts';
import { createLocalId } from '../../../editor/model.js';
import { resolveNodeGenerator } from '../node-generator.js';
import { patchCanvasMagicPrompt } from '../magic-metadata-model.js';
import { roleLibraryAvailability } from './role-library-model.js';
import { planCanvasRoleLibrarySelection } from './role-library-graph-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const usable = (value) => typeof value === 'string' && value.length > 0;
const signature = (selection) =>
  JSON.stringify([selection.images, selection.videos, selection.audios]);
const aborted = () => Object.assign(new Error('角色引用操作已取消'), { name: 'AbortError' });

/** A transient picker owns reads; this controller exclusively owns the graph transaction. */
export function useCanvasRoleLibrary({
  node,
  documentKey,
  source = unavailableRoleLibrarySource,
  readonly,
  ready,
  getDocument,
  getPrompt,
  onAcceptedPrompt,
  graphActions,
  flushGraph,
  asset,
  readImageDimensions = probeImageDimensions,
  restricted = false,
  protectionActive = false,
  cancelOtherGestures,
}) {
  const owner = useMemo(
    () => ({ documentKey, nodeId: node?.id, source }),
    [documentKey, node?.id, source],
  );
  const latest = useRef(null),
    alive = useRef(false),
    opened = useRef(null),
    operation = useRef(null),
    accepted = useRef(null);
  const [open, setOpen] = useState(false);
  latest.current = {
    node,
    readonly,
    ready,
    getDocument,
    getPrompt,
    onAcceptedPrompt,
    graphActions,
    flushGraph,
    asset,
    readImageDimensions,
    restricted,
    protectionActive,
    cancelOtherGestures,
    owner,
  };
  const fresh = useCallback(
    (captured = owner) => {
      if (!captured) return null;
      const value = latest.current,
        graph = value.getDocument?.();
      const target = graph?.nodes?.find((item) => item.id === captured.nodeId);
      if (
        !alive.current ||
        value.owner !== captured ||
        value.readonly ||
        !value.ready ||
        graph?.documentKey !== captured.documentKey ||
        !graph.ready ||
        graph.readonly ||
        !Array.isArray(graph.nodes) ||
        !Array.isArray(graph.edges) ||
        target?.type !== 'video'
      )
        return null;
      const resolved = resolveNodeGenerator(target, graph.nodes, graph.edges, graph.models);
      const availability = roleLibraryAvailability({
        schema: resolved.schema,
        params: { ...resolved.params, ...resolved.inputMedia },
        readonly: value.readonly,
        ready: value.ready && !!resolved.schema,
        configLocked: resolved.configLocked,
        isValidExtraConfig: resolved.modelKeys !== null,
        restricted: value.restricted,
        protectionActive: value.protectionActive,
      });
      const savingAccepted = accepted.current?.owner === captured;
      return (availability.visible || savingAccepted) && !availability.disabled
        ? { value, graph, target, resolved, availability }
        : null;
    },
    [owner],
  );
  const close = useCallback(() => {
    opened.current = null;
    operation.current?.abort();
    operation.current = null;
    accepted.current = null;
    setOpen(false);
  }, []);
  useEffect(() => {
    alive.current = true;
    close();
    const hide = () => close();
    window.addEventListener('pagehide', hide);
    return () => {
      alive.current = false;
      opened.current = null;
      operation.current?.abort();
      operation.current = null;
      accepted.current = null;
      window.removeEventListener('pagehide', hide);
    };
  }, [owner, close]);
  useEffect(() => {
    if (open && !fresh(opened.current)) close();
  }, [open, node, readonly, ready, restricted, protectionActive, fresh, close]);

  const toggle = useCallback(() => {
    if (opened.current === owner) {
      close();
      return;
    }
    if (!fresh()) return;
    latest.current.cancelOtherGestures?.();
    opened.current = owner;
    accepted.current = null;
    setOpen(true);
  }, [owner, close, fresh]);
  // Display can use the actual document even before the lifecycle effect enables writes.
  const graph = getDocument?.();
  const currentNode = graph?.nodes?.find((item) => item.id === node?.id) || node;
  const state =
    currentNode?.type === 'video'
      ? resolveNodeGenerator(currentNode, graph?.nodes || [], graph?.edges || [], graph?.models)
      : null;
  const availability = state
    ? roleLibraryAvailability({
        schema: state.schema,
        params: { ...state.params, ...state.inputMedia },
        readonly,
        ready: ready && !!state.schema,
        configLocked: state.configLocked,
        isValidExtraConfig: state.modelKeys !== null,
        restricted,
        protectionActive,
      })
    : {
        visible: false,
        disabled: true,
        seedanceTabVisible: false,
        capacities: {
          imageSelectableCount: 0,
          videoSelectableCount: 0,
          audioSelectableCount: 0,
        },
      };
  const media = state?.inputMedia || {};
  const context = {
    seedanceTabVisible: availability.seedanceTabVisible,
    ...availability.capacities,
    existingImageIds: array(media.imageList).flatMap((item) =>
      item.assetId ? [item.assetId] : item.compliantExempt && usable(item.url) ? [item.url] : [],
    ),
    existingVideoIds: array(media.videoList)
      .filter(
        (item) =>
          !graph?.nodes.find((candidate) => candidate.id === item.nodeId)?.data
            ?.assetVideoCertifiedInPlace,
      )
      .flatMap((item) => (item.assetId ? [item.assetId] : [])),
    existingAudioIds: array(media.audioList).flatMap((item) =>
      item.assetId ? [item.assetId] : [],
    ),
    existingImageUris: array(media.imageList).flatMap((item) =>
      item.assetId
        ? [`asset://${item.assetId}`]
        : item.compliantExempt && usable(item.url)
          ? [item.url]
          : [],
    ),
    existingVideoUris: array(media.videoList).flatMap((item) =>
      item.assetId ? [`asset://${item.assetId}`] : [],
    ),
    existingAudioUris: array(media.audioList).flatMap((item) =>
      item.assetId ? [`asset://${item.assetId}`] : [],
    ),
  };
  const confirm = useCallback(
    async (selection) => {
      const captured = owner;
      if (opened.current !== captured || !fresh(captured) || operation.current) return false;
      if (
        !selection ||
        !['images', 'videos', 'audios'].every(
          (key) => Array.isArray(selection[key]) && selection[key].every(usable),
        )
      )
        throw new Error('角色素材选择无效');
      const controller = new AbortController();
      operation.current = controller;
      const check = () => {
        const context = fresh(captured);
        if (controller.signal.aborted || opened.current !== captured || !context) throw aborted();
        return context;
      };
      try {
        const selectionKey = signature(selection);
        if (
          accepted.current?.owner === captured &&
          accepted.current.selectionKey === selectionKey
        ) {
          const current = check();
          if (current.value.flushGraph?.(current.value.getDocument()) !== true)
            throw new Error('引用已添加，画布保存失败；重试只保存当前画布');
          accepted.current = null;
          return true;
        }
        const start = check();
        const records = new Map(
          array(selection.assets)
            .filter((item) => item?.assetId && item.assetUrl)
            .map((item) => [item.assetId, item]),
        );
        // Existing references are a real resolver fallback, never a guessed CDN URL.
        for (const list of Object.values(start.resolved.inputMedia))
          for (const ref of array(list))
            if (ref.assetId && ref.url && !records.has(ref.assetId))
              records.set(ref.assetId, {
                assetId: ref.assetId,
                assetUrl: ref.url,
                complianceCheckedAtMs: ref.complianceCheckedAtMs,
                createdAtMs: ref.sourceCreatedAtMsIsLocalPlaceholder
                  ? undefined
                  : ref.sourceCreatedAtMs,
              });
        const resolveAssetUri = (uri) => {
          const item = records.get(uri.slice('asset://'.length));
          return item ? { ...item, url: item.assetUrl } : null;
        };
        for (const uri of [...selection.images, ...selection.videos, ...selection.audios])
          if (uri.startsWith('asset://') && !resolveAssetUri(uri))
            throw new Error('部分角色素材无法读取，已保留选择，请刷新素材库后重试');
        const imageDimensionsByUri = new Map();
        const directSources = new Set(
          start.graph.edges
            .filter((edge) => edge.target === captured.nodeId)
            .map((edge) => edge.source),
        );
        const existingImages = new Set(
          start.graph.nodes.flatMap((item) => {
            const data = item.data || {};
            if (!directSources.has(item.id) || (data.type || item.type) !== 'image') return [];
            if (data.portraitAssetId) return [`asset://${data.portraitAssetId}`];
            const url = Array.isArray(data.url) ? data.url[0] : data.url;
            return data.portraitCompliantExempt && usable(url) ? [url] : [];
          }),
        );
        await Promise.all(
          [...new Set(selection.images)]
            .filter((uri) => !existingImages.has(uri))
            .map(async (uri) => {
              const url = uri.startsWith('asset://') ? resolveAssetUri(uri).url : uri;
              try {
                const dimensions = await start.value.readImageDimensions(
                  start.value.asset?.(url) || url,
                  { signal: controller.signal },
                );
                check();
                imageDimensionsByUri.set(uri, dimensions);
              } catch (cause) {
                if (controller.signal.aborted || cause?.name === 'AbortError') throw aborted();
                check(); // Source rV falls back to a square after an ordinary metadata failure.
              }
            }),
        );
        const current = check();
        const limits = current.availability.capacities;
        if (
          [
            ['images', 'imageSelectableCount'],
            ['videos', 'videoSelectableCount'],
            ['audios', 'audioSelectableCount'],
          ].some(([list, key]) => new Set(selection[list]).size > limits[key])
        )
          throw new Error('参考素材数量已变化，已保留选择，请调整后重试');
        const prompt = current.value.getPrompt?.();
        const projectedNodes = current.graph.nodes.map((item) =>
          item.id === captured.nodeId && typeof prompt === 'string'
            ? {
                ...item,
                data: {
                  ...item.data,
                  params: patchCanvasMagicPrompt(item.data.params || {}, prompt),
                },
              }
            : item,
        );
        const plan = planCanvasRoleLibrarySelection({
          nodes: projectedNodes,
          edges: current.graph.edges,
          targetNodeId: captured.nodeId,
          selection,
          schema: current.resolved.schema,
          resolveAssetUri,
          makeNodeId: createLocalId,
          makeEdgeId: createLocalId,
          imageDimensionsByUri,
          labels: { image: '素材图片', video: '素材视频', audio: '素材音频' },
        });
        if (!plan) return false;
        check();
        if (plan.unchanged) {
          if (current.value.flushGraph?.(current.value.getDocument()) !== true)
            throw new Error('画布保存失败，已保留选择，请重试');
          return true;
        }
        if (
          !current.value.graphActions?.commitGraph(
            { ...current.graph, ...plan },
            {
              expectedGraph: current.graph,
              historySnapshot: { nodes: projectedNodes, edges: current.graph.edges },
              explicitPromptNodeIds: [captured.nodeId],
            },
          )
        )
          throw new Error('画布已变化，已保留角色选择，请重试');
        accepted.current = { owner: captured, selectionKey };
        current.value.onAcceptedPrompt?.(
          current.value.getDocument()?.nodes.find((item) => item.id === captured.nodeId)?.data
            ?.params?.prompt,
        );
        if (current.value.flushGraph?.(current.value.getDocument()) !== true)
          throw new Error('引用已添加，画布保存失败；重试只保存当前画布');
        accepted.current = null;
        return true;
      } finally {
        if (operation.current === controller) operation.current = null;
      }
    },
    [owner, fresh],
  );
  return {
    open: open && opened.current === owner,
    owner,
    source,
    availability,
    context,
    toggle,
    close,
    confirm,
  };
}
