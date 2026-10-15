/** Release owned geometry, material, texture and bitmap resources once per tree. */
export function disposeObjectTree(root) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    images = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
    if (object.skeleton?.boneTexture) textures.add(object.skeleton.boneTexture);
  });
  for (const texture of textures) {
    for (const image of Array.isArray(texture.image) ? texture.image : [texture.image])
      if (image) images.add(image);
    texture.dispose();
  }
  for (const image of images) image.close?.();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function isObjectVisible(object) {
  for (let current = object; current; current = current.parent)
    if (current.visible === false) return false;
  return true;
}

/** Imported extras may contain older IDs; the owned top-level root is authoritative. */
export function viewportEntityId(object, content) {
  let nodeId;
  for (let current = object; current; current = current.parent) {
    nodeId ||= current.userData.studioNodeId;
    if (current.parent === content) {
      if (current.userData.blockingStudioPathFor && typeof nodeId === 'string') return nodeId;
      const ownerId = current.userData.entityId;
      return typeof nodeId === 'string' && nodeId.startsWith(`${ownerId}:node:`)
        ? nodeId
        : ownerId || null;
    }
  }
  return null;
}
