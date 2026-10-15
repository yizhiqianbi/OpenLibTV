import * as THREE from 'three';
import {
  SCENE_DEFAULTS,
  PREVIEW_ASPECT,
  SHELL_WIDTH_RATIO,
  SHELL_HEIGHT_RATIO,
} from './scene-config.js';

export function configureCamera(camera, width, height, config = SCENE_DEFAULTS) {
  camera.fov = config.fov;
  camera.aspect = Math.max(width, 1) / Math.max(height, 1);
  const yaw = THREE.MathUtils.degToRad(config.yaw);
  camera.position.set(Math.sin(yaw) * config.camZ, config.camY, Math.cos(yaw) * config.camZ);
  camera.lookAt(0, config.lookAtY, 0);
  camera.rotateX(THREE.MathUtils.degToRad(config.pitch));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

/** Source tz(): project the shell, solve its width, then align the DOM copy above it. */
export function calculatePreviewLayout(width, height, config = SCENE_DEFAULTS) {
  width = Math.max(width, 1);
  height = Math.max(height, 1);
  const camera = configureCamera(
    new THREE.PerspectiveCamera(config.fov, width / height, 0.1, 80),
    width,
    height,
    config,
  );
  const projectedWidth = (screenWidth, y) => {
    const left = new THREE.Vector3(-screenWidth / 2, y, 0).project(camera);
    const right = new THREE.Vector3(screenWidth / 2, y, 0).project(camera);
    return Math.abs(right.x - left.x) * width * 0.5;
  };
  const initialY =
    ((config.screenWidth / PREVIEW_ASPECT) * SHELL_HEIGHT_RATIO) / 2 + config.screenGap;
  const initialWidth = projectedWidth(config.screenWidth * SHELL_WIDTH_RATIO, initialY);
  const maximum = Math.max(1, width - 40);
  // Source minimum is 340px. Keep its layout at normal widths and fit smaller phones.
  const wanted = THREE.MathUtils.clamp(initialWidth, Math.min(340, maximum), maximum);
  let screenWidth = config.screenWidth;
  for (let attempt = 0; attempt < 3; attempt++) {
    const y = ((screenWidth / PREVIEW_ASPECT) * SHELL_HEIGHT_RATIO) / 2 + config.screenGap;
    const current = projectedWidth(screenWidth * SHELL_WIDTH_RATIO, y);
    if (current <= 0 || Math.abs(current - wanted) < 0.25) break;
    screenWidth *= wanted / current;
  }
  const videoHeight = screenWidth / PREVIEW_ASPECT;
  const shellHeight = videoHeight * SHELL_HEIGHT_RATIO;
  const centerY = shellHeight / 2 + config.screenGap;
  return {
    screenWidth,
    videoHeight,
    shellWidth: screenWidth * SHELL_WIDTH_RATIO,
    shellHeight,
    centerY,
    top: (1 - new THREE.Vector3(0, centerY + shellHeight / 2, 0).project(camera).y) * height * 0.5,
    titleScale: projectedWidth(screenWidth * SHELL_WIDTH_RATIO, centerY) / 728.13,
    projectedWidth: projectedWidth(screenWidth * SHELL_WIDTH_RATIO, centerY),
  };
}

export function roundedRectangle(width, height, radius) {
  radius = THREE.MathUtils.clamp(
    Number.isFinite(radius) ? radius : 0,
    0,
    Math.min(width, height) / 2,
  );
  const x = -width / 2,
    y = -height / 2,
    shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0);
  shape.lineTo(x + width, y + height - radius);
  shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
  shape.lineTo(x + radius, y + height);
  shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
  shape.lineTo(x, y + radius);
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5);
  shape.closePath();
  return shape;
}

export function sweepEasing(progress, easing = 'easeIn', curve = 2) {
  curve = Math.max(curve, 1);
  if (easing === 'easeIn') return progress ** curve;
  if (easing === 'easeOut') return 1 - (1 - progress) ** curve;
  if (easing === 'easeInOut')
    return progress < 0.5 ? (2 * progress) ** curve / 2 : 1 - ((1 - progress) * 2) ** curve / 2;
  return progress;
}

export function updateParallaxCamera(camera, pointer, reducedMotion, config = SCENE_DEFAULTS) {
  const yaw = THREE.MathUtils.degToRad(config.yaw);
  const target = new THREE.Vector3(
    Math.sin(yaw) * config.camZ,
    config.camY,
    Math.cos(yaw) * config.camZ,
  );
  if (reducedMotion) camera.position.copy(target);
  else
    camera.position.lerp(
      target.add(new THREE.Vector3(pointer.x * config.parallaxX, pointer.y * config.parallaxY, 0)),
      config.damp,
    );
  camera.lookAt(0, config.lookAtY, 0);
  camera.rotateX(THREE.MathUtils.degToRad(config.pitch));
  camera.updateMatrixWorld();
}
