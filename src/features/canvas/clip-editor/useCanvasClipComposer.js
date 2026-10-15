import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { probeVideoMetadata } from '../../../services/media-metadata.ts';
import { collectVideoClipIncomingData } from './domain/incoming-model.js';
import { isClipAgentEditingActive } from '../clip-disconnect/disconnect-model.js';
import fallbackConfig from './domain/agent-config-fallback.json';
import {
  applyVideoComposeComposerMode,
  buildVideoComposeAgentSubmit,
  getVideoComposeMode,
  patchVideoComposeComposer,
  resolveVideoComposeAgentConfig,
} from './domain/agent-composer-model.js';
import {
  missingVideoComposePresetMaterials,
  planVideoComposePresetGraph,
  videoComposePresetDisplaySize,
} from './domain/preset-graph-model.js';

function readImageDisplaySize(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const image = new Image();
    const finish = (error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', abort);
      const size = videoComposePresetDisplaySize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      image.removeAttribute('src');
      if (error) reject(error);
      else resolve(size);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(), 8000);
    image.onload = () => finish();
    image.onerror = () => finish();
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

async function preparePresetDisplay(material, mapUrl, signal) {
  if (material.nodeType === 'audio' || (material.width > 0 && material.height > 0))
    return videoComposePresetDisplaySize(material);
  if (material.nodeType === 'image') return readImageDisplaySize(mapUrl(material.url), signal);
  const result = await probeVideoMetadata(mapUrl(material.url), { signal, timeoutMs: 8000 });
  return videoComposePresetDisplaySize(result.metadata);
}

/** Node composer/presets use fresh Canvas transactions; service execution stays with Agent. */
export function useCanvasClipComposer({
  documentKey,
  projectId,
  ready,
  readonly,
  configContent,
  remoteConfig,
  getDocument,
  getNodeIncarnation,
  projectGraph,
  commitGraph,
  flushGraph,
  mapUrl = (url) => url,
  submitRequest,
  notify,
  makeId = createLocalId,
  prepareDisplay = preparePresetDisplay,
}) {
  // Original resolver always has its bundled four-mode fallback, even offline.
  // The public JSON is an operational override; this captured fallback stays fixed.
  const config = resolveVideoComposeAgentConfig(remoteConfig ?? configContent.data, fallbackConfig);
  const owner = useMemo(() => ({ documentKey, ready, readonly }), [documentKey, ready, readonly]);
  const latest = useRef(null);
  const active = useRef(false);
  const tasks = useRef(new Map());
  const warmups = useRef(new Map());
  const [pendingIds, setPendingIds] = useState([]);
  latest.current = {
    owner,
    documentKey,
    projectId,
    ready,
    readonly,
    config,
    getDocument,
    getNodeIncarnation,
    projectGraph,
    commitGraph,
    flushGraph,
    mapUrl,
    submitRequest,
    notify,
    makeId,
    prepareDisplay,
  };
  useLayoutEffect(() => {
    const ownedTasks = tasks.current;
    const ownedWarmups = warmups.current;
    active.current = true;
    setPendingIds([]);
    return () => {
      active.current = false;
      for (const task of ownedTasks.values()) task.abort();
      ownedTasks.clear();
      for (const cleanup of ownedWarmups.values()) cleanup();
      ownedWarmups.clear();
    };
  }, [owner]);
  const current = (nodeId, { requireConfig = true, requireIdle = true } = {}) => {
    const state = latest.current;
    const graph = state.getDocument();
    if (
      !active.current ||
      state.owner !== owner ||
      !state.ready ||
      state.readonly ||
      (requireConfig && !state.config) ||
      graph?.documentKey !== documentKey ||
      !graph.ready ||
      graph.readonly
    )
      return null;
    const node = graph.nodes.find((item) => item.id === nodeId && item.type === 'video-clip');
    if (!node || (requireIdle && isClipAgentEditingActive(node.data?.agentEditing, Date.now())))
      return null;
    return { state, graph, node };
  };
  const patch = (nodeId, changes) => {
    const value = current(nodeId);
    if (!value) return false;
    const { state, graph, node } = value;
    const composer = patchVideoComposeComposer(node.data?.agentComposerData, changes, state.config);
    return state.commitGraph(
      {
        ...graph,
        nodes: graph.nodes.map((item) =>
          item === node ? { ...item, data: { ...item.data, agentComposerData: composer } } : item,
        ),
      },
      { expectedGraph: graph, historyWriter: () => {} },
    );
  };
  const applyMode = async (nodeId, modeKey, withPreset = false) => {
    const value = current(nodeId);
    if (!value || tasks.current.has(nodeId)) return false;
    const { state, graph, node } = value;
    const mode = getVideoComposeMode(modeKey, state.config);
    let composerNode = node;
    if (state.projectGraph) {
      try {
        const projected = state.projectGraph(graph);
        if (!Array.isArray(projected?.nodes) || !Array.isArray(projected?.edges))
          throw new Error('Invalid draft projection');
        composerNode = projected.nodes.find((item) => item.id === nodeId);
        if (!composerNode) return false;
      } catch {
        state.notify?.('当前画布草稿无法读取，原输入仍保留，请重试');
        return false;
      }
    }
    const composer = applyVideoComposeComposerMode(
      composerNode.data?.agentComposerData,
      modeKey,
      state.config,
      { withPreset },
    );
    if (
      !state.commitGraph(
        {
          ...graph,
          nodes: graph.nodes.map((item) =>
            item === node ? { ...item, data: { ...item.data, agentComposerData: composer } } : item,
          ),
        },
        { expectedGraph: graph, historyWriter: () => {} },
      )
    )
      return false;
    if (!withPreset) return true;
    const controller = new AbortController();
    const incarnation = state.getNodeIncarnation?.(nodeId);
    tasks.current.set(nodeId, controller);
    setPendingIds([...tasks.current.keys()]);
    try {
      const fresh = current(nodeId);
      if (!fresh) return false;
      const missing = missingVideoComposePresetMaterials(
        mode,
        nodeId,
        fresh.graph.nodes,
        fresh.graph.edges,
      );
      const prepared = await Promise.all(
        missing.map(async (material) => ({
          material,
          size: await state.prepareDisplay(material, state.mapUrl, controller.signal),
        })),
      );
      const latestValue = current(nodeId);
      if (
        !latestValue ||
        controller.signal.aborted ||
        tasks.current.get(nodeId) !== controller ||
        (state.getNodeIncarnation && state.getNodeIncarnation(nodeId) !== incarnation) ||
        latestValue.node.data?.agentComposerData?.modeKey !== modeKey
      )
        return false;
      const plan = planVideoComposePresetGraph({
        ...latestValue.graph,
        nodeId,
        mode,
        prepared,
        makeId: latestValue.state.makeId,
      });
      if (!plan) return false;
      if (!plan.addedNodeIds.length) return true;
      const accepted = latestValue.state.commitGraph(
        { ...latestValue.graph, nodes: plan.nodes, edges: plan.edges },
        { expectedGraph: latestValue.graph, consumePromptDrafts: true },
      );
      if (!accepted) return false;
      if (latestValue.state.flushGraph?.(latestValue.state.getDocument()) === false) {
        latestValue.state.notify?.('预设素材已添加，但本机保存失败，请重试保存画布');
        return false;
      }
      return true;
    } catch (error) {
      if (!controller.signal.aborted && current(nodeId))
        latest.current.notify?.(error.message || '预设素材读取失败，请重试');
      return false;
    } finally {
      if (tasks.current.get(nodeId) === controller) {
        tasks.current.delete(nodeId);
        if (active.current && latest.current.owner === owner)
          setPendingIds([...tasks.current.keys()]);
      }
    }
  };
  const submit = (nodeId, prompt) => {
    if (typeof prompt === 'string' && !patch(nodeId, { prompt })) return false;
    const value = current(nodeId);
    if (!value) return false;
    const request = buildVideoComposeAgentSubmit({
      ...value,
      nodeId,
      projectId: value.state.projectId,
      nodes: value.graph.nodes,
      config: value.state.config,
      composer: value.node.data?.agentComposerData,
      incomingData: collectVideoClipIncomingData({ node: value.node, ...value.graph }),
    });
    if (request.status !== 'ready') return false;
    if (value.state.flushGraph?.(value.graph) === false) return false;
    // Local Agent records the exact request and explains its unavailable executor.
    // Pending/editing/task state may only be introduced by a connected service.
    return value.state.submitRequest?.(request.payload, request.skillUseMeta) === true;
  };
  const changeVolume = (nodeId, volume) => {
    const value = current(nodeId, { requireConfig: false, requireIdle: false });
    if (!value || !Number.isFinite(volume)) return false;
    const { state, graph, node } = value;
    return state.commitGraph(
      {
        ...graph,
        nodes: graph.nodes.map((item) =>
          item === node
            ? { ...item, data: { ...item.data, playbackVolume: Math.max(0, Math.min(1, volume)) } }
            : item,
        ),
      },
      { expectedGraph: graph, historyWriter: () => {} },
    );
  };
  const changeExpandedSize = (nodeId, generatorExpandedSize) => {
    const value = current(nodeId, { requireConfig: false });
    if (
      !value ||
      !Number.isFinite(generatorExpandedSize?.width) ||
      !Number.isFinite(generatorExpandedSize?.height)
    )
      return false;
    const { state, graph, node } = value;
    return state.commitGraph(
      {
        ...graph,
        nodes: graph.nodes.map((item) =>
          item === node ? { ...item, data: { ...item.data, generatorExpandedSize } } : item,
        ),
      },
      { expectedGraph: graph, historyWriter: () => {} },
    );
  };
  const warmPresets = useCallback(
    (modes) => {
      const state = latest.current;
      if (!active.current || state.owner !== owner) return;
      for (const mode of modes || [])
        for (const material of mode.preset?.materials || []) {
          if (!material.url || !['image', 'video'].includes(material.nodeType)) continue;
          const url = state.mapUrl(material.url);
          if (!url || warmups.current.has(url)) continue;
          const media =
            material.nodeType === 'image' ? new Image() : document.createElement('video');
          const cleanup = () => {
            clearTimeout(timeout);
            media.onload = media.onerror = media.onloadedmetadata = null;
            media.removeAttribute('src');
            if (material.nodeType === 'video') media.load();
          };
          const timeout = setTimeout(cleanup, 8000);
          warmups.current.set(url, cleanup);
          media.onerror = cleanup;
          if (material.nodeType === 'image') media.onload = cleanup;
          else {
            media.preload = 'metadata';
            media.muted = true;
            media.playsInline = true;
            media.onloadedmetadata = cleanup;
          }
          media.src = url;
        }
    },
    [owner],
  );
  return {
    config,
    configContent,
    pendingIds,
    patch,
    applyMode,
    submit,
    changeVolume,
    changeExpandedSize,
    warmPresets,
  };
}
