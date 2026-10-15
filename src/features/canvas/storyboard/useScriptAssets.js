import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Graph writes remain with the caller; each command reads the latest document. */
export function useScriptAssets({
  node,
  documentKey,
  ready,
  readonly,
  onMutateAsset,
  getDocument,
}) {
  const identity = JSON.stringify([documentKey, node.id]);
  const owner = useRef(null);
  const operation = useRef(null);
  const [state, setState] = useState({ identity, pending: false, error: '', notice: '' });
  owner.current = { identity, node, documentKey, ready, readonly, onMutateAsset, getDocument };
  useLayoutEffect(() => {
    if (state.identity !== identity) {
      operation.current?.abort();
      operation.current = null;
      setState({ identity, pending: false, error: '', notice: '' });
    } else if (!ready || readonly) {
      operation.current?.abort();
      operation.current = null;
      setState((value) => ({ ...value, pending: false }));
    }
  }, [identity, ready, readonly, state.identity]);
  useLayoutEffect(() => () => operation.current?.abort(), []);
  const latestNode = useCallback(() => {
    const current = owner.current;
    return (
      current.getDocument?.()?.nodes?.find((value) => value.id === current.node.id) || current.node
    );
  }, []);
  const mutate = useCallback(
    async (command, notice = '') => {
      const current = owner.current;
      if (!current.ready || current.readonly || !current.onMutateAsset || operation.current)
        return null;
      const abort = new AbortController();
      operation.current = abort;
      setState({ identity: current.identity, pending: true, error: '', notice: '' });
      try {
        const result = await current.onMutateAsset(current.node.id, command, {
          signal: abort.signal,
          documentKey: current.documentKey,
          expectedNode: latestNode(),
          expectedAssetFingerprint: command.expectedAssetFingerprint,
        });
        if (abort.signal.aborted || owner.current.identity !== current.identity) return null;
        if (!result?.ok) throw new Error(result?.reason || '资产修改未保存，请重试');
        setState({
          identity: current.identity,
          pending: false,
          error: '',
          notice: typeof notice === 'function' ? notice(result) : notice,
        });
        return result;
      } catch (error) {
        if (!abort.signal.aborted && owner.current.identity === current.identity)
          setState({
            identity: current.identity,
            pending: false,
            error: error.message || '资产修改未保存，请重试',
            notice: '',
          });
        return null;
      } finally {
        if (operation.current === abort) operation.current = null;
      }
    },
    [latestNode],
  );
  return {
    mutate,
    latestNode,
    disabled:
      !ready || readonly || !onMutateAsset || (state.identity === identity && state.pending),
    pending: state.identity === identity && state.pending,
    error: state.identity === identity ? state.error : '',
    notice: state.identity === identity ? state.notice : '',
  };
}
