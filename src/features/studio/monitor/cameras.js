import * as THREE from 'three';
import { isObjectVisible } from '../scene-resources.js';
import { MONITOR_ASPECT, MONITOR_ORBIT, MONITOR_TOP } from './model.js';

export function monitorCameras(runtime) {
  const ids = new Map([...runtime.entities].map(([id, object]) => [object, id]));
  const cameras = [];
  runtime.content.traverse((object) => {
    const id = ids.get(object);
    if (id && object.isCamera && isObjectVisible(object)) cameras.push({ id, name: object.name });
  });
  return cameras;
}

/** Uses the source's median-radius filter to exclude distant oversized mesh outliers. */
export function monitorBounds(content) {
  const entries = [];
  content.updateWorldMatrix(true, true);
  content.traverse((node) => {
    if (!node.isMesh || !isObjectVisible(node)) return;
    if (node.isSkinnedMesh) node.computeBoundingBox();
    else if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const box = (node.isSkinnedMesh ? node.boundingBox : node.geometry.boundingBox)?.clone();
    if (box && !box.isEmpty()) {
      box.applyMatrix4(node.matrixWorld);
      entries.push({ box, radius: box.getBoundingSphere(new THREE.Sphere()).radius });
    }
  });
  const result = new THREE.Box3();
  const radii = entries.map((entry) => entry.radius).sort((a, b) => a - b);
  const median = radii.length ? radii[Math.floor(radii.length / 2)] : 0;
  for (const entry of entries)
    if (entries.length <= 1 || entry.radius <= median * 8) result.union(entry.box);
  return result;
}

export function fitMonitorTopCamera(camera, content, aspect = MONITOR_ASPECT) {
  camera.aspect = aspect;
  camera.up.set(0, 0, -1);
  const bounds = monitorBounds(content);
  if (bounds.isEmpty()) {
    camera.position.set(0, 5, 0);
    camera.near = 0.1;
    camera.far = 1000;
    camera.lookAt(0, 0, 0);
  } else {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const size = bounds.getSize(new THREE.Vector3());
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
    // Fit at the closest (upper) face, which is half the height nearer than the center.
    // This local correction preserves the source bounds filter without clipping tall objects.
    const planarDistance = Math.max(
      Math.max(size.z / 2, 0.05) / tangent,
      Math.max(size.x / 2, 0.05) / Math.max(aspect * tangent, 0.001),
      0.1,
    );
    const distance = size.y / 2 + 1.15 * planarDistance;
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, distance, 0));
    camera.near = Math.max((distance - size.y / 2) / 1000, 0.001);
    camera.far = Math.max(distance + size.y / 2 + 100 * sphere.radius, 100);
    camera.lookAt(sphere.center);
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** Preview cameras are borrowed copies: never change the main or authored camera aspect. */
export function monitorCamera(runtime, key) {
  if (key === MONITOR_TOP) return fitMonitorTopCamera(runtime.camera.clone(false), runtime.content);
  const source = key === MONITOR_ORBIT ? runtime.monitor3dView?.camera : runtime.entities.get(key);
  if (!source?.isCamera) return null;
  source.updateWorldMatrix(true, false);
  const camera = source.clone(false);
  source.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
  if (key === MONITOR_ORBIT && camera.isPerspectiveCamera) {
    camera.aspect = MONITOR_ASPECT;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(true);
  return camera;
}

export function restoreViewport3dView(runtime) {
  const saved = runtime.monitor3dView;
  if (!saved) return;
  const aspect = runtime.camera.aspect;
  runtime.camera.copy(saved.camera, false);
  runtime.camera.aspect = aspect;
  runtime.camera.updateProjectionMatrix();
  runtime.orbit.target.copy(saved.target);
  runtime.orbit.enableRotate = true;
  runtime.monitor3dView = null;
  runtime.orbit.update();
}
