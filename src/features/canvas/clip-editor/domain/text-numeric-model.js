export const parseTextNumeric = (raw) => {
  if (String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
/** Source s2: min-relative step snapping, then decimal precision of step. */
export function snapTextNumeric(value, min, max, step) {
  if (!(step > 0)) return clamp(value, min, max);
  const digits = String(step).split('.')[1]?.length || 0;
  return Number(clamp(min + Math.round((value - min) / step) * step, min, max).toFixed(digits));
}
export function textNumericAtPointer(x, rect, min, max, step) {
  return !(rect.width > 0) || !(max > min)
    ? null
    : snapTextNumeric(min + ((x - rect.left) / rect.width) * (max - min), min, max, step);
}
export function settleTextNumeric(raw, lastValid, min, max, step, snap = false) {
  const value = parseTextNumeric(raw);
  return value == null
    ? lastValid
    : snap
      ? snapTextNumeric(value, min, max, step)
      : clamp(value, min, max);
}
