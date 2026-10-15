import { useLayoutEffect, useRef, useState } from 'react';
import { selectCanvasEdgeIds } from '../domain/edge-interaction-model.js';

/** Ephemeral edge selection follows the document owner; it is never written into graph/history. */
export function useCanvasEdgeSelection(props) {
  const latest = useRef(props),
    active = useRef(false),
    pending = useRef([]);
  latest.current = props;
  const owner = useRef({
    documentKey: props.documentKey,
    ready: props.ready,
    readonly: props.readonly,
  });
  if (
    owner.current.documentKey !== props.documentKey ||
    owner.current.ready !== props.ready ||
    owner.current.readonly !== props.readonly
  ) {
    owner.current = {
      documentKey: props.documentKey,
      ready: props.ready,
      readonly: props.readonly,
    };
    pending.current = [];
  }
  const renderedOwner = owner.current;
  const [selection, setSelection] = useState({ owner: renderedOwner, ids: [] });
  useLayoutEffect(() => {
    active.current = true;
    setSelection({ owner: owner.current, ids: pending.current });
    return () => {
      active.current = false;
      pending.current = [];
      owner.current = { ...owner.current };
    };
  }, [props.documentKey, props.ready, props.readonly]);
  const current = () => {
    const value = latest.current;
    if (!active.current || renderedOwner !== owner.current || !value.ready || value.isDisabled?.())
      return null;
    return value;
  };
  const publish = (ids) => {
    pending.current = ids;
    setSelection({ owner: owner.current, ids });
    return true;
  };
  const clear = () => {
    if (!active.current || renderedOwner !== owner.current) return false;
    return publish([]);
  };
  const select = (id, options = {}) => {
    const value = current();
    const edge = value?.edges.find((item) => item.id === id);
    if (!edge || edge.hidden || edge.selectable === false) return false;
    const valid = new Set(value.edges.map((item) => item.id));
    const previous = pending.current.filter((item) => valid.has(item));
    const intent =
      value.readonly && options.keyboard ? { ...options, additive: false, toggle: false } : options;
    if (!intent.additive) value.clearNodeSelection?.();
    return publish(selectCanvasEdgeIds(previous, id, intent));
  };
  const deselect = (id) => {
    const value = current();
    if (!value) return false;
    value.clearNodeSelection?.();
    return publish(pending.current.filter((item) => item !== id));
  };
  const selected =
    selection.owner === owner.current
      ? selection.ids.filter((id) => props.edges.some((edge) => edge.id === id && !edge.hidden))
      : [];
  const retireMissing = (edges) => {
    if (!active.current || renderedOwner !== owner.current) return false;
    const valid = new Set(edges.map((edge) => edge.id));
    const remaining = pending.current.filter((id) => valid.has(id));
    return remaining.length !== pending.current.length ? publish(remaining) : false;
  };
  const getSelectedIds = () => {
    if (!active.current || renderedOwner !== owner.current || latest.current.ready !== true)
      return [];
    const valid = new Set(latest.current.edges.map((edge) => edge.id));
    // RF deletion reads already-selected IDs, independently of visual hidden /
    // selectable gates. Only removed IDs retire this pending selection.
    return pending.current.filter((id) => valid.has(id));
  };
  useLayoutEffect(() => {
    const valid = new Set(props.edges.map((edge) => edge.id));
    const remaining = pending.current.filter((id) => valid.has(id));
    if (remaining.length !== pending.current.length) {
      pending.current = remaining;
      setSelection({ owner: owner.current, ids: remaining });
    }
  }, [props.edges]);
  return { selected, select, deselect, clear, retireMissing, getSelectedIds };
}
