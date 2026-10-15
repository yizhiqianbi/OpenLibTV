// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { glbBufferToDataUrl, parseGlbBuffer } from '../glb.js';
import { createViewportEntityController } from '../viewport-entities.js';
import { createViewportCommands } from '../viewport-commands.js';
import { createStudioSceneTree } from '../outliner/scene-tree.js';
import { createCameraGlb } from '../fixtures/camera-glb.js';
import { createCameraRigController } from './runtime.js';
import {
  applyCameraPathPose,
  bakeCameraPath,
  cameraPathCurve,
  cameraPathPose,
  inferCameraTimeline,
  readCameraScene,
} from './scene.js';
import { cameraPathSettings, createCameraRig } from './model.js';
import { viewportEntityId } from '../scene-resources.js';

class Reader {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result = glbBufferToDataUrl(await blob.arrayBuffer());
    this.onloadend?.();
  }
}
afterEach(() => vi.unstubAllGlobals());

async function loadFixture() {
  const content = new THREE.Group(),
    entities = new Map(),
    helpers = new THREE.Group();
  let data;
  const entityController = createViewportEntityController({
    content,
    entities,
    transform: { detach: vi.fn() },
    onCameraData: (_id, value) => {
      data = value;
    },
  });
  const object = {
    id: 'imported',
    type: 'glb',
    name: 'Cameras.glb',
    dataUrl: glbBufferToDataUrl(createCameraGlb()),
    position: [2, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  entityController.reconcile([object]);
  await entityController.waitForReady();
  const cameraController = createCameraRigController({ content, entities, helpers });
  cameraController.reconcile(data.rigs, data.timeline, entityController.exportAnimations());
  return { content, entities, helpers, entityController, cameraController, data, object };
}

describe('actual source-shaped camera rig lifecycle', () => {
  it('seeks real arc-length camera poses and switches the actual shot camera across a cut', async () => {
    const rt = await loadFixture(),
      rig = rt.data.rigs[0],
      camera = rt.entities.get(rig.cameraId);
    const path = rt.entities.get(rig.id),
      curve = cameraPathCurve(path, rig.settings);
    rt.cameraController.seek(3, rig.id);
    expect(
      camera.getWorldPosition(new THREE.Vector3()).distanceTo(curve.getPointAt(0.5)),
    ).toBeLessThan(1e-6);
    const target = rt.content.getObjectByName(rig.aim.name).getWorldPosition(new THREE.Vector3());
    const direction = camera.getWorldDirection(new THREE.Vector3());
    expect(
      direction.dot(target.sub(camera.getWorldPosition(new THREE.Vector3())).normalize()),
    ).toBeCloseTo(1);
    const fallback = new THREE.PerspectiveCamera();
    expect(rt.cameraController.renderCamera('film', 2.99, 6, fallback)).toBe(camera);
    expect(rt.cameraController.renderCamera('film', 3, 6, fallback)).toBe(
      rt.entities.get(rt.data.rigs[1].cameraId),
    );
    expect(rt.cameraController.renderCamera('orbit', 3, 6, fallback)).toBe(fallback);
    expect(rt.helpers.children.length).toBeGreaterThan(0);
    expect(rt.content.children).not.toContain(rt.helpers);
    rt.cameraController.dispose();
    rt.entityController.dispose();
    expect(rt.helpers.children).toHaveLength(0);
  });

  it('bakes only camera transforms at 30fps while respecting parent transform, reverse speed and quaternion continuity', async () => {
    const rt = await loadFixture(),
      rig = rt.data.rigs[0],
      group = rt.entities.get(rig.id),
      camera = rt.entities.get(rig.cameraId);
    const settings = cameraPathSettings({ ...rig.settings, duration: 2, speed: -2, roll: 20 });
    const clip = bakeCameraPath(rt.content, group, camera, settings);
    expect(clip.duration).toBe(1);
    expect(clip.tracks.map((track) => track.name)).toEqual([
      `${camera.uuid}.position`,
      `${camera.uuid}.quaternion`,
    ]);
    expect(clip.tracks[0].times).toHaveLength(31);
    const mixer = new THREE.AnimationMixer(rt.content),
      action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    action.time = 0;
    mixer.update(0);
    const curve = cameraPathCurve(group, settings);
    expect(
      camera.getWorldPosition(new THREE.Vector3()).distanceTo(curve.getPointAt(1)),
    ).toBeLessThan(1e-6);
    action.time = 1;
    mixer.update(0);
    expect(
      camera.getWorldPosition(new THREE.Vector3()).distanceTo(curve.getPointAt(0)),
    ).toBeLessThan(1e-6);
    const quaternions = clip.tracks[1].values;
    for (let index = 4; index < quaternions.length; index += 4)
      expect(
        new THREE.Quaternion()
          .fromArray(quaternions, index - 4)
          .dot(new THREE.Quaternion().fromArray(quaternions, index)),
      ).toBeGreaterThanOrEqual(0);
    expect(
      bakeCameraPath(rt.content, group, camera, { ...settings, speed: 1, duration: 1000 }).tracks[0]
        .times,
    ).toHaveLength(2000);
    const parent = new THREE.Group();
    parent.position.set(2, 3, 4);
    parent.rotation.y = 0.6;
    parent.scale.setScalar(2);
    parent.add(camera);
    rt.content.add(parent);
    const pose = cameraPathPose(curve, settings, 0.25, rt.content.getObjectByName(rig.aim.name));
    applyCameraPathPose(camera, pose);
    expect(camera.getWorldPosition(new THREE.Vector3()).distanceTo(pose.position)).toBeLessThan(
      1e-6,
    );
    mixer.stopAllAction();
    mixer.uncacheRoot(rt.content);
    rt.cameraController.dispose();
    rt.entityController.dispose();
  });

  it('exports source rig/timeline extras with stable IDs and reimports all camera clips plus untouched Slide/Grow and node edits', async () => {
    vi.stubGlobal('FileReader', Reader);
    const rt = await loadFixture();
    const edited = {
      ...rt.object,
      nodeEdits: { '0.0.0': { name: 'PreservedDetail', position: [0.8, 0, 0.5] } },
    };
    rt.entityController.reconcile([edited]);
    rt.cameraController.reconcile(
      rt.data.rigs.map((rig) => ({ ...rig, bake: true })),
      rt.data.timeline,
      rt.entityController.exportAnimations(),
    );
    rt.entityController.seekAnimations(1);
    rt.cameraController.seek(1);
    const buffer = await createViewportCommands({ current: rt }).exportGLB();
    const restored = await parseGlbBuffer(buffer);
    expect(restored.animations.map((clip) => clip.name)).toEqual([
      'Slide',
      'Grow',
      'Path_QA_Arc',
      'Path_QA_Truck',
    ]);
    expect(restored.getObjectByName('PreservedDetail').position.toArray()).toEqual([0.8, 0, 0.5]);
    createStudioSceneTree(restored, 'new-import');
    const data = readCameraScene(restored, 'new-import');
    expect(data.rigs).toHaveLength(2);
    expect(data.timeline).toMatchObject({ version: 1, duration: 6 });
    expect(data.timeline.shots.map((shot) => shot.cameraId)).toEqual(
      data.rigs.map((rig) => rig.cameraId),
    );
    expect(data.timeline.shots[0].cameraId).not.toBe(rt.data.timeline.shots[0].cameraId);
    expect(data.rigs.map((rig) => rig.cameraStableId)).toEqual(['qa-camera-a', 'qa-camera-b']);
    expect(data.rigs[0].waypoints).toHaveLength(3);
    const mixer = new THREE.AnimationMixer(restored);
    const clip = restored.animations.find((clip) => clip.name === 'Path_QA_Arc');
    mixer.clipAction(clip).play().time = 3;
    mixer.update(0);
    const camera = restored.getObjectByName('QA_Arc');
    expect(camera.position.x).toBeGreaterThan(5);
    let meshCount = 0;
    restored.traverse((node) => {
      if (node.isMesh) meshCount++;
    });
    expect(meshCount).toBe(3);
    rt.cameraController.dispose();
    rt.entityController.dispose();
    mixer.stopAllAction();
    mixer.uncacheRoot(restored);
  });

  it('preserves imported camera animation until the path is edited, then replaces only its camera tracks', async () => {
    const rt = await loadFixture(),
      rig = rt.data.rigs[0],
      camera = rt.entities.get(rig.cameraId),
      mesh = rt.content.getObjectByName('MovingTriangle');
    const source = new THREE.AnimationClip('Original', 6, [
      new THREE.VectorKeyframeTrack(`${camera.uuid}.position`, [0, 6], [0, 1, 2, 6, 1, 2]),
      new THREE.VectorKeyframeTrack(`${mesh.uuid}.position`, [0, 6], [0, 0, 0, 6, 0, 0]),
    ]);
    const mixer = new THREE.AnimationMixer(rt.content);
    mixer.clipAction(source).play().time = 2;
    mixer.update(0);
    const before = camera.position.clone();
    rt.cameraController.reconcile([rig], rt.data.timeline, [source]);
    rt.cameraController.seek(2);
    expect(camera.position.equals(before)).toBe(true);
    expect(rt.cameraController.exportClips([source])).toEqual([source]);
    rt.cameraController.reconcile([{ ...rig, bake: true }], rt.data.timeline, [source]);
    rt.cameraController.seek(2);
    expect(camera.position.equals(before)).toBe(false);
    const exported = rt.cameraController.exportClips([source]);
    expect(exported[0].tracks.map((track) => track.name)).toEqual([`${mesh.uuid}.position`]);
    expect(exported[1].name).toBe('Path_QA_Arc');
    mixer.stopAllAction();
    mixer.uncacheRoot(rt.content);
    rt.cameraController.dispose();
    rt.entityController.dispose();
  });

  it('restores borrowed source nodes and aliases on undo, reapplies rig edits after entity reconciliation and releases helpers once', async () => {
    const rt = await loadFixture(),
      rig = rt.data.rigs[0],
      originalId = rig.waypoints[0].id;
    const changed = {
      ...rig,
      bake: true,
      waypoints: rig.waypoints.map((point, index) =>
        index ? point : { ...point, transform: { ...point.transform, position: [9, 4, 3] } },
      ),
    };
    rt.cameraController.reconcile([changed], rt.data.timeline);
    expect(rt.entities.get(originalId).position.toArray()).toEqual([9, 4, 3]);
    rt.entityController.reconcile([rt.object]);
    rt.cameraController.reconcile([changed], rt.data.timeline);
    expect(rt.entities.get(originalId).position.toArray()).toEqual([9, 4, 3]);
    const geometry = rt.helpers.children[0].children[0].geometry,
      dispose = vi.spyOn(geometry, 'dispose');
    rt.cameraController.reconcile([], null);
    expect(rt.entities.get(originalId).position.toArray()).toEqual(
      rig.waypoints[0].transform.position,
    );
    expect(dispose).toHaveBeenCalledOnce();
    rt.cameraController.dispose();
    rt.cameraController.dispose();
    rt.entityController.dispose();
  });

  it('reconstructs source camera tracks without path extras as editable disabled states without overwriting the original clip', async () => {
    const scene = await parseGlbBuffer(createCameraGlb());
    for (const node of [...scene.children])
      if (node.userData.blockingStudioPathFor) node.removeFromParent();
    delete scene.userData.blockingStudioTimeline;
    const camera = scene.getObjectByName('QA_Arc');
    const original = new THREE.AnimationClip('ImportedCamera', 6, [
      new THREE.VectorKeyframeTrack(
        `${camera.uuid}.position`,
        [0, 3, 6],
        [1, 2, 3, 4, 4, 3, 7, 2, 3],
      ),
    ]);
    scene.animations.push(original);
    const tree = createStudioSceneTree(scene, 'camera-source');
    const first = readCameraScene(scene, 'camera-source'),
      second = readCameraScene(scene, 'camera-source');
    expect(first.rigs).toHaveLength(1);
    expect(first.rigs[0].id).toBe(second.rigs[0].id);
    expect(first.rigs[0].waypoints.map((state) => state.transform.position)).toEqual([
      [1, 2, 3],
      [4, 4, 3],
      [7, 2, 3],
    ]);
    expect(first.rigs[0]).toMatchObject({
      bake: false,
      settings: { enabled: false, easing: 'linear', aim: 'target', duration: 6 },
    });
    const entities = tree.nodes,
      controller = createCameraRigController({ content: scene, entities });
    controller.reconcile(first.rigs, first.timeline, scene.animations);
    expect(controller.exportClips(scene.animations)).toEqual(scene.animations);
    controller.reconcile([{ ...first.rigs[0], bake: true }], first.timeline, scene.animations);
    expect(controller.exportClips(scene.animations).map((clip) => clip.name)).toEqual([
      'Slide',
      'Grow',
      'Path_QA_Arc',
    ]);
    controller.dispose();
  });

  it('identifies created waypoint transforms and infers original clip cuts without a timeline envelope', () => {
    const content = new THREE.Group(),
      camera = new THREE.PerspectiveCamera();
    camera.name = 'Camera_A';
    camera.userData.entityId = 'cam';
    camera.userData.hf_id = 'cam';
    content.add(camera);
    const entities = new Map([['cam', camera]]),
      controller = createCameraRigController({ content, entities });
    let id = 0;
    const rig = createCameraRig(
      { id: 'cam', name: 'Camera_A' },
      [1, 2, 3],
      [0, 0, 0],
      4,
      () => `point-${++id}`,
    );
    controller.reconcile([rig]);
    expect(viewportEntityId(entities.get(rig.waypoints[0].id), content)).toBe(rig.waypoints[0].id);
    const second = new THREE.PerspectiveCamera();
    second.name = 'Camera_B';
    content.add(second);
    content.animations = [
      new THREE.AnimationClip('camera_a_action', 4, [
        new THREE.VectorKeyframeTrack(`${camera.uuid}.position`, [0, 4], [0, 0, 0, 1, 0, 0]),
      ]),
      new THREE.AnimationClip('Camera_B', 4, []),
    ];
    expect(inferCameraTimeline(content).shots.map((shot) => [shot.start, shot.end])).toEqual([
      [0, 2],
      [2, 4],
    ]);
    content.userData = {
      fps: 24,
      cameraMarkers: [
        { frame: 0, camera: 'Camera_A' },
        { frame: 48, camera: 1 },
      ],
    };
    expect(inferCameraTimeline(content).shots.map((shot) => shot.cameraId)).toEqual([
      'cam',
      second.uuid,
    ]);
    controller.dispose();
  });
});
