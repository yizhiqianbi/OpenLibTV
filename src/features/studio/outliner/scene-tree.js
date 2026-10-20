import * as THREE from 'three';
import { studioNodeCopyId, studioNodeId, studioNodePath } from './model.js';
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
  const copyNodeIds = new Set(),
    copyRoots = new Map();
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
    apply(edits = {}, nodeCopies = []) {
      for (const root of copyRoots.values()) root.removeFromParent();
      for (const id of copyNodeIds) nodes.delete(id);
      copyNodeIds.clear();
      copyRoots.clear();
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
      const cloneResources = (root) => {
        root.traverse((node) => {
          if (node.geometry?.clone) node.geometry = node.geometry.clone();
          if (Array.isArray(node.material))
            node.material = node.material.map((item) => item?.clone?.() || item);
          else if (node.material?.clone) node.material = node.material.clone();
        });
        return root;
      };
      for (const copy of Array.isArray(nodeCopies) ? nodeCopies : []) {
        const source = nodes.get(studioNodeId(ownerId, copy.sourcePath));
        if (!source?.parent || !copy?.id) continue;
        const clone = cloneResources(source.clone(true));
        const rootId = studioNodeCopyId(ownerId, copy.id);
        const sourcePosition = Array.isArray(copy.position)
          ? copy.position
          : source.position.toArray();
        clone.position.fromArray(sourcePosition);
        clone.name = copy.name || `${source.name} 副本`;
        clone.visible = copy.visible !== false;
        clone.userData = { ...clone.userData, studioNodeId: rootId, studioNodeCopyId: copy.id };
        const sourcePath = Array.isArray(copy.sourcePath) ? copy.sourcePath : [];
        const descendants = metadata.filter(
          (entry) =>
            entry.path.length >= sourcePath.length &&
            sourcePath.every((part, index) => entry.path[index] === part),
        );
        for (const entry of descendants) {
          const relativePath = entry.path.slice(sourcePath.length);
          const target = relativePath.reduce((node, index) => node?.children?.[index], clone);
          if (!target) continue;
          const id = studioNodeCopyId(ownerId, copy.id, relativePath);
          target.userData = { ...target.userData, studioNodeId: id, studioNodeCopyId: copy.id };
          copyNodeIds.add(id);
          nodes.set(id, target);
          const override = copy.edits?.[studioNodePath(relativePath)] || {};
          const edited = { ...entry, ...(relativePath.length === 0 ? copy : {}), ...override };
          target.name = edited.name || target.name;
          target.visible = edited.visible !== false;
          for (const property of ['position', 'rotation', 'scale']) {
            const value = edited[property];
            if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
              continue;
            if (property === 'rotation') target.rotation.set(...value.map(radians));
            else target[property].fromArray(value);
          }
        }
        source.parent.add(clone);
        copyRoots.set(copy.id, clone);
      }
      return nodes;
    },
    copyNodeIds,
  };
}
