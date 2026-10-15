// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  calculatePreviewLayout,
  configureCamera,
  roundedRectangle,
  sweepEasing,
  updateParallaxCamera,
} from './scene-math.js';
import {
  SCENE_DEFAULTS,
  detectDownloadPlatform,
  shouldAvoidWebGlVideoTexture,
} from './scene-config.js';

describe('source Blender projection and interaction math', () => {
  it.each([
    [1440, 900],
    [772, 900],
    [390, 844],
    [320, 640],
  ])('fits the shell and projects its top at %i × %i', (width, height) => {
    const layout = calculatePreviewLayout(width, height);
    const camera = configureCamera(new THREE.PerspectiveCamera(42, 1, 0.1, 80), width, height);
    const top = new THREE.Vector3(0, layout.centerY + layout.shellHeight / 2, 0).project(camera);
    const left = new THREE.Vector3(-layout.shellWidth / 2, layout.centerY, 0).project(camera);
    const right = new THREE.Vector3(layout.shellWidth / 2, layout.centerY, 0).project(camera);
    expect(layout.top).toBeCloseTo(((1 - top.y) * height) / 2, 8);
    expect(layout.projectedWidth).toBeCloseTo(((right.x - left.x) * width) / 2, 8);
    expect(layout.projectedWidth).toBeLessThanOrEqual(width - 40 + 0.3);
    expect(layout.projectedWidth).toBeGreaterThanOrEqual(Math.min(340, width - 40) - 0.3);
    expect(layout.titleScale).toBeCloseTo(layout.projectedWidth / 728.13, 8);
  });

  it('uses source damping and returns to the exact base camera with reduced motion', () => {
    const camera = configureCamera(new THREE.PerspectiveCamera(), 772, 900);
    updateParallaxCamera(camera, { x: 1, y: -1 }, false);
    expect(camera.position.x).toBeCloseTo(SCENE_DEFAULTS.parallaxX * SCENE_DEFAULTS.damp, 8);
    expect(camera.position.y).toBeCloseTo(
      SCENE_DEFAULTS.camY - SCENE_DEFAULTS.parallaxY * SCENE_DEFAULTS.damp,
      8,
    );
    updateParallaxCamera(camera, { x: 1, y: -1 }, true);
    expect(camera.position.toArray()).toEqual([0, 3.8, 11.3]);
  });

  it('preserves the source sweep easing and clamps the rounded shell geometry', () => {
    expect(sweepEasing(0.25, 'easeIn', 2)).toBe(0.0625);
    expect(sweepEasing(0.25, 'easeOut', 2)).toBe(0.4375);
    expect(sweepEasing(0.25, 'easeInOut', 2)).toBe(0.125);
    const geometry = new THREE.ShapeGeometry(roundedRectangle(4, 2, 100), 32);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox.min.toArray()).toEqual([-2, -1, 0]);
    expect(geometry.boundingBox.max.toArray()).toEqual([2, 1, 0]);
    geometry.dispose();
  });

  it('keeps the original Safari video exception and avoids mistaking an iPad for desktop macOS', () => {
    expect(shouldAvoidWebGlVideoTexture('AppleWebKit/605.1.15 Version/18 Safari/605.1.15')).toBe(
      true,
    );
    expect(shouldAvoidWebGlVideoTexture('AppleWebKit/537.36 Chrome/133.0')).toBe(false);
    expect(
      detectDownloadPlatform({ platform: 'MacIntel', userAgent: 'Mac OS X', maxTouchPoints: 5 }),
    ).toBeNull();
    expect(
      detectDownloadPlatform({ platform: 'MacIntel', userAgent: 'Mac OS X', maxTouchPoints: 0 }),
    ).toBe('mac');
    expect(detectDownloadPlatform({ platform: 'Win32' })).toBe('windows');
  });
});
