import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createCanvasClipDisconnectController } from './clip-disconnect-controller.js';

/** Observed port identity and capability mode each retire the local operation epoch. */
export function useCanvasClipDisconnect(options) {
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef(null);
  if (controller.current === null)
    controller.current = createCanvasClipDisconnectController({ getOptions: () => latest.current });
  const controls = controller.current;
  const state = useSyncExternalStore(controls.subscribe, controls.getState, controls.getState);
  useLayoutEffect(() => {
    controls.activate();
    return () => controls.retire();
  }, [
    controls,
    options.documentKey,
    options.ready,
    options.readonly,
    options.port,
    options.port?.mode,
  ]);
  return { ...state, disconnect: controls.disconnect, cancel: controls.cancel };
}
