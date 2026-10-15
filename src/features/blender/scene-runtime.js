import * as THREE from 'three';
import { getSceneDefaults } from './scene-config.js';
import {
  calculatePreviewLayout,
  configureCamera,
  roundedRectangle,
  sweepEasing,
  updateParallaxCamera,
} from './scene-math.js';
import { createGroundReflection } from './reflection.js';
import { createPreviewVideo } from './preview-video.js';
import {
  gridVertexShader,
  gridFragmentShader,
  shellVertexShader,
  shellFragmentShader,
  videoVertexShader,
  videoFragmentShader,
  sweepVertexShader,
  sweepFragmentShader,
} from './shaders.js';

export function disposeSceneTree(root) {
  const geometry = new Set(),
    materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      if (material) materials.add(material);
  });
  for (const item of geometry) item.dispose();
  for (const item of materials) item.dispose();
}

function createScreen(layout, config, texture) {
  const { screenWidth: width, videoHeight: height, shellWidth, shellHeight, centerY } = layout;
  const group = new THREE.Group();
  group.name = 'Blender preview';
  group.position.y = centerY;
  const shellRadius = Math.min(config.shellRadius, shellWidth / 2, shellHeight / 2);
  const videoRadius = Math.min(config.videoRadius, width / 2, height / 2);
  const extrusion = (depth, extrudeMaterial = 0) => ({
    depth,
    steps: 1,
    curveSegments: 32,
    bevelEnabled: false,
    material: 0,
    extrudeMaterial,
  });
  const shellShape = roundedRectangle(shellWidth, shellHeight, shellRadius);
  const shell = new THREE.Mesh(
    config.shellThickness > 0
      ? new THREE.ExtrudeGeometry(shellShape, extrusion(config.shellThickness))
      : new THREE.ShapeGeometry(shellShape, 32),
    new THREE.MeshStandardMaterial({
      color: config.shellFillColor,
      transparent: config.shellFillOpacity < 1,
      opacity: config.shellFillOpacity,
      roughness: 0.55,
      metalness: 0.1,
      depthWrite: config.shellFillOpacity >= 1,
      side: THREE.DoubleSide,
    }),
  );
  shell.position.z = -config.shellThickness - 0.025;
  group.add(shell);
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(shellWidth + shellHeight * 0.03, shellHeight * 1.03),
    new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: new THREE.Vector2(shellWidth, shellHeight) },
        uRadius: { value: shellRadius },
        uPointer: { value: new THREE.Vector2() },
        uBorderWidth: { value: config.shellBorderWidth },
        uBorderOpacity: { value: config.shellBorderOpacity },
        uLightIntensity: { value: config.shellLightIntensity },
        uLightRadius: { value: config.shellLightRadius },
        uGlowWidth: { value: config.shellLightGlow },
        uLightColor: { value: new THREE.Color(config.shellLightColor) },
      },
      vertexShader: shellVertexShader,
      fragmentShader: shellFragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  light.position.z = -0.005;
  group.add(light);
  if (config.videoThickness > 0) {
    const front = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      colorWrite: false,
      depthWrite: false,
    });
    const edge = new THREE.MeshStandardMaterial({
      color: '#15171b',
      roughness: 0.65,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(
        roundedRectangle(width, height, videoRadius),
        extrusion(config.videoThickness, 1),
      ),
      [front, edge],
    );
    rim.position.z = 0.005 - config.videoThickness;
    group.add(rim);
  }
  const video = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.ShaderMaterial({
      uniforms: {
        uVideo: { value: texture },
        uSize: { value: new THREE.Vector2(width, height) },
        uRadius: { value: videoRadius },
      },
      vertexShader: videoVertexShader,
      fragmentShader: videoFragmentShader,
      transparent: true,
      toneMapped: false,
    }),
  );
  video.position.z = 0.01;
  video.frustumCulled = false;
  video.visible = false;
  group.add(video);
  return { group, light, video };
}

