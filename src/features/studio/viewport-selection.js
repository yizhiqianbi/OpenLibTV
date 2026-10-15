import { Box3, Box3Helper } from 'three';
import { isObjectVisible } from './scene-resources.js';

/** One viewport-owned helper; document content and its materials are only borrowed. */
export function createViewportSelectionController({ scene, content, entities }) {
  const box = new Box3(),
    nodeBox = new Box3();
  const helper = new Box3Helper(box, '#ff983d');
  helper.name = 'Studio selection bounds';
  helper.visible = false;
  helper.frustumCulled = false;
  helper.renderOrder = 10;
  helper.material.depthTest = false;
  helper.material.depthWrite = false;
  helper.material.toneMapped = false;
  scene.add(helper);
  let selected = null,
    active = true;

  const belongsToContent = (object) => {
    for (let node = object; node; node = node.parent) if (node === content) return true;
    return false;
  };
  const includeVisibleBounds = (node) => {
    if (!node.visible) return;
    if (node.geometry?.getAttribute('position')) {
      // Skinning changes the live mesh's bounds without changing its geometry. Both
      // routines reuse their existing Box3 and scratch vectors after the first call.
      if (node.isSkinnedMesh || node.isInstancedMesh) node.computeBoundingBox();
      const source = node.boundingBox !== undefined ? node : node.geometry;
      if (!source.boundingBox) source.computeBoundingBox();
      if (source.boundingBox) {
        nodeBox.copy(source.boundingBox).applyMatrix4(node.matrixWorld);
        box.union(nodeBox);
      }
    }
    for (const child of node.children) includeVisibleBounds(child);
  };

  return {
    helper,
    setSelection(id) {
      if (!active) return;
      selected = id;
      // Never leave the previous selection visible until the next evaluated frame.
      helper.visible = false;
    },
    update({ visible = true } = {}) {
      if (!active) return;
      helper.visible = false;
      box.makeEmpty();
      const object = entities.get(selected);
      if (!visible || !object || !belongsToContent(object) || !isObjectVisible(object)) return;
      object.updateWorldMatrix(true, true);
      includeVisibleBounds(object);
      if (box.isEmpty()) return;
      // Flat meshes still need a readable box; padding also prevents surface z-fighting.
      box.expandByScalar(0.015);
      helper.visible = true;
      helper.updateMatrixWorld(true);
    },
    dispose() {
      if (!active) return;
      active = false;
      selected = null;
      helper.visible = false;
      helper.removeFromParent();
      helper.dispose();
    },
  };
}
