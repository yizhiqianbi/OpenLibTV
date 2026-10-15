import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The view owns no graph: callers supply a cancellable, read-only candidate source. */
export function useCanvasReferenceSource({ source, sessionKey, refreshKey }) {
  const latest = useRef(source);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', candidates: [], error: null });
  useLayoutEffect(() => {
    latest.current = source;
  });
  useEffect(() => {
    const request = new AbortController();
    let active = true;
    setState({ status: 'loading', candidates: [], error: null });
    Promise.resolve()
      .then(() => {
        if (!active || request.signal.aborted) return null;
        if (!latest.current?.load) throw new Error('引用素材来源不可用');
        return latest.current.load({ signal: request.signal });
      })
      .then((candidates) => {
        if (!active || request.signal.aborted) return;
        if (!Array.isArray(candidates)) throw new Error('引用素材列表不可用');
        setState({ status: 'ready', candidates, error: null });
      })
      .catch((error) => {
        if (active && !request.signal.aborted) setState({ status: 'error', candidates: [], error });
      });
    return () => {
      active = false;
      request.abort();
    };
  }, [sessionKey, refreshKey, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
