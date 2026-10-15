import { useEffect, useRef } from 'react';

const isolatedWheelSurface = '.nowheel,input,textarea,select,audio,video,[contenteditable]';

function ownsWheel(target, board, isolatedSurface) {
  if (target.closest?.(isolatedSurface)) return true;
  const view = board.ownerDocument.defaultView;
  for (let element = target; element && element !== board; element = element.parentElement) {
    const style = view.getComputedStyle(element);
    if (
      (/(auto|scroll)/.test(style.overflowY || style.overflow) &&
        element.scrollHeight > element.clientHeight) ||
      (/(auto|scroll)/.test(style.overflowX || style.overflow) &&
        element.scrollWidth > element.clientWidth)
    )
      return true;
  }
  return false;
}

export function useGraphWheel({ board, setView, zoom, isolatedSurface = isolatedWheelSurface }) {
  const latest = useRef({ setView, zoom });
  latest.current = { setView, zoom };
  useEffect(() => {
    const b = board.current;
    if (!b) return;
    const wheel = (e) => {
      const { setView, zoom } = latest.current;
      const target = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      if (e.defaultPrevented || !target || ownsWheel(target, b, isolatedSurface)) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoom(Math.exp(-e.deltaY * 0.006), e.clientX, e.clientY);
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    b.addEventListener('wheel', wheel, { passive: false });
    return () => b.removeEventListener('wheel', wheel);
  }, [board, isolatedSurface]);
}
