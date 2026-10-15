import * as THREE from 'three';
import {
  applyCameraEntity,
  applyCameraPathPose,
  bakeCameraPath,
  cameraEntitySnapshot,
  cameraPathCurve,
  cameraPathPose,
  cameraPathTarget,
  cameraTimelineForExport,
} from './scene.js';
import { cameraAtTime, cameraPathProgress } from './model.js';
import { disposeObjectTree, isObjectVisible } from '../scene-resources.js';

const marker = (id, color = 0x7cc4ff) => {
  const node = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.08),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  node.userData.studioPickerId = id;
  node.renderOrder = 999;
  return node;
};
const transformBackup = (root) => {
  const values = [];
  root.traverse((node) =>
    values.push({
      node,
      snapshot: cameraEntitySnapshot(node),
      userData: { ...node.userData },
      children: [...node.children],
    }),
  );
  return () => {
    for (const { node, snapshot, userData, children } of values) {
      applyCameraEntity(node, snapshot);
      node.userData = { ...userData };
      for (const child of [...node.children]) if (!children.includes(child)) node.remove(child);
      for (const child of children) node.add(child);
    }
  };
};

const updateCurve = (entry) => {
  entry.group.updateWorldMatrix(true, true);
  const points = entry.rig.waypoints.map((waypoint) =>
    entry.nodes.get(waypoint.id).getWorldPosition(new THREE.Vector3()).toArray(),
  );
  const signature = JSON.stringify([
    points,
    entry.rig.settings.curve,
    entry.rig.settings.closed,
    entry.rig.settings.tension,
  ]);
  if (signature === entry.curveSignature) return;
  entry.curveSignature = signature;
  entry.curve = cameraPathCurve(entry.group, entry.rig.settings);
  entry.geometry.setFromPoints(
    entry.curve ? entry.curve.getSpacedPoints(Math.min(Math.max(48 * points.length, 96), 640)) : [],
  );
  entry.geometry.computeBoundingSphere();
};

