import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TYPES } from '../catalog.js';
import { createCanvasNode } from '../model.js';
import { resolveCanvasConnectedCreation } from '../domain/connection-model.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';
import { canvasConnectionPair, canvasHandlePoint } from '../domain/connection-gesture-model.js';
import { canvasWorldNodes, canvasNodeSize } from '../domain/groups.js';
import { canvasSourceConnectedCreationPosition } from '../domain/connection-ghost-model.js';

/** Menu candidates and commits share the source's separate connected-creation policy. */
export function useCanvasConnectionMenu(options) {
  const latest = useRef(options);
  latest.current = options;
  const [menu, setMenu] = useState(null);
  const currentMenu = useRef(menu);
  currentMenu.current = menu;
  const epoch = useRef(0);
  const { documentKey, ready, readonly, nodes, edges, models } = options;
  const cancel = useCallback(() => {
    currentMenu.current = null;
    latest.current.setLinking?.(null);
    latest.current.setLinkPoint?.(null);
    setMenu(null);
  }, []);
  useEffect(() => {
    epoch.current += 1;
    cancel();
    return cancel;
  }, [documentKey, ready, readonly, cancel]);
  useEffect(() => {
    const value = currentMenu.current;
    if (value && !nodes.some((node) => node.id === value.nodeId)) cancel();
  }, [nodes, cancel]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancel]);
  const owner = (value) => {
    const state = latest.current;
    const graph = state.getDocument();
    return value &&
      value.epoch === epoch.current &&
      value.documentKey === state.documentKey &&
      graph?.documentKey === value.documentKey &&
      graph.ready &&
      !graph.readonly
      ? graph
      : null;
  };
  const open = (value) => {
    const state = latest.current;
    if (!state.ready || state.readonly) return;
    const graph = state.getDocument();
    if (
      !graph?.ready ||
      graph.readonly ||
      graph.documentKey !== state.documentKey ||
      !graph.nodes.some((node) => node.id === value.nodeId)
    )
      return;
    state.setMenu(null);
    state.setContext(null);
    const anchorPoint = state.point?.({ clientX: value.clientX, clientY: value.clientY });
    const next = {
      ...value,
      documentKey: state.documentKey,
      epoch: epoch.current,
      ...(anchorPoint ? { anchorPoint } : {}),
    };
    currentMenu.current = next;
    const origin = canvasWorldNodes(graph.nodes).find((node) => node.id === value.nodeId);
    state.setLinking?.(value.handleType === 'source' ? value.nodeId : null);
    state.setLinkPoint?.(
      value.handleType === 'source'
        ? value.point || canvasHandlePoint(origin, value.handleType)
        : null,
    );
    setMenu(next);
  };
  const close = (value, context = {}) => {
    if (!value || currentMenu.current !== value) return;
    currentMenu.current = null;
    if (!context.preserveConnection) {
      latest.current.setLinking?.(null);
      latest.current.setLinkPoint?.(null);
    }
    setMenu((current) => (current === value ? null : current));
  };
  const candidate = (graph, value, type, makeId) => {
    const kind =
      TYPES.find((entry) => entry.type === type) ||
      TYPES.find((entry) => entry.type === 'script-v2');
    const node = createCanvasNode({
      type,
      label: kind.label,
      nodes: graph.nodes,
      models: graph.models,
      position: { x: 0, y: 0 },
      ...(makeId ? { makeId } : {}),
    });
    const position =
      value.point ||
      canvasSourceConnectedCreationPosition(graph.nodes, value.nodeId, value.handleType, {
        getNodeSize: canvasNodeSize,
      });
    if (!position) return null;
    const origin = graph.nodes.find((item) => item.id === value.nodeId);
    if (origin?.type === 'image' && type === 'text') {
      node.data = {
        ...node.data,
        text: '根据图片生成提示词',
        params: { ...node.data.params, prompt: '根据图片生成提示词', count: 1 },
      };
    }
    return { ...node, position };
  };
  const entries = useMemo(() => {
    if (!menu) return [];
    const graph = { nodes, edges, models };
    const types = TYPES.filter((entry) =>
      ['text', 'image', 'video', 'video-clip', 'audio', 'script-v2', 'reference'].includes(
        entry.type,
      ),
    );
    if (menu.handleType === 'source')
      types.push({
        ...TYPES.find((entry) => entry.type === 'script-v2'),
        type: 'script',
        label: '脚本（旧版）',
      });
    return types.map((entry) => {
      const node = candidate(graph, menu, entry.type, () => '__connection-candidate__');
      const plan = node
        ? resolveCanvasConnectedCreation({
            ...graph,
            nodes: [...nodes, node],
            createdNodeId: node.id,
            ...canvasConnectionPair(menu.nodeId, menu.handleType, node.id),
          })
        : { valid: false, reason: 'missingNode' };
      return {
        ...entry,
        disabled: !plan.valid,
        reason: plan.valid ? undefined : plan.message || canvasConnectionReasonLabel(plan.reason),
      };
    });
    // Candidate construction is pure; graph identity and menu owner control refresh.
  }, [menu, nodes, edges, models]);
  const choose = (type, value) => {
    if (value !== currentMenu.current) return false;
    const graph = owner(value);
    if (!graph) return false;
    const newNode = candidate(graph, value, type);
    if (!newNode) return false;
    const connected = latest.current.connectNodes({
      ...canvasConnectionPair(value.nodeId, value.handleType, newNode.id),
      newNode,
    });
    if (!connected) return false;
    latest.current.setSelected([newNode.id]);
    currentMenu.current = null;
    latest.current.setLinking?.(null);
    latest.current.setLinkPoint?.(null);
    setMenu(null);
    return true;
  };
  return { menu, entries, open, close, choose };
}
