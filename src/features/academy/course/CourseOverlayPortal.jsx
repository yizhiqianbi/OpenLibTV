import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Course marketing source targets the fullscreen element; related overlays must remain reachable. */
export default function CourseOverlayPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    const update = () => setTarget(document.fullscreenElement || document.body);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return target ? createPortal(children, target) : null;
}
