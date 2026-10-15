import { useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createViewportEntityController } from '../viewport-entities.js';
import { applyViewportSelection, disposeViewportTransformControls } from '../viewport-controls.js';
import { disposeObjectTree, isObjectVisible, viewportEntityId } from '../scene-resources.js';
import { createCameraRigController } from '../camera/runtime.js';
import { cameraPreviewFrame } from '../camera/model.js';
import { renderViewportFrame } from '../viewport-frame.js';
import { createStudioMonitorController } from '../monitor/runtime.js';
import { createViewportLighting } from '../viewport-lighting.js';
import { createViewportNavigation } from '../viewport-navigation.js';
import { createViewportSelectionController } from '../viewport-selection.js';
import { createViewportInput } from '../viewport-input.js';
export function useViewportScene({ host, latest, runtime }) {
  useEffect(() => {
    const root = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      latest.current.onError?.('当前浏览器无法启动 3D 视口，请刷新重试');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    root.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101114');
    const lighting = createViewportLighting({ scene, renderer });
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(5, 4, 6);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.target.set(0, 1, 0);
    orbit.screenSpacePanning = true;
    orbit.dampingFactor = 0.12;
    orbit.rotateSpeed = 0.7;
    orbit.zoomSpeed = 0.85;
    orbit.minDistance = 0.05;
    orbit.maxDistance = Infinity;
    const gridHelper = new THREE.GridHelper(100, 100, 0x5b5d66, 0x2a2c32);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.7;
    scene.add(gridHelper);
    const axes = new THREE.AxesHelper(1.8);
    scene.add(axes);
    const content = new THREE.Group();
    scene.add(content);
    const cameraHelpers = new THREE.Group();
    scene.add(cameraHelpers);
    const entities = new Map();
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    const helper = transform.getHelper?.() || transform;
    scene.add(helper);
    transform.addEventListener('dragging-changed', (e) => {
      if (e.value) {
        runtime.current?.navigation.cancel();
        if (down) down.transformed = true;
      }
      orbit.enabled = !e.value;
      if (!e.value && transform.object) {
        const o = transform.object;
        latest.current.onTransform?.(viewportEntityId(o, content), {
          position: o.position.toArray(),
          rotation: [o.rotation.x, o.rotation.y, o.rotation.z].map((v) => (v * 180) / Math.PI),
          scale: o.scale.toArray(),
        });
      }
    });
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down;
    const start = (e) => {
      down =
        e.button === 0 && !e.altKey
          ? { x: e.clientX, y: e.clientY, transformed: transform.dragging }
          : null;
    };
    const click = (e) => {
      const gesture = down;
      down = null;
      if (
        !gesture ||
        gesture.transformed ||
        input.isNavigatingPointer(e) ||
        e.button !== 0 ||
        Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 4 ||
        transform.dragging
      )
        return;
      const r = root.getBoundingClientRect();
      const activeCamera =
        runtime.current?.cameraController.renderCamera(
          latest.current.viewMode,
          latest.current.time,
          latest.current.cameraTimeline?.duration,
          camera,
        ) || camera;
      const frame =
        activeCamera === camera
          ? { left: 0, top: 0, width: r.width, height: r.height }
          : cameraPreviewFrame(r.width, r.height, activeCamera.aspect);
      const x = e.clientX - r.left - frame.left,
        y = e.clientY - r.top - frame.top;
      if (x < 0 || x > frame.width || y < 0 || y > frame.height) return;
      pointer.set((x / frame.width) * 2 - 1, (-y / frame.height) * 2 + 1);
      raycaster.setFromCamera(pointer, activeCamera);
      const hit = raycaster
        .intersectObjects(
          [...content.children, ...(activeCamera === camera ? [cameraHelpers] : [])],
          true,
        )
        .find((h) => isObjectVisible(h.object));
      let helperId = null;
      for (let node = hit?.object; node && node !== content; node = node.parent) {
        if (
          node.userData.studioPickerId &&
          node.parent &&
          (node.parent === cameraHelpers || node.parent.parent === cameraHelpers)
        ) {
          helperId = node.userData.studioPickerId;
          break;
        }
      }
      latest.current.onSelect?.(helperId || viewportEntityId(hit?.object, content));
    };
    renderer.domElement.addEventListener('pointerdown', start);
    renderer.domElement.addEventListener('pointerup', click);
    const cancelPointer = () => {
      down = null;
    };
    renderer.domElement.addEventListener('pointercancel', cancelPointer);
    const resize = () => {
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    let animation;
    const renderFrame = () => renderViewportFrame(rt, latest.current);
    const render = (now = performance.now()) => {
      animation = requestAnimationFrame(render);
      rt.navigation.tick(now);
      renderFrame();
      rt.monitorController.tick(latest.current, now);
      if (now - lastViewUpdate >= 80) {
        lastViewUpdate = now;
        const view = rt.navigation.state();
        const quaternion = camera.quaternion.toArray().map((n) => Math.round(n * 1000) / 1000);
        const state = { ...view, quaternion };
        const signature = JSON.stringify(state);
        if (signature !== lastViewSignature) {
          lastViewSignature = signature;
          latest.current.onViewChange?.(state);
        }
      }
    };
    let lastViewUpdate = -Infinity,
      lastViewSignature = '';
    const rt = {
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
      renderFrame,
    };
    rt.navigation = createViewportNavigation(rt);
    rt.selectionController = createViewportSelectionController({ scene, content, entities });
    const input = createViewportInput({
      element: renderer.domElement,
      orbit,
      navigation: rt.navigation,
    });
    rt.monitorController = createStudioMonitorController(rt);
    rt.cameraController = createCameraRigController({ content, entities, helpers: cameraHelpers });
    rt.entityController = createViewportEntityController({
      content,
      entities,
      transform,
      onChange: () => {
        if (runtime.current === rt) {
          rt.cameraController.reconcile(
            latest.current.cameraPaths,
            latest.current.cameraTimeline,
            rt.entityController.exportAnimations(),
          );
          applyViewportSelection(rt, latest.current);
        }
      },
      onError: (message) => {
        if (runtime.current === rt) latest.current.onError?.(message);
      },
      onLoading: (count) => {
        if (runtime.current === rt) latest.current.onModelLoading?.(count);
      },
      onAnimations: (id, clips) => {
        if (runtime.current === rt) latest.current.onAnimations?.(id, clips);
      },
      onHierarchy: (id, subtree) => {
        if (runtime.current === rt) latest.current.onHierarchy?.(id, subtree);
      },
      onCameraData: (id, data) => {
        if (runtime.current === rt) latest.current.onCameraData?.(id, data);
      },
    });
    runtime.current = rt;
    render();
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      rt.monitorController.dispose();
      rt.navigation.dispose();
      rt.selectionController.dispose();
      input.dispose();
      rt.cameraController.dispose();
      rt.entityController.dispose();
      orbit.dispose();
      disposeViewportTransformControls(transform, helper);
      renderer.domElement.removeEventListener('pointerdown', start);
      renderer.domElement.removeEventListener('pointerup', click);
      renderer.domElement.removeEventListener('pointercancel', cancelPointer);
      lighting.dispose();
      disposeObjectTree(scene);
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [host, latest, runtime]);
}
