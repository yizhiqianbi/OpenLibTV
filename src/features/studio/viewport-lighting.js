import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** The generated studio map needs no remote HDRI; the caller owns its render target. */
export function createViewportEnvironment(renderer) {
  const environment = new RoomEnvironment();
  let generator;
  try {
    generator = new THREE.PMREMGenerator(renderer);
    return generator.fromScene(environment, 0.04, 0.1, 100, { size: 128 });
  } finally {
    environment.dispose();
    generator?.dispose();
  }
}

/** Owns viewport lighting only, leaving document meshes and imported materials intact. */
export function createViewportLighting({
  scene,
  renderer,
  createEnvironment = createViewportEnvironment,
}) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const previousEnvironment = scene.environment;
  const previousIntensity = scene.environmentIntensity;
  const environment = createEnvironment(renderer);
  if (environment) {
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.35;
  }

  const rig = new THREE.Group();
  rig.name = 'Studio viewport lighting';
  const ambient = new THREE.HemisphereLight(0xdce5f5, 0x50505b, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  key.shadow.bias = -0.0001;
  key.shadow.normalBias = 0.015;
  Object.assign(key.shadow.camera, {
    left: -24,
    right: 24,
    top: 24,
    bottom: -24,
    near: 0.1,
    far: 80,
  });
  key.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xdbe5ff, 0.55);
  fill.position.set(4, 3, 1);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(1, 5, -5);
  const lights = [ambient, key, fill, rim];
  rig.add(...lights, key.target, fill.target, rim.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.ShadowMaterial({ opacity: 0.3 }),
  );
  floor.name = 'Studio viewport shadow ground';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.008;
  floor.receiveShadow = true;
  rig.add(floor);
  scene.add(rig);

  let disposed = false;
  return {
    rig,
    dispose() {
      if (disposed) return;
      disposed = true;
      rig.removeFromParent();
      for (const light of lights) light.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      if (environment) {
        if (scene.environment === environment.texture) {
          scene.environment = previousEnvironment;
          scene.environmentIntensity = previousIntensity;
        }
        environment.dispose();
      }
    },
  };
}
