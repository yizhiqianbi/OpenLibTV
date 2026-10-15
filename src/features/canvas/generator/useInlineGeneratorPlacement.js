import { useLayoutEffect, useState } from 'react';
import { inlineGeneratorCenter, inlineGeneratorWidth } from './inline-placement-model.js';
export { inlineGeneratorCenter } from './inline-placement-model.js';

/** Board-width adaptation; only overflow moves the source node-centered overlay. */
export function useInlineGeneratorPlacement(center, view, board) {
  const [viewportWidth, setViewportWidth] = useState(undefined);
  useLayoutEffect(() => {
    const element = board?.current;
    if (!element) {
      setViewportWidth(undefined);
      return;
    }
    let current = true;
    const measure = () => {
      if (current) setViewportWidth(element.getBoundingClientRect().width);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      current = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [board]);
  return {
    center: inlineGeneratorCenter(center, view || { x: 0, z: 1 }, viewportWidth),
    width: inlineGeneratorWidth(viewportWidth),
  };
}
