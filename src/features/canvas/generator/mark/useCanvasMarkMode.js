import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { centerCanvasView } from '../../geometry.js';
import {
  canvasMarkSource,
  normalizeCanvasMarkResponse,
} from '../../../../services/canvas-mark-source.js';
import { readCanvasMarkImage } from '../../../../services/canvas-mark-image.js';
import { resolveCanvasMarkTarget, canvasMarkSurfaceAvailable } from './mark-target.js';
import {
  MARK_MAX_OCCURRENCES,
  markTokenOccurrences,
  normalizeMarkPoint,
  makeMarkStableId,
  planCanvasMarkResult,
  selectCanvasMarkSuggestion,
  deleteCanvasMarkPoint,
  replaceFirstMarkToken,
  deleteFirstMarkToken,
} from './mark-model.js';

const empty = () => ({ points: [], loading: false, error: '', saveError: false });

/** Mode and recognition operations are transient; only validated prompt/metadata enter the graph. */
export function useCanvasMarkMode(props) {
  const localOwner = useMemo(() => ({ documentKey: props.documentKey }), [props.documentKey]);
  const owner = props.documentOwner || localOwner;
  const latest = useRef(null),
    alive = useRef(false),
    mode = useRef(null),
    operation = useRef(null),
    currentState = useRef(empty()),
    surfaces = useRef(new Map()),
    surfaceCallbacks = useRef(new Map());
  const [request, setRequest] = useState(null),
    [state, setState] = useState(empty);
  latest.current = { ...props, owner };
  const publish = useCallback((next) => {
    currentState.current = next;
    setState(next);
  }, []);
  const writable = (capturedOwner = owner) => {
    const value = latest.current,
      graph = value.getDocument?.();
    return alive.current &&
      value.owner === capturedOwner &&
      value.ready &&
      !value.readonly &&
      !value.suspended &&
      graph?.documentKey === capturedOwner.documentKey &&
      graph.ready &&
      !graph.readonly &&
      Array.isArray(graph.nodes) &&
      Array.isArray(graph.edges)
      ? { value, graph }
      : null;
  };
  const fresh = (captured) => {
    if (!captured || mode.current !== captured) return null;
    const context = writable(captured.owner),
      resolved =
        context && resolveCanvasMarkTarget(context.graph, captured.targetId, context.value);
    return resolved && !resolved.resolved.configLocked ? { ...context, ...resolved } : null;
  };
  const cancelOperation = useCallback(() => {
    const active = operation.current;
    operation.current = null;
    active?.abort.abort();
  }, []);
  const retire = useCallback(() => {
    mode.current = null;
    cancelOperation();
    publish(empty());
    setRequest(null);
  }, [cancelOperation, publish]);
  useLayoutEffect(() => {
    const ownedSurfaces = surfaces.current,
      ownedCallbacks = surfaceCallbacks.current;
    alive.current = true;
    retire();
    ownedSurfaces.clear();
    ownedCallbacks.clear();
    return () => {
      alive.current = false;
      retire();
      ownedSurfaces.clear();
      ownedCallbacks.clear();
    };
  }, [owner, retire]);
  const operationCurrent = (active) => {
    const context = fresh(active.mode),
      source = context?.graph.nodes.find((n) => n.id === active.sourceId);
    return context &&
      operation.current === active &&
      !active.abort.signal.aborted &&
      (context.value.source || canvasMarkSource) === active.sourceAdapter &&
      canvasMarkSurfaceAvailable(source, context.graph.nodes, context.value.protectionActive) &&
      JSON.stringify(source.data.url) === active.sourceUrls
      ? { ...context, source }
      : null;
  };
  useLayoutEffect(() => {
    if (mode.current && !fresh(mode.current)) {
      retire();
      return;
    }
    const active = operation.current;
    if (active && !operationCurrent(active)) {
      cancelOperation();
      publish({
        ...currentState.current,
        loading: false,
        points: currentState.current.points.filter((point) => point.index !== active.point.index),
      });
    }
    if (!mode.current) return;
    const graph = latest.current.getDocument?.();
    const filtered = currentState.current.points.filter((point) => {
      const source = graph?.nodes.find((n) => n.id === point.nodeId);
      return (
        source &&
        canvasMarkSurfaceAvailable(source, graph.nodes, latest.current.protectionActive) &&
        JSON.stringify(source.data.url) === point.sourceUrls
      );
    });
    if (filtered.length !== currentState.current.points.length)
      publish({ ...currentState.current, points: filtered });
  });
  useEffect(() => {
    const cancelPending = () => {
      const active = operation.current;
      if (!active) return;
      cancelOperation();
      publish({
        ...currentState.current,
        loading: false,
        points: currentState.current.points.filter((point) => point.index !== active.point.index),
      });
    };
    const hidden = () => {
      if (document.hidden) cancelPending();
    };
    window.addEventListener('blur', cancelPending);
    window.addEventListener('pagehide', retire);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', cancelPending);
      window.removeEventListener('pagehide', retire);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [cancelOperation, publish, retire]);
  const enter = (targetId, { cursorOffset = null } = {}) => {
    if (mode.current !== request) return false;
    const context = writable(owner),
      resolved = context && resolveCanvasMarkTarget(context.graph, targetId, context.value);
    if (!resolved || resolved.resolved.configLocked) return false;
    context.value.cancelOtherModes?.();
    context.value.cancelOtherGestures?.();
    retire();
    const captured = { owner, targetId, nextIndex: 1, cursorOffset };
    mode.current = captured;
    setRequest(captured);
    return true;
  };
  const renderedMode =
    request && request.owner === owner && request === mode.current ? request : null;
  const renderedFresh = () => fresh(renderedMode);
  const report = (message, saveError = false) => {
    publish({ ...currentState.current, error: message, saveError });
    latest.current.notify?.(message);
    return false;
  };
  const projected = (context) => context.value.projectGraph?.(context.graph) || context.graph;
  const commit = (context, plan) =>
    !!plan &&
    !!fresh(renderedMode) &&
    context.value.commitGraph({ ...context.graph, ...plan }, { expectedGraph: context.graph }) ===
      true;
  const flush = (context) => {
    let saved = false;
    try {
      saved = context.value.flushGraph?.(context.value.getDocument()) === true;
    } catch {
      /* Keep the already accepted graph and retry only persistence. */
    }
    if (!saved) return report('标记已保留在当前画布，保存失败，请重试保存', true);
    publish({ ...currentState.current, error: '', saveError: false });
    return true;
  };
  const point = async (sourceId, event) => {
    const context = renderedFresh(),
      captured = renderedMode;
    if (
      !context ||
      operation.current ||
      currentState.current.saveError ||
      event.button !== 0 ||
      context.value.space?.current ||
      context.value.tool === 'hand' ||
      context.value.isOtherPointerActive?.() ||
      context.value.shouldSuppressClick?.(event)
    )
      return false;
    const source = context.graph.nodes.find((node) => node.id === sourceId),
      surface = surfaces.current.get(sourceId);
    if (
      !canvasMarkSurfaceAvailable(source, context.graph.nodes, context.value.protectionActive) ||
      !surface ||
      surface !== event.currentTarget
    )
      return false;
    let before;
    try {
      before = projected(context);
    } catch {
      return report('当前画布草稿无法保存，请重试');
    }
    const target = before.nodes.find((node) => node.id === captured.targetId);
    if (markTokenOccurrences(target?.data.params?.prompt ?? '').length >= MARK_MAX_OCCURRENCES)
      return report(`最多可选择${MARK_MAX_OCCURRENCES}个元素`);
    const sourceAdapter = context.value.source || canvasMarkSource;
    if (!sourceAdapter.available) return report('元素识别服务未连接，暂时无法选择局部元素');
    const normalized = normalizeMarkPoint(
        { x: event.clientX, y: event.clientY },
        surface.getBoundingClientRect(),
      ),
      image = surface.parentElement?.querySelector('img');
    if (!normalized || !image) return false;
    const nextPoint = {
      nodeId: sourceId,
      ...normalized,
      index: captured.nextIndex++,
      selectedSuggestionIndex: 0,
      sourceUrls: JSON.stringify(source.data.url),
    };
    const active = {
      mode: captured,
      point: nextPoint,
      sourceId,
      sourceUrls: nextPoint.sourceUrls,
      sourceAdapter,
      abort: new AbortController(),
    };
    operation.current = active;
    publish({
      ...currentState.current,
      points: [...currentState.current.points, nextPoint],
      loading: true,
      error: '',
    });
    try {
      const base64 = await (context.value.readImage || readCanvasMarkImage)(image, {
        signal: active.abort.signal,
      });
      if (!operationCurrent(active)) return false;
      const response = await sourceAdapter.markClickSuggest(
        {
          id: sourceId,
          image_base64: base64,
          point: [normalized.relX, normalized.relY],
          lang: context.value.lang || 'zh',
        },
        { signal: active.abort.signal },
      );
      const current = operationCurrent(active);
      if (!current) return false;
      const graph = projected(current),
        targetNow = graph.nodes.find((node) => node.id === captured.targetId);
      if (markTokenOccurrences(targetNow?.data.params?.prompt ?? '').length >= MARK_MAX_OCCURRENCES)
        throw new Error(`最多可选择${MARK_MAX_OCCURRENCES}个元素`);
      const plan = planCanvasMarkResult({
        ...graph,
        targetNodeId: captured.targetId,
        sourceNodeId: sourceId,
        pointIndex: nextPoint.index,
        response,
        cursorOffset: captured.cursorOffset,
      });
      if (!operationCurrent(active) || !commit(current, plan))
        throw new Error('画布已变化，标记未保存，请重试');
      captured.cursorOffset = null;
      const apiResponseId = makeMarkStableId(response.id, nextPoint.index),
        stored = current.value.getDocument().nodes.find((node) => node.id === captured.targetId)
          .data.params.magicList[apiResponseId];
      publish({
        ...currentState.current,
        loading: false,
        points: currentState.current.points.map((item) =>
          item.index === nextPoint.index
            ? { ...item, apiResponseId, suggestions: stored.suggestions }
            : item,
        ),
      });
      return flush(current);
    } catch (error) {
      if (operationCurrent(active) && error.name !== 'AbortError') {
        publish({
          ...currentState.current,
          points: currentState.current.points.filter((item) => item.index !== nextPoint.index),
        });
        return report(
          error.code === 'UNAVAILABLE'
            ? '元素识别服务未连接，暂时无法选择局部元素'
            : error.message?.startsWith('最多可选择') ||
                error.message?.startsWith('画布已变化') ||
                error.message?.startsWith('当前画布草稿')
              ? error.message
              : '未识别出任何内容，请重新尝试',
        );
      }
      return false;
    } finally {
      if (operation.current === active) {
        operation.current = null;
        publish({
          ...currentState.current,
          loading: false,
          points: currentState.current.points.filter(
            (item) => item.index !== nextPoint.index || item.apiResponseId,
          ),
        });
      }
    }
  };
  const mutate = (planner, stableId, selectedIndex) => {
    const context = renderedFresh();
    const knownPoint = currentState.current.points.find((item) => item.apiResponseId === stableId);
    if (
      !context ||
      !knownPoint ||
      (planner !== deleteCanvasMarkPoint &&
        (!Number.isSafeInteger(selectedIndex) ||
          selectedIndex < 0 ||
          selectedIndex >= knownPoint.suggestions.length))
    )
      return false;
    let plan, graph;
    try {
      graph = projected(context);
      plan = planner({
        ...graph,
        targetNodeId: renderedMode.targetId,
        stableId,
        selectedIndex,
        knownSuggestions: knownPoint.suggestions,
      });
    } catch {
      return report('当前画布草稿无法保存，请重试');
    }
    if (!plan) {
      const params = graph.nodes.find((node) => node.id === renderedMode.targetId)?.data.params,
        metadata = params?.magicList,
        validMetadata =
          metadata === undefined ||
          (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)),
        entry = validMetadata && metadata?.[stableId],
        entryValid =
          entry === undefined ||
          (entry &&
            typeof entry.imageUrl === 'string' &&
            normalizeCanvasMarkResponse({ id: stableId, suggestions: entry.suggestions })),
        prompt = params?.prompt ?? '',
        changedPrompt =
          planner === deleteCanvasMarkPoint
            ? deleteFirstMarkToken(prompt, stableId)
            : replaceFirstMarkToken(prompt, stableId, selectedIndex);
      if (
        !validMetadata ||
        !entryValid ||
        changedPrompt !== prompt ||
        (planner === deleteCanvasMarkPoint && entry !== undefined)
      )
        return false;
    }
    const needsCommit =
      !!plan || graph.nodes !== context.graph.nodes || graph.edges !== context.graph.edges;
    if (needsCommit && !commit(context, plan || { nodes: graph.nodes, edges: graph.edges }))
      return false;
    publish({
      ...currentState.current,
      points:
        planner === deleteCanvasMarkPoint
          ? currentState.current.points.filter((item) => item.apiResponseId !== stableId)
          : currentState.current.points.map((item) =>
              item.apiResponseId === stableId
                ? { ...item, selectedSuggestionIndex: selectedIndex }
                : item,
            ),
    });
    return needsCommit ? flush(context) : true;
  };
  const getSurfaceRef = (id) => {
    if (!surfaceCallbacks.current.has(id))
      surfaceCallbacks.current.set(id, (element) => {
        if (latest.current.owner !== owner) return;
        if (element) surfaces.current.set(id, element);
        else surfaces.current.delete(id);
      });
    return surfaceCallbacks.current.get(id);
  };
  return {
    documentOwner: owner,
    active: !!renderedMode,
    targetId: renderedMode?.targetId,
    ownerKey: renderedMode,
    state,
    enter,
    cancel: () => {
      if (!alive.current || latest.current.owner !== owner || mode.current !== renderedMode)
        return false;
      retire();
      return true;
    },
    exit: () => {
      if (!renderedFresh()) return false;
      retire();
      return true;
    },
    onEscape: () => {
      if (!renderedFresh()) return false;
      retire();
      return true;
    },
    point,
    getSurfaceRef,
    surfaceState: (id) => {
      const context = renderedFresh(),
        source = context?.graph.nodes.find((node) => node.id === id);
      return context &&
        canvasMarkSurfaceAvailable(source, context.graph.nodes, context.value.protectionActive)
        ? {
            active: true,
            points: state.points.filter((item) => item.nodeId === id),
            loading: state.loading,
            disabled: state.saveError,
            ownerKey: renderedMode,
            onPoint: (event) => point(id, event),
            onSelect: (stableId, index) => mutate(selectCanvasMarkSuggestion, stableId, index),
            onDelete: (stableId) => mutate(deleteCanvasMarkPoint, stableId),
          }
        : null;
    },
    syncSuggestion: (stableId, selectedIndex, targetId = renderedMode?.targetId) => {
      if (!renderedFresh() || !Number.isSafeInteger(selectedIndex) || selectedIndex < 0)
        return false;
      publish({
        ...currentState.current,
        points: currentState.current.points.map((item) =>
          item.apiResponseId === stableId && selectedIndex < (item.suggestions?.length || 0)
            ? { ...item, selectedSuggestionIndex: selectedIndex }
            : item,
        ),
      });
      return true;
    },
    setCursorOffset: (targetId, offset) => {
      if (
        !renderedFresh() ||
        targetId !== renderedMode.targetId ||
        renderedMode.targetId !== targetId ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      )
        return false;
      renderedMode.cursorOffset = offset;
      return true;
    },
    retrySave: () => {
      const context = renderedFresh();
      return !!context && flush(context);
    },
    returnToTarget: () => {
      const context = renderedFresh(),
        bounds = context?.value.board.current?.getBoundingClientRect();
      if (!context) return false;
      const view =
        bounds &&
        centerCanvasView(context.target, bounds, context.graph.nodes, context.value.getView());
      if (view) context.value.focusView(view, { duration: 400 });
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
  };
}
