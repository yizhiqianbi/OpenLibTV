import { useEffect } from 'react';
import { fitMonitorTopCamera, restoreViewport3dView } from '../monitor/cameras.js';

export function useViewportCamera({ runtime, viewMode, objects }) {
  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    if (viewMode !== 'orbit') rt.navigation?.cancel();
    const { camera, orbit } = rt;
    if (viewMode === 'top') {
      rt.monitor3dView ||= { camera: camera.clone(false), target: orbit.target.clone() };
      fitMonitorTopCamera(camera, rt.content, camera.aspect);
      orbit.target.set(camera.position.x, camera.position.y - 1, camera.position.z);
      orbit.enableRotate = false;
    } else if (viewMode === 'front') {
      restoreViewport3dView(rt);
      camera.position.set(0, 3, 12);
      orbit.target.set(0, 1, 0);
    } else restoreViewport3dView(rt);
    orbit.update();
  }, [viewMode, runtime, objects]);
}
