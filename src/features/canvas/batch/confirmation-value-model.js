/** Structural comparison for persisted confirmation state, without UI dependencies. */
export function sameCanvasConfirmationValue(left, right, seen = new WeakMap()) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (seen.has(left)) return seen.get(left) === right;
  seen.set(left, right);
  const a = Object.keys(left),
    b = Object.keys(right);
  return (
    a.length === b.length &&
    a.every(
      (key) =>
        Object.hasOwn(right, key) && sameCanvasConfirmationValue(left[key], right[key], seen),
    )
  );
}
