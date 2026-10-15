import { useEffect, useRef } from 'react';
import { typeInfo } from '../catalog.js';
import { createCanvasNode } from '../model.js';
import { createLocalId } from '../../editor/model.js';
import { readCanvasUploadNode } from '../domain/uploads.js';
import { canvasWorldPosition } from '../domain/groups.js';
import { resolveCanvasConnection } from '../domain/connection-model.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';
import { resolveNodeGenerator } from '../generator/node-generator.js';
import { ensureGeneratorMediaListOrder } from '../generator/reference-reconciliation-model.js';
import { collectVideoClipIncomingData } from '../clip-editor/domain/incoming-model.js';

function clipVideoCapacityUsed(target, graph) {
  const data = target.data?.clipTimelineData;
  if (data?.clips !== undefined && !Array.isArray(data.clips)) return null;
  const clips = (data?.clips || []).filter((clip) => clip.type !== 'audio');
  const represented = new Set(clips.map((clip) => clip.sourceNodeId).filter(Boolean));
  // Accepted sources may still be awaiting metadata. Reserve their eventual
  // clips as well so another concurrent drop cannot overfill the timeline.
  const sources = new Set([
    ...(Array.isArray(data?.videoSourceNodeIds) ? data.videoSourceNodeIds : []),
    ...collectVideoClipIncomingData({ node: target, ...graph }).videoList.map(
      (source) => source.nodeId,
    ),
  ]);
  return (
    clips.length +
    [...sources].filter((id) => typeof id === 'string' && id && !represented.has(id)).length
  );
}

