import * as THREE from 'three';
import { createCameraRig, identityTransform } from './model.js';

function simplify(points, tolerance) {
  const indices = new Set([0, points.length - 1]),
    pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop(),
      segment = new THREE.Line3(points[start], points[end]);
    let farthest = -1,
      distance = 0;
    for (let index = start + 1; index < end; index++) {
      const value = points[index].distanceTo(
        segment.closestPointToPoint(points[index], true, new THREE.Vector3()),
      );
      if (value > distance) {
        distance = value;
        farthest = index;
      }
    }
    if (farthest < 0 || distance <= tolerance) continue;
    indices.add(farthest);
    pending.push([start, farthest], [farthest, end]);
  }
  return [...indices].sort((a, b) => a - b);
}

/** Source eaX reconstructs a disabled editable path while retaining the original camera clip. */
export function restoreCameraRig(scene, camera, cameraId, ownerId) {
  const cameraTrack = (track) => {
    const binding = THREE.PropertyBinding.parseTrackName(track.name);
    return THREE.PropertyBinding.findNode(scene, binding.nodeName) === camera
      ? binding.propertyName
      : null;
  };
  const clip = (scene.animations || []).find((clip) =>
    clip.tracks.some((track) => ['position', 'quaternion'].includes(cameraTrack(track))),
  );
  const position = clip?.tracks.find((track) => cameraTrack(track) === 'position');
  if (!position || position.getValueSize() !== 3 || position.times.length < 2) return null;
  const rotation = clip.tracks.find((track) => cameraTrack(track) === 'quaternion');
  const positionSample = position.createInterpolant(new Float32Array(3));
  const rotationSample =
    rotation?.getValueSize() === 4 ? rotation.createInterpolant(new Float32Array(4)) : null;
  camera.parent?.updateWorldMatrix(true, false);
  const parent = camera.parent?.matrixWorld || new THREE.Matrix4(),
    parentRotation =
      camera.parent?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
  const duration = Math.max(clip.duration, position.times.at(-1)),
    count = Math.min(Math.max(position.times.length, 2), 120);
  const bounds = new THREE.Box3().setFromObject(scene),
    fallback = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const points = [],
    focuses = [];
  for (let index = 0; index < count; index++) {
    const time = (duration * index) / (count - 1),
      point = new THREE.Vector3().fromArray(positionSample.evaluate(time)).applyMatrix4(parent);
    points.push(point);
    if (rotationSample) {
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion().fromArray(rotationSample.evaluate(time)).premultiply(parentRotation),
      );
      const radius = point.distanceTo(fallback);
      focuses.push(point.clone().addScaledVector(direction, radius > 0.001 ? radius : 1));
    }
  }
  const extent = new THREE.Box3().setFromPoints(points).getSize(new THREE.Vector3()).length();
  if (extent < 1e-4) return null;
  const focus = focuses.length
    ? focuses
        .reduce((sum, point) => sum.add(point), new THREE.Vector3())
        .divideScalar(focuses.length)
    : fallback;
  let tolerance = 0.01 * extent,
    indices = points.length <= 2 ? [0, points.length - 1] : simplify(points, tolerance);
  while (indices.length > 12 && tolerance < extent) {
    tolerance *= 1.8;
    indices = simplify(points, tolerance);
  }
  if (indices.length > 12)
    indices = Array.from({ length: 12 }, (_, index) =>
      Math.round((index * (points.length - 1)) / 11),
    );
  let entityIndex = 0;
  const rig = createCameraRig(
    { id: cameraId, name: camera.name },
    points[0].toArray(),
    focus.toArray(),
    Math.max(duration, 0.1),
    () => `${cameraId}:rig:${entityIndex++}`,
  );
  return {
    ...rig,
    sourceOwnerId: ownerId,
    cameraStableId: camera.userData.hf_id,
    bake: false,
    settings: { ...rig.settings, aim: 'target', enabled: false, easing: 'linear' },
    waypoints: indices.map((point, index) => ({
      id: `${cameraId}:waypoint:${point}`,
      name: `WP_${index + 1}`,
      transform: { ...identityTransform(), position: points[point].toArray() },
    })),
  };
}
