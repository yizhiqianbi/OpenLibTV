import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../../editor/model.js';
import { centerCanvasView } from '../../geometry.js';
import { resolveNodeGenerator } from '../node-generator.js';
import {
  applyFocusAspect,
  deleteCanvasFocusRegion,
  drawFocusRegion,
  focusGeneratorCapability,
  moveFocusRegion,
  normalizeFocusPoint,
  planCanvasFocusRegion,
  resizeFocusRegion,
} from './focus-region-model.js';

const empty = () => ({
  sourceId: null,
  region: null,
  ratio: null,
  drawing: false,
  error: '',
  committed: null,
});
const client = (event) => ({ x: event.clientX, y: event.clientY });

/** Source front image only. Storyboard membership is a direct-parent rule. */
export function focusSurfaceAvailable(node, nodes, targetId, protectionActive = false) {
  if (protectionActive || node?.type !== 'image' || node.id === targetId) return false;
  const url = Array.isArray(node.data?.url) ? node.data.url[0] : null;
  if (typeof url !== 'string' || !url || url.startsWith('blob:')) return false;
  if (url.startsWith('data:') && !node.data.localMediaReady) return false;
  const parent = nodes.find((item) => item.id === node.parentId);
  const data = parent?.data;
  return !(
    parent?.type === 'group' &&
    data?.storyboardGroupType !== 'video' &&
    (data?.storyboardGroupType === 'image' ||
      data?.standaloneStoryboardImageGrid === true ||
      (typeof data?.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0))
  );
}

