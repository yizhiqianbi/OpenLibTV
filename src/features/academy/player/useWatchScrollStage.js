import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollStageBox } from './watch-stage-model.js';

export function useWatchScrollStage(enabled, desktop = true) {
  const stage = useRef(null);
  const meta = useRef(null);
  const anchor = useRef(null);
  const [size, setSize] = useState(null);
  const [outside, setOutside] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!desktop) {
      setSize(null);
      return;
    }
    let active = true;
    const measure = () => {
      if (!active) return;
      const next = scrollStageBox(
        window.innerWidth,
        window.innerHeight,
        meta.current?.offsetHeight,
      );
      setSize((previous) =>
        previous?.width === next?.width && previous?.height === next?.height ? previous : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (stage.current) observer?.observe(stage.current);
    if (meta.current) observer?.observe(meta.current);
    window.addEventListener('resize', measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [desktop]);
  useEffect(() => {
    setOutside(false);
    setDismissed(false);
    if (!enabled || !anchor.current || typeof IntersectionObserver === 'undefined') return;
    let active = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!active || !entry) return;
        setOutside(!entry.isIntersecting);
        if (entry.isIntersecting) setDismissed(false);
      },
      { threshold: 0 },
    );
    observer.observe(anchor.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled]);
  const dismiss = useCallback(() => setDismissed(true), []);
  return { stage, meta, anchor, size, floating: enabled && outside && !dismissed, dismiss };
}
