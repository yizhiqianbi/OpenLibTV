import { useLayoutEffect, useRef, useState } from 'react';

function usePluginScroll(setShowcase) {
  const experience = useRef(null),
    upper = useRef(null),
    track = useRef(null),
    stage = useRef(null),
    programmatic = useRef(false),
    timer = useRef(null),
    [phase, setPhase] = useState('before');
  useLayoutEffect(() => {
    const root = experience.current,
      head = upper.current,
      t = track.current,
      s = stage.current;
    if (!root || !head || !t || !s) return;
    let raf = null,
      stickyTop = 0,
      travel = 0,
      end = 0,
      fade = 160,
      anchor = [];
    const mobile = () => window.matchMedia('(max-width:767px)').matches;
    const measure = () => {
      if (mobile()) return;
      stickyTop = parseFloat(getComputedStyle(s).top) || 0;
      travel = Math.max(0, t.offsetHeight - s.offsetHeight);
      const top = t.getBoundingClientRect().top;
      anchor = [...t.querySelectorAll('[data-showcase-id]')].map(
        (e) => e.getBoundingClientRect().top - top,
      );
      const start = window.scrollY + top - stickyTop,
        remaining = Math.max(0, document.documentElement.scrollHeight - window.innerHeight - start);
      end = Math.min(travel, Math.max(anchor.at(-1) || 0, remaining - 160));
      fade = Math.max(1, Math.min(160, remaining - end));
    };
    const update = () => {
      raf = null;
      if (mobile()) {
        root.style.setProperty('--cli-surrounding-opacity', '1');
        head.style.removeProperty('transform');
        setPhase('after');
        return;
      }
      const position = stickyTop - t.getBoundingClientRect().top,
        offset = Math.min(travel, Math.max(0, position)),
        next = position < 0 ? 'before' : position < end ? 'active' : 'after',
        v = Math.min(
          1,
          (position < 0 ? -position : Math.max(0, position - end)) / (position < 0 ? 160 : fade),
        );
      root.style.setProperty('--cli-surrounding-opacity', String(v * v * (3 - 2 * v)));
      head.style.transform = `translateY(${offset}px)`;
      setPhase(next);
      if (!programmatic.current) {
        let selected = 0;
        anchor.forEach((a, i) => {
          if (a <= position + 1) selected = i;
        });
        setShowcase(selected);
      }
    };
    const schedule = () => {
        if (raf === null) raf = requestAnimationFrame(update);
      },
      resize = () => {
        measure();
        schedule();
      },
      cancel = () => {
        programmatic.current = false;
        clearTimeout(timer.current);
        schedule();
      };
    measure();
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', resize);
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    const ro = new ResizeObserver(resize);
    [root, head, t, s, document.body].forEach((e) => ro.observe(e));
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', resize);
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      ro.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
      clearTimeout(timer.current);
    };
  }, [setShowcase]);
  function select(index) {
    setShowcase(index);
    if (window.matchMedia('(max-width:767px)').matches) return;
    const anchor = track.current?.querySelector(`[data-showcase-id="${index}"]`),
      top = parseFloat(getComputedStyle(stage.current).top) || 0;
    if (!anchor) return;
    programmatic.current = true;
    clearTimeout(timer.current);
    window.scrollTo({
      top: Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - top),
      behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth',
    });
    timer.current = setTimeout(() => {
      programmatic.current = false;
    }, 850);
  }
  return { experience, upper, track, stage, phase, select };
}

export default usePluginScroll;
