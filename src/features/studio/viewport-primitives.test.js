// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyLightProperties,
  createPrimitiveEntity,
  ensureLightType,
} from './viewport-primitives.js';

describe('studio source light properties', () => {
  it('creates source-shaped point, spot and directional lights', () => {
    const point = createPrimitiveEntity({
      id: 'point',
      type: 'light',
      name: 'Point',
      lightType: 'point',
      intensity: 3,
      range: 18,
      color: '#123456',
      castShadow: false,
    });
    const pointLight = point.children.find((child) => child.isLight);
    expect(pointLight.isPointLight).toBe(true);
    expect(pointLight.intensity).toBe(3);
    expect(pointLight.distance).toBe(18);
    expect(pointLight.castShadow).toBe(false);
    expect(pointLight.color.getHexString()).toBe('123456');

    const spot = createPrimitiveEntity({
      id: 'spot',
      type: 'light',
      name: 'Spot',
      lightType: 'spot',
      angle: 80,
      penumbra: 0.6,
    });
    const spotLight = spot.children.find((child) => child.isLight);
    expect(spotLight.isSpotLight).toBe(true);
    expect(THREE.MathUtils.radToDeg(spotLight.angle)).toBeCloseTo(80);
    expect(spotLight.penumbra).toBeCloseTo(0.6);

    const directional = createPrimitiveEntity({
      id: 'directional',
      type: 'light',
      name: 'Directional',
      lightType: 'directional',
    });
    expect(directional.children.find((child) => child.isLight).isDirectionalLight).toBe(true);
  });

  it('updates an existing light without replacing its object or marker', () => {
    const root = createPrimitiveEntity({ id: 'light', type: 'light', name: 'Light' });
    const light = root.children.find((child) => child.isLight);
    applyLightProperties(root, {
      lightType: 'spot',
      color: '#abcdef',
      intensity: 1.5,
      range: 24,
      angle: 22,
      penumbra: 0.25,
      castShadow: false,
    });
    expect(root.children).toContain(light);
    expect(light.color.getHexString()).toBe('abcdef');
    expect(light.intensity).toBe(1.5);
    expect(light.distance).toBe(24);
    expect(light.castShadow).toBe(false);
  });

  it('replaces only the light child when a local light changes type', () => {
    const root = createPrimitiveEntity({ id: 'light', type: 'light', name: 'Light' });
    const marker = root;
    const next = ensureLightType(root, { lightType: 'spot' });
    expect(root).toBe(marker);
    expect(next.isSpotLight).toBe(true);
    expect(root.children.filter((child) => child.isLight)).toHaveLength(1);
  });
});