/** Node commands belong to the loaded document; readers never own a stale graph. */
export function useCanvasNodeActions(options) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(false);
  const uploads = useRef(new Set());
  const shotUploads = useRef(new Map());
  const { documentKey, readonly, ready } = options;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const tasks = uploads.current;
    return () => {
      for (const task of tasks) task.abort();
      tasks.clear();
    };
  }, [documentKey, readonly, ready]);

  const current = () => {
    const state = latest.current;
    return active.current && state.documentKey === documentKey && state.ready && !state.readonly
      ? state
      : null;
  };
  const change = (nodes, edges = latest.current.edges) => {
    const state = current();
    if (!state) return;
    state.record();
    state.setNodes(nodes);
    state.setEdges(edges);
  };
  const update = (id, data) => {
    const state = current();
    if (!state) return;
    state.setNodes((nodes) =>
      nodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...data } } : node)),
    );
    state.setSaved(false);
  };
  const addNode = (type, position) => {
    if (!latest.current.ready || latest.current.documentKey !== documentKey) return;
    if (latest.current.readonly) {
      latest.current.notify('只读模式，如需创建请复制画布');
      return;
    }
    const state = current();
    if (!state) return;
    const bounds = state.board.current?.getBoundingClientRect();
    if (!position && !bounds) return;
    const node = createCanvasNode({
      type,
      label: typeInfo(type).label,
      nodes: state.nodes,
      models: state.models,
      position:
        position ||
        state.point({
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
        }),
    });
    change([...state.nodes, node]);
    state.setSelected([node.id]);
    state.setPanel(
      ['image', 'video', 'audio', 'script', 'storyboard', 'script-v2'].includes(type)
        ? null
        : node.id,
    );
    state.setMenu(null);
    return node;
  };
  const connect = (id) => {
    const state = current();
    if (!state?.linking) return false;
    const connected = state.connectNodes?.({ sourceId: state.linking, targetId: id }) === true;
    state.setLinking(null);
    state.setLinkPoint(null);
    return connected;
  };
  const upload = async (files, position) => {
    // File inputs clear their value immediately after dispatch. FileList is
    // live, so retain every selected File before the first asynchronous read.
    const selectedFiles = Array.from(files || []);
    if (!current()) return;
    const controller = new AbortController();
    uploads.current.add(controller);
    const items = [];
    try {
      for (const file of selectedFiles) {
        try {
          const item = await readCanvasUploadNode(file, {
            position,
            index: items.length,
            signal: controller.signal,
          });
          if (controller.signal.aborted || !current()) return;
          items.push(item);
        } catch (error) {
          const state = current();
          if (controller.signal.aborted || !state) return;
          state.notify(error.message || '文件读取失败，请重新选择文件');
        }
      }
      const state = current();
      if (!items.length || controller.signal.aborted || !state) return;
      state.record();
      // File reads may span edits; append to React's latest graph and retain its edges.
      state.setNodes((nodes) => [...nodes, ...items]);
      state.setSelected(items.map((node) => node.id));
    } finally {
      uploads.current.delete(controller);
    }
  };
  const uploadClipFiles = async (files, { targetId, isCurrent, signal } = {}) => {
    const selectedFiles = Array.from(files || []).filter((file) => {
      const type = String(file.type || '').toLowerCase();
      return type.startsWith('video/') || type.startsWith('audio/');
    });
    const state = current();
    const graph =
      (typeof latest.current.currentDocument === 'function'
        ? latest.current.currentDocument()
        : latest.current.currentDocument?.current) || state;
    if (
      !selectedFiles.length ||
      !state ||
      !graph ||
      graph.documentKey !== documentKey ||
      !graph.ready ||
      graph.readonly ||
      !latest.current.commitGraph ||
      !targetId ||
      signal?.aborted ||
      !graph.nodes.some((node) => node.id === targetId && node.type === 'video-clip') ||
      (isCurrent && !isCurrent())
    )
      return [];
    const target = graph.nodes.find((node) => node.id === targetId);
    const position = canvasWorldPosition(target, graph.nodes);
    const targetToken = latest.current.getNodeIncarnation?.(targetId) ?? null;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    uploads.current.add(controller);
    const items = [];
    try {
      for (const file of selectedFiles) {
        try {
          const item = await readCanvasUploadNode(file, {
            position,
            index: items.length,
            signal: controller.signal,
          });
          if (controller.signal.aborted || !current() || (isCurrent && !isCurrent())) return [];
          items.push(item);
        } catch (error) {
          if (controller.signal.aborted || !current()) return [];
          latest.current.notify?.(error.message || '文件读取失败，请重新选择文件');
          return [];
        }
      }
      const currentGraph =
        (typeof latest.current.currentDocument === 'function'
          ? latest.current.currentDocument()
          : latest.current.currentDocument?.current) || graph;
      const currentTarget = currentGraph.nodes.find((node) => node.id === targetId);
      if (
        controller.signal.aborted ||
        !current() ||
        !currentTarget ||
        currentTarget.type !== 'video-clip' ||
        currentGraph.documentKey !== documentKey ||
        !currentGraph.ready ||
        currentGraph.readonly ||
        (isCurrent && !isCurrent()) ||
        (targetToken
          ? latest.current.getNodeIncarnation?.(targetId) !== targetToken
          : currentTarget !== target)
      )
        return [];
      const videoItems = items.filter((item) => item.type === 'video');
      const existingVideos = clipVideoCapacityUsed(currentTarget, currentGraph);
      if (existingVideos === null) {
        latest.current.notify?.('时间轴数据无法读取，原画布数据已保留');
        return [];
      }
      if (existingVideos + videoItems.length > 30) {
        latest.current.notify?.('时间轴最多支持 30 个视频片段');
        return [];
      }
      const nodes = [...currentGraph.nodes, ...items];
      let edges = currentGraph.edges;
      for (const item of items) {
        const plan = resolveCanvasConnection({
          ...currentGraph,
          nodes,
          edges,
          sourceId: item.id,
          targetId,
        });
        if (!plan.valid) {
          latest.current.notify?.(canvasConnectionReasonLabel(plan.reason));
          return [];
        }
        edges = [...edges, { id: createLocalId('edge'), source: item.id, target: targetId }];
      }
      const committed = latest.current.commitGraph(
        { ...currentGraph, nodes, edges },
        { expectedGraph: currentGraph },
      );
      if (!committed) return [];
      latest.current.setSelected?.([targetId]);
      return items;
    } finally {
      signal?.removeEventListener('abort', abort);
      uploads.current.delete(controller);
    }
  };
  const shotContext = (targetId) => {
    const state = current();
    const graph =
      (typeof state?.currentDocument === 'function'
        ? state.currentDocument()
        : state?.currentDocument?.current) || state;
    const target = graph?.nodes?.find((node) => node.id === targetId);
    return state &&
      graph.documentKey === documentKey &&
      graph.ready &&
      !graph.readonly &&
      target?.type === 'shot-breakdown' &&
      !target.data?.taskInfo?.loading
      ? { state, graph, target }
      : null;
  };
  const updateShotBreakdown = (targetId, patch) => {
    const context = shotContext(targetId);
    if (!context) return false;
    return (
      context.state.commitGraph?.(
        {
          ...context.graph,
          nodes: context.graph.nodes.map((node) =>
            node.id === targetId ? { ...node, data: { ...node.data, ...patch } } : node,
          ),
        },
        { expectedGraph: context.graph },
      ) === true
    );
  };
  const uploadShotBreakdownFile = async (targetId, file) => {
    const context = shotContext(targetId);
    if (!context || !file?.type?.startsWith('video/')) return false;
    if (file.size > 50 * 1024 * 1024) {
      context.state.notify('视频大小不能超过 50MB');
      return false;
    }
    shotUploads.current.get(targetId)?.abort();
    const controller = new AbortController();
    shotUploads.current.set(targetId, controller);
    uploads.current.add(controller);
    const incarnation = context.state.getNodeIncarnation?.(targetId);
    const incoming = context.graph.edges.filter((edge) => edge.target === targetId);
    try {
      // The local adapter stores a data URL in a real VIDEO source node. A blob
      // URL is process-local and must never be persisted as a ready resource.
      const item = await readCanvasUploadNode(file, { signal: controller.signal });
      const next = shotContext(targetId);
      if (!next || controller.signal.aborted || shotUploads.current.get(targetId) !== controller)
        return false;
      if (incarnation && next.state.getNodeIncarnation?.(targetId) !== incarnation) return false;
      const currentIncoming = next.graph.edges.filter((edge) => edge.target === targetId);
      if (
        incoming.length !== currentIncoming.length ||
        incoming.some((edge, i) => edge !== currentIncoming[i])
      )
        return false;
      const position = canvasWorldPosition(next.target, next.graph.nodes);
      const source = {
        ...item,
        position: { x: position.x - (item.width || 350) - 80, y: position.y },
        data: { ...item.data, action: 'video_resource', uploaded: true },
      };
      const committed =
        next.state.commitGraph?.(
          {
            ...next.graph,
            nodes: [...next.graph.nodes, source],
            edges: [
              ...next.graph.edges.filter((edge) => edge.target !== targetId),
              { id: createLocalId('edge'), source: source.id, target: targetId },
            ],
          },
          { expectedGraph: next.graph },
        ) === true;
      if (committed) {
        next.state.setSelected([targetId]);
        next.state.notify?.('已载入本地视频，选择拆解维度后可开始拉片');
      }
      return committed;
    } catch (error) {
      if (!controller.signal.aborted) current()?.notify(error.message || '视频读取失败，请重试');
      return false;
    } finally {
      uploads.current.delete(controller);
      if (shotUploads.current.get(targetId) === controller) shotUploads.current.delete(targetId);
    }
  };
  const generateNode = (nodeId, metadata = {}, promptOverride) => {
    const state = current();
    const node = state?.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const target =
      typeof promptOverride === 'string'
        ? {
            ...node,
            data: { ...node.data, params: { ...node.data?.params, prompt: promptOverride } },
          }
        : node;
    const resolved = resolveNodeGenerator(target, state.nodes, state.edges, state.models, {
      metadata,
    });
    if (!resolved.schema) {
      state.notify('模型配置尚不可用，请重新加载后重试');
      return;
    }
    const { params, error } = resolved;
    // Keep the local document's request params aligned with the source
    // generator contract.  Incoming media is already authoritative here;
    // only stable node IDs become order entries and URL-only records remain
    // untouched.  This is still a local adapter: no generation request is
    // sent while the server integration is deferred.
    const inputLists = ['imageList', 'videoList', 'audioList'].reduce((result, key) => {
      const list = resolved.inputMedia?.[key];
      if (Array.isArray(list) && list.length) result[key] = list;
      return result;
    }, {});
    const mixedList = resolved.inputMedia
      ? [
          ...(resolved.inputMedia.imageList || []).map((item) => ({ ...item, mediaType: 'image' })),
          ...(resolved.inputMedia.videoList || []).map((item) => ({ ...item, mediaType: 'video' })),
          ...(resolved.inputMedia.audioList || []).map((item) => ({ ...item, mediaType: 'audio' })),
        ]
      : [];
    if (Array.isArray(params.mixedList) && mixedList.length) inputLists.mixedList = mixedList;
    const requestParams = ensureGeneratorMediaListOrder({ ...params, ...inputLists });
    update(node.id, {
      params: requestParams,
      generationError: error || '生成服务未连接，提示词已保留。',
    });
    state.notify(error || '生成服务未连接，暂时无法生成');
  };
  return {
    addNode,
    change,
    update,
    connect,
    upload,
    uploadClipFiles,
    uploadShotBreakdownFile,
    updateShotBreakdown,
    generateNode,
  };
}
