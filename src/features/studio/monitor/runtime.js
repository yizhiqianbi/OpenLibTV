import { cameraAtTime } from '../camera/model.js';
import { monitorCameras } from './cameras.js';
import { createMonitorCapture } from './capture.js';
import { MONITOR_PLAYBACK_INTERVAL, MONITOR_SIGNATURE_INTERVAL, monitorKeys } from './model.js';

function sceneSignature(runtime) {
  let signature = 0;
  const number = (value) => {
    signature = (31 * signature + Math.round(1000 * (Number(value) || 0))) | 0;
  };
  const string = (value = '') => {
    for (const character of value) signature = (31 * signature + character.charCodeAt(0)) | 0;
  };
  const color = (value) => {
    if (value?.isColor) [value.r, value.g, value.b].forEach(number);
  };
  color(runtime.scene.background);
  number(runtime.renderer.shadowMap?.enabled);
  runtime.content.traverse((node) => {
    string(node.uuid);
    number(node.visible ? 1 : 2);
    [...node.position, ...node.quaternion, ...node.scale].forEach(number);
    if (node.isCamera) {
      [
        node.fov,
        node.zoom,
        node.near,
        node.far,
        node.aspect,
        ...node.projectionMatrix.elements,
      ].forEach(number);
    }
    color(node.color);
    number(node.intensity);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      [
        material.id,
        material.opacity,
        material.side,
        material.transparent,
        material.alphaTest,
        material.depthTest,
        material.depthWrite,
        material.wireframe,
        material.emissiveIntensity,
        material.envMapIntensity,
        material.roughness,
        material.metalness,
      ].forEach(number);
      color(material.color);
      color(material.emissive);
    }
  });
  return signature;
}

/** Invoked by the sole viewport RAF after scene evaluation; captures at most two visible cards. */
export function createStudioMonitorController(runtime, options) {
  const capture = createMonitorCapture(runtime, options);
  let active = true,
    state = null;
  const reset = () => {
    capture.release();
    state = null;
  };
  return {
    tick(data, now) {
      if (!active) return;
      const channel = data.monitor;
      const request = channel?.request();
      if (!request) {
        if (state) {
          channel?.emit({
            sceneKey: state.sceneKey,
            cameras: state.cameras,
            frames: {},
            playbackCameraId: null,
          });
          reset();
        }
        return;
      }
      if (state?.sceneKey !== request.sceneKey) reset();
      if (!state)
        state = {
          sceneKey: request.sceneKey,
          cameras: [],
          frames: {},
          stale: new Set(),
          checkedAt: -Infinity,
          playbackAt: -Infinity,
          signature: null,
          names: '',
          requestKey: '',
          playbackCameraId: null,
        };
      let changed = false;
      if (now - state.checkedAt >= MONITOR_SIGNATURE_INTERVAL) {
        state.checkedAt = now;
        const signature = sceneSignature(runtime);
        const cameras = monitorCameras(runtime);
        const names = JSON.stringify(cameras);
        if (signature !== state.signature || names !== state.names) {
          state.signature = signature;
          state.names = names;
          state.cameras = cameras;
          state.stale = new Set(monitorKeys(request, cameras));
          changed = true;
        }
      }
      const keys = monitorKeys(request, state.cameras);
      const requestKey = JSON.stringify([keys, request.thumbnailWidth]);
      if (requestKey !== state.requestKey) {
        state.requestKey = requestKey;
        state.stale = new Set(keys);
        changed = true;
      }
      for (const key of Object.keys(state.frames))
        if (!keys.includes(key)) {
          delete state.frames[key];
          changed = true;
        }
      for (const key of state.stale) if (!keys.includes(key)) state.stale.delete(key);
      const shotCamera = cameraAtTime(
        data.cameraTimeline?.shots || [],
        data.time,
        data.cameraTimeline?.duration,
      );
      const activeId =
        shotCamera || (runtime.entities.get(data.viewMode)?.isCamera ? data.viewMode : null);
      const playbackCameraId = state.cameras.some((camera) => camera.id === activeId)
        ? activeId
        : null;
      if (state.playbackCameraId !== playbackCameraId) {
        if (state.playbackCameraId) state.stale.add(state.playbackCameraId);
        state.playbackCameraId = playbackCameraId;
        state.playbackAt = -Infinity;
        changed = true;
      }
      const playback =
        data.playing &&
        keys.includes(playbackCameraId) &&
        now - state.playbackAt >= MONITOR_PLAYBACK_INTERVAL;
      const pending = keys.filter((key) => state.frames[key] === undefined || state.stale.has(key));
      const batch = [...new Set([...(playback ? [playbackCameraId] : []), ...pending])].slice(0, 2);
      for (const key of batch) {
        state.frames[key] = capture.capture(key, request.thumbnailWidth) || state.frames[key] || '';
        state.stale.delete(key);
        if (key === playbackCameraId) state.playbackAt = now;
        changed = true;
      }
      if (changed)
        channel.emit({
          sceneKey: state.sceneKey,
          cameras: state.cameras,
          frames: { ...state.frames },
          playbackCameraId: state.playbackCameraId,
        });
    },
    dispose() {
      active = false;
      reset();
      capture.dispose();
    },
  };
}