/** Canvas owns the mode, pointer, fresh graph transaction and save retry. Views own no document. */
export function useCanvasFocusMode(props) {
  const owner = useMemo(() => ({ documentKey: props.documentKey }), [props.documentKey]);
  const latest = useRef(null),
    alive = useRef(false),
    mode = useRef(null),
    pointer = useRef(null),
    surfaces = useRef(new Map()),
    callbacks = useRef(new Map()),
    transient = useRef(empty());
  const [request, setRequest] = useState(null),
    [state, setState] = useState(empty);
  latest.current = { ...props, owner };
  const publishState = useCallback((next) => {
    transient.current = next;
    setState(next);
  }, []);
  const writable = useCallback(
    (capturedOwner = owner, allowSuspended = false) => {
      const value = latest.current,
        graph = value.getDocument?.();
      return alive.current &&
        value.owner === capturedOwner &&
        value.ready &&
        !value.readonly &&
        (!value.suspended || allowSuspended) &&
        graph?.documentKey === capturedOwner.documentKey &&
        graph.ready &&
        !graph.readonly &&
        Array.isArray(graph.nodes) &&
        Array.isArray(graph.edges)
        ? { value, graph }
        : null;
    },
    [owner],
  );
  const capable = (node, graph, value) => {
    if (!node || value.protectionActive) return false;
    const parent = graph.nodes.find((item) => item.id === node.parentId);
    const parentData = parent?.data;
    if (
      parent?.type === 'group' &&
      parentData?.storyboardGroupType === 'image' &&
      parentData.standaloneStoryboardImageGrid === true &&
      !(
        typeof parentData.sourceScriptNodeId === 'string' &&
        parentData.sourceScriptNodeId.length > 0
      )
    )
      return false;
    // Legacy local uploads have no source action. They remain resources until
    // an explicit generator entry is requested; the source capability is separate.
    if (node.data?.localMediaReady && !node.data.action && !node.data.showGenerator) return false;
    return focusGeneratorCapability({
      node,
      schema: resolveNodeGenerator(node, graph.nodes, graph.edges, graph.models).schema,
      isAssetBoardMode: value.isAssetBoardMode,
      onlyFineTune: node.data?.onlyFineTune,
      slashPreset: node.data?.slashPreset,
    });
  };
  const fresh = (captured = mode.current) => {
    if (!captured || captured !== mode.current) return null;
    const context = writable(captured.owner);
    const target = context?.graph.nodes.find((node) => node.id === captured.targetId);
    return context &&
      capable(target, context.graph, context.value) &&
      !resolveNodeGenerator(target, context.graph.nodes, context.graph.edges, context.graph.models)
        .configLocked
      ? { ...context, target }
      : null;
  };
  const cancelPointer = useCallback(() => {
    const current = pointer.current;
    pointer.current = null;
    try {
      current?.capture.releasePointerCapture?.(current.pointerId);
    } catch {
      /* Already released. */
    }
    if (current) publishState({ ...current.previous, drawing: false });
  }, [publishState]);
  const retire = useCallback(() => {
    mode.current = null;
    cancelPointer();
    publishState(empty());
    setRequest(null);
  }, [cancelPointer, publishState]);
  useLayoutEffect(() => {
    const ownerSurfaces = surfaces.current,
      ownerCallbacks = callbacks.current;
    alive.current = true;
    retire();
    ownerCallbacks.clear();
    ownerSurfaces.clear();
    return () => {
      alive.current = false;
      retire();
      ownerSurfaces.clear();
      ownerCallbacks.clear();
    };
  }, [owner, retire]);
  useLayoutEffect(() => {
    const context = fresh();
    if (mode.current && !context) {
      retire();
      return;
    }
    const pending = transient.current;
    if (!context || !pending.sourceId) return;
    const source = context.graph.nodes.find((node) => node.id === pending.sourceId);
    if (
      !focusSurfaceAvailable(
        source,
        context.graph.nodes,
        context.target.id,
        context.value.protectionActive,
      ) ||
      source.data.url[0] !== pending.sourceUrl
    ) {
      cancelPointer();
      publishState(empty());
    }
  });
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancelPointer();
    };
    window.addEventListener('blur', cancelPointer);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancelPointer);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [cancelPointer]);
  const enter = (targetId) => {
    if (mode.current !== request) return false;
    const context = writable(owner),
      target = context?.graph.nodes.find((node) => node.id === targetId);
    if (
      !context ||
      !capable(target, context.graph, context.value) ||
      resolveNodeGenerator(target, context.graph.nodes, context.graph.edges, context.graph.models)
        .configLocked
    )
      return false;
    context.value.cancelOtherModes?.();
    context.value.cancelOtherGestures?.();
    if (!writable(owner)) return false;
    retire();
    const captured = { owner, targetId };
    mode.current = captured;
    setRequest(captured);
    return true;
  };
  const renderedMode = request?.owner === owner ? request : null;
  const renderedFresh = () => fresh(renderedMode);
  const exit = () => {
    if (renderedFresh()) retire();
  };
  const getSurfaceRef = (id) => {
    if (!callbacks.current.has(id))
      callbacks.current.set(id, (element) => {
        if (latest.current.owner !== owner) return;
        if (element) surfaces.current.set(id, element);
        else surfaces.current.delete(id);
      });
    return callbacks.current.get(id);
  };
  const surfaceState = (id) => {
    const context = renderedFresh();
    if (!context) return null;
    const node = context.graph.nodes.find((item) => item.id === id);
    if (
      !focusSurfaceAvailable(
        node,
        context.graph.nodes,
        context.target.id,
        context.value.protectionActive,
      )
    )
      return null;
    const pending = transient.current;
    const saved = context.target.data.params?.focusRegion;
    const existing = saved?.nodeId === id ? saved : null;
    return {
      region: pending.sourceId === id ? pending.region : existing,
      drawing: pending.sourceId === id && pending.drawing,
      interacting: pointer.current?.sourceId === id,
      disabled: !!pending.committed,
      onStart: (event) => start(event, id),
      onResize: (handle, event) => start(event, id, handle),
    };
  };
  const start = (event, sourceId, handle) => {
    const context = renderedFresh(),
      surface = surfaces.current.get(sourceId);
    if (!context || !surface || transient.current.committed) return false;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (pointer.current || context.value.isOtherPointerActive?.()) return true;
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      event.pointerType === 'touch' ||
      context.value.space?.current ||
      context.value.tool === 'hand'
    )
      return false;
    const source = context.graph.nodes.find((node) => node.id === sourceId);
    if (
      !focusSurfaceAvailable(
        source,
        context.graph.nodes,
        context.target.id,
        context.value.protectionActive,
      )
    )
      return false;
    const rect = surface.getBoundingClientRect(),
      point = normalizeFocusPoint(client(event), rect);
    if (!point) return false;
    const previous = transient.current;
    const saved = context.target.data.params?.focusRegion;
    const initial =
      previous.sourceId === sourceId ? previous.region : saved?.nodeId === sourceId ? saved : null;
    const inside =
      initial &&
      point.x >= initial.relX &&
      point.x <= initial.relX + initial.width &&
      point.y >= initial.relY &&
      point.y <= initial.relY + initial.height;
    if (handle && !initial) return false;
    const kind = handle ? 'resize' : inside ? 'move' : 'draw';
    const next = {
      ...empty(),
      sourceId,
      sourceUrl: source.data.url[0],
      region: kind === 'draw' ? null : initial,
      ratio: previous.sourceId === sourceId ? previous.ratio : null,
      drawing: kind === 'draw',
    };
    pointer.current = {
      mode: renderedMode,
      sourceId,
      sourceUrl: next.sourceUrl,
      pointerId: event.pointerId,
      start: client(event),
      initial,
      kind,
      handle,
      previous,
      surface,
      capture: context.value.board.current,
    };
    publishState(next);
    try {
      pointer.current.capture.setPointerCapture?.(event.pointerId);
    } catch {
      /* Native capture can be unavailable. */
    }
    return true;
  };
  const move = (event) => {
    const current = pointer.current;
    if (!current) return false;
    if (current.mode !== renderedMode || latest.current.owner !== owner) return false;
    if (event.pointerId !== current.pointerId) return true;
    const context = fresh(current.mode);
    const source = context?.graph.nodes.find((node) => node.id === current.sourceId);
    if (
      !context ||
      !source ||
      source.data.url?.[0] !== current.sourceUrl ||
      !current.surface.isConnected
    ) {
      cancelPointer();
      return true;
    }
    const rect = current.surface.getBoundingClientRect();
    let region;
    if (current.kind === 'draw') {
      const a = normalizeFocusPoint(current.start, rect),
        b = normalizeFocusPoint(client(event), rect);
      region =
        a && b
          ? {
              relX: Math.min(a.x, b.x),
              relY: Math.min(a.y, b.y),
              width: Math.abs(a.x - b.x),
              height: Math.abs(a.y - b.y),
            }
          : null;
    } else if (current.kind === 'move')
      region = moveFocusRegion(current.initial, current.start, client(event), rect);
    else
      region = resizeFocusRegion({
        region: current.initial,
        handle: current.handle,
        startClient: current.start,
        currentClient: client(event),
        contentRect: rect,
        ratioLabel: transient.current.ratio,
        containerAspectRatio: rect.width / rect.height,
      });
    publishState({ ...transient.current, region });
    return true;
  };
  const end = (event, cancelled = false) => {
    const current = pointer.current;
    if (!current) return false;
    if (current.mode !== renderedMode || latest.current.owner !== owner) return false;
    if (event.pointerId !== current.pointerId) return true;
    if (event.type === 'lostpointercapture' && event.target !== current.capture) return true;
    if (cancelled || !fresh(current.mode)) {
      cancelPointer();
      return true;
    }
    move(event);
    if (pointer.current !== current) return true;
    const region =
      current.kind === 'draw'
        ? drawFocusRegion(current.start, client(event), current.surface.getBoundingClientRect())
        : transient.current.region;
    pointer.current = null;
    try {
      current.capture.releasePointerCapture?.(current.pointerId);
    } catch {
      /* Already released. */
    }
    publishState({ ...transient.current, region, drawing: false });
    return true;
  };
  const cancelPending = () => {
    if (!renderedFresh()) return false;
    cancelPointer();
    publishState(empty());
    return true;
  };
  const chooseRatio = (label) => {
    if (!renderedFresh() || pointer.current || transient.current.committed) return false;
    const pending = transient.current,
      surface = surfaces.current.get(pending.sourceId);
    if (!surface || !pending.region) return false;
    const rect = surface.getBoundingClientRect();
    const region = applyFocusAspect(pending.region, label, rect.width / rect.height);
    if (!region) return false;
    publishState({ ...pending, region, ratio: label });
    return true;
  };
  const returnToTarget = () => {
    const context = renderedFresh(),
      bounds = context?.value.board.current?.getBoundingClientRect();
    if (!context) return false;
    const view =
      bounds &&
      centerCanvasView(context.target, bounds, context.graph.nodes, context.value.getView());
    if (view) context.value.focusView(view, { duration: 400 });
    retire();
    return true;
  };
  const error = (message) => {
    publishState({ ...transient.current, error: message });
    return false;
  };
  const confirm = () => {
    const context = renderedFresh(),
      pending = transient.current,
      surface = surfaces.current.get(pending.sourceId);
    if (!context || !pending.region || pointer.current || !surface) return false;
    const source = context.graph.nodes.find((node) => node.id === pending.sourceId);
    if (
      !focusSurfaceAvailable(
        source,
        context.graph.nodes,
        context.target.id,
        context.value.protectionActive,
      ) ||
      source.data.url[0] !== pending.sourceUrl
    )
      return error('图片已变化，请重新框选');
    if (!pending.committed) {
      let projected;
      try {
        projected = context.value.projectGraph?.(context.graph) || context.graph;
      } catch {
        return error('当前画布草稿无法保存，请重试');
      }
      const rect = surface.getBoundingClientRect();
      const plan = planCanvasFocusRegion({
        ...projected,
        targetNodeId: context.target.id,
        sourceNodeId: pending.sourceId,
        region: pending.region,
        ratioLabel: pending.ratio,
        containerAspectRatio: rect.width / rect.height,
        makeEdgeId: createLocalId,
      });
      if (
        !plan ||
        !fresh(renderedMode) ||
        context.value.commitGraph(
          { ...context.graph, ...plan },
          { expectedGraph: context.graph },
        ) !== true
      )
        return error('画布已变化，聚焦区域未保存，请重试');
      const committed = context.value
        .getDocument()
        .nodes.find((node) => node.id === context.target.id)?.data.params?.focusRegion;
      publishState({ ...pending, committed, error: '' });
    }
    const graph = context.value.getDocument();
    const savedRegion = graph.nodes.find((node) => node.id === context.target.id)?.data.params
      ?.focusRegion;
    if (!fresh(renderedMode) || savedRegion !== transient.current.committed)
      return error('聚焦参数已变化，请退出后重新编辑');
    if (context.value.flushGraph?.(graph) !== true)
      return error('聚焦区域已保留在当前画布，保存失败，请重试保存');
    return returnToTarget();
  };
  const removeRegion = (targetId) => {
    const context = writable(owner);
    if (!context) return false;
    let projected;
    try {
      projected = context.value.projectGraph?.(context.graph) || context.graph;
    } catch {
      context.value.notify?.('当前画布草稿无法保存，请重试');
      return false;
    }
    const plan = deleteCanvasFocusRegion({ ...projected, targetNodeId: targetId });
    if (
      !plan ||
      context.value.commitGraph({ ...context.graph, ...plan }, { expectedGraph: context.graph }) !==
        true
    )
      return false;
    if (mode.current?.targetId === targetId) retire();
    context.value.flushGraph?.(context.value.getDocument());
    return true;
  };
  const patchNode = (targetId, data) => {
    const context = writable(owner, true),
      target = context?.graph.nodes.find((node) => node.id === targetId);
    if (!context || !target) return false;
    if (!data.params || target.type !== 'image' || data.params.model === target.data.params?.model)
      return null;
    const nextNode = { ...target, data: { ...target.data, ...data } };
    const schema = resolveNodeGenerator(
      nextNode,
      context.graph.nodes,
      context.graph.edges,
      context.graph.models,
    ).schema;
    if (!schema || schema.properties?.focus === true || !target.data.params?.focusRegion)
      return null;
    let projected;
    try {
      projected = context.value.projectGraph?.(context.graph) || context.graph;
    } catch {
      context.value.notify?.('当前画布草稿无法保存，请重试');
      return false;
    }
    const cleared = deleteCanvasFocusRegion({ ...projected, targetNodeId: targetId });
    if (!cleared) return false;
    const projectedTarget = projected.nodes.find((node) => node.id === targetId);
    const prompt =
      data.params.prompt === undefined || data.params.prompt === target.data.params.prompt
        ? projectedTarget.data.params.prompt
        : data.params.prompt;
    const next = {
      ...context.graph,
      ...cleared,
      nodes: cleared.nodes.map((node) =>
        node.id === targetId
          ? {
              ...node,
              data: {
                ...node.data,
                ...data,
                params: {
                  ...data.params,
                  prompt,
                  focusRegion: undefined,
                  originImage: undefined,
                  scene: undefined,
                },
              },
            }
          : node,
      ),
    };
    if (context.value.commitGraph(next, { expectedGraph: context.graph }) !== true) return false;
    if (mode.current?.targetId === targetId) retire();
    context.value.flushGraph?.(context.value.getDocument());
    return true;
  };
  return {
    active: !!renderedMode,
    targetId: renderedMode?.targetId,
    ownerKey: renderedMode,
    enter,
    exit,
    cancel: retire,
    returnToTarget,
    cancelPending,
    chooseRatio,
    confirm,
    retrySave: confirm,
    surfaceState,
    getSurfaceRef,
    move,
    end,
    removeRegion,
    patchNode,
    state,
    surfaceElement: surfaces.current.get(state.sourceId),
    canTarget: (id) => {
      const context = writable(owner),
        node = context?.graph.nodes.find((item) => item.id === id);
      return !!context && capable(node, context.graph, context.value);
    },
    onEscape: () => {
      if (!renderedFresh()) return false;
      if (pointer.current || transient.current.sourceId) return cancelPending();
      retire();
      return true;
    },
    paneClick: () => {
      const captured = renderedMode;
      if (!fresh(captured)) return;
      requestAnimationFrame(() => {
        const context = fresh(captured);
        if (context)
          context.value.setSelected((previous) =>
            previous.includes(captured.targetId) ? previous : [...previous, captured.targetId],
          );
      });
    },
    consumePointer: (event) => {
      if (!renderedFresh() || (!pointer.current && !latest.current.isOtherPointerActive?.()))
        return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    },
  };
}
