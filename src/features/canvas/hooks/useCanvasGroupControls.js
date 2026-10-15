import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  captureStoryboardGroupControlSignature,
  computeStoryboardNaturalDimensions,
  planStoryboardGroupControl,
} from '../domain/storyboard-group-controls-model.js';
import {
  findStoryboardStitchNodePosition,
  planStoryboardStitch,
} from '../domain/storyboard-stitch-model.js';
import { composeStoryboardStitch } from '../stitch/runtime.js';
import { probeImageDimensions } from '../../../services/browser-image-metadata.ts';
import { readCanvasUploadNode } from '../domain/uploads.js';
import { planCanvasGeneralGroupControl } from '../domain/general-group-controls-model.js';

const signatureOf = (nodes, groupId) =>
  JSON.stringify(captureStoryboardGroupControlSignature(nodes, groupId));
const finiteDimensions = (item) =>
  Number.isFinite(item?.width) &&
  item.width > 0 &&
  Number.isFinite(item?.height) &&
  item.height > 0;
const generalCommands = new Set(['color', 'layout', 'convertToStoryboard']);
const planControl = (options) =>
  generalCommands.has(options.command?.type)
    ? planCanvasGeneralGroupControl(options)
    : planStoryboardGroupControl(options);

/** Group mutations share the graph CAS; asynchronous reads retain only their own group. */
export function useCanvasGroupControls(props) {
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false);
  const tasks = useRef(new Map());
  const pending = useRef(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState({ documentKey: props.documentKey, groupIds: [] });
  const [error, setError] = useState('');
  const { documentKey, ready, readonly, nodes, stitchSource } = props;

  const current = () => {
    const state = latest.current;
    const graph = state.getDocument?.();
    return active.current &&
      state.documentKey === documentKey &&
      state.ready &&
      !state.readonly &&
      graph?.documentKey === documentKey &&
      graph.ready &&
      !graph.readonly
      ? graph
      : null;
  };
  const syncBusy = () => {
    if (active.current && latest.current.documentKey === documentKey)
      setBusy({ documentKey, groupIds: [...tasks.current.keys()] });
  };
  const cancelConfirmation = (request) => {
    if (!request || pending.current !== request) return;
    pending.current = null;
    if (request) {
      const owner = tasks.current.get(request.groupId);
      if (owner?.confirmation === request) {
        owner.controller.abort();
        tasks.current.delete(request.groupId);
        syncBusy();
      }
    }
    setConfirmation(null);
    setError('');
  };
  useLayoutEffect(() => {
    active.current = true;
    const ownedTasks = tasks.current;
    return () => {
      active.current = false;
      pending.current = null;
      for (const owner of ownedTasks.values()) owner.controller.abort();
      ownedTasks.clear();
    };
  }, []);
  useLayoutEffect(() => {
    for (const owner of tasks.current.values()) owner.controller.abort();
    tasks.current.clear();
    pending.current = null;
    setConfirmation(null);
    setError('');
    setBusy({ documentKey, groupIds: [] });
  }, [documentKey, ready, readonly]);
  useEffect(() => {
    let canceled = false;
    for (const [id, owner] of tasks.current) {
      if (signatureOf(nodes, id) !== owner.signature) {
        owner.controller.abort();
        tasks.current.delete(id);
        canceled = true;
      }
    }
    if (canceled) setBusy({ documentKey, groupIds: [...tasks.current.keys()] });
    const request = pending.current;
    if (request && !nodes.some((node) => node.id === request.groupId && node.type === 'group')) {
      pending.current = null;
      setConfirmation(null);
      setError('');
    }
  }, [nodes, documentKey]);
  useEffect(() => {
    let canceled = false;
    for (const [id, owner] of tasks.current) {
      if (owner.kind === 'stitch' && owner.stitchSource !== stitchSource) {
        owner.controller.abort();
        tasks.current.delete(id);
        canceled = true;
      }
    }
    if (canceled) setBusy({ documentKey, groupIds: [...tasks.current.keys()] });
  }, [stitchSource, documentKey]);

  const isCurrent = (owner) => {
    const graph = current();
    return graph &&
      tasks.current.get(owner.groupId) === owner &&
      !owner.controller.signal.aborted &&
      (owner.kind !== 'stitch' || owner.stitchSource === latest.current.stitchSource) &&
      signatureOf(graph.nodes, owner.groupId) === owner.signature
      ? graph
      : null;
  };
  const start = (groupId, graph, request) => {
    const owner = {
      groupId,
      signature: signatureOf(graph.nodes, groupId),
      controller: new AbortController(),
      confirmation: request,
      kind: request ? 'convert' : 'stitch',
      stitchSource: latest.current.stitchSource,
    };
    tasks.current.set(groupId, owner);
    syncBusy();
    return owner;
  };
  const finish = (owner) => {
    if (tasks.current.get(owner.groupId) === owner) {
      tasks.current.delete(owner.groupId);
      syncBusy();
    }
  };
  const apply = (graph, groupId, command, dimensions) => {
    const plan = planControl({
      nodes: graph.nodes,
      edges: graph.edges,
      groupId,
      command,
      dimensions,
    });
    if (!plan.valid) return false;
    if (!plan.changed) return true;
    const next = { ...graph, nodes: plan.nodes, edges: plan.edges || graph.edges };
    if (!latest.current.graphActions.commitGraph(next, { expectedGraph: graph })) return false;
    if (plan.immediateFlush) latest.current.flushGraph?.(latest.current.getDocument());
    if (plan.fitGroupId) latest.current.onFocusNode?.(plan.fitGroupId, next.nodes);
    if (plan.removedIds?.length) {
      const removed = new Set(plan.removedIds);
      latest.current.setSelected?.((previous) => previous.filter((id) => !removed.has(id)));
    }
    return true;
  };
  const convert = async (graph, groupId, request) => {
    const initial = captureStoryboardGroupControlSignature(graph.nodes, groupId);
    if (!initial) return false;
    const owner = start(groupId, graph, request);
    try {
      const dimensions = new Map();
      await Promise.all(
        initial.children.map(async (child) => {
          if (finiteDimensions({ width: child.contentWidth, height: child.contentHeight })) return;
          if (!child.displayUrl) return;
          try {
            const value = await (latest.current.readImage || probeImageDimensions)(
              latest.current.resolveUrl?.(child.displayUrl) || child.displayUrl,
              { signal: owner.controller.signal },
            );
            if (isCurrent(owner))
              dimensions.set(
                child.id,
                computeStoryboardNaturalDimensions(value.width, value.height),
              );
          } catch (cause) {
            if (cause?.name === 'AbortError') throw cause;
            // Source image.onerror uses its ratio fallback; unreadable pixels are not guessed.
          }
        }),
      );
      const latestGraph = isCurrent(owner);
      return latestGraph
        ? apply(latestGraph, groupId, { type: 'convertToNormal' }, dimensions)
        : false;
    } finally {
      finish(owner);
    }
  };
  const stitch = async (graph, groupId, command) => {
    const result = planStoryboardStitch({
      nodes: graph.nodes,
      groupId,
      resolution: command.resolution,
    });
    if (!result.valid) {
      latest.current.notify?.(result.message || '当前分镜组没有可拼接的图片');
      return false;
    }
    const owner = start(groupId, graph);
    const { plan } = result;
    latest.current.notify?.(`正在拼接分镜图（${plan.resolution.toUpperCase()}）…`);
    try {
      const composed = await (latest.current.compose || composeStoryboardStitch)(plan, {
        signal: owner.controller.signal,
        resolveUrl: latest.current.resolveUrl,
      });
      let latestGraph = isCurrent(owner);
      if (!latestGraph) return false;
      const create = owner.stitchSource?.create;
      const node = create
        ? await create(composed.file, {
            signal: owner.controller.signal,
            documentKey,
            groupId,
            plan,
          })
        : await readCanvasUploadNode(composed.file, {
            position: plan.position,
            signal: owner.controller.signal,
          });
      latestGraph = isCurrent(owner);
      if (!latestGraph) return false;
      if (
        !node?.id ||
        node.type !== 'image' ||
        !Array.isArray(node.data?.url) ||
        !node.data.url[0] ||
        latestGraph.nodes.some((item) => item.id === node.id)
      )
        throw new Error('拼接图无法写入画布，请重试');
      const group = latestGraph.nodes.find((item) => item.id === groupId);
      const position = findStoryboardStitchNodePosition({
        group,
        nodes: latestGraph.nodes,
        size: plan.displaySize,
      });
      if (!position) throw new Error('拼接图无法放入当前画布，请重试');
      const { parentId: _parent, extent: _extent, ...root } = node;
      const created = {
        ...root,
        position,
        ...plan.displaySize,
        measured: { ...plan.displaySize },
        data: {
          ...node.data,
          name: plan.name,
          generatorType: 'default',
          _explicitContentDims: true,
          contentWidth: plan.displaySize.width,
          contentHeight: plan.displaySize.height,
          ...(!create ? { localMediaReady: true, action: 'image_resource' } : {}),
        },
      };
      const next = { ...latestGraph, nodes: [...latestGraph.nodes, created] };
      if (!latest.current.graphActions.commitGraph(next, { expectedGraph: latestGraph }))
        return false;
      const saved = latest.current.flushGraph?.(latest.current.getDocument());
      latest.current.setSelected?.([created.id]);
      latest.current.setPanel?.(null);
      latest.current.onFocusNode?.(created.id, next.nodes);
      const message = create ? '已创建拼接图' : '已在本机创建拼接图';
      latest.current.notify?.(saved === false ? `${message}，保存失败，请导出画布后重试` : message);
      return true;
    } catch (cause) {
      if (isCurrent(owner) && cause?.name !== 'AbortError')
        latest.current.notify?.(cause?.message || '拼接失败，请重试');
      return false;
    } finally {
      finish(owner);
    }
  };
  const command = (groupId, action) => {
    const graph = current();
    if (!graph || !action || tasks.current.has(groupId)) return false;
    if (action.type === 'stitch') return stitch(graph, groupId, action);
    const plan = planControl({
      nodes: graph.nodes,
      edges: graph.edges,
      groupId,
      command: action,
    });
    if (!plan.valid) return false;
    if (['clear', 'convertToNormal'].includes(action.type)) {
      cancelConfirmation(pending.current);
      const request = {
        groupId,
        command: action,
        documentKey,
        scriptLinked: Boolean(
          graph.nodes.find((node) => node.id === groupId)?.data?.sourceScriptNodeId,
        ),
      };
      pending.current = request;
      setError('');
      setConfirmation(request);
      return true;
    }
    try {
      return apply(graph, groupId, action);
    } catch (cause) {
      latest.current.notify?.(cause.message || '分镜组无法修改，请重试');
      return false;
    }
  };
  const confirm = async (request) => {
    const graph = current();
    if (
      !request ||
      pending.current !== request ||
      request.documentKey !== documentKey ||
      !graph ||
      tasks.current.has(request.groupId)
    )
      return false;
    try {
      const completed =
        request.command.type === 'convertToNormal'
          ? await convert(graph, request.groupId, request)
          : apply(graph, request.groupId, request.command);
      if (pending.current === request && current()) {
        if (completed) cancelConfirmation(request);
        else setError('分镜组已改变，未提交修改，请重试。');
      }
      return completed;
    } catch (cause) {
      if (pending.current === request && current() && cause?.name !== 'AbortError')
        setError(cause?.message || '分镜组无法修改，请重试');
      return false;
    }
  };
  return {
    command,
    confirm: () => confirm(confirmation),
    cancel: () => cancelConfirmation(confirmation),
    confirmation:
      ready && !readonly && confirmation?.documentKey === documentKey ? confirmation : null,
    busyGroupIds: busy.documentKey === documentKey ? busy.groupIds : [],
    error,
  };
}