export function createBlenderRuntime({
  host,
  videoUrl,
  roughnessUrl,
  normalUrl,
  videoTextureEnabled = true,
  reducedMotion = false,
  onLayout,
  onReady,
  onError,
  rendererFactory = (options) => new THREE.WebGLRenderer(options),
  textureLoader = new THREE.TextureLoader(),
}) {
  let disposed = false,
    readySent = false,
    groundReady = false,
    videoReady = !videoTextureEnabled;
  let options = { reducedMotion, sweepActive: false },
    config = getSceneDefaults(false);
  let screen,
    layout,
    preview,
    currentResolution = config.resolution,
    sweepProgress = 0,
    sweepTime = 0,
    previousSweepActive = false;
  const textures = new Set();
  const renderer = rendererFactory({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#090a0d');
  scene.fog = new THREE.Fog('#090a0d', 14, 40);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const sun = new THREE.DirectionalLight('#d6dde8', 0.45);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  const reflection = createGroundReflection(config);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), reflection.material);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShaderMaterial({
      uniforms: {
        cellSize: { value: config.cellSize },
        sectionSize: { value: config.cellSize },
        cellThickness: { value: 0 },
        sectionThickness: { value: config.lineThickness },
        cellColor: { value: new THREE.Color(config.lineColor) },
        sectionColor: { value: new THREE.Color(config.lineColor) },
        fadeDistance: { value: config.fadeDistance },
        fadeStrength: { value: config.fadeStrength },
        fadeFrom: { value: 1 },
        infiniteGrid: { value: true },
        followCamera: { value: false },
        worldCamProjPosition: { value: new THREE.Vector3() },
        worldPlanePosition: { value: new THREE.Vector3(0, 0.01, 0) },
      },
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      transparent: true,
      side: THREE.BackSide,
    }),
  );
  grid.position.y = 0.01;
  grid.frustumCulled = false;
  scene.add(grid);
  const sweepUniforms = {
    uColor: { value: new THREE.Color(config.gridSweepColor) },
    uCellSize: { value: config.cellSize },
    uLineThickness: { value: config.lineThickness },
    uProgress: { value: 0 },
    uSweepWidth: { value: config.gridSweepWidth },
    uGlow: { value: config.gridSweepGlow },
    uOpacity: { value: config.gridSweepOpacity },
    uStrength: { value: 0 },
    uSweepFar: { value: config.gridSweepFar },
    uSweepNear: { value: config.gridSweepNear },
    uFarOpacity: { value: config.gridSweepFarOpacity },
    uFarSoftness: { value: config.gridSweepFarSoftness },
    uDepthPower: { value: config.gridSweepDepthPower },
    uFadeDistance: { value: config.fadeDistance },
    uTime: { value: 0 },
    uIrregularity: { value: config.gridSweepIrregularity },
    uNoiseScale: { value: config.gridSweepNoiseScale },
    uNoiseSpeed: { value: config.gridSweepNoiseSpeed },
  };
  const sweep = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.ShaderMaterial({
      uniforms: sweepUniforms,
      vertexShader: sweepVertexShader,
      fragmentShader: sweepFragmentShader,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sweep.position.y = 0.025;
  sweep.rotation.x = -Math.PI / 2;
  sweep.frustumCulled = false;
  sweep.renderOrder = 2;
  scene.add(sweep);
  const pointer = new THREE.Vector2(),
    raycaster = new THREE.Raycaster(),
    plane = new THREE.Plane();
  const normal = new THREE.Vector3(0, 0, 1),
    position = new THREE.Vector3(),
    intersection = new THREE.Vector3();
  const local = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    lightTarget = new THREE.Vector2();
  const disposeTexture = (texture) => {
    texture.dispose();
    texture.image?.close?.();
  };
  const loadTexture = (url) =>
    new Promise((resolve, reject) =>
      textureLoader.load(
        url,
        (texture) => {
          if (disposed) {
            disposeTexture(texture);
            resolve(null);
            return;
          }
          textures.add(texture);
          resolve(texture);
        },
        undefined,
        (error) =>
          reject(
            new Error(`Unable to load texture ${url}${error?.message ? `: ${error.message}` : ''}`),
          ),
      ),
    );
  Promise.all([loadTexture(roughnessUrl), loadTexture(normalUrl)])
    .then((loaded) => {
      if (disposed) return;
      loaded.forEach((texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.NoColorSpace;
        texture.anisotropy = 8;
        texture.repeat.set(config.texRepeat, config.texRepeat);
        texture.needsUpdate = true;
      });
      [reflection.material.roughnessMap, reflection.material.normalMap] = loaded;
      reflection.material.needsUpdate = true;
      groundReady = true;
    })
    .catch((error) => {
      if (!disposed) onError?.('texture', error);
    });
  if (videoTextureEnabled) {
    preview = createPreviewVideo({
      url: videoUrl,
      reducedMotion,
      onReady: () => {
        videoReady = true;
      },
      onError: (error) => {
        if (!disposed) onError?.('video', error);
      },
    });
  }
  const runtime = {
    canvas: renderer.domElement,
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return;
      const narrow = width <= 768;
      config = getSceneDefaults(narrow);
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), narrow ? 1.5 : 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
      configureCamera(camera, width, height, config);
      layout = calculatePreviewLayout(width, height, config);
      if (screen) {
        scene.remove(screen.group);
        disposeSceneTree(screen.group);
      }
      screen = createScreen(layout, config, preview?.texture || null);
      scene.add(screen.group);
      if (config.resolution !== currentResolution) {
        reflection.setResolution(config.resolution);
        currentResolution = config.resolution;
      }
      onLayout?.({ top: layout.top, titleScale: layout.titleScale });
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    updateOptions(next) {
      options = { ...options, ...next };
      preview?.setReducedMotion(options.reducedMotion);
    },
    syncVisibility() {
      preview?.syncVisibility();
    },
    setPaused(value) {
      preview?.setPaused(value);
    },
    render(delta) {
      if (disposed || !screen) return;
      delta = Math.min(Math.max(delta, 0), 0.1);
      updateParallaxCamera(camera, pointer, options.reducedMotion, config);
      screen.video.visible = videoTextureEnabled && videoReady;
      grid.material.uniforms.worldCamProjPosition.value.set(
        camera.position.x,
        grid.position.y,
        camera.position.z,
      );
      if (options.sweepActive && !previousSweepActive) {
        sweepProgress = 0;
        sweepTime = 0;
      }
      if (options.sweepActive) {
        sweepProgress = options.reducedMotion
          ? 0.55
          : (sweepProgress + delta / Math.max(config.gridSweepDuration, 0.1)) % 1;
        if (!options.reducedMotion) sweepTime += delta;
      }
      sweepUniforms.uProgress.value = options.reducedMotion
        ? sweepProgress
        : sweepEasing(sweepProgress, config.gridSweepEasing, config.gridSweepCurve);
      sweepUniforms.uTime.value = sweepTime;
      sweepUniforms.uStrength.value = THREE.MathUtils.damp(
        sweepUniforms.uStrength.value,
        Number(options.sweepActive),
        10,
        delta,
      );
      previousSweepActive = options.sweepActive;
      screen.light.updateWorldMatrix(true, false);
      screen.light.getWorldPosition(position);
      screen.light.getWorldQuaternion(quaternion);
      normal.set(0, 0, 1).applyQuaternion(quaternion);
      plane.setFromNormalAndCoplanarPoint(normal, position);
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        screen.light.worldToLocal(local.copy(intersection));
        lightTarget.set(local.x, local.y);
        screen.light.material.uniforms.uPointer.value.lerp(
          lightTarget,
          1 - Math.exp(-delta * config.shellLightDamp),
        );
      }
      reflection.update(renderer, scene, camera, ground);
      renderer.render(scene, camera);
      if (!readySent && groundReady && videoReady) {
        readySent = true;
        onReady?.();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preview?.dispose();
      reflection.dispose();
      disposeSceneTree(scene);
      for (const texture of textures) disposeTexture(texture);
      textures.clear();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  return runtime;
}
