import * as THREE from 'three';
import { studioRowRelations } from '../outliner/model.js';

export function cameraRigRows(rigs) {
  const rows = [];
  for (const rig of rigs) {
    const row = (entity, type, depth, parentId) => ({
      id: entity.id,
      ownerId: rig.id,
      name: entity.name,
      type,
      depth,
      parentId,
      subtree: true,
      cameraRig: true,
      position: entity.transform.position,
      rotation: new THREE.Euler()
        .setFromQuaternion(new THREE.Quaternion().fromArray(entity.transform.rotation))
        .toArray()
        .slice(0, 3)
        .map(THREE.MathUtils.radToDeg),
      scale: entity.transform.scale,
      visible: entity.visible !== false,
    });
    rows.push(row(rig, 'path', 0, null));
    for (const waypoint of rig.waypoints) rows.push(row(waypoint, 'waypoint', 1, rig.id));
    if (rig.aim) rows.push(row(rig.aim, 'aim', 1, rig.id));
    if (rig.focus)
      rows.push(
        row(
          rig.focus,
          'focus',
          rig.focusParent === 'aim' && rig.aim ? 2 : 1,
          rig.focusParent === 'aim' && rig.aim ? rig.aim.id : rig.id,
        ),
      );
  }
  return studioRowRelations(rows);
}
export function cameraRowsWithoutDuplicatePaths(rows, rigs) {
  const sourceIds = rigs.filter((rig) => rig.sourceOwnerId).map((rig) => rig.id);
  return rows.filter(
    (row) => !sourceIds.some((id) => row.id === id || row.id.startsWith(id + '.')),
  );
}
export function changeCameraRigEntity(rig, id, changes) {
  const patch = (entity) => {
    if (!entity || entity.id !== id) return entity;
    const transform = { ...entity.transform };
    for (const key of ['position', 'scale']) if (changes[key]) transform[key] = [...changes[key]];
    if (changes.rotation)
      transform.rotation = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(...changes.rotation.map(THREE.MathUtils.degToRad)))
        .toArray();
    return {
      ...entity,
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.visible === undefined ? {} : { visible: changes.visible }),
      transform,
    };
  };
  const old = [rig, ...rig.waypoints, rig.aim, rig.focus].find((item) => item?.id === id);
  const base = patch(rig);
  return {
    ...base,
    settings:
      changes.name && old?.name === rig.settings.targetName
        ? { ...rig.settings, targetName: changes.name }
        : rig.settings,
    bake: true,
    waypoints: rig.waypoints.map(patch),
    aim: patch(rig.aim),
    focus: patch(rig.focus),
  };
}
