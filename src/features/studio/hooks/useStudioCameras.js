import { useMemo, useState } from 'react';
import * as THREE from 'three';
import {
  addCameraWaypoint,
  cameraPathSettings,
  cameraPathSpan,
  createCameraRig,
  normalizeCameraShots,
  removeCameraWaypoint,
  trimCameraShots,
} from '../camera/model.js';
import { applyCameraPreset } from '../camera/presets.js';
import {
  cameraRigRows,
  cameraRowsWithoutDuplicatePaths,
  changeCameraRigEntity,
} from '../camera/presentation.js';

export function resolveCameraWaypointStep({ waypoints = [], stateId = null, time = 0, direction }) {
  const ordered = [...waypoints].sort((a, b) => a.time - b.time);
  if (!ordered.length || (direction !== 1 && direction !== -1)) return null;
  if (stateId) {
    const index = ordered.findIndex((waypoint) => waypoint.id === stateId);
    return index >= 0 ? ordered[index + direction] || null : null;
  }
  if (direction > 0) return ordered.find((waypoint) => waypoint.time > time) || null;
  let previous = null;
  for (const waypoint of ordered) {
    if (waypoint.time >= time) break;
    previous = waypoint;
  }
  return previous;
}

export function useStudioCameras({
  baseRows,
  cameraPaths,
  setCameraPaths,
  cameraTimeline,
  setCameraTimeline,
  duration,
  setDuration,
  time,
  setTime,
  setPlaying,
  setViewMode,
  setWorkspace,
  selected,
  setSelected,
  record,
  viewport,
  baseAnimationDuration = 0,
}) {
  const [editor, setEditor] = useState(null);
  const cameras = baseRows.filter((row) => row.type === 'camera');
  const cameraIds = new Set(cameras.map((camera) => camera.id));
  const validPaths = cameraPaths.filter((rig) => cameraIds.has(rig.cameraId));
  const rows = useMemo(
    () => [
      ...cameraRowsWithoutDuplicatePaths(baseRows, cameraPaths),
      ...cameraRigRows(cameraPaths),
    ],
    [baseRows, cameraPaths],
  );
  const shots = cameraTimeline
    ? cameraTimeline.shots.filter((shot) => cameraIds.has(shot.cameraId))
    : normalizeCameraShots(
        validPaths.map((rig) => ({
          cameraId: rig.cameraId,
          start: 0,
          end: Math.min(
            cameraPathSpan(rig.settings) /
              (Math.abs(rig.settings.speed) > 1e-4 ? Math.abs(rig.settings.speed) : 1),
            600,
          ),
        })),
        duration,
      );
  const editorRig = validPaths.find((rig) => rig.id === editor?.pathId);
  const activeRig =
    editorRig &&
    [
      editorRig.id,
      editorRig.cameraId,
      ...editorRig.waypoints.map((waypoint) => waypoint.id),
      editorRig.aim?.id,
      editorRig.focus?.id,
    ].includes(selected)
      ? editorRig
      : null;
  const commitRig = (next) => {
    const before = cameraPaths.find((rig) => rig.id === next.id);
    record();
    setCameraPaths((rigs) => rigs.map((rig) => (rig.id === next.id ? next : rig)));
    const oldSpan = before ? cameraPathSpan(before.settings) : 0,
      span = cameraPathSpan(next.settings);
    if (oldSpan !== span) {
      if (
        cameraTimeline?.shots.length === 1 &&
        cameraTimeline.shots[0].cameraId === next.cameraId &&
        cameraTimeline.shots[0].start === 0 &&
        cameraTimeline.shots[0].end === cameraTimeline.duration
      ) {
        setCameraTimeline({
          version: 1,
          duration: span,
          shots: [{ cameraId: next.cameraId, start: 0, end: span }],
        });
        setDuration(span);
      } else if (!cameraTimeline)
        setDuration(
          Math.max(
            span,
            baseAnimationDuration,
            ...validPaths
              .filter((rig) => rig.id !== next.id)
              .map((rig) => cameraPathSpan(rig.settings)),
            0.1,
          ),
        );
      setTime((value) => Math.min(value, span));
    }
    setPlaying(false);
  };
  const openCamera = (id) => {
    const camera = cameras.find((camera) => camera.id === id);
    if (!camera) return;
    let rig = cameraPaths.find((rig) => rig.cameraId === id);
    if (!rig) {
      const context = viewport.current?.cameraRigContext?.(id);
      rig = createCameraRig(
        camera,
        context?.origin || camera.position,
        context?.focus || [0, 1, 0],
        duration,
      );
      record();
      setCameraPaths((rigs) => [...rigs, rig]);
    }
    setEditor({ pathId: rig.id, stateId: null, view: 'clip' });
    setSelected(id);
    setPlaying(false);
  };
  const selectState = (state) => {
    if (!activeRig) return;
    setEditor({ pathId: activeRig.id, stateId: state.id, view: 'keyframe' });
    setSelected(state.id);
    setTime(state.time);
    setPlaying(false);
  };
  const addState = () => {
    if (!activeRig) return;
    const origin = viewport.current?.cameraRigContext?.(activeRig.cameraId)?.origin;
    const point = origin ? viewport.current?.worldToCameraPath?.(activeRig.id, origin) : null;
    const last = activeRig.waypoints.at(-1),
      previous = activeRig.waypoints.at(-2);
    const position =
      point ||
      last.transform.position.map(
        (value, index) => value + (value - previous.transform.position[index]),
      );
    const next = addCameraWaypoint(activeRig, time, position);
    commitRig(next.rig);
    setEditor({ pathId: activeRig.id, stateId: next.id, view: 'keyframe' });
    setSelected(next.id);
  };
  const removeState = () => {
    if (!activeRig || !editor?.stateId) return;
    const next = removeCameraWaypoint(activeRig, editor.stateId);
    if (next === activeRig) return;
    commitRig(next);
    setEditor({ pathId: activeRig.id, stateId: null, view: 'clip' });
    setSelected(activeRig.cameraId);
  };
  /** Move the active camera path selection to the adjacent source waypoint. */
  const stepState = (direction) => {
    const next = resolveCameraWaypointStep({
      waypoints: activeRig?.waypoints,
      stateId: editor?.stateId,
      time,
      direction,
    });
    if (!next) return false;
    selectState(next);
    return true;
  };
  const preset = (id) => {
    if (!activeRig) return;
    const next = applyCameraPreset(activeRig, id, (point) => {
      const position = viewport.current?.worldToCameraPath?.(activeRig.id, point.toArray());
      return position ? new THREE.Vector3().fromArray(position) : point;
    });
    if (next === activeRig) return;
    commitRig(next);
    setEditor({ pathId: activeRig.id, stateId: null, view: 'clip' });
    setSelected(activeRig.cameraId);
  };
  const patchEntity = (id, changes) => {
    const rig = cameraPaths.find(
      (rig) =>
        rig.id === id ||
        rig.waypoints.some((waypoint) => waypoint.id === id) ||
        rig.aim?.id === id ||
        rig.focus?.id === id,
    );
    if (!rig) return false;
    commitRig(changeCameraRigEntity(rig, id, changes));
    return true;
  };
  const selectShot = (shot) => {
    setTime(shot.start);
    setPlaying(false);
    setWorkspace('animation');
    setViewMode('film');
    openCamera(shot.cameraId);
  };
  const trimShot = (index, edge, value) => {
    const next = trimCameraShots(shots, index, edge, value, duration);
    setCameraTimeline({ version: 1, duration, shots: next });
    setTime(
      edge === 'start' ? next[index].start : Math.max(next[index].end - 0.05, next[index].start),
    );
    setPlaying(false);
  };
  const refreshCameraData = (ownerId, data) => {
    if (!data) return;
    setCameraPaths((rigs) => {
      const extra = (data.rigs || []).filter(
        (rig) =>
          !rigs.some((existing) => existing.id === rig.id || existing.cameraId === rig.cameraId),
      );
      return extra.length
        ? [...rigs, ...extra.map((rig) => ({ ...rig, sourceOwnerId: ownerId }))]
        : rigs;
    });
    if (data.timeline?.shots.length) {
      setCameraTimeline((existing) => existing || data.timeline);
      setDuration((value) => (cameraTimeline ? value : Math.max(value, data.timeline.duration)));
    }
  };
  return {
    rows,
    cameras,
    validPaths,
    shots,
    timeline: { version: 1, duration, shots },
    editor,
    activeRig,
    setEditor,
    close: () => {
      setSelected(activeRig?.cameraId || null);
      setEditor(null);
    },
    openCamera,
    commitRig,
    selectState,
    stepState,
    addState,
    removeState,
    preset,
    patchEntity,
    selectShot,
    trimShot,
    refreshCameraData,
    patchRotation: (rotation) => {
      if (activeRig)
        commitRig({
          ...activeRig,
          bake: true,
          fixedRotation: new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad)))
            .toArray(),
        });
    },
    patchSettings: (changes) => {
      if (activeRig)
        commitRig({
          ...activeRig,
          bake: true,
          settings: cameraPathSettings({ ...activeRig.settings, ...changes }),
        });
    },
  };
}
