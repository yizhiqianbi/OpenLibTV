import * as THREE from 'three';

const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_MATERIAL = Object.freeze({
  color: '#bfc2c9',
  metallic: 0,
  roughness: 0.62,
  opacity: 1,
  transparent: false,
  depthWrite: true,
});

export const firstMaterial = (node) =>
  Array.isArray(node?.material) ? node.material[0] : node?.material;

/** Read the source renderer's first-material mutation payload without sharing Three objects. */
export function materialSnapshot(node) {
  const material = firstMaterial(node);
  if (!material) return null;
  const opacity = clamp(finite(material.opacity, 1), 0, 1);
  return {
    color: material.color?.getHexString
      ? `#${material.color.getHexString()}`
      : DEFAULT_MATERIAL.color,
    metallic: clamp(finite(material.metalness, DEFAULT_MATERIAL.metallic), 0, 1),
    roughness: clamp(finite(material.roughness, DEFAULT_MATERIAL.roughness), 0, 1),
    opacity,
    transparent: material.transparent === true,
    depthWrite: material.depthWrite !== false,
  };
}

function standardMaterial(node) {
  const material = firstMaterial(node);
  if (!material) return null;
  if (material instanceof THREE.MeshStandardMaterial) return material;
  // The source mutation upgrades unsupported mesh materials before applying its
  // baseColor/metallic/roughness payload. Preserve material-array shape locally
  // so secondary primitives continue to render with their own source material.
  const replacement = new THREE.MeshStandardMaterial();
  if (Array.isArray(node.material)) node.material[0] = replacement;
  else node.material = replacement;
  material.dispose?.();
  return replacement;
}

/** Apply serializable material fields to the first material of a mesh. */
export function applyMaterialProperties(node, value = {}) {
  if (!node?.isMesh) return;
  const material = standardMaterial(node);
  if (!material) return;
  if (typeof value.color === 'string') {
    try {
      material.color.set(value.color);
    } catch {
      // Keep the last valid color when a local document contains malformed data.
    }
  }
  if (Number.isFinite(value.metallic)) material.metalness = clamp(value.metallic, 0, 1);
  if (Number.isFinite(value.roughness)) material.roughness = clamp(value.roughness, 0, 1);
  if (Number.isFinite(value.opacity)) material.opacity = clamp(value.opacity, 0, 1);
  if (value.transparent !== undefined) material.transparent = value.transparent === true;
  if (value.depthWrite !== undefined) material.depthWrite = value.depthWrite !== false;
  material.needsUpdate = true;
}

export function materialPatch(value = {}) {
  const next = {};
  if (typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color))
    next.color = value.color.toLowerCase();
  for (const key of ['metallic', 'roughness', 'opacity'])
    if (Number.isFinite(value[key])) next[key] = clamp(value[key], 0, 1);
  if (value.transparent !== undefined && typeof value.transparent === 'boolean')
    next.transparent = value.transparent;
  if (value.depthWrite !== undefined && typeof value.depthWrite === 'boolean')
    next.depthWrite = value.depthWrite;
  return next;
}
