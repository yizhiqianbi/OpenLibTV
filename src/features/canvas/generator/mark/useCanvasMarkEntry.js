import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolveCanvasMarkTarget } from './mark-target.js';

const loadController = () => import('./CanvasMarkControllerBridge.jsx');
const modules = new WeakMap();
function load(loader) {
  let pending = modules.get(loader);
  if (!pending) {
    pending = Promise.resolve()
      .then(loader)
      .then((module) => {
        if (!module?.default) throw new Error('元素选择工具不可用');
        return module.default;
      });
    modules.set(loader, pending);
    pending.catch(() => {
      if (modules.get(loader) === pending) modules.delete(loader);
    });
  }
  return pending;
}

/** A small mount-only entry; recognition, geometry and tool views remain a real lazy chunk. */
export function useCanvasMarkEntry(props) {
  const owner = useMemo(() => ({ documentKey: props.documentKey }), [props.documentKey]);
  const latest = useRef(null),
    alive = useRef(false),
    pending = useRef(null),
    apiRef = useRef(null);
  const [Implementation, setImplementation] = useState(null),
    [snapshot, setSnapshot] = useState(null),
    [entryRequest, setEntryRequest] = useState(null),
    [loading, setLoading] = useState(false);
  latest.current = { ...props, owner };
  const writable = useCallback(
    (captured = owner) => {
      const value = latest.current,
        graph = value.getDocument?.();
      return alive.current &&
        value.owner === captured &&
        value.ready &&
        !value.readonly &&
        !value.suspended &&
        graph?.documentKey === captured.documentKey &&
        graph.ready &&
        !graph.readonly
        ? { value, graph }
        : null;
    },
    [owner],
  );
  useLayoutEffect(() => {
    alive.current = true;
    pending.current = null;
    setEntryRequest(null);
    setSnapshot(null);
    setLoading(false);
    return () => {
      alive.current = false;
      pending.current = null;
    };
  }, [owner]);
  useLayoutEffect(() => {
    const requested = pending.current || entryRequest;
    if (!requested) return;
    const context = writable(requested.owner),
      target = context && resolveCanvasMarkTarget(context.graph, requested.targetId, context.value);
    if (!target || target.resolved.configLocked) {
      pending.current = null;
      setEntryRequest(null);
      setLoading(false);
    }
  }, [entryRequest, writable, props]);
  useEffect(() => {
    const hidden = () => {
      pending.current = null;
      setEntryRequest(null);
      setLoading(false);
      apiRef.current?.cancel();
    };
    window.addEventListener('pagehide', hidden);
    return () => window.removeEventListener('pagehide', hidden);
  }, []);
  const enter = (targetId, options = {}) => {
    const context = writable(owner),
      target = context && resolveCanvasMarkTarget(context.graph, targetId, context.value);
    if (!target || target.resolved.configLocked) return false;
    if (apiRef.current?.documentOwner === owner) return apiRef.current.enter(targetId, options);
    if (pending.current) return false;
    context.value.cancelOtherModes?.();
    context.value.cancelOtherGestures?.();
    const requested = { owner, targetId, options };
    pending.current = requested;
    setLoading(true);
    load(context.value.loader || loadController).then(
      (Component) => {
        if (!alive.current || latest.current.owner !== owner || pending.current !== requested)
          return;
        pending.current = null;
        setLoading(false);
        setImplementation(() => Component);
        setEntryRequest(requested);
      },
      () => {
        if (!alive.current || latest.current.owner !== owner || pending.current !== requested)
          return;
        pending.current = null;
        setLoading(false);
        latest.current.notify?.('元素选择工具加载失败，请重新点击标记重试');
      },
    );
    return true;
  };
  const cancel = () => {
    if (!alive.current || latest.current.owner !== owner) return false;
    pending.current = null;
    setEntryRequest(null);
    setLoading(false);
    apiRef.current?.cancel();
  };
  const current = snapshot?.documentOwner === owner ? snapshot : null;
  const api = () =>
    alive.current && latest.current.owner === owner && apiRef.current?.documentOwner === owner
      ? apiRef.current
      : null;
  const modeApi = () => {
    const live = api();
    return live?.ownerKey === current?.ownerKey ? live : null;
  };
  return {
    active: !!current?.active,
    targetId: current?.targetId,
    ownerKey: current?.ownerKey,
    state: current?.state,
    Surface: current?.Surface,
    loadingEntry: loading,
    enter,
    cancel,
    canTarget: (id) => {
      const context = writable(owner);
      return !!context && !!resolveCanvasMarkTarget(context.graph, id, context.value);
    },
    exit: () => modeApi()?.exit() ?? false,
    onEscape: () => modeApi()?.onEscape() ?? false,
    paneClick: () => modeApi()?.paneClick(),
    surfaceState: (id) => modeApi()?.surfaceState(id) ?? null,
    getSurfaceRef: (id) => modeApi()?.getSurfaceRef(id),
    syncSuggestion: (id, index, targetId) =>
      modeApi()?.syncSuggestion(id, index, targetId) ?? false,
    setCursorOffset: (targetId, offset) => modeApi()?.setCursorOffset(targetId, offset) ?? false,
    entry:
      Implementation &&
      createElement(Implementation, {
        ...props,
        documentOwner: owner,
        apiRef,
        entryRequest,
        onPublish: (value) => {
          if (alive.current && latest.current.owner === owner) setSnapshot(value);
        },
        onEntryConsumed: (requested) => {
          if (latest.current.owner === owner && requested === entryRequest) setEntryRequest(null);
        },
      }),
  };
}
