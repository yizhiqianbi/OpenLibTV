import * as THREE from 'three';
import { CAMERA_PATH_DEFAULTS, identityTransform } from './model.js';
import { createLocalId } from '../../editor/model.js';

/** Source eaO/_I exposes these six entries; the underlying unused catalogue has eighteen. */
export const CAMERA_PRESETS = [
  { id: 'arc-right', label: '弧线', description: '围绕主体移动', path: 'M 8 31 Q 34 2 72 25' },
  { id: 'dolly-in', label: '推近', description: '聚焦主体，增强张力', path: 'M 8 31 L 72 12' },
  { id: 'truck-left', label: '横移', description: '横向穿过场景', path: 'M 72 25 Q 40 14 8 25' },
  {
    id: 'crane-up',
    label: '升起',
    description: '抬升视角，展现更广场景',
    path: 'M 10 33 Q 30 32 70 7',
  },
  { id: 'flyover', label: '飞越', description: '从场景上方飞过', path: 'M 8 32 Q 38 2 72 17' },
  {
    id: 'reveal-behind',
    label: '揭示',
    description: '从遮挡后显露主体',
    path: 'M 8 34 C 14 5 55 5 72 25',
  },
];
export const CAMERA_EASING_PRESETS = [
  { id: 'linear', label: '线性', easing: 'linear', path: 'M8 32 L72 8' },
  { id: 'ease', label: '缓动', easing: 'inout', path: 'M8 32 C20 32 18 8 72 8' },
  { id: 'ease-in', label: '缓入', easing: 'in', path: 'M8 32 C40 32 56 28 72 8' },
  { id: 'ease-out', label: '缓出', easing: 'out', path: 'M8 32 C24 12 40 8 72 8' },
  { id: 'ease-in-out', label: '缓入缓出', easing: 'inout', path: 'M8 32 C30 32 50 8 72 8' },
  {
    id: 'smooth',
    label: '平滑',
    easing: 'inout',
    path: 'M8 32 C20 32 20 27 29 23 C40 17 54 18 72 8',
  },
];
export const activeCameraEasingPreset = (easing) =>
  ({ in: 'ease-in', out: 'ease-out', inout: 'ease-in-out' })[easing] || 'linear';

/** Source eox/eow/eoS plus the source's framing/intensity adjustment, in world space. */
export function buildCameraPreset(id, anchor, { intensity = 1, framing = 'medium' } = {}) {
  const focus = new THREE.Vector3().fromArray(anchor.focus);
  const offset = new THREE.Vector3().fromArray(anchor.origin).sub(focus);
  const radius = Math.max(anchor.radius, 0.001),
    up = new THREE.Vector3(0, 1, 0);
  if (offset.lengthSq() < 1e-8) offset.set(0, 0, Math.max(radius, 1));
  const right = new THREE.Vector3().crossVectors(up, offset);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const orbit = (angle, scale = 1, height = 0) => {
    const point = offset.clone().applyAxisAngle(up, angle).multiplyScalar(scale);
    point.y += radius * height;
    return point.add(focus);
  };
  const dolly = (scale, height = 0, horizontal = 0) => {
    const point = offset.clone().multiplyScalar(scale);
    point.y += radius * height;
    return point.addScaledVector(right, radius * horizontal).add(focus);
  };
  let points, settings;
  switch (id) {
    case 'arc-right':
      points = [-0.55, 0, 0.55].map((angle, i) => orbit(angle, 1, i === 1 ? 0.12 : 0));
      settings = { aim: 'target', duration: 6 };
      break;
    case 'dolly-in':
      points = [1.6, 1.1, 0.6].map((scale) => dolly(scale));
      settings = { aim: 'target', duration: 6 };
      break;
    case 'truck-left':
      points = [0.9, 0, -0.9].map((horizontal) => dolly(1, 0, horizontal));
      settings = { aim: 'target', duration: 7 };
      break;
    case 'crane-up':
      points = [dolly(1.15, -0.4), dolly(1, 0.25), dolly(0.95, 0.95)];
      settings = { aim: 'target', duration: 8 };
      break;
    case 'flyover':
      points = [dolly(1.8, -0.15), dolly(0.8, 0.7), dolly(-0.2, 1.1), dolly(-1.2, 0.6)];
      settings = { aim: 'target', easing: 'linear', duration: 10 };
      break;
    case 'reveal-behind':
      points = Array.from({ length: 5 }, (_, i) =>
        orbit((1 - i / 4) * Math.PI * 0.75, 1.3 - (0.3 * i) / 4, -0.3 + (0.3 * i) / 4),
      );
      settings = { aim: 'target', easing: 'out', duration: 9 };
      break;
    default:
      return null;
  }
  const framingScale = { close: 0.72, medium: 1, wide: 1.35 }[framing] ?? 1;
  const strength = Math.min(Math.max(intensity, 0.25), 2);
  const origin = new THREE.Vector3()
    .fromArray(anchor.origin)
    .sub(focus)
    .multiplyScalar(framingScale)
    .add(focus);
  return {
    points: points.map((point) =>
      point
        .sub(focus)
        .multiplyScalar(framingScale)
        .add(focus)
        .sub(origin)
        .multiplyScalar(strength)
        .add(origin),
    ),
    settings,
  };
}
export function applyCameraPreset(
  rig,
  id,
  worldToLocal = (point) => point,
  makeId = () => createLocalId('waypoint'),
) {
  const result = buildCameraPreset(id, rig.anchor, rig.settings);
  if (!result) return rig;
  return {
    ...rig,
    bake: true,
    settings: {
      ...rig.settings,
      closed: CAMERA_PATH_DEFAULTS.closed,
      easing: CAMERA_PATH_DEFAULTS.easing,
      ...result.settings,
      presetId: id,
    },
    waypoints: result.points.map((point, i) => ({
      id: makeId(),
      name: `WP_${i + 1}`,
      transform: { ...identityTransform(), position: worldToLocal(point).toArray() },
    })),
  };
}
