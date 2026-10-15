import { useEffect } from 'react';
export function useViewportEntities({ objects, cameraPaths, cameraTimeline, runtime }) {
  useEffect(() => {
    runtime.current?.entityController.reconcile(objects);
    runtime.current?.cameraController.reconcile(
      cameraPaths,
      cameraTimeline,
      runtime.current.entityController.exportAnimations(),
    );
  }, [objects, cameraPaths, cameraTimeline, runtime]);
}
