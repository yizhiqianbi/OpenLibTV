import * as THREE from 'three';
import { applyMaterialProperties } from './material.js';

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);

const lightConstructor = (type) =>
  type === 'directional'
    ? THREE.DirectionalLight
    : type === 'spot'
      ? THREE.SpotLight
      : THREE.PointLight;

const normalizedLightType = (value) =>
  ['directional', 'point', 'spot'].includes(value) ? value : 'point';

export function ensureLightType(root, spec = {}) {
  const type = normalizedLightType(spec.lightType),
    current = root.children.find((child) => child.isLight),
    matches =
      (type === 'directional' && current?.isDirectionalLight) ||
      (type === 'point' && current?.isPointLight) ||
      (type === 'spot' && current?.isSpotLight);
  if (matches) return current;
  if (current) root.remove(current);
  const Light = lightConstructor(type),
    light = new Light(spec.color || '#fff4d2', 8, 12);
  root.add(light);
  return light;
}

export function applyLightProperties(root, spec = {}) {
  const lightType = normalizedLightType(spec.lightType);
  root.traverse((node) => {
    if (!node.isLight) return;
    node.color.set(spec.color || '#fff4d2');
    node.intensity = Math.max(0, finite(spec.intensity, 8));
    node.castShadow = spec.castShadow !== false;
    if (node.isDirectionalLight) return;
    node.distance = Math.max(0, finite(spec.range, 12));
    if (node.isSpotLight) {
      node.angle = THREE.MathUtils.degToRad(Math.max(1, Math.min(179, finite(spec.angle, 45))));
      node.penumbra = Math.max(0, Math.min(1, finite(spec.penumbra, 0.1)));
      node.decay = 2;
      node.updateMatrixWorld?.();
    }
  });
  root.userData.lightType = lightType;
}

export function createPrimitiveEntity(spec) {
  let object;
  const material =
    spec.type === 'light'
      ? null
      : new THREE.MeshStandardMaterial({
          color: spec.color || '#bfc2c9',
          roughness: Number.isFinite(spec.roughness) ? spec.roughness : 0.62,
          metalness: Number.isFinite(spec.metallic) ? spec.metallic : 0,
          opacity: Number.isFinite(spec.opacity) ? spec.opacity : 1,
          transparent: spec.transparent === true || Number(spec.opacity) < 1,
          depthWrite: spec.depthWrite !== false,
        });
  if (spec.type === 'character') {
    object = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.65, 8, 24), material);
    body.position.y = 0.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 24), material);
    head.position.y = 1.5;
    object.add(body, head);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 6, 20), material);
      leg.position.set(side * 0.13, 0.35, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 6, 20), material);
      arm.position.set(side * 0.32, 1.01, 0);
      arm.rotation.z = side * 0.2;
      object.add(leg, arm);
    }
  } else if (spec.type === 'camera') {
    material.dispose();
    object = new THREE.PerspectiveCamera(spec.fov || 45, 16 / 9, 0.01, 1000);
  } else if (spec.type === 'light') {
    object = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: spec.color || '#fff4d2' }),
    );
    ensureLightType(object, spec);
  } else {
    const geometry =
      spec.type === 'sphere'
        ? new THREE.SphereGeometry(0.5, 48, 32)
        : spec.type === 'cylinder'
          ? new THREE.CylinderGeometry(0.4, 0.4, 1, 64)
          : spec.type === 'plane'
            ? new THREE.PlaneGeometry(3, 3)
            : new THREE.BoxGeometry(1, 1, 1);
    object = new THREE.Mesh(geometry, material);
    if (spec.type === 'plane') object.rotation.x = -Math.PI / 2;
  }
  object.userData.entityId = spec.id;
  object.name = spec.name;
  object.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  object.traverse((o) => applyMaterialProperties(o, spec));
  if (spec.type === 'light') applyLightProperties(object, spec);

  return object;
}
