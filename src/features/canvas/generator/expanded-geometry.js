/** Public GeneratorWrapper 976401: resize around the fixed card centre. */
export function generatorExpandedSize(saved) {
  const valid = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
  return {
    width: valid(saved?.width) ? saved.width : 800,
    height: valid(saved?.height) ? saved.height : 600,
  };
}

export function resizeExpandedGenerator(start, point) {
  const dx = point.x - start.x,
    dy = point.y - start.y;
  let width = start.width,
    height = start.height;
  if (start.direction.includes('e')) width += 2 * dx;
  if (start.direction.includes('w')) width -= 2 * dx;
  if (start.direction.includes('s')) height += 2 * dy;
  if (start.direction.includes('n')) height -= 2 * dy;
  return {
    width: Math.min(start.maxWidth, Math.max(660, Math.round(width))),
    height: Math.min(start.maxHeight, Math.max(360, Math.round(height))),
  };
}
