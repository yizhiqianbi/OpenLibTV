import * as THREE from 'three';
import { restoreCameraRig } from './restore.js';
import {
  cameraPathProgress,
  cameraPathSettings,
  cameraPathSpan,
  normalizeCameraShots,
  parseCameraTimeline,
} from './model.js';

export const cameraEntitySnapshot = (node) => ({
  id: node.userData.studioNodeId || node.userData.entityId || node.uuid,
  stableId: node.userData.hf_id,
  name: node.name,
  visible: node.visible !== false,
  transform: {
    position: node.position.toArray(),
    rotation: node.quaternion.toArray(),
    scale: node.scale.toArray(),
  },
});
export function applyCameraEntity(node, state) {
  node.name = state.name;
  node.visible = state.visible !== false;
  if (state.stableId || state.id) node.userData.hf_id = state.stableId || state.id;
  node.position.fromArray(state.transform.position);
  node.quaternion.fromArray(state.transform.rotation).normalize();
  node.scale.fromArray(state.transform.scale);
}
/** Source camera rig extras contain Object3D transforms; runtime UUIDs are never document IDs. */
export function readCameraScene(scene, ownerId) {
  const rigs = [],
    cameras = new Map();
  let timeline = null;
  scene.traverse((node) => {
    if (node.isCamera) cameras.set(node.userData.hf_id, cameraEntitySnapshot(node).id);
    timeline ||= parseCameraTimeline(node.userData.blockingStudioTimeline);
  });
  scene.traverse((group) => {
    const name = group.userData.blockingStudioPathFor;
    if (typeof name !== 'string') return;
    const camera = scene.getObjectByName(name);
    if (!camera?.isCamera) return;
    const waypoints = group.children
      .filter((node) => node.userData.blockingStudioWaypoint === true)
      .sort(
        (a, b) =>
          (a.userData.blockingStudioWaypointIndex || 0) -
          (b.userData.blockingStudioWaypointIndex || 0),
      );
    if (waypoints.length < 2) return;
    let aim = null,
      focus = null;
    group.traverse((node) => {
      if (node.userData.blockingStudioPathAim === true) aim ||= node;
      if (node.userData.blockingStudioPathFocus === true) focus ||= node;
    });
    const origin = camera.getWorldPosition(new THREE.Vector3()),
      target = aim?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3();
    const saved = group.userData.blockingStudioPathAnchor;
    const validPoint = (point) =>
      Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
    const anchor =
      validPoint(saved?.origin) && validPoint(saved?.focus)
        ? {
            origin: [...saved.origin],
            focus: [...saved.focus],
            radius: Number.isFinite(saved.radius) && saved.radius > 1e-4 ? saved.radius : 1,
          }
        : {
            origin: origin.toArray(),
            focus: target.toArray(),
            radius: origin.distanceTo(target) || 1,
          };
    rigs.push({
      ...cameraEntitySnapshot(group),
      sourceOwnerId: ownerId,
      cameraId: cameraEntitySnapshot(camera).id,
      cameraStableId: camera.userData.hf_id,
      settings: cameraPathSettings(group.userData.blockingStudioPath),
      anchor,
      waypoints: waypoints.map(cameraEntitySnapshot),
      aim: aim ? cameraEntitySnapshot(aim) : null,
      focus: focus ? cameraEntitySnapshot(focus) : null,
      focusParent: focus?.parent === aim ? 'aim' : 'path',
      bake: false,
    });
  });
  scene.traverse((camera) => {
    if (!camera.isCamera || rigs.some((rig) => rig.cameraId === cameraEntitySnapshot(camera).id))
      return;
    const restored = restoreCameraRig(scene, camera, cameraEntitySnapshot(camera).id, ownerId);
    if (restored) rigs.push(restored);
  });
  let aspect = null;
  scene.traverse((node) => {
    if (Number.isFinite(node.userData.libtvProjectAspect) && node.userData.libtvProjectAspect > 0)
      aspect ||= node.userData.libtvProjectAspect;
  });
  if (!aspect)
    scene.traverse((node) => {
      if (
        node.isPerspectiveCamera &&
        Number.isFinite(node.userData.blockingStudioAspect || node.aspect)
      )
        aspect ||= node.userData.blockingStudioAspect || node.aspect;
    });
  return {
    aspect,
    rigs,
    timeline: timeline
      ? {
          ...timeline,
          shots: timeline.shots.flatMap((shot) =>
            cameras.has(shot.cameraId) ? [{ ...shot, cameraId: cameras.get(shot.cameraId) }] : [],
          ),
        }
      : inferCameraTimeline(scene),
  };
}

