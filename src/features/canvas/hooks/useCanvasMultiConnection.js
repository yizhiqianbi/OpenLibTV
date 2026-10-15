import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TYPES, typeInfo } from '../catalog.js';
import { createCanvasNode } from '../model.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';
import {
  getCanvasGroupConnectionSources,
  getCanvasMultiConnectionSources,
  resolveCanvasMultiConnectedCreation,
} from '../domain/multi-connection-model.js';
import { isCanvasOrdinaryMultiConnectionGroup } from '../domain/multi-connection-entry-model.js';
import {
  canvasMultiConnectionDropTarget,
  canvasMultiConnectionPanVelocity,
} from '../domain/multi-connection-gesture-model.js';

const kinds = ['text', 'image', 'video', 'video-clip', 'audio', 'script-v2'];
const labels = {
  text: '文本生成',
  image: '图片生成',
  video: '视频生成',
  'video-clip': '视频',
  'script-v2': '脚本生成',
};
const icons = {
  text: 'text-align-left',
  image: 'image-generator-n',
  video: 'video-generator-n',
  'video-clip': 'icon-scissors',
  audio: 'audio-lines',
  'script-v2': 'imageset',
};
const descriptions = { 'video-clip': '多个视频片段合为一个', 'script-v2': '创意脚本、生成故事板' };

