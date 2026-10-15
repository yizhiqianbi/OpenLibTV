import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canvasNodeConnectionFeedback,
  canvasNodeConnectionTilt,
} from '../domain/connection-feedback-model.js';

/**
 * Physical hit testing can control hoveredNodeId/cursor while a port owns capture.
 * Without that prop, source mouse-enter/move/leave semantics support click linking.
 */
export function useCanvasNodeConnectionFeedback(options) {
  const {
    nodeId,
    documentKey,
    gestureId,
    active = false,
    originIds = [],
    invalidTargetId = null,
    edges = [],
    frozen = false,
    hoveredNodeId,
    cursor,
  } = options;
  const elementRef = useRef(null);
  const ownerRef = useRef(null);
  if (
    !ownerRef.current ||
    ownerRef.current.documentKey !== documentKey ||
    ownerRef.current.nodeId !== nodeId ||
    ownerRef.current.gestureId !== gestureId ||
    ownerRef.current.frozen !== frozen
  )
    ownerRef.current = { documentKey, nodeId, gestureId, frozen };
  const owner = ownerRef.current;
  const latest = useRef(null);
  const inside = useRef(false);
  const frame = useRef(null);
  const pending = useRef(null);
  const recovery = useRef(null);
  const [hover, setHover] = useState({ owner, nodeHovered: false, connectionHovered: false });
  const [pose, setPose] = useState({ owner, x: 0, y: 0, recovering: false });
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const controlled = hoveredNodeId !== undefined;
  const feedback = canvasNodeConnectionFeedback({
    nodeId,
    active,
    originIds,
    invalidTargetId,
    edges,
    frozen,
    hovered: controlled
      ? hoveredNodeId === nodeId
      : hover.owner === owner && hover.connectionHovered,
  });
  latest.current = { owner, feedback, active, controlled, frozen };

  const cancelFrame = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pending.current = null;
  }, []);
  const cancelRecovery = useCallback(() => {
    if (recovery.current !== null) clearTimeout(recovery.current);
    recovery.current = null;
  }, []);
  const queueTilt = useCallback((point, element = elementRef.current) => {
    const current = latest.current;
    if (!current.feedback.isConnectionTarget || !element) return;
    pending.current = { point, element, owner: current.owner };
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const value = pending.current;
      pending.current = null;
      if (
        !value ||
        value.owner !== latest.current.owner ||
        !latest.current.feedback.isConnectionTarget
      )
        return;
      const next = canvasNodeConnectionTilt(value.point, value.element.getBoundingClientRect());
      if (next) setPose({ ...next, owner: value.owner, recovering: false });
    });
  }, []);
  useEffect(() => {
    inside.current = false;
    cancelFrame();
    cancelRecovery();
    setHover({ owner, nodeHovered: false, connectionHovered: false });
    setPose({ owner, x: 0, y: 0, recovering: false });
    return () => {
      cancelFrame();
      cancelRecovery();
    };
  }, [owner, cancelFrame, cancelRecovery]);
  useEffect(() => {
    setHover((value) => {
      if (value.owner !== owner) return value;
      if (active && value.nodeHovered) return { ...value, nodeHovered: false };
      if (!active && value.connectionHovered) return { ...value, connectionHovered: false };
      return value;
    });
  }, [active, owner]);
  const target = feedback.isConnectionTarget;
  useEffect(() => {
    cancelRecovery();
    if (target) return;
    cancelFrame();
    const value = poseRef.current;
    if (value.owner !== owner || frozen) {
      setPose({ owner, x: 0, y: 0, recovering: false });
      return;
    }
    if (value.x === 0 && value.y === 0) return;
    recovery.current = setTimeout(() => {
      recovery.current = null;
      if (latest.current.owner !== owner) return;
      setPose({ owner, x: 0, y: 0, recovering: false });
    }, 400);
    setPose({ owner, x: 0, y: 0, recovering: true });
    return cancelRecovery;
  }, [target, owner, frozen, cancelFrame, cancelRecovery]);
  const cursorX = cursor?.x;
  const cursorY = cursor?.y;
  useEffect(() => {
    if (controlled && target) queueTilt({ x: cursorX, y: cursorY });
  }, [controlled, target, cursorX, cursorY, owner, queueTilt]);

  const onMouseEnter = useCallback(() => {
    const current = latest.current;
    if (current.frozen) return;
    inside.current = true;
    if (!current.active)
      setHover({ owner: current.owner, nodeHovered: true, connectionHovered: false });
  }, []);
  const onMouseLeave = useCallback(() => {
    inside.current = false;
    setHover({ owner: latest.current.owner, nodeHovered: false, connectionHovered: false });
  }, []);
  const onMouseMove = useCallback(
    (event) => {
      const current = latest.current;
      if (current.frozen || current.controlled || !current.active || !inside.current) return;
      setHover({ owner: current.owner, nodeHovered: false, connectionHovered: true });
      // The render following the first move activates source hover feedback.
      // Keep its cursor so the owner effect can compute that first frame too.
      pending.current = {
        point: { x: event.clientX, y: event.clientY },
        element: elementRef.current || event.currentTarget,
        owner: current.owner,
      };
      if (current.feedback.isConnectionTarget)
        queueTilt(pending.current.point, pending.current.element);
    },
    [queueTilt],
  );
  useEffect(() => {
    if (!controlled && target && pending.current) {
      const value = pending.current;
      queueTilt(value.point, value.element);
    }
  }, [controlled, target, queueTilt]);

  const currentPose = pose.owner === owner ? pose : { x: 0, y: 0, recovering: false };
  const tiltStyle =
    !frozen && (target || currentPose.x !== 0 || currentPose.y !== 0 || currentPose.recovering)
      ? {
          transform: `perspective(800px) rotateX(${currentPose.x}deg) rotateY(${currentPose.y}deg)`,
          transformOrigin: 'center center',
          transition: `transform ${target ? '80ms' : '400ms'} ease-out`,
        }
      : {};
  return {
    ...feedback,
    elementRef,
    tiltStyle,
    nodeHovered: !frozen && hover.owner === owner && hover.nodeHovered,
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
  };
}
