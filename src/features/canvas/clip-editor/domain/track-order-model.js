/** Move an existing track onto the target row without creating gaps. */
export function moveTrackOrder(order, source, target) {
  if (!Array.isArray(order) || source === target)
    return source === target ? [...(order || [])] : null;
  const from = order.indexOf(source);
  const targetPosition = order.indexOf(target);
  if (from < 0 || targetPosition < 0) return null;
  const next = [...order];
  next.splice(from, 1);
  next.splice(targetPosition, 0, source);
  return next;
}
