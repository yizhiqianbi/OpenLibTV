import * as THREE from 'three';
import { parseGlbDataUrl, abortImportError } from './glb.js';
import { disposeObjectTree } from './scene-resources.js';
import {
  applyLightProperties,
  createPrimitiveEntity,
  ensureLightType,
} from './viewport-primitives.js';
import { radians } from './model.js';
import { createImportedAnimations } from './imported-animations.js';
import { createStudioSceneTree } from './outliner/scene-tree.js';
import { readCameraScene } from './camera/scene.js';
import { applyMaterialProperties } from './material.js';

export const isImportedObject = (spec) => ['glb', 'imported'].includes(spec.type) || !!spec.dataUrl;
const sourceFor = (spec) => (isImportedObject(spec) ? spec.dataUrl : `primitive:${spec.type}`);

/** Owns attached entities and pending parses for one viewport runtime. */
export function createViewportEntityController({
  content,
  entities,
  transform,
  onChange,
  onError,
  onLoading,
  onAnimations,
  onHierarchy,
  onCameraData,
  parseImported = parseGlbDataUrl,
  createPrimitive = createPrimitiveEntity,
}) {
  let active = true,
    desired = new Map(),
    reportedError = '';
  const entries = new Map(),
    jobs = new Map(),
    staged = new Map(),
    failures = new Map();
  const colorsFor = (object) => {
    const colors = new Map();
    object.traverse((child) => {
      for (const material of Array.isArray(child.material) ? child.material : [child.material])
        if (material?.color) colors.set(material, material.color.clone());
    });
    return colors;
  };
  const update = (entry, spec) => {
    entry.object.visible = spec.visible !== false;
    entry.object.name = spec.name;
    entry.object.position.fromArray(spec.position || [0, 0, 0]);
    entry.object.rotation.set(...(spec.rotation || [0, 0, 0]).map(radians));
    entry.object.scale.fromArray(spec.scale || [1, 1, 1]);
    entry.tree?.apply(spec.nodeEdits);
    if (
      entry.tree &&
      transform.object &&
      [...entry.tree.nodes.values()].includes(transform.object) &&
      !entry.object.getObjectByProperty('uuid', transform.object.uuid)
    )
      transform.detach();
    if (spec.type === 'camera') {
      entry.object.fov = spec.fov || 45;
      entry.object.updateProjectionMatrix();
      return;
    }
    if (spec.type === 'light') {
      ensureLightType(entry.object, spec);
      applyLightProperties(entry.object, spec);
    }
    if (!isImportedObject(spec)) {
      entry.object.traverse((node) => applyMaterialProperties(node, spec));
    }
    if (isImportedObject(spec) && !spec.color) return;
    for (const [material] of entry.colors) material.color.set(spec.color || '#bfc2c9');
  };
  const notify = () => {
    if (!active) return;
    const message = [...failures]
      .filter(([id]) => desired.has(id))
      .map(([id, failure]) => `模型“${desired.get(id).name}”加载失败：${failure.error.message}`)
      .join('；');
    if (message !== reportedError) {
      reportedError = message;
      onError?.(message);
    }
    onLoading?.(jobs.size);
    onChange?.();
  };
  const attach = (spec, scene, source) => {
    const object = isImportedObject(spec) ? new THREE.Group() : scene;
    if (isImportedObject(spec)) object.add(scene);
    object.userData.entityId = spec.id;
    object.userData.hf_id = spec.id;
    object.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const animation = isImportedObject(spec) ? createImportedAnimations(scene) : null;
    const tree = isImportedObject(spec) ? createStudioSceneTree(scene, spec.id) : null;
    const entry = { object, source, colors: colorsFor(object), animation, tree };
    update(entry, spec);
    content.add(object);
    entries.set(spec.id, entry);
    entities.set(spec.id, object);
    for (const [id, node] of tree?.nodes || []) entities.set(id, node);
    if (animation) onAnimations?.(spec.id, animation.metadata);
    if (tree) onHierarchy?.(spec.id, tree.metadata);
    if (tree) onCameraData?.(spec.id, readCameraScene(scene, spec.id));
  };
  const remove = (id) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (
      transform.object === entry.object ||
      [...(entry.tree?.nodes.values() || [])].includes(transform.object)
    )
      transform.detach();
    content.remove(entry.object);
    entities.delete(id);
    for (const nodeId of entry.tree?.nodes.keys() || []) entities.delete(nodeId);
    entries.delete(id);
    entry.animation?.dispose();
    disposeObjectTree(entry.object);
  };
  const start = (spec, source) => {
    const job = { source, abort: new AbortController() };
    jobs.set(spec.id, job);
    job.promise = Promise.resolve()
      .then(() => parseImported(source, { signal: job.abort.signal }))
      .then((scene) => {
        if (
          !active ||
          jobs.get(spec.id) !== job ||
          !desired.has(spec.id) ||
          sourceFor(desired.get(spec.id)) !== source
        ) {
          disposeObjectTree(scene);
          return;
        }
        jobs.delete(spec.id);
        attach(desired.get(spec.id), scene, source);
        notify();
      })
      .catch((error) => {
        if (!active || jobs.get(spec.id) !== job) return;
        jobs.delete(spec.id);
        if (error.name !== 'AbortError') failures.set(spec.id, { source, error });
        notify();
      });
  };
  const controller = {
    get active() {
      return active;
    },
    stage(spec, scene) {
      if (!active) {
        disposeObjectTree(scene);
        throw abortImportError();
      }
      const previous = staged.get(spec.id);
      if (previous) disposeObjectTree(previous.scene);
      staged.set(spec.id, { source: sourceFor(spec), scene });
    },
    discardStage(id) {
      const entry = staged.get(id);
      if (!entry) return;
      staged.delete(id);
      disposeObjectTree(entry.scene);
    },
    reconcile(specs) {
      if (!active) return;
      desired = new Map(specs.map((spec) => [spec.id, spec]));
      for (const [id, job] of jobs)
        if (!desired.has(id) || sourceFor(desired.get(id)) !== job.source) {
          jobs.delete(id);
          job.abort.abort();
        }
      for (const [id, failure] of failures)
        if (!desired.has(id) || sourceFor(desired.get(id)) !== failure.source) failures.delete(id);
      for (const [id, entry] of entries)
        if (!desired.has(id) || sourceFor(desired.get(id)) !== entry.source) remove(id);
      for (const spec of specs) {
        const source = sourceFor(spec),
          entry = entries.get(spec.id);
        if (entry) {
          update(entry, spec);
          continue;
        }
        const prepared = staged.get(spec.id);
        if (prepared && prepared.source !== source) controller.discardStage(spec.id);
        if (prepared && prepared.source === source) {
          staged.delete(spec.id);
          attach(spec, prepared.scene, source);
        } else if (isImportedObject(spec)) {
          if (!jobs.has(spec.id) && !failures.has(spec.id)) start(spec, source);
        } else attach(spec, createPrimitive(spec), source);
      }
      notify();
    },
    retry() {
      failures.clear();
      controller.reconcile([...desired.values()]);
    },
    seekAnimations(time, selection = null) {
      if (!active) return;
      for (const [id, entry] of entries)
        entry.animation?.seek(
          time,
          selection ? (selection.objectId === id ? selection.index : false) : null,
        );
    },
    exportAnimations() {
      return [...entries.values()].flatMap((entry) => entry.animation?.exportClips() || []);
    },
    async waitForReady() {
      while (active && jobs.size)
        await Promise.allSettled([...jobs.values()].map((job) => job.promise));
      if (!active) throw abortImportError();
      if (failures.size) throw new Error('模型尚未成功载入，请重新导入后导出');
    },
    dispose() {
      if (!active) return;
      active = false;
      for (const job of jobs.values()) job.abort.abort();
      jobs.clear();
      for (const id of entries.keys()) remove(id);
      for (const entry of staged.values()) disposeObjectTree(entry.scene);
      staged.clear();
      failures.clear();
      desired.clear();
    },
  };
  return controller;
}
