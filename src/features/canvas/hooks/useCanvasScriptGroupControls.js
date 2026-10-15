import { useLayoutEffect, useRef, useState } from 'react';
import { canvasScriptGroupRunConfirmation } from '../domain/script-group-controls-model.js';

/** Source confirmation entry; remote generation/fees require a separately verified service. */
export function useCanvasScriptGroupControls({ documentKey, ready, readonly, getDocument }) {
  const latest = useRef(null);
  latest.current = { documentKey, ready, readonly, getDocument };
  const mounted = useRef(false);
  const pending = useRef(null);
  const [request, setRequest] = useState(null);
  const current = () => {
    const state = latest.current;
    const graph = state.getDocument?.();
    return mounted.current &&
      state.documentKey === documentKey &&
      state.ready &&
      !state.readonly &&
      graph?.documentKey === state.documentKey &&
      graph.ready &&
      !graph.readonly
      ? graph
      : null;
  };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    pending.current = null;
    setRequest(null);
  }, [documentKey, ready, readonly]);
  const open = (groupId) => {
    const graph = current();
    if (!graph) return false;
    const confirmation = canvasScriptGroupRunConfirmation(graph.nodes, groupId);
    if (!confirmation) return false;
    const group = graph.nodes.find((node) => node.id === groupId);
    const value = { ...confirmation, groupId, documentKey, groupData: group.data };
    pending.current = value;
    setRequest(value);
    return true;
  };
  const cancel = (owner) => {
    if (!owner || pending.current !== owner) return;
    pending.current = null;
    setRequest(null);
  };
  const graph = request ? current() : null;
  const group = request ? graph?.nodes.find((node) => node.id === request.groupId) : null;
  const visible =
    request &&
    request.documentKey === documentKey &&
    pending.current === request &&
    group?.data === request.groupData &&
    canvasScriptGroupRunConfirmation(graph.nodes, group.id);
  return { open, request: visible ? request : null, cancel };
}
