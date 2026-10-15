import { useEffect } from 'react';
import { applyViewportSelection } from '../viewport-controls.js';

export function useViewportSelection({ mode, objects, runtime, selected }) {
  useEffect(() => {
    applyViewportSelection(runtime.current, { selected, mode });
  }, [selected, mode, objects.length, runtime]);
}
