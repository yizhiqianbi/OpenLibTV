import * as THREE from 'three';
import { createNestedAnimatedGlb, encodeGlb } from './animated-glb.js';

/** Synthetic source-shaped rigs, two real cameras, and unchanged Slide/Grow geometry clips. */
export function createCameraGlb() {
  const original = createNestedAnimatedGlb();
  const length = new DataView(original).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(original, 20, length)));
  const binary = original.slice(28 + length);
  json.asset.generator = 'LibTV synthetic camera source regression';
  json.cameras = [0, 1].map(() => ({
    type: 'perspective',
    perspective: { yfov: Math.PI / 4, aspectRatio: 16 / 9, znear: 0.01, zfar: 1000 },
  }));
  const timeline = {
    version: 1,
    duration: 6,
    shots: [
      { cameraId: 'qa-camera-a', start: 0, end: 3 },
      { cameraId: 'qa-camera-b', start: 3, end: 6 },
    ],
  };
  json.scenes[0].extras = { blockingStudioTimeline: JSON.stringify(timeline) };
  for (const [index, origin] of [
    [0, [5, 3, 6]],
    [1, [-5, 2, 4]],
  ]) {
    const name = index ? 'QA_Truck' : 'QA_Arc';
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        new THREE.Vector3(...origin),
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Vector3(0, 1, 0),
      ),
    );
    const cameraIndex = json.nodes.length;
    json.nodes.push({
      name,
      camera: index,
      translation: origin,
      rotation: quaternion.toArray(),
      extras: { hf_id: `qa-camera-${index ? 'b' : 'a'}` },
    });
    json.scenes[0].nodes.push(cameraIndex);
    const pathIndex = json.nodes.length,
      waypointIndex = pathIndex + 1,
      aimIndex = pathIndex + 4;
    json.nodes.push({
      name: `Path_${name}`,
      children: [waypointIndex, waypointIndex + 1, waypointIndex + 2, aimIndex],
      extras: {
        hf_id: `qa-path-${index}`,
        blockingStudioPathFor: name,
        blockingStudioPath: {
          enabled: true,
          aim: 'target',
          targetName: `Aim_${name}`,
          duration: 6,
          easing: 'inout',
          curve: 'centripetal',
          closed: false,
          tension: 0.5,
          speed: 1,
        },
        blockingStudioPathAnchor: {
          origin,
          focus: [0, 0.5, 0],
          radius: Math.hypot(origin[0], origin[1] - 0.5, origin[2]),
        },
      },
    });
    [
      origin,
      [origin[0] + 2, origin[1] + 1, origin[2] - 1],
      [origin[0] + 4, origin[1], origin[2] - 2],
    ].forEach((position, state) =>
      json.nodes.push({
        name: `WP_${state + 1}`,
        translation: position,
        extras: {
          hf_id: `qa-wp-${index}-${state}`,
          blockingStudioWaypoint: true,
          blockingStudioWaypointIndex: state,
        },
      }),
    );
    json.nodes.push(
      {
        name: `Aim_${name}`,
        translation: [0, 0.5, 0],
        children: [aimIndex + 1],
        extras: { hf_id: `qa-aim-${index}`, blockingStudioPathAim: true },
      },
      {
        name: `Focus_${name}`,
        extras: { hf_id: `qa-focus-${index}`, blockingStudioPathFocus: true },
      },
    );
    json.scenes[0].nodes.push(pathIndex);
  }
  return encodeGlb(json, binary);
}