/** Source eiI: marker cuts, then camera animation spans, then the first camera. */
export function inferCameraTimeline(scene) {
  const cameras = [];
  scene.traverse((node) => {
    if (node.isCamera) cameras.push(node);
  });
  const clips = scene.animations || [],
    duration = Math.min(600, Math.max(0, ...clips.map((clip) => clip.duration)));
  if (!cameras.length || !duration) return null;
  const extras = scene.userData;
  const markers =
    extras.gltfExtensions?.WEBGI_animation_markers?.markers ||
    extras.markers ||
    extras.cameraMarkers ||
    extras.camera_markers ||
    extras.timelineMarkers ||
    [];
  const fps = Number.isFinite(extras.fps) && extras.fps > 0 ? extras.fps : 24;
  const cuts = markers
    .flatMap((marker) => {
      const time =
        marker.time ?? marker.t ?? (Number.isFinite(marker.frame) ? marker.frame / fps : null);
      const camera =
        typeof marker.camera === 'number'
          ? cameras[marker.camera]
          : cameras.find((camera) => camera.name === (marker.camera || marker.cameraName));
      return Number.isFinite(time) && time >= 0 && time < duration && camera
        ? [{ cameraId: cameraEntitySnapshot(camera).id, time }]
        : [];
    })
    .sort((a, b) => a.time - b.time);
  if (cuts.length)
    return {
      version: 1,
      duration,
      shots: normalizeCameraShots(
        cuts.map((cut, index) => ({
          cameraId: cut.cameraId,
          start: cut.time,
          end: cuts[index + 1]?.time ?? duration,
        })),
        duration,
      ),
    };
  const normalize = (name) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .replace(/action$/, '');
  const spans = new Map(),
    byName = new Map(cameras.map((camera) => [normalize(camera.name), camera]));
  const add = (camera, start, end) => {
    const current = spans.get(camera);
    spans.set(camera, {
      cameraId: cameraEntitySnapshot(camera).id,
      start: Math.min(current?.start ?? start, start),
      end: Math.max(current?.end ?? end, end),
    });
  };
  for (const clip of clips) {
    let matched = false;
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const found = THREE.PropertyBinding.findNode(scene, binding.nodeName);
      const camera = found?.isCamera
        ? found
        : byName.get(normalize(binding.nodeName.split('/').at(-1)));
      if (!camera || !track.times.length) continue;
      matched = true;
      add(camera, Math.max(track.times[0], 0), Math.min(track.times.at(-1), duration));
    }
    if (!matched && byName.has(normalize(clip.name)))
      add(byName.get(normalize(clip.name)), 0, Math.min(clip.duration, duration));
  }
  const shots = normalizeCameraShots(
    cameras.flatMap((camera) => (spans.has(camera) ? [spans.get(camera)] : [])),
    duration,
  );
  return {
    version: 1,
    duration,
    shots: shots.length
      ? shots
      : [{ cameraId: cameraEntitySnapshot(cameras[0]).id, start: 0, end: duration }],
  };
}

