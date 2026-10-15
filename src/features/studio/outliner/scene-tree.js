import * as THREE from 'three';
import { studioNodeId, studioNodePath } from './model.js';
import { radians } from '../model.js';
import { applyMaterialProperties, materialSnapshot } from '../material.js';

const lightType = (node) =>
  node.isDirectionalLight ? 'directional' : node.isSpotLight ? 'spot' : 'point';

const lightProperties = (node) =>
  node.isLight
    ? {
        lightType: lightType(node),
        intensity: Number.isFinite(node.intensity) ? node.intensity : 8,
        ...(node.isDirectionalLight
          ? {}
          : { range: Number.isFinite(node.distance) ? node.distance : 12 }),
        ...(node.isSpotLight
          ? {
              angle: THREE.MathUtils.radToDeg(node.angle),
              penumbra: Number.isFinite(node.penumbra) ? node.penumbra : 0.1,
            }
          : {}),
        castShadow: node.castShadow === true,
      }
    : {};

const applyLightProperties = (node, value = {}) => {
  if (!node.isLight) return;
  if (Number.isFinite(value.intensity)) node.intensity = Math.max(0, value.intensity);
  if (value.castShadow !== undefined) node.castShadow = value.castShadow === true;
  if (!node.isDirectionalLight && Number.isFinite(value.range))
    node.distance = Math.max(0, value.range);
  if (node.isSpotLight) {
    if (Number.isFinite(value.angle))
      node.angle = THREE.MathUtils.degToRad(Math.max(1, Math.min(179, value.angle)));
    if (Number.isFinite(value.penumbra)) node.penumbra = Math.max(0, Math.min(1, value.penumbra));
  }
};

/** Holds only runtime node references. The document keeps the serializable metadata/edits. */
export function createStudioSceneTree(scene, ownerId) {
  const nodes = new Map(),
    metadata = [],
    parents = new Map();
  const animated = new Map();
  for (const clip of scene.animations || [])
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      let node = THREE.PropertyBinding.findNode(scene, binding.nodeName);
      if (binding.objectName === 'bones')
        node =
          node?.skeleton?.getBoneByName(binding.objectIndex) ||
          node?.skeleton?.bones[binding.objectIndex];
      if (!node) continue;
      const property = binding.propertyName === 'quaternion' ? 'rotation' : binding.propertyName;
      const properties = animated.get(node) || new Set();
      properties.add(property);
      animated.set(node, properties);
    }
  delete scene.userData.studioNodeId;
  const visit = (node, path) => {
    const id = studioNodeId(ownerId, path);
    node.userData.studioNodeId = id;
    if (node.isCamera) node.userData.hf_id ||= id;
    node.userData.studioAnimatedProperties = [...(animated.get(node) || [])];
    nodes.set(id, node);
    parents.set(id, node.parent || scene);
    const sourceMaterial = node.isMesh ? materialSnapshot(node) : null;
    metadata.push({
      path,
      name: node.name,
      type: node.isCamera ? 'camera' : node.isLight ? 'light' : node.isMesh ? 'mesh' : 'group',
      position: node.position.toArray(),
      rotation: [node.rotation.x, node.rotation.y, node.rotation.z].map(
        (value) => (value * 180) / Math.PI,
      ),
      scale: node.scale.toArray(),
      visible: node.visible !== false,
      animatedProperties: [...(animated.get(node) || [])],
      ...(sourceMaterial || {}),
      ...(node.isPerspectiveCamera ? { fov: node.fov } : {}),
      ...lightProperties(node),
    });
    node.children.forEach((child, index) => visit(child, [...path, index]));
  };
  scene.children.forEach((node, index) => visit(node, [index]));
  return {
    nodes,
    metadata,
    apply(edits = {}) {
      const deleted = new Set();
      for (const source of metadata) {
        const path = source.path;
        if (
          path.some((_, index) => edits[studioNodePath(path.slice(0, index + 1))]?.deleted === true)
        )
          deleted.add(studioNodeId(ownerId, path));
      }
      for (const source of metadata) {
        const node = nodes.get(studioNodeId(ownerId, source.path));
        const override = edits[studioNodePath(source.path)] || {};
        const edited = { ...source, ...override };
        const id = studioNodeId(ownerId, source.path),
          parent = parents.get(id) || scene;
        if (deleted.has(id)) {
          node.removeFromParent();
          node.visible = false;
          continue;
        }
        if (node.parent !== parent) parent.add(node);
        const expectedIndex = source.path.at(-1),
          currentIndex = parent.children.indexOf(node);
        if (currentIndex >= 0 && currentIndex !== expectedIndex) {
          parent.children.splice(currentIndex, 1);
          parent.children.splice(Math.min(expectedIndex, parent.children.length), 0, node);
        }
        node.name = edited.name;
        node.visible = edited.visible !== false;
        if (source.color !== undefined) applyMaterialProperties(node, source);
        if (
          source.color !== undefined &&
          Object.keys(override).some((key) =>
            ['color', 'metallic', 'roughness', 'opacity', 'transparent', 'depthWrite'].includes(
              key,
            ),
          )
        ) {
          const materialOverride = { ...override };
          // The source's mutation derives transparency from the new alpha. A
          // persisted explicit transparent value still wins when present.
          if ('opacity' in override && !('transparent' in override))
            materialOverride.transparent = Number(override.opacity) < 1;
          applyMaterialProperties(node, materialOverride);
        }
        applyLightProperties(node, source);
        applyLightProperties(node, override);
        if (
          node.isPerspectiveCamera &&
          Number.isFinite(edited.fov) &&
          edited.fov > 0 &&
          edited.fov < 180
        ) {
          node.fov = edited.fov;
          node.updateProjectionMatrix();
        }
        for (const property of ['position', 'rotation', 'scale']) {
          if (source.animatedProperties.includes(property)) continue;
          const value = edited[property];
          if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
            continue;
          if (property === 'rotation') node.rotation.set(...value.map(radians));
          else node[property].fromArray(value);
        }
      }
    },
  };
}
