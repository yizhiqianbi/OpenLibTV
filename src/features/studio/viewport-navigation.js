import * as THREE from 'three';
import { isObjectVisible } from './scene-resources.js';
import { restoreViewport3dView } from './monitor/cameras.js';

const DEFAULT_DIRECTION = new THREE.Vector3(5, 4, 6).normalize();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const AXIS_VIEWS = {
  front: { label: '前视图', direction: [0, 0, 1] },
  back: { label: '后视图', direction: [0, 0, -1] },
  right: { label: '右视图', direction: [1, 0, 0] },
  left: { label: '左视图', direction: [-1, 0, 0] },
  // OrbitControls keeps Y as its up axis; a safe pole avoids flipping at exactly 90°.
  top: { label: '顶视图', direction: [0, 1, 0.00001] },
  bottom: { label: '底视图', direction: [0, -1, 0.00001] },
};
const AXIS_ALIASES = {
  x: 'right',
  '-x': 'left',
  y: 'top',
  '-y': 'bottom',
  z: 'front',
  '-z': 'back',
};

function finiteBox(box) {
  return !!box && !box.isEmpty() && [...box.min, ...box.max].every(Number.isFinite);
}

function isNavigationGeometry(node, root) {
  if (!node.geometry || !isObjectVisible(node)) return false;
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  if (materials.every((material) => material?.visible === false)) return false;
  for (let ancestor = node; ancestor && ancestor !== root; ancestor = ancestor.parent)
    if (ancestor.userData.blockingStudioPathFor) return false;
  return true;
}

/** Bounds include visible nested, skinned and instanced geometry, never the ground/helpers. */
export function viewportNavigationBounds(root) {
  const bounds = new THREE.Box3();
  if (!root || !isObjectVisible(root)) return bounds;
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!isNavigationGeometry(node, root)) return;
    if (node.isSkinnedMesh || node.isInstancedMesh) node.computeBoundingBox();
    else if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const local =
      node.isSkinnedMesh || node.isInstancedMesh ? node.boundingBox : node.geometry.boundingBox;
    if (!local) return;
    const box = local.clone().applyMatrix4(node.matrixWorld);
    if (finiteBox(box)) bounds.union(box);
  });
  return bounds;
}

function boxCorners(box) {
  const corners = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  return corners;
}

function viewQuaternion(direction) {
  const matrix = new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), WORLD_UP);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

/** Fit the actual horizontal and vertical frusta, including each corner's depth. */
export function fitViewportBounds(camera, box, direction, padding = 1.65) {
  if (!finiteBox(box)) return null;
  const target = box.getCenter(new THREE.Vector3());
  const normal = direction.clone().normalize();
  if (!normal.lengthSq()) normal.copy(DEFAULT_DIRECTION);
  const quaternion = viewQuaternion(normal);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const tangentY = Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
  const tangentX = tangentY * Math.max(camera.aspect, 0.0001);
  let distance = 0.25;
  for (const corner of boxCorners(box)) {
    const offset = corner.sub(target);
    const depth = offset.dot(normal);
    distance = Math.max(
      distance,
      depth + (Math.abs(offset.dot(right)) * padding) / tangentX,
      depth + (Math.abs(offset.dot(up)) * padding) / tangentY,
    );
  }
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.25);
  return {
    target,
    direction: normal,
    quaternion,
    distance,
    position: target.clone().addScaledVector(normal, distance),
    near: Math.max(0.001, (distance - radius) * 0.02),
    far: Math.max(100, distance + radius * 16),
  };
}

function currentDirection(runtime) {
  const direction = runtime.camera.position.clone().sub(runtime.orbit.target);
  return direction.lengthSq() ? direction.normalize() : DEFAULT_DIRECTION.clone();
}

function reducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Animation is advanced by the existing viewport RAF; no independent listeners or timers. */
export function createViewportNavigation(
  runtime,
  { duration = 240, now = () => performance.now(), prefersReducedMotion = reducedMotion } = {},
) {
  let active = true;
  let transition = null;
  let axis = null;
  const state = () => ({
    axis,
    label: AXIS_VIEWS[axis]?.label || '用户透视',
    projection: 'perspective',
    animating: transition !== null,
  });
  const apply = (target, quaternion, distance) => {
    runtime.orbit.target.copy(target);
    runtime.camera.up.copy(WORLD_UP);
    runtime.camera.position
      .copy(target)
      .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion), distance);
    runtime.camera.lookAt(target);
    // Consume pending damping deltas so a completed frame cannot drift away afterwards.
    const damping = runtime.orbit.enableDamping;
    runtime.orbit.enableDamping = false;
    runtime.orbit.update();
    runtime.orbit.enableDamping = damping;
  };
  const begin = (goal, nextAxis = null) => {
    if (!active || !goal) return false;
    const damping = runtime.orbit.enableDamping;
    runtime.orbit.enableDamping = false;
    runtime.orbit.update();
    runtime.orbit.enableDamping = damping;
    axis = nextAxis;
    runtime.camera.near = goal.near;
    runtime.camera.far = goal.far;
    runtime.camera.updateProjectionMatrix();
    const startDirection = currentDirection(runtime);
    transition = {
      at: now(),
      target: runtime.orbit.target.clone(),
      quaternion: viewQuaternion(startDirection),
      distance: Math.max(runtime.camera.position.distanceTo(runtime.orbit.target), 0.25),
      goal,
    };
    if (duration <= 0 || prefersReducedMotion()) {
      apply(goal.target, goal.quaternion, goal.distance);
      transition = null;
    }
    return true;
  };
  const boundsFor = (id) => {
    const root = id ? runtime.entities.get(id) : runtime.content;
    if (!root || !isObjectVisible(root)) return null;
    const bounds = viewportNavigationBounds(root);
    if (!bounds.isEmpty()) return bounds;
    // Cameras, lights and empty scene roots still have a useful point to frame.
    const point = root.getWorldPosition(new THREE.Vector3());
    return new THREE.Box3().setFromCenterAndSize(point, new THREE.Vector3(1, 1, 1));
  };
  return {
    state,
    frame(id) {
      if (!active) return false;
      restoreViewport3dView(runtime);
      const bounds = boundsFor(id);
      return bounds
        ? begin(fitViewportBounds(runtime.camera, bounds, currentDirection(runtime)), axis)
        : false;
    },
    axis(name) {
      const nextAxis = AXIS_ALIASES[name] || name;
      if (!active || !AXIS_VIEWS[nextAxis]) return false;
      restoreViewport3dView(runtime);
      const direction = new THREE.Vector3().fromArray(AXIS_VIEWS[nextAxis].direction).normalize();
      const target = runtime.orbit.target.clone();
      const distance = Math.max(runtime.camera.position.distanceTo(target), 0.25);
      return begin(
        {
          target,
          direction,
          quaternion: viewQuaternion(direction),
          distance,
          near: runtime.camera.near,
          far: runtime.camera.far,
        },
        nextAxis,
      );
    },
    reset() {
      if (!active) return false;
      restoreViewport3dView(runtime);
      return begin(fitViewportBounds(runtime.camera, boundsFor(), DEFAULT_DIRECTION));
    },
    tick(time = now()) {
      if (!active || !transition) return false;
      const progress = THREE.MathUtils.clamp((time - transition.at) / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const { goal } = transition;
      const target = transition.target.clone().lerp(goal.target, eased);
      const quaternion = transition.quaternion.clone().slerp(goal.quaternion, eased);
      apply(target, quaternion, THREE.MathUtils.lerp(transition.distance, goal.distance, eased));
      if (progress >= 1) transition = null;
      return true;
    },
    cancel() {
      transition = null;
      axis = null;
    },
    dispose() {
      active = false;
      transition = null;
    },
  };
}
