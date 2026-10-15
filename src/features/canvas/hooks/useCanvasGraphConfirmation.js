import { useLayoutEffect, useRef, useState } from 'react';

/** Shared owner lifecycle; callers retain their source eligibility and identity rules. */
export function useCanvasGraphConfirmation(props) {
  const latest = useRef(props),
    active = useRef(false),
    pending = useRef(null),
    metadata = useRef(new WeakMap());
  const owner = useRef({
    documentKey: props.documentKey,
    ready: props.ready,
    readonly: props.readonly,
    version: 0,
  });
  const [visible, setVisible] = useState(null);
  latest.current = props;
  if (
    owner.current.documentKey !== props.documentKey ||
    owner.current.ready !== props.ready ||
    owner.current.readonly !== props.readonly
  ) {
    owner.current = {
      documentKey: props.documentKey,
      ready: props.ready,
      readonly: props.readonly,
      version: owner.current.version + 1,
    };
    pending.current = null;
  }
  useLayoutEffect(() => {
    active.current = true;
    if (!pending.current) setVisible(null);
    return () => {
      active.current = false;
      owner.current.version += 1;
      pending.current = null;
    };
  }, [props.documentKey, props.ready, props.readonly]);
  const current = () => {
    const value = latest.current;
    if (!active.current || value.ready !== true || value.readonly !== false) return null;
    try {
      const graph = value.getDocument?.();
      return graph?.documentKey === value.documentKey &&
        graph.ready === true &&
        graph.readonly === false &&
        Array.isArray(graph.nodes) &&
        Array.isArray(graph.edges)
        ? { ...value, graph }
        : null;
    } catch {
      return null;
    }
  };
  const close = (request) => {
    if (!active.current || !request || pending.current !== request) return false;
    pending.current = null;
    setVisible(null);
    return true;
  };
  const execute = (value, operation) => {
    try {
      return value.execute?.(operation, value.graph) === true;
    } catch {
      latest.current.notify?.(latest.current.failureMessage);
      return false;
    }
  };
  const requestOperation = (input) => {
    const value = current();
    if (!value) return false;
    let description;
    try {
      description = value.describe(value.graph, input);
    } catch {
      latest.current.notify?.(latest.current.failureMessage);
      return false;
    }
    if (!description) return false;
    if (pending.current) close(pending.current);
    if (!description.notice) return execute(value, description.operation);
    const request = Object.freeze({ ...description.notice });
    metadata.current.set(request, {
      operation: description.operation,
      identity: description.identity,
      documentKey: value.documentKey,
      version: owner.current.version,
    });
    pending.current = request;
    setVisible(request);
    return false;
  };
  const renderedRequest = pending.current === visible ? visible : null;
  const confirm = (request = renderedRequest) => {
    const value = current(),
      saved = request && metadata.current.get(request);
    if (
      !value ||
      !saved ||
      pending.current !== request ||
      saved.documentKey !== value.documentKey ||
      saved.version !== owner.current.version
    )
      return false;
    let valid = false;
    try {
      valid = value.validate(value.graph, saved.identity, saved.operation) === true;
    } catch {
      valid = false;
    }
    if (!valid) {
      latest.current.notify?.(latest.current.changedMessage);
      close(request);
      return false;
    }
    const accepted = execute(value, saved.operation);
    if (accepted) close(request);
    return accepted;
  };
  return {
    request: renderedRequest,
    getPendingRequest: () => (active.current ? pending.current : null),
    requestOperation,
    confirm,
    cancel: (request = renderedRequest) => close(request),
  };
}
