// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGroundReflection } from './reflection.js';
import { SCENE_DEFAULTS } from './scene-config.js';
import { configureCamera } from './scene-math.js';

function fixture() {
  const reflection = createGroundReflection(SCENE_DEFAULTS);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), reflection.material);
  ground.rotation.x = -Math.PI / 2;
  const scene = new THREE.Scene();
  scene.add(ground);
  const camera = configureCamera(new THREE.PerspectiveCamera(42, 1, 0.1, 80), 772, 900);
  const previousTarget = { name: 'previous' };
  const renderer = {
    getRenderTarget: () => previousTarget,
    setRenderTarget: vi.fn(),
    render: vi.fn(),
    xr: { enabled: true },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    state: { buffers: { depth: { setMask: vi.fn() } } },
  };
  return { reflection, ground, scene, camera, renderer, previousTarget };
}

describe('Blender planar reflection ownership', () => {
  it('renders the reflected camera and five original blur kernels then restores renderer state', () => {
    const { reflection, ground, scene, camera, renderer, previousTarget } = fixture();
    let reflectedPosition;
    renderer.render.mockImplementation((renderedScene, renderedCamera) => {
      expect(ground.visible).toBe(false);
      if (renderedScene === scene) reflectedPosition = renderedCamera.position.clone();
    });
    reflection.update(renderer, scene, camera, ground);
    expect(reflectedPosition.y).toBeCloseTo(-camera.position.y, 8);
    expect(reflectedPosition.z).toBeCloseTo(camera.position.z, 8);
    expect(renderer.render).toHaveBeenCalledTimes(6);
    expect(ground.visible).toBe(true);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget);
    reflection.dispose();
    ground.geometry.dispose();
    reflection.material.dispose();
  });

  it('restores renderer state even if rendering fails and cannot render after disposal', () => {
    const { reflection, ground, scene, camera, renderer, previousTarget } = fixture();
    renderer.render.mockImplementation(() => {
      throw new Error('context lost');
    });
    expect(() => reflection.update(renderer, scene, camera, ground)).toThrow('context lost');
    expect(ground.visible).toBe(true);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(previousTarget);
    reflection.dispose();
    reflection.dispose();
    renderer.render.mockClear();
    reflection.update(renderer, scene, camera, ground);
    expect(renderer.render).not.toHaveBeenCalled();
    ground.geometry.dispose();
    reflection.material.dispose();
  });
});
