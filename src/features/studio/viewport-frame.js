import { Vector2 } from 'three';
import { radians, transformAt } from './model.js';
import { viewportEntityId } from './scene-resources.js';
import { cameraPreviewFrame } from './camera/model.js';

/** Borrows one live viewport runtime; resource setup, RAF and disposal stay in useViewportScene. */
export function renderViewportFrame(runtime, data) {
  const {
    scene,
    camera,
    renderer,
    orbit,
    transform,
    entities,
    content,
    gridHelper,
    cameraHelpers,
    axes,
    helper,
  } = runtime;
  const [ratioWidth, ratioHeight] = (data.ratio || '16:9').split(':').map(Number);
  const aspect = ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 16 / 9;
  content.userData.libtvProjectAspect = aspect;
  content.traverse((node) => {
    if (node.isPerspectiveCamera) {
      node.aspect = aspect;
      node.userData.blockingStudioAspect = aspect;
      node.updateProjectionMatrix();
    }
  });
  gridHelper.visible = data.grid;
  axes.visible = data.grid;
  runtime.entityController.seekAnimations(data.time, data.animationSelection);
  if (!transform.dragging) {
    for (const spec of data.objects) {
      const object = entities.get(spec.id);
      if (!object) continue;
      const tr = transformAt(spec, data.frames, data.time);
      object.position.fromArray(tr.position);
      object.rotation.set(...tr.rotation.map(radians));
      object.scale.fromArray(tr.scale);
    }
  }
  runtime.cameraController.seek(
    data.time,
    data.selected,
    transform.dragging ? viewportEntityId(transform.object, content) : null,
  );
  const activeCamera =
    runtime.cameraController.renderCamera(
      data.viewMode,
      data.time,
      data.cameraTimeline?.duration,
      camera,
    ) || camera;
  orbit.enabled = activeCamera === camera && !transform.dragging;
  transform.enabled = activeCamera === camera;
  if (orbit.enabled) orbit.update();
  runtime.selectionController?.update({ visible: activeCamera === camera });
  const helpersVisible = cameraHelpers.visible,
    transformVisible = helper.visible;
  if (activeCamera !== camera) {
    cameraHelpers.visible = false;
    helper.visible = false;
    gridHelper.visible = false;
    axes.visible = false;
  }
  try {
    const size = renderer.getSize(new Vector2());
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    if (activeCamera !== camera) {
      const frame = cameraPreviewFrame(size.x, size.y, aspect);
      renderer.setClearColor('#090a0c', 1);
      renderer.clear();
      renderer.setViewport(
        frame.left,
        size.y - frame.top - frame.height,
        frame.width,
        frame.height,
      );
      renderer.setScissor(frame.left, size.y - frame.top - frame.height, frame.width, frame.height);
      renderer.setScissorTest(true);
    }
    renderer.render(scene, activeCamera);
  } finally {
    renderer.setScissorTest(false);
    cameraHelpers.visible = helpersVisible;
    helper.visible = transformVisible;
  }
}
