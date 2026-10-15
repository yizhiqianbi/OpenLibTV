// @vitest-environment jsdom
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createViewportInput } from './viewport-input.js';

const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
const event = (type, options = {}) => {
  const { pointerId = 1, pointerType = 'mouse', ...mouse } = options;
  const value = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 100,
    clientY: 100,
    ...mouse,
  });
  Object.defineProperties(value, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  return value;
};
const setup = ({ native = false } = {}) => {
  const element = document.createElement('canvas');
  Object.defineProperties(element, { clientWidth: { value: 1000 }, clientHeight: { value: 600 } });
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  document.body.append(element);
  const camera = new THREE.PerspectiveCamera(45, 1000 / 600, 0.01, 1000);
  camera.position.set(5, 4, 6);
  const orbit = native
    ? new OrbitControls(camera, element)
    : {
        mouseButtons: {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        },
        touches: { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE },
        enabled: true,
      };
  const navigation = { cancel: vi.fn() };
  const input = createViewportInput({ element, orbit, navigation });
  cleanups.push(() => {
    input.dispose();
    orbit.dispose?.();
    element.remove();
  });
  return { element, orbit, camera, navigation, input };
};

it('maps middle orbit, right pan and native touch gestures while plain left remains object selection', () => {
  const { element, orbit, input } = setup();
  expect(orbit.mouseButtons).toEqual({
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  });
  expect(orbit.touches).toEqual({ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN });
  element.dispatchEvent(event('pointerdown'));
  expect(orbit.mouseButtons.LEFT).toBeNull();
  expect(input.isNavigatingPointer(event('pointerup'))).toBe(false);
  expect(input.isNavigatingPointer(event('pointerup', { button: 1 }))).toBe(true);
  expect(input.isNavigatingPointer(event('pointerup', { button: 2 }))).toBe(true);
});

it('enables Alt-left in capture before native controls and rejects its release after Alt is let go', () => {
  const { element, orbit, navigation, input } = setup({ native: true });
  const cameraBefore = orbit.object.position.clone();
  element.dispatchEvent(event('pointerdown'));
  expect(navigation.cancel).not.toHaveBeenCalled();
  document.dispatchEvent(event('pointermove', { clientX: 200 }));
  expect(orbit.object.position.toArray()).toEqual(cameraBefore.toArray());
  element.dispatchEvent(event('pointerup'));
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  expect(orbit.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
  expect(navigation.cancel).toHaveBeenCalledOnce();
  document.dispatchEvent(event('pointermove', { clientX: 200 }));
  expect(orbit.object.position.distanceTo(cameraBefore)).toBeGreaterThan(0.1);
  const selection = vi.fn((release) => input.isNavigatingPointer(release));
  element.addEventListener('pointerup', selection);
  const release = event('pointerup', { clientX: 200 });
  element.dispatchEvent(release);
  expect(orbit.mouseButtons.LEFT).toBeNull();
  expect(selection).toHaveReturnedWith(true);
  element.dispatchEvent(event('pointerdown'));
  expect(input.isNavigatingPointer(event('pointerup'))).toBe(false);
});

it('uses native Shift-middle pan and right pan without rotating the camera around its target', () => {
  const { element, orbit, camera, navigation } = setup({ native: true });
  const targetBefore = orbit.target.clone(),
    directionBefore = camera.position.clone().sub(orbit.target);
  element.dispatchEvent(event('pointerdown', { button: 1, shiftKey: true }));
  document.dispatchEvent(event('pointermove', { button: 1, shiftKey: true, clientX: 160 }));
  expect(orbit.target.distanceTo(targetBefore)).toBeGreaterThan(0.1);
  expect(camera.position.clone().sub(orbit.target).distanceTo(directionBefore)).toBeLessThan(
    0.000001,
  );
  element.dispatchEvent(event('pointerup', { button: 1 }));
  const nextTarget = orbit.target.clone();
  element.dispatchEvent(event('pointerdown', { button: 2 }));
  document.dispatchEvent(event('pointermove', { button: 2, clientX: 160 }));
  expect(orbit.target.distanceTo(nextTarget)).toBeGreaterThan(0.1);
  expect(camera.position.clone().sub(orbit.target).distanceTo(directionBefore)).toBeLessThan(
    0.000001,
  );
  element.dispatchEvent(event('pointerup', { button: 2 }));
  expect(navigation.cancel).toHaveBeenCalledTimes(2);
});

it('restores temporary Alt-left for matching cancel, outside release and window blur', () => {
  const { element, orbit } = setup();
  element.dispatchEvent(event('pointerdown', { altKey: true, pointerId: 7 }));
  document.dispatchEvent(event('pointercancel', { pointerId: 8 }));
  expect(orbit.mouseButtons.LEFT).toBe(THREE.MOUSE.ROTATE);
  document.dispatchEvent(event('pointercancel', { pointerId: 7 }));
  expect(orbit.mouseButtons.LEFT).toBeNull();
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  document.dispatchEvent(event('pointerup'));
  expect(orbit.mouseButtons.LEFT).toBeNull();
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  window.dispatchEvent(new Event('blur'));
  expect(orbit.mouseButtons.LEFT).toBeNull();
  orbit.enabled = false;
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  expect(orbit.mouseButtons.LEFT).toBeNull();
});

it('removes its own captured listeners and restores borrowed controls on repeated disposal', () => {
  const element = document.createElement('canvas');
  const orbit = new THREE.EventDispatcher();
  const originalMouse = { LEFT: THREE.MOUSE.ROTATE },
    originalTouch = { ONE: THREE.TOUCH.PAN };
  orbit.mouseButtons = originalMouse;
  orbit.touches = originalTouch;
  const navigation = { cancel: vi.fn() };
  const removedElement = vi.spyOn(element, 'removeEventListener'),
    removedDocument = vi.spyOn(document, 'removeEventListener'),
    removedWindow = vi.spyOn(window, 'removeEventListener');
  const input = createViewportInput({ element, orbit, navigation });
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  input.dispose();
  input.dispose();
  expect(removedElement).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
  expect(removedDocument).toHaveBeenCalledWith('pointerup', expect.any(Function), true);
  expect(removedDocument).toHaveBeenCalledWith('pointercancel', expect.any(Function), true);
  expect(removedWindow).toHaveBeenCalledWith('blur', expect.any(Function));
  expect(orbit.mouseButtons).toBe(originalMouse);
  expect(orbit.touches).toBe(originalTouch);
  element.dispatchEvent(event('pointerdown', { altKey: true }));
  orbit.dispatchEvent({ type: 'start' });
  expect(navigation.cancel).not.toHaveBeenCalled();
  expect(orbit.mouseButtons).toBe(originalMouse);
  expect(input.isNavigatingPointer(event('pointerup', { button: 1 }))).toBe(false);
  removedElement.mockRestore();
  removedDocument.mockRestore();
  removedWindow.mockRestore();
});
