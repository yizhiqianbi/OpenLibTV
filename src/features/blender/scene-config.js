// Public source module 586662; values are not inferred from screenshots.
export const SCENE_DEFAULTS = Object.freeze({
  fov: 42,
  camY: 3.8,
  camZ: 11.3,
  pitch: 0,
  yaw: 0,
  lookAtY: 3.95,
  parallaxX: 1.3,
  parallaxY: 1.3,
  damp: 0.075,
  cellSize: 1,
  lineThickness: 1,
  fadeDistance: 28,
  fadeStrength: 1.4,
  lineColor: '#565a5f',
  gridSweepDuration: 1.4,
  gridSweepEasing: 'easeIn',
  gridSweepCurve: 2,
  gridSweepWidth: 3.9,
  gridSweepGlow: 2,
  gridSweepOpacity: 0.8,
  gridSweepColor: '#d9e7f5',
  gridSweepFar: -17,
  gridSweepNear: 12,
  gridSweepFarOpacity: 0.08,
  gridSweepFarSoftness: 2.2,
  gridSweepDepthPower: 1.6,
  gridSweepIrregularity: 0.7,
  gridSweepNoiseScale: 0.18,
  gridSweepNoiseSpeed: 0.35,
  mixStrength: 1.5,
  mixBlur: 6,
  mirror: 0.5,
  blurX: 400,
  blurY: 320,
  roughness: 1,
  metalness: 0.4,
  groundColor: '#92a2bb',
  texRepeat: 2,
  normalScale: 2,
  resolution: 512,
  screenWidth: 7.28,
  screenGap: 0.1,
  shellRadius: 0.122,
  videoRadius: 0.045,
  shellThickness: 0.08,
  videoThickness: 0.025,
  shellFillColor: '#1a1a1a',
  shellFillOpacity: 1,
  shellBorderWidth: 2.5,
  shellBorderOpacity: 0.16,
  shellLightIntensity: 0.38,
  shellLightRadius: 0.1,
  shellLightGlow: 3,
  shellLightColor: '#ffffff',
  shellLightDamp: 16,
});
export const OVERLAY_DEFAULTS = Object.freeze({
  sweepDuration: 2.5,
  sweepWidth: 14,
  sweepBrightness: 1,
  sweepGlow: 3,
  sweepOpacity: 1,
  sweepColor: '#ffffff',
});
export const PREVIEW_ASPECT = 1440 / 810;
export const SHELL_WIDTH_RATIO = 728.13 / 708.196;
export const SHELL_HEIGHT_RATIO = 418.41 / 397.963;
export const BLENDER_ASSETS = Object.freeze({
  video: 'https://libtv-res.liblib.art/director/libtv-blender.webm',
  poster: '/assets/blender/hero-preview-poster.webp',
  roughness: '/assets/blender/SurfaceImperfections003_1K_var1.jpg',
  normal: '/assets/blender/SurfaceImperfections003_1K_Normal.jpg',
  platformMac: 'https://www.liblib.tv/assets/blender/platform-apple.svg',
  platformWindows: 'https://www.liblib.tv/assets/blender/platform-windows.svg',
});
export const getSceneDefaults = (narrow) => ({ ...SCENE_DEFAULTS, resolution: narrow ? 256 : 512 });
export function shouldAvoidWebGlVideoTexture(userAgent) {
  return /AppleWebKit/i.test(userAgent) && !/(?:Chrome|Chromium|Edg|OPR)\//i.test(userAgent);
}
export function detectDownloadPlatform({ platform = '', userAgent = '', maxTouchPoints = 0 }) {
  const agent = `${platform} ${userAgent}`;
  if (/Windows|Win32|Win64|WinCE/i.test(agent)) return 'windows';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1))
    return null;
  return /Macintosh|Mac OS X|MacIntel|MacPPC|Mac68K/i.test(agent) ? 'mac' : null;
}
