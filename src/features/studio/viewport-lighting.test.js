// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createViewportEnvironment, createViewportLighting } from './viewport-lighting.js';
import { createPrimitiveEntity } from './viewport-primitives.js';
import { disposeObjectTree } from './scene-resources.js';

const state = vi.hoisted(() => ({ environments: [], generators: [], fail: false }));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    PMREMGenerator: class {
      constructor() {
        this.target = new actual.WebGLRenderTarget(128, 128);
        this.fromScene = vi.fn(() => {
          if (state.fail) throw new Error('Environment unavailable');
          return this.target;
        });
        this.dispose = vi.fn();
        state.generators.push(this);
      }
    },
  };
});
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class {
    constructor() {
      this.dispose = vi.fn();
      state.environments.push(this);
    }
  },
}));

afterEach(() => {
  state.environments.length = 0;
  state.generators.length = 0;
  state.fail = false;
});

const renderer = () => ({ shadowMap: {} });

describe('owned viewport lighting', () => {
  it('lights original materials without replacing or recoloring document meshes', () => {
    const scene = new THREE.Scene();
    const original = new THREE.MeshPhysicalMaterial({
      color: '#ba481d',
      roughness: 0.22,
      metalness: 0.9,
      clearcoat: 0.7,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), original);
    scene.add(mesh);
    const target = new THREE.WebGLRenderTarget(128, 128);
    const gl = renderer();
    const lighting = createViewportLighting({
      scene,
      renderer: gl,
      createEnvironment: () => target,
    });

    expect(mesh.material).toBe(original);
    expect(original.color.getHexString()).toBe('ba481d');
    expect(original.roughness).toBe(0.22);
    expect(original.metalness).toBe(0.9);
    expect(original.clearcoat).toBe(0.7);
    expect(original.envMap).toBeNull();
    expect(scene.environment).toBe(target.texture);
    expect(gl.toneMapping).toBe(THREE.AgXToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.SRGBColorSpace);
    const casters = lighting.rig.children.filter((node) => node.isLight && node.castShadow);
    expect(casters).toHaveLength(1);
    expect(lighting.rig.children.some((node) => node.isMesh && node.receiveShadow)).toBe(true);

    lighting.dispose();
    expect(scene.children).toEqual([mesh]);
    expect(mesh.material).toBe(original);
    disposeObjectTree(scene);
  });

  it('releases render targets, shadow maps and ground exactly once before scene cleanup', () => {
    const scene = new THREE.Scene();
    const previous = new THREE.Texture();
    scene.environment = previous;
    scene.environmentIntensity = 0.8;
    const environment = new THREE.WebGLRenderTarget(128, 128);
    const disposeEnvironment = vi.spyOn(environment, 'dispose');
    const lighting = createViewportLighting({
      scene,
      renderer: renderer(),
      createEnvironment: () => environment,
    });
    const key = lighting.rig.children.find((node) => node.isLight && node.castShadow);
    key.shadow.map = new THREE.WebGLRenderTarget(2048, 2048);
    const disposeShadow = vi.spyOn(key.shadow.map, 'dispose');
    const floor = lighting.rig.children.find((node) => node.isMesh);
    const disposeGeometry = vi.spyOn(floor.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(floor.material, 'dispose');

    lighting.dispose();
    lighting.dispose();
    disposeObjectTree(scene);

    for (const dispose of [disposeEnvironment, disposeShadow, disposeGeometry, disposeMaterial])
      expect(dispose).toHaveBeenCalledOnce();
    expect(lighting.rig.parent).toBeNull();
    expect(scene.environment).toBe(previous);
    expect(scene.environmentIntensity).toBe(0.8);
    previous.dispose();
  });

  it('does not overwrite a newer environment owned by another viewport operation', () => {
    const scene = new THREE.Scene();
    const environment = new THREE.WebGLRenderTarget(128, 128);
    const lighting = createViewportLighting({
      scene,
      renderer: renderer(),
      createEnvironment: () => environment,
    });
    const replacement = new THREE.Texture();
    scene.environment = replacement;
    scene.environmentIntensity = 1.4;
    lighting.dispose();
    expect(scene.environment).toBe(replacement);
    expect(scene.environmentIntensity).toBe(1.4);
    replacement.dispose();
  });
});

describe('local studio environment generation', () => {
  it('keeps only the finished environment target after disposing transient generator resources', () => {
    const gl = renderer();
    const target = createViewportEnvironment(gl);
    expect(target).toBe(state.generators[0].target);
    expect(state.generators[0].fromScene).toHaveBeenCalledWith(
      state.environments[0],
      0.04,
      0.1,
      100,
      { size: 128 },
    );
    expect(state.generators[0].dispose).toHaveBeenCalledOnce();
    expect(state.environments[0].dispose).toHaveBeenCalledOnce();
    target.dispose();
  });

  it('also releases transient resources when environment generation fails', () => {
    state.fail = true;
    expect(() => createViewportEnvironment(renderer())).toThrow('Environment unavailable');
    expect(state.generators[0].dispose).toHaveBeenCalledOnce();
    expect(state.environments[0].dispose).toHaveBeenCalledOnce();
    state.generators[0].target.dispose();
  });
});

it('smooths the cylinder silhouette while retaining its document dimensions and selectable identity', () => {
  const cylinder = createPrimitiveEntity({ id: 'cylinder', name: '圆柱体', type: 'cylinder' });
  cylinder.geometry.computeBoundingBox();
  expect(cylinder.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(64);
  const size = cylinder.geometry.boundingBox.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(0.8);
  expect(size.y).toBeCloseTo(1);
  expect(size.z).toBeCloseTo(0.8);
  expect(cylinder.userData.entityId).toBe('cylinder');
  expect(cylinder.castShadow).toBe(true);
  expect(cylinder.receiveShadow).toBe(true);
  disposeObjectTree(cylinder);
});
