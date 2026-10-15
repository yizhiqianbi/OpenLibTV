export const MONITOR_TOP = 'topView';
export const MONITOR_ORBIT = 'orbitView';
export const MONITOR_ASPECT = 16 / 9;
export const MONITOR_SIGNATURE_INTERVAL = 500;
export const MONITOR_PLAYBACK_INTERVAL = 1000 / 24;

/** The source preserves a camera's aspect inside a fixed 16:9 thumbnail frame. */
export function monitorDimensions(width, aspect, pixelRatio = 1, maxTextureSize = 2048) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : MONITOR_ASPECT;
  const dpr = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const limit = Math.floor(Math.min(2048, maxTextureSize || 2048) / dpr);
  const height = Math.max(
    Math.round(
      Math.min(
        width > 0 ? Math.ceil(width / Math.min(ratio, MONITOR_ASPECT)) : 96,
        limit,
        limit / ratio,
      ),
    ),
    1,
  );
  return {
    width: Math.max(Math.round(Math.round(height * ratio) * dpr), 1),
    height: Math.max(Math.round(height * dpr), 1),
  };
}

export function monitorKeys(request, cameras) {
  const available = new Set(cameras.map((camera) => camera.id));
  return [
    ...(request.topView ? [MONITOR_TOP] : []),
    ...(request.orbitView ? [MONITOR_ORBIT] : []),
    ...new Set((request.cameraIds || []).filter((id) => available.has(id))),
  ];
}
