import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCanvasBatchPlan } from './model.js';
import { runCanvasBatch } from './runner.js';

const emptyMetadata = Object.freeze({});

/** A group run belongs to one document. No network or document mutation lives here. */
export function useCanvasBatch({
  groupId,
  documentKey,
  nodes,
  edges,
  models,
  metadata = emptyMetadata,
  estimate,
  executeNode,
  getDocument,
  readonly = false,
  ready = true,
}) {
  const plan = useMemo(
    () => buildCanvasBatchPlan({ groupId, nodes, edges, models, metadata }),
    [groupId, nodes, edges, models, metadata],
  );
  const [quote, setQuote] = useState({ status: 'unavailable', value: null, error: '' });
  const [state, setState] = useState(null);
  const mounted = useRef(false);
  const run = useRef(null);
  const identity = useRef({ documentKey, groupId, readonly, ready });
  identity.current = { documentKey, groupId, readonly, ready };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      run.current?.abort();
      run.current = null;
    };
  }, []);
  useEffect(() => {
    run.current?.abort();
    run.current = null;
    setState(null);
    return () => {
      run.current?.abort();
      run.current = null;
    };
  }, [documentKey, groupId, readonly, ready]);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!estimate || !ready || readonly || !plan.nodeIds.length) {
      setQuote({ status: 'unavailable', value: null, error: '' });
      return () => controller.abort();
    }
    setQuote({ status: 'loading', value: null, error: '' });
    Promise.resolve()
      .then(() =>
        controller.signal.aborted ? undefined : estimate(plan, { signal: controller.signal }),
      )
      .then(
        (value) => {
          if (active && !controller.signal.aborted)
            setQuote({ status: value?.hasError ? 'error' : 'ready', value, error: '' });
        },
        (cause) => {
          if (active && !controller.signal.aborted)
            setQuote({
              status: 'error',
              value: null,
              error: cause instanceof Error ? cause.message : '算力消耗计算失败',
            });
        },
      );
    return () => {
      active = false;
      controller.abort();
    };
  }, [estimate, plan, documentKey, readonly, ready, quoteAttempt]);
  const retryEstimate = useCallback(() => setQuoteAttempt((attempt) => attempt + 1), []);
  const start = useCallback(async () => {
    if (run.current || !groupId || readonly || !ready || !plan.nodeIds.length) return null;
    const controller = new AbortController();
    run.current = controller;
    const isCurrent = () =>
      mounted.current &&
      run.current === controller &&
      identity.current.documentKey === documentKey &&
      identity.current.groupId === groupId &&
      identity.current.ready &&
      !identity.current.readonly;
    const result = await runCanvasBatch(plan, {
      executeNode,
      getDocument,
      signal: controller.signal,
      isCurrent,
      onState: setState,
    });
    const stillCurrent = isCurrent();
    if (run.current === controller) run.current = null;
    return stillCurrent ? result : null;
  }, [documentKey, groupId, readonly, ready, plan, executeNode, getDocument]);
  const cancel = useCallback(() => run.current?.abort(), []);
  return { plan, quote, retryEstimate, state, start, cancel };
}
