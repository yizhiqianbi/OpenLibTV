import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePlayerFollowup({
  playbackKey,
  hasNext,
  training,
  enabled,
  gate = 'allow',
  onNext,
}) {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(5);
  const [hover, setHover] = useState(false);
  const pending = useRef(false);
  const latest = useRef({ hasNext, training, enabled, gate, onNext });
  useLayoutEffect(() => {
    latest.current = { hasNext, training, enabled, gate, onNext };
  }, [hasNext, training, enabled, gate, onNext]);
  const ended = useCallback(() => {
    const value = latest.current;
    if (value.gate === 'deny') return;
    if (value.gate === 'hold') {
      pending.current = true;
      return;
    }
    if (value.enabled && (value.hasNext || value.training)) {
      setRemaining(5);
      setOpen(true);
    } else if (value.hasNext) value.onNext?.();
  }, []);
  useEffect(() => {
    pending.current = false;
    setOpen(false);
    setRemaining(5);
  }, [playbackKey]);
  useEffect(() => {
    if (gate === 'deny') {
      pending.current = false;
      setOpen(false);
    } else if (gate === 'allow' && pending.current) {
      pending.current = false;
      ended();
    }
  }, [gate, ended]);
  useEffect(() => {
    if (!open || !hasNext) return;
    const timer = setInterval(() => {
      if (!hover && !document.hidden) setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [open, hasNext, hover]);
  useEffect(() => {
    if (open && hasNext && remaining === 0) {
      setOpen(false);
      latest.current.onNext?.();
    }
  }, [open, hasNext, remaining]);
  return { open, remaining, ended, close: () => setOpen(false), hover: setHover };
}
