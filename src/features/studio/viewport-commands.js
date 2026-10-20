import * as THREE from 'three';
import { createLocalId } from '../editor/model.js';
import { abortImportError, parseGlbBuffer, readGlbFile, throwIfImportAborted } from './glb.js';
import { disposeObjectTree } from './scene-resources.js';
import { animationMetadata } from './animation-model.js';
import { createStudioSceneTree } from './outliner/scene-tree.js';
import { readCameraScene } from './camera/scene.js';
import { createViewportNavigation } from './viewport-navigation.js';
import { renderViewportFrame } from './viewport-frame.js';

export function resolveVideoMimeType(MediaRecorderCtor = globalThis.MediaRecorder) {
  if (!MediaRecorderCtor) return null;
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorderCtor.isTypeSupported?.(type) !== false) || null;
}
const navigationFor = (rt) =>
  rt?.navigation || (rt && createViewportNavigation(rt, { duration: 0 }));
export function createViewportCommands(runtime) {
  return {
    capture() {
      const rt = runtime.current;
      if (!rt) return null;
      const camera =
        rt.cameraController?.renderCamera(rt.viewMode, rt.time, rt.duration, rt.camera) ||
        rt.camera;
      if (rt.renderFrame) rt.renderFrame();
      else rt.renderer.render(rt.scene, camera);
      return rt.renderer.domElement.toDataURL('image/png');
    },
    async exportVideo({ duration = 0, fps = 30, signal, onProgress } = {}) {
      const rt = runtime.current;
      const canvas = rt?.renderer?.domElement;
      const Recorder = globalThis.MediaRecorder;
      if (!rt || !canvas?.captureStream || !Recorder) throw Error('当前浏览器不支持视频导出');
      const mimeType = resolveVideoMimeType(Recorder);
      if (!mimeType) throw Error('当前浏览器不支持 WebM 视频导出');
      const total = Number.isFinite(duration) ? Math.max(0, Math.min(duration, 600)) : 0;
      if (!total) throw Error('请先添加动画，再导出视频');
      const stream = canvas.captureStream(fps);
      const chunks = [];
      const recorder = new Recorder(stream, { mimeType });
      const finished = new Promise((resolve, reject) => {
        recorder.ondataavailable = (event) => event.data?.size && chunks.push(event.data);
        recorder.onerror = () => reject(recorder.error || Error('视频导出失败'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      });
      const frameDelay = 1000 / Math.max(1, Math.min(60, fps));
      recorder.start();
      try {
        for (let index = 0; index <= Math.ceil(total * fps); index += 1) {
          if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
          const time = Math.min(total, index / fps);
          renderViewportFrame(rt, { ...rt.latest.current, time, playing: false });
          onProgress?.(time / total);
          if (index < Math.ceil(total * fps))
            await new Promise((resolve) => setTimeout(resolve, frameDelay));
        }
        recorder.stop();
        const blob = await finished;
        return { blob, mimeType, duration: total };
      } catch (error) {
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks?.().forEach((track) => track.stop?.());
        throw error;
      } finally {
        stream.getTracks?.().forEach((track) => track.stop?.());
      }
    },
    focus(id) {
      return navigationFor(runtime.current)?.frame(id) || false;
    },
    frameAll() {
      return navigationFor(runtime.current)?.frame() || false;
    },
    viewAxis(axis) {
      return navigationFor(runtime.current)?.axis(axis) || false;
    },
    resetView() {
      return navigationFor(runtime.current)?.reset() || false;
    },
    viewState() {
      return runtime.current?.navigation?.state() || null;
    },
    async exportGLB() {
      const rt = runtime.current;
      if (!rt) throw Error('视口未就绪');
      await rt.entityController.waitForReady();
      if (runtime.current !== rt || !rt.entityController.active) throw abortImportError();
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
      if (runtime.current !== rt || !rt.entityController.active) throw abortImportError();
      const timeline = rt.cameraController?.exportTimeline();
      if (timeline) {
        rt.content.traverse((node) => delete node.userData.blockingStudioTimeline);
        rt.content.userData.blockingStudioTimeline = JSON.stringify(timeline);
      }
      const buffer = await new GLTFExporter().parseAsync(rt.content, {
        binary: true,
        onlyVisible: false,
        animations:
          rt.cameraController?.exportClips(rt.entityController.exportAnimations()) ||
          rt.entityController.exportAnimations(),
      });
      if (runtime.current !== rt || !rt.entityController.active) throw abortImportError();
      return buffer;
    },
    async importGLB(file, { signal } = {}) {
      const rt = runtime.current;
      if (!rt) throw Error('视口未就绪');
      const { buffer, dataUrl } = await readGlbFile(file, { signal });
      if (runtime.current !== rt || !rt.entityController.active) throw abortImportError();
      const scene = await parseGlbBuffer(buffer, { signal });
      if (runtime.current !== rt || !rt.entityController.active || signal?.aborted) {
        disposeObjectTree(scene);
        throw abortImportError();
      }
      const spec = {
        id: createLocalId('import'),
        name: file.name,
        type: 'glb',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        dataUrl,
        clips: animationMetadata(scene.animations),
      };
      spec.subtree = createStudioSceneTree(scene, spec.id).metadata;
      spec.cameraData = readCameraScene(scene, spec.id);
      rt.entityController.stage(spec, scene);
      // The editor commits serializable state. Until then the model is staged,
      // so an interrupted import can never create an orphan visible entity.
      signal?.addEventListener('abort', () => rt.entityController.discardStage(spec.id), {
        once: true,
      });
      throwIfImportAborted(signal);
      return spec;
    },
    cameraPose() {
      const rt = runtime.current;
      if (!rt) return null;
      return {
        position: rt.camera.position.toArray(),
        rotation: [rt.camera.rotation.x, rt.camera.rotation.y, rt.camera.rotation.z].map(
          THREE.MathUtils.radToDeg,
        ),
        fov: rt.camera.fov,
      };
    },
    cameraRigContext(id) {
      const rt = runtime.current,
        camera = rt?.entities.get(id);
      if (!camera) return null;
      const bounds = new THREE.Box3().setFromObject(rt.content);
      const focus = bounds.isEmpty()
        ? rt.orbit.target.clone()
        : bounds.getCenter(new THREE.Vector3());
      return {
        origin: camera.getWorldPosition(new THREE.Vector3()).toArray(),
        focus: focus.toArray(),
      };
    },
    worldToCameraPath(id, position) {
      return runtime.current?.cameraController
        ?.worldToPath(id, new THREE.Vector3().fromArray(position))
        .toArray();
    },
  };
}
