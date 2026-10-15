export const TEXT_MOTION_OPTIONS = Object.freeze([
  ['none', '无动画'],
  ['fade', '淡入'],
  ['spring-up', '弹起'],
  ['blur-in', '虚化浮现'],
  ['zoom-in', '放大进入'],
  ['slide-left', '向左滑入'],
  ['slide-right', '向右滑入'],
  ['wipe-in', '擦除显现'],
  ['pulse', '脉冲'],
  ['wave', '波浪'],
]);
const types = new Set([...TEXT_MOTION_OPTIONS.map(([type]) => type), 'fade-in', 'fade-out']);
const defaults = {
  fade: 300,
  'fade-in': 300,
  'fade-out': 300,
  'blur-in': 300,
  'spring-up': 550,
  'zoom-in': 600,
  'wipe-in': 600,
  wave: 600,
  'slide-left': 500,
  'slide-right': 500,
  pulse: 450,
};
const bounded = (value, minimum, maximum, fallback) =>
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
/** Source nc/nl: durations are milliseconds; amplitude alone retains two decimals. */
export function normalizeTextMotion(value = {}) {
  const type = types.has(value.type) ? value.type : 'none';
  const duration = defaults[type] ?? 600;
  return {
    type,
    durationMs: Math.round(bounded(value.durationMs ?? duration, 100, 10000, duration)),
    delayMs: Math.round(bounded(value.delayMs ?? 0, 0, 10000, 0)),
    iterations: Math.round(bounded(value.iterations ?? 1, 1, 100, 1)),
    amplitudePx: Math.round(100 * bounded(value.amplitudePx ?? 8, 0, 80, 8)) / 100,
  };
}
