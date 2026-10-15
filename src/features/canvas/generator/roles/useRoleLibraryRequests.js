import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const roleSourceMessage = (cause, fallback = '角色素材读取失败，请重试') =>
  cause instanceof Error && cause.message ? cause.message : fallback;

/** The view owns reads; its owner can change even when an adapter ignores AbortSignal. */
export function useRoleLibraryRead(source, key, load, initial, enabled = true) {
  const current = useRef(null);
  const loader = useRef(load);
  loader.current = load;
  const scope = useMemo(() => ({ source, key }), [source, key]);
  current.current = scope;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ source, data: initial, loading: enabled, error: null });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const read = loader.current;
    const owns = () => current.current === scope && !controller.signal.aborted;
    setState((previous) => ({
      source,
      data: previous.source === source ? previous.data : initial,
      loading: true,
      error: null,
    }));
    Promise.resolve()
      .then(() => read({ signal: controller.signal }))
      .then(
        (data) => owns() && setState({ source, data, loading: false, error: null }),
        (cause) => {
          if (owns())
            setState((previous) => ({
              ...previous,
              source,
              loading: false,
              error: roleSourceMessage(cause),
            }));
        },
      );
    return () => controller.abort();
    // initial is a stable empty value supplied by the view; reads are keyed by
    // their actual request, not by an inline loader or presentation props.
  }, [source, scope, attempt, enabled, initial]);
  return {
    ...(state.source === source ? state : { data: initial, loading: enabled, error: null }),
    retry,
  };
}

/** Cancel certification/upload/delete work on branch, context, source or mount changes. */
export function useRoleLibraryWork(source, contextKey) {
  const scope = useMemo(
    () => ({ source, contextKey, controllers: new Set() }),
    [source, contextKey],
  );
  const latest = useRef(scope);
  latest.current = scope;
  useEffect(() => () => scope.controllers.forEach((controller) => controller.abort()), [scope]);
  return useCallback(() => {
    const controller = new AbortController();
    scope.controllers.add(controller);
    return {
      signal: controller.signal,
      current: () => latest.current === scope && !controller.signal.aborted,
      finish: () => scope.controllers.delete(controller),
    };
  }, [scope]);
}