export function cameraPathCurve(group, settings) {
  const waypoints = group.children
    .filter((node) => node.userData.blockingStudioWaypoint === true)
    .sort(
      (a, b) => a.userData.blockingStudioWaypointIndex - b.userData.blockingStudioWaypointIndex,
    );
  if (waypoints.length < 2) return null;
  group.updateWorldMatrix(true, true);
  return new THREE.CatmullRomCurve3(
    waypoints.map((node) => node.getWorldPosition(new THREE.Vector3())),
    settings.closed && waypoints.length > 2,
    settings.curve,
    settings.tension,
  );
}
const normalizedName = (value) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
export function cameraPathTarget(root, name) {
  if (!name) return null;
  let match = root.getObjectByName(name);
  if (!match)
    root.traverse((node) => {
      if (!match && normalizedName(node.name) === normalizedName(name)) match = node;
    });
  return match;
}
export function cameraPathPose(curve, settings, progress, target) {
  const position = curve.getPointAt(Math.min(Math.max(progress, 0), 1));
  if (settings.aim === 'fixed') return { position, quaternion: null };
  const focus =
    settings.aim === 'target' && target
      ? target.getWorldPosition(new THREE.Vector3())
      : position.clone().add(curve.getTangentAt(progress));
  if (focus.distanceToSquared(position) < 1e-10) return { position, quaternion: null };
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(position, focus, new THREE.Vector3(0, 1, 0)),
  );
  if (settings.roll !== 0)
    quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        THREE.MathUtils.degToRad(settings.roll),
      ),
    );
  return { position, quaternion };
}
export function applyCameraPathPose(camera, pose) {
  if (camera.parent) {
    camera.parent.updateWorldMatrix(true, false);
    camera.position
      .copy(pose.position)
      .applyMatrix4(new THREE.Matrix4().copy(camera.parent.matrixWorld).invert());
    if (pose.quaternion)
      camera.quaternion.copy(
        camera.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(pose.quaternion),
      );
  } else {
    camera.position.copy(pose.position);
    if (pose.quaternion) camera.quaternion.copy(pose.quaternion);
  }
  camera.updateMatrixWorld(true);
}
/** Exact camera-only eo4 limits and sign continuity; no generic wrapper frames enter this clip. */
export function bakeCameraPath(
  root,
  group,
  camera,
  settings = cameraPathSettings(group.userData.blockingStudioPath),
) {
  const curve = cameraPathCurve(group, settings);
  if (!curve || !camera.name) return null;
  const span = cameraPathSpan(settings),
    speed = Math.abs(settings.speed) > 1e-4 ? Math.abs(settings.speed) : 1;
  const duration = Math.min(span / speed, 600),
    count = Math.min(2000, Math.max(2, Math.round(duration * 30) + 1));
  const target = cameraPathTarget(root, settings.targetName),
    inverse = new THREE.Matrix4(),
    parentRotation = new THREE.Quaternion();
  if (camera.parent) {
    camera.parent.updateWorldMatrix(true, false);
    inverse.copy(camera.parent.matrixWorld).invert();
    camera.parent.getWorldQuaternion(parentRotation).invert();
  }
  const times = [],
    positions = [],
    quaternions = [],
    fixed = camera.quaternion.clone();
  let previous;
  for (let i = 0; i < count; i++) {
    const time = (i / (count - 1)) * duration;
    const pathTime =
      settings.speed === 0 ? 0 : settings.speed < 0 ? span - time * speed : time * speed;
    const pose = cameraPathPose(
      curve,
      settings,
      cameraPathProgress(settings, pathTime, false),
      target,
    );
    const position = pose.position.applyMatrix4(inverse);
    const quaternion = pose.quaternion
      ? parentRotation.clone().multiply(pose.quaternion)
      : fixed.clone();
    if (previous && previous.dot(quaternion) < 0)
      quaternion.set(-quaternion.x, -quaternion.y, -quaternion.z, -quaternion.w);
    previous = quaternion;
    times.push(time);
    positions.push(...position.toArray());
    quaternions.push(...quaternion.toArray());
  }
  return new THREE.AnimationClip(`Path_${camera.name}`, duration, [
    new THREE.VectorKeyframeTrack(`${camera.uuid}.position`, times, positions),
    new THREE.QuaternionKeyframeTrack(`${camera.uuid}.quaternion`, times, quaternions),
  ]);
}
export function cameraTimelineForExport(content, timeline) {
  if (!timeline) return null;
  const byId = new Map();
  content.traverse((node) => {
    if (node.isCamera) byId.set(cameraEntitySnapshot(node).id, node.userData.hf_id);
  });
  const encoded = {
    version: 1,
    duration: timeline.duration,
    shots: timeline.shots.flatMap((shot) =>
      byId.has(shot.cameraId) ? [{ ...shot, cameraId: byId.get(shot.cameraId) }] : [],
    ),
  };
  return parseCameraTimeline(encoded);
}