const entryFocusSelector = (options) => options.entryFocusSelector ?? '.cv-selection-add-hit';
function groupEntry(nodes, nodeId) {
  if (nodeId == null) return null;
  const group = nodes.find((node) => node.id === nodeId);
  if (!isCanvasOrdinaryMultiConnectionGroup(group)) return null;
  const groupIds = new Set([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (
        (node.data?.type ?? node.type) === 'group' &&
        groupIds.has(node.parentId) &&
        !groupIds.has(node.id)
      ) {
        groupIds.add(node.id);
        changed = true;
      }
  }
  const sources = getCanvasGroupConnectionSources(nodes, nodeId);
  return {
    sourceIds: sources.map((node) => node.id),
    membership: [
      nodes.filter((node) => groupIds.has(node.id)).map((node) => [node.id, node.parentId ?? null]),
      sources.map((node) => [node.id, node.parentId]),
    ],
  };
}
function entrySignature(options, nodes = options.nodes) {
  const sourceIds = options.sourceIds || [];
  if (
    options.entryKey === undefined &&
    options.entryNodeId === undefined &&
    options.entryFocusSelector === undefined
  )
    return JSON.stringify(sourceIds);
  return JSON.stringify([
    sourceIds,
    options.entryKey ?? null,
    options.entryNodeId ?? null,
    entryFocusSelector(options),
    groupEntry(nodes, options.entryNodeId)?.membership ?? null,
  ]);
}

/** Source nJ: multi-select has its own threshold, pan, validation and creation transaction. */
export function useCanvasMultiConnection(options) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(true);
  const gesture = useRef(null);
  const request = useRef(null);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const frame = useRef(null);
  const focusFrame = useRef(null);
  const suppression = useRef(null);
  const [preview, setPreview] = useState(null);
  const [menu, setMenu] = useState(null);
  const signature = entrySignature(options);
  const sources = useMemo(
    () => getCanvasMultiConnectionSources(options.nodes, options.sourceIds || []),
    [options.nodes, options.sourceIds],
  );
  const owner = useCallback((value) => {
    const current = latest.current;
    const graph = current.getDocument();
    const entry =
      current.entryNodeId != null ? groupEntry(graph?.nodes || [], current.entryNodeId) : null;
    return active.current &&
      value &&
      value.epoch === epoch.current &&
      value.documentKey === current.documentKey &&
      value.signature === entrySignature(current, graph?.nodes || []) &&
      current.ready &&
      !current.readonly &&
      graph?.documentKey === value.documentKey &&
      graph.ready &&
      !graph.readonly &&
      (current.entryNodeId == null ||
        (entry && JSON.stringify(entry.sourceIds) === JSON.stringify(value.sourceIds))) &&
      value.sourceIds.every((id) => graph.nodes.some((node) => node.id === id))
      ? graph
      : null;
  }, []);
  const clearGesture = useCallback(() => {
    const value = gesture.current;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (value?.capture) {
      try {
        value.capture.releasePointerCapture?.(value.pointerId);
      } catch {
        /* Native release may already have happened. */
      }
    }
    setPreview(null);
  }, []);
  const cancel = useCallback(() => {
    sequence.current += 1;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    clearGesture();
    request.current = null;
    setMenu(null);
  }, [clearGesture]);
  const restoreEntryFocus = useCallback(
    (value, focusSequence = value.requestSequence) => {
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      const id = requestAnimationFrame(() => {
        if (focusFrame.current === id) focusFrame.current = null;
        if (
          sequence.current !== focusSequence ||
          gesture.current ||
          request.current ||
          !owner(value)
        )
          return;
        try {
          latest.current.board.current
            ?.querySelector(value.entryFocusSelector)
            ?.focus({ preventScroll: true });
        } catch {
          /* A caller-provided selector must not break gesture cancellation. */
        }
      });
      focusFrame.current = id;
    },
    [owner],
  );
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    epoch.current += 1;
    cancel();
    suppression.current = null;
    return cancel;
  }, [options.documentKey, options.ready, options.readonly, signature, cancel]);

  const publish = useCallback(
    (value) => {
      if (!owner(value)) return;
      const current = latest.current;
      const board = current.board.current;
      const hit = board?.ownerDocument.elementFromPoint?.(value.x, value.y)?.closest?.('.cv-node');
      const hoveredNodeId = hit && board.contains(hit) ? hit.dataset.nodeId : null;
      const targetId = hoveredNodeId;
      const plan = targetId ? current.validate({ sourceIds: value.sourceIds, targetId }) : null;
      setPreview({
        sourceIds: value.sourceIds,
        screenPoint: { x: value.x, y: value.y },
        hoveredNodeId,
        target: targetId ? { targetId } : null,
        status: targetId ? (plan?.valid ? 'valid' : 'invalid') : 'unknown',
        gestureId: value.gestureId,
        documentKey: value.documentKey,
      });
    },
    [owner],
  );
  const pan = useCallback(
    function advance(timestamp) {
      frame.current = null;
      const value = gesture.current;
      if (!value?.dragged || !owner(value)) {
        clearGesture();
        return;
      }
      const current = latest.current;
      const bounds = current.board.current?.getBoundingClientRect();
      if (!bounds) return;
      const velocity = canvasMultiConnectionPanVelocity({ x: value.x, y: value.y }, bounds);
      const delta = Math.min(
        0.05,
        Math.max(0, (timestamp - (value.lastFrame ?? timestamp)) / 1000),
      );
      value.lastFrame = timestamp;
      if (velocity.x || velocity.y) {
        const view = current.viewRef.current;
        const next = { ...view, x: view.x + velocity.x * delta, y: view.y + velocity.y * delta };
        current.viewRef.current = next;
        current.setView(next);
        publish(value);
        frame.current = requestAnimationFrame(advance);
      }
    },
    [owner, clearGesture, publish],
  );
  const open = useCallback(
    (value) => {
      if (!owner(value)) return false;
      latest.current.setMenu?.(null);
      latest.current.setContext?.(null);
      request.current = value;
      setMenu(value);
      return true;
    },
    [owner],
  );
  const makeRequest = (opener) => {
    const current = latest.current;
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    const requestSequence = ++sequence.current;
    const sourceIds = getCanvasMultiConnectionSources(current.nodes, current.sourceIds || []).map(
      (node) => node.id,
    );
    const names = [
      ...new Set(
        sourceIds.map((id) => typeInfo(current.nodes.find((node) => node.id === id)?.type).label),
      ),
    ];
    const value = {
      kind: 'multi',
      opener,
      sourceIds,
      documentKey: current.documentKey,
      epoch: epoch.current,
      requestSequence,
      entryFocusSelector: entryFocusSelector(current),
      signature: entrySignature(current, current.getDocument()?.nodes || []),
      title: `引用选中的 ${sourceIds.length} 个${names.join('/')}节点`,
    };
    value.restoreFocus = () => restoreEntryFocus(value);
    return value;
  };
  useEffect(() => {
    if (gesture.current && !owner(gesture.current)) clearGesture();
    else if (gesture.current?.dragged) publish(gesture.current);
    if (request.current && !owner(request.current)) {
      request.current = null;
      setMenu(null);
    }
  }, [options.nodes, options.edges, options.models, owner, clearGesture, publish]);
  useEffect(() => {
    const move = (event) => {
      const value = gesture.current;
      if (!value || event.pointerId !== value.pointerId) return;
      if (!owner(value)) {
        cancel();
        return;
      }
      value.x = event.clientX;
      value.y = event.clientY;
      if (!value.dragged && Math.hypot(value.x - value.startX, value.y - value.startY) >= 10) {
        value.dragged = true;
        request.current = null;
        setMenu(null);
      }
      if (!value.dragged) return;
      event.preventDefault();
      publish(value);
      if (frame.current === null) {
        value.lastFrame = undefined;
        frame.current = requestAnimationFrame(pan);
      }
    };
    const end = (event) => {
      const value = gesture.current;
      if (!value || event.pointerId !== value.pointerId) return;
      const canceled = event.type !== 'pointerup';
      // The pointer path owns every ensuing mouse click, including a long press.
      suppression.current = { endedAt: Date.now(), pointerId: value.pointerId };
      if (owner(value) && !canceled) {
        const current = latest.current;
        const distance = Math.hypot(event.clientX - value.startX, event.clientY - value.startY);
        if (value.dragged || distance >= 10) {
          const point = current.point(event);
          const graph = current.getDocument();
          const targetId = canvasMultiConnectionDropTarget(graph.nodes, value.sourceIds, point);
          const success =
            targetId &&
            current.validate({ sourceIds: value.sourceIds, targetId })?.valid &&
            current.connectMultiNodes({ sourceIds: value.sourceIds, targetId });
          if (!success) open({ ...value, point });
          suppression.current = { endedAt: Date.now(), pointerId: value.pointerId };
        } else if (Date.now() - value.startedAt < 300 && distance < 10) {
          if (request.current) {
            request.current = null;
            setMenu(null);
          } else open(value);
          suppression.current = { endedAt: Date.now(), pointerId: value.pointerId };
        }
      }
      clearGesture();
    };
    const blur = () => cancel();
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const escape = (event) => {
      if (event.key !== 'Escape' || event.isComposing || !gesture.current) return;
      event.preventDefault();
      event.stopPropagation();
      const value = gesture.current;
      const canRestore = owner(value);
      const opener = value.opener;
      cancel();
      if (canRestore) {
        if (opener?.isConnected) opener.focus?.({ preventScroll: true });
        else restoreEntryFocus(value, sequence.current);
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('lostpointercapture', end);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [owner, cancel, clearGesture, open, pan, publish, restoreEntryFocus]);

  const start = (event) => {
    event.stopPropagation();
    const current = latest.current;
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      gesture.current ||
      !current.ready ||
      current.readonly
    )
      return;
    // Touch takeover may route through the shared pointer cancel and cancel this hook too.
    // Mint the new request only after those owners have released their old lifetimes.
    current.cancelOtherGestures?.();
    const value = makeRequest(event.currentTarget);
    if (!value.sourceIds.length || !owner(value)) return;
    event.preventDefault();
    suppression.current = null;
    // The decorative add button disappears during dragging; capture the stable pane.
    Object.assign(value, {
      capture: current.board.current,
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragged: false,
      gestureId: value.requestSequence,
    });
    gesture.current = value;
    try {
      value.capture.setPointerCapture?.(value.pointerId);
    } catch {
      /* Window listeners retain ownership. */
    }
  };
  const shouldSuppressClick = (event) =>
    event?.detail !== 0 &&
    !!suppression.current &&
    Date.now() - suppression.current.endedAt < 500 &&
    (event?.pointerId == null || event.pointerId === suppression.current.pointerId);
  const click = (event) => {
    event.stopPropagation();
    // The original multi indicator is pointerdown-only; click adds keyboard access.
    if (event.detail !== 0) return;
    if (shouldSuppressClick(event)) return;
    if (request.current) {
      request.current = null;
      setMenu(null);
    } else open(makeRequest(event.currentTarget));
  };
  const close = (value) => {
    if (value !== request.current) return;
    request.current = null;
    setMenu(null);
  };
  const candidate = (graph, value, type, makeId) => {
    const bounds = latest.current.bounds;
    if (!kinds.includes(type) || !bounds) return null;
    return createCanvasNode({
      type,
      label: typeInfo(type).label,
      nodes: graph.nodes,
      models: graph.models,
      position: value.point || {
        x: bounds.x + bounds.width + 100,
        y: bounds.y + bounds.height / 2 - 60,
      },
      ...(makeId ? { makeId } : {}),
    });
  };
  const entries = useMemo(() => {
    if (!menu) return [];
    const graph = { nodes: options.nodes, edges: options.edges, models: options.models };
    return kinds.map((type) => {
      const node = candidate(graph, menu, type, () => '__multi-connection-candidate__');
      const plan = node
        ? resolveCanvasMultiConnectedCreation({
            ...graph,
            nodes: [...graph.nodes, node],
            sourceIds: menu.sourceIds,
            targetId: node.id,
            createdNodeId: node.id,
          })
        : { valid: false, reason: 'missingNode' };
      return {
        ...TYPES.find((entry) => entry.type === type),
        label: labels[type] || typeInfo(type).label,
        iconAsset: icons[type],
        ...(descriptions[type] ? { description: descriptions[type] } : {}),
        disabled: !plan.valid,
        reason: plan.valid ? undefined : canvasConnectionReasonLabel(plan.reason),
      };
    });
  }, [menu, options.nodes, options.edges, options.models]);
  const choose = (type, value) => {
    if (value !== request.current) return false;
    const graph = owner(value);
    if (!graph) return false;
    const newNode = candidate(graph, value, type);
    if (
      !newNode ||
      !latest.current.connectMultiNodes({
        sourceIds: value.sourceIds,
        targetId: newNode.id,
        newNode,
      })
    )
      return false;
    close(value);
    latest.current.setSelected([newNode.id]);
    return true;
  };
  return {
    sources,
    preview,
    menu,
    entries,
    start,
    click,
    cancel,
    close,
    choose,
    shouldSuppressClick,
  };
}
