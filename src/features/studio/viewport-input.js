import { MOUSE, TOUCH } from 'three';

/** Configure native OrbitControls without sharing primary-button object selection. */
export function createViewportInput({ element, orbit, navigation }) {
  const originalMouseButtons = orbit.mouseButtons,
    originalTouches = orbit.touches;
  const mouseButtons = {
    ...originalMouseButtons,
    LEFT: null,
    MIDDLE: MOUSE.ROTATE,
    RIGHT: MOUSE.PAN,
  };
  orbit.mouseButtons = mouseButtons;
  orbit.touches = { ...originalTouches, ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  const document = element.ownerDocument || element,
    window = document.defaultView;
  const navigatingPointers = new Set();
  let active = true,
    altPointer = null,
    completedPointer = null;
  const pointerId = (event) => event.pointerId ?? 'mouse';
  const navigates = (event) =>
    event.pointerType !== 'touch' &&
    (event.button === 1 || event.button === 2 || (event.button === 0 && event.altKey));
  const restoreLeft = () => {
    mouseButtons.LEFT = null;
    altPointer = null;
  };
  const start = (event) => {
    if (!active) return;
    const id = pointerId(event);
    completedPointer = null;
    navigatingPointers.delete(id);
    if (!navigates(event) || orbit.enabled === false) return;
    navigatingPointers.add(id);
    if (event.button === 0 && altPointer === null) {
      altPointer = id;
      mouseButtons.LEFT = MOUSE.ROTATE;
    }
  };
  const finish = (event) => {
    if (!active) return;
    const id = pointerId(event);
    // Keep this one ID through event propagation: Alt may already be released by
    // pointerup, while the editor's selection listener runs after this capture.
    completedPointer = navigatingPointers.has(id) ? id : null;
    navigatingPointers.delete(id);
    if (id === altPointer) restoreLeft();
  };
  const blur = () => {
    navigatingPointers.clear();
    completedPointer = null;
    restoreLeft();
  };
  const cancelNavigation = () => {
    if (active) navigation?.cancel?.();
  };
  // OrbitControls registers its bubble listener in its constructor. Capture must
  // prepare Alt-left first, and reset even when pointerup happens outside canvas.
  element.addEventListener('pointerdown', start, true);
  document.addEventListener('pointerup', finish, true);
  document.addEventListener('pointercancel', finish, true);
  window?.addEventListener('blur', blur);
  orbit.addEventListener?.('start', cancelNavigation);
  return {
    isNavigatingPointer(event) {
      if (!active) return false;
      const id = pointerId(event);
      return navigates(event) || navigatingPointers.has(id) || id === completedPointer;
    },
    dispose() {
      if (!active) return;
      active = false;
      element.removeEventListener('pointerdown', start, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      window?.removeEventListener('blur', blur);
      orbit.removeEventListener?.('start', cancelNavigation);
      blur();
      orbit.mouseButtons = originalMouseButtons;
      orbit.touches = originalTouches;
    },
  };
}