/** Owns source rig nodes, camera-only playback clips and disposable preview helpers. */
export function createCameraRigController({ content, entities, helpers = new THREE.Group() }) {
  const entries = new Map(),
    cameraMarkers = new Map();
  let active = true,
    timeline = null,
    originalClips = [];
  const animatedCamera = (camera) =>
    originalClips.some((clip) =>
      clip.tracks.some((track) => {
        const binding = THREE.PropertyBinding.parseTrackName(track.name);
        return (
          ['position', 'quaternion'].includes(binding.propertyName) &&
          THREE.PropertyBinding.findNode(content, binding.nodeName) === camera
        );
      }),
    );
  const remove = (id) => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.mixer?.stopAllAction();
    entry.mixer?.uncacheRoot(content);
    if (entry.borrowed) entry.restore();
    else entry.group.removeFromParent();
    for (const [nodeId, node] of entry.nodes)
      if (!entry.borrowed || nodeId !== entry.group.userData.studioNodeId) {
        if (entities.get(nodeId) === node) entities.delete(nodeId);
      }
    if (entry.borrowed)
      for (const [nodeId, node] of entry.originalNodes) entities.set(nodeId, node);
    disposeObjectTree(entry.preview);
    entry.preview.removeFromParent();
    entries.delete(id);
  };
  const controller = {
    reconcile(rigs = [], nextTimeline = null, clips = []) {
      if (!active) return;
      timeline = nextTimeline;
      originalClips = clips;
      for (const id of entries.keys()) if (!rigs.some((rig) => rig.id === id)) remove(id);
      for (const rig of rigs) {
        const camera = entities.get(rig.cameraId);
        if (!camera?.isCamera) continue;
        let entry = entries.get(rig.id);
        if (entry && entry.camera !== camera) {
          remove(rig.id);
          entry = null;
        }
        if (!entry) {
          const existing = entities.get(rig.id),
            group = existing || new THREE.Group();
          const preview = new THREE.Group(),
            geometry = new THREE.BufferGeometry(),
            material = new THREE.LineBasicMaterial({ color: 0x7cc4ff, depthTest: false });
          const line = new THREE.Line(geometry, material);
          line.renderOrder = 998;
          preview.add(line);
          helpers.add(preview);
          if (!existing) content.add(group);
          entry = {
            group,
            camera,
            borrowed: !!existing,
            originalNodes: existing
              ? new Map(
                  [...entities].filter(([, node]) => {
                    let current = node;
                    while (current) {
                      if (current === group) return true;
                      current = current.parent;
                    }
                    return false;
                  }),
                )
              : new Map(),
            restore: existing ? transformBackup(group) : () => {},
            nodes: new Map(),
            preview,
            geometry,
            line,
            markers: new Map(),
            signature: '',
          };
          entries.set(rig.id, entry);
        }
        if (rig.fixedRotation) camera.quaternion.fromArray(rig.fixedRotation);
        const signature = JSON.stringify([
          rig,
          rig.settings.aim === 'fixed' ? camera.quaternion.toArray() : null,
        ]);
        const changed = signature !== entry.signature;
        entry.signature = signature;
        entry.rig = rig;
        applyCameraEntity(entry.group, rig);
        entry.group.userData.blockingStudioPathFor = camera.name;
        entry.group.userData.blockingStudioPath = { ...rig.settings };
        entry.group.userData.blockingStudioPathAnchor = { ...rig.anchor };
        entry.group.userData.studioNodeId = rig.id;
        camera.userData.hf_id ||= rig.cameraStableId || rig.cameraId;
        const previousNodes = entry.nodes;
        entry.nodes = new Map([[rig.id, entry.group]]);
        entities.set(rig.id, entry.group);
        const attach = (state, parent, flags = {}) => {
          if (!state) return null;
          const node =
            previousNodes.get(state.id) || entities.get(state.id) || new THREE.Object3D();
          applyCameraEntity(node, state);
          Object.assign(node.userData, flags, { studioNodeId: state.id });
          parent.add(node);
          entry.nodes.set(state.id, node);
          entities.set(state.id, node);
          return node;
        };
        rig.waypoints.forEach((state, index) =>
          attach(state, entry.group, {
            blockingStudioWaypoint: true,
            blockingStudioWaypointIndex: index,
          }),
        );
        const aim = attach(rig.aim, entry.group, { blockingStudioPathAim: true });
        attach(rig.focus, rig.focusParent === 'aim' && aim ? aim : entry.group, {
          blockingStudioPathFocus: true,
        });
        for (const [id, node] of previousNodes)
          if (!entry.nodes.has(id)) {
            node.removeFromParent();
            if (entities.get(id) === node) entities.delete(id);
          }
        for (const child of [...entry.group.children])
          if (
            child.userData.blockingStudioWaypoint &&
            !rig.waypoints.some((state) => state.id === child.userData.studioNodeId)
          )
            child.removeFromParent();
        for (const [id, icon] of entry.markers)
          if (!entry.nodes.has(id)) {
            icon.removeFromParent();
            disposeObjectTree(icon);
            entry.markers.delete(id);
          }
        for (const [id] of entry.nodes)
          if (id !== rig.id && !entry.markers.has(id)) {
            const icon = marker(id);
            entry.preview.add(icon);
            entry.markers.set(id, icon);
          }
        updateCurve(entry);
        if (!changed) continue;
        entry.mixer?.stopAllAction();
        entry.mixer?.uncacheRoot(content);
        entry.clip = rig.bake ? bakeCameraPath(content, entry.group, camera, rig.settings) : null;
        if (entry.clip) {
          entry.mixer = new THREE.AnimationMixer(content);
          entry.action = entry.mixer.clipAction(entry.clip).setLoop(THREE.LoopOnce, 1).play();
          entry.action.clampWhenFinished = true;
        } else {
          entry.mixer = null;
          entry.action = null;
        }
      }
    },
    seek(time, selected, draggingId) {
      if (!active) return;
      for (const entry of entries.values()) {
        const { rig, camera } = entry;
        updateCurve(entry);
        if (entry.action && draggingId !== rig.cameraId) {
          entry.action.enabled = true;
          entry.action.paused = false;
          entry.action.time = Math.max(0, Math.min(time, entry.clip.duration));
          entry.mixer.update(0);
        } else if (
          entry.curve &&
          rig.settings.enabled &&
          !animatedCamera(camera) &&
          draggingId !== rig.cameraId
        ) {
          applyCameraPathPose(
            camera,
            cameraPathPose(
              entry.curve,
              rig.settings,
              cameraPathProgress(rig.settings, time),
              cameraPathTarget(content, rig.settings.targetName),
            ),
          );
        }
        entry.preview.visible =
          isObjectVisible(entry.group) &&
          (selected === rig.id || entry.nodes.has(selected) || selected === rig.cameraId);
        for (const [id, icon] of entry.markers) {
          const node = entry.nodes.get(id);
          icon.position.copy(node.getWorldPosition(new THREE.Vector3()));
        }
      }
      const cameras = new Map();
      content.traverse((node) => {
        if (node.isCamera) cameras.set(cameraEntitySnapshot(node).id, node);
      });
      for (const [id, icon] of cameraMarkers)
        if (!cameras.has(id)) {
          icon.removeFromParent();
          disposeObjectTree(icon);
          cameraMarkers.delete(id);
        }
      for (const [id, camera] of cameras) {
        let icon = cameraMarkers.get(id);
        if (!icon) {
          icon = new THREE.Group();
          icon.userData.studioPickerId = id;
          const material = new THREE.MeshBasicMaterial({ color: 0x3b8fcb });
          icon.add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.45), material));
          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12), material);
          lens.rotation.x = Math.PI / 2;
          lens.position.z = -0.31;
          icon.add(lens);
          cameraMarkers.set(id, icon);
          helpers.add(icon);
        }
        icon.position.copy(camera.getWorldPosition(new THREE.Vector3()));
        icon.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
        icon.visible = isObjectVisible(camera);
      }
    },
    renderCamera(viewMode, time, duration, fallback) {
      const id =
        viewMode === 'film' ? cameraAtTime(timeline?.shots || [], time, duration) : viewMode;
      const camera = entities.get(id);
      return camera?.isCamera ? camera : fallback;
    },
    exportClips(originalClips) {
      const clips = [...originalClips];
      for (const entry of entries.values()) {
        const baked = entry.rig.bake
          ? entry.clip
          : entry.rig.settings.enabled && !animatedCamera(entry.camera)
            ? bakeCameraPath(content, entry.group, entry.camera, entry.rig.settings)
            : null;
        if (!baked) continue;
        for (let i = clips.length - 1; i >= 0; i--) {
          const tracks = clips[i].tracks.filter(
            (track) =>
              ![`${entry.camera.uuid}.position`, `${entry.camera.uuid}.quaternion`].includes(
                track.name,
              ),
          );
          if (tracks.length === clips[i].tracks.length) continue;
          if (!tracks.length) clips.splice(i, 1);
          else {
            const copy = clips[i].clone();
            copy.tracks = tracks;
            clips[i] = copy;
          }
        }
        clips.push(baked.clone());
      }
      return clips;
    },
    exportTimeline() {
      return cameraTimelineForExport(content, timeline);
    },
    worldToPath(id, point) {
      const entry = entries.get(id);
      return entry ? entry.group.worldToLocal(point.clone()) : point.clone();
    },
    cameraOrigin(id) {
      return entities.get(id)?.getWorldPosition(new THREE.Vector3());
    },
    dispose() {
      if (!active) return;
      active = false;
      for (const id of entries.keys()) remove(id);
      for (const icon of cameraMarkers.values()) {
        icon.removeFromParent();
        disposeObjectTree(icon);
      }
      cameraMarkers.clear();
    },
  };
  return controller;
}
