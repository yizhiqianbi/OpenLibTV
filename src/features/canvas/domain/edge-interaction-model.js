const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const directions = new Set(['left', 'right', 'top', 'bottom']);
const distance = (first, second) => (first.x - second.x) ** 2 + (first.y - second.y) ** 2;

/** The source XYFlow equations; positions are the actual handle anchors in world units. */
export function resolveCanvasEdgeBezier({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = 'bottom',
  targetPosition = 'top',
  curvature = 0.25,
}) {
  if (![sourceX, sourceY, targetX, targetY, curvature].every(finite)) return null;
  if (!directions.has(sourcePosition) || !directions.has(targetPosition)) return null;
  const offset = (value) => (value >= 0 ? value / 2 : 25 * curvature * Math.sqrt(-value));
  const control = (position, x, y, otherX, otherY) => {
    if (position === 'left') return { x: x - offset(x - otherX), y };
    if (position === 'right') return { x: x + offset(otherX - x), y };
    if (position === 'top') return { x, y: y - offset(y - otherY) };
    return { x, y: y + offset(otherY - y) };
  };
  const source = { x: sourceX, y: sourceY },
    target = { x: targetX, y: targetY },
    control1 = control(sourcePosition, sourceX, sourceY, targetX, targetY),
    control2 = control(targetPosition, targetX, targetY, sourceX, sourceY);
  const label = {
    x: sourceX * 0.125 + control1.x * 0.375 + control2.x * 0.375 + targetX * 0.125,
    y: sourceY * 0.125 + control1.y * 0.375 + control2.y * 0.375 + targetY * 0.125,
  };
  if (![control1.x, control1.y, control2.x, control2.y, label.x, label.y].every(finite))
    return null;
  return {
    source,
    target,
    control1,
    control2,
    label,
    offset: { x: Math.abs(label.x - sourceX), y: Math.abs(label.y - sourceY) },
    path: `M${sourceX},${sourceY} C${control1.x},${control1.y} ${control2.x},${control2.y} ${targetX},${targetY}`,
  };
}

/** Canvas renders zero-sized right/left handles; worldById already resolves parent positions. */
export function canvasEdgeGeometry(worldById, edge) {
  const source = worldById.get(edge?.source),
    target = worldById.get(edge?.target);
  if (!source || !target || edge.hidden) return null;
  // The current Canvas exposes one right source and one left target port.
  if (edge.sourceHandle != null && edge.sourceHandle !== 'source') return null;
  if (edge.targetHandle != null && edge.targetHandle !== 'target') return null;
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0)
    return null;
  if (
    ![
      source.position?.x,
      source.position?.y,
      source.width,
      source.height,
      target.position?.x,
      target.position?.y,
      target.width,
      target.height,
    ].every(finite)
  )
    return null;
  return resolveCanvasEdgeBezier({
    sourceX: source.position.x + source.width,
    sourceY: source.position.y + source.height / 2,
    targetX: target.position.x,
    targetY: target.position.y + target.height / 2,
    sourcePosition: 'right',
    targetPosition: 'left',
  });
}

/** Sampling is by arc length, not by the cubic parameter. The caller owns the native path. */
export function createCanvasEdgeNearestLookup(pathApi) {
  try {
    const length = pathApi.getTotalLength();
    if (!finite(length) || length < 0) return null;
    const samples = Array.from({ length: 81 }, (_, index) =>
      pathApi.getPointAtLength((index / 80) * length),
    );
    if (samples.some((point) => !finite(point?.x) || !finite(point?.y))) return null;
    return (point) => {
      try {
        if (!finite(point?.x) || !finite(point?.y)) return null;
        let nearest = samples[0],
          index = 0,
          best = distance(nearest, point);
        for (let current = 1; current < samples.length; current++) {
          const candidate = distance(samples[current], point);
          if (candidate < best) {
            nearest = samples[current];
            index = current;
            best = candidate;
          }
        }
        const start = Math.max(0, (index - 1) / 80),
          end = Math.min(1, (index + 1) / 80);
        for (let current = 0; current <= 10; current++) {
          const candidate = pathApi.getPointAtLength(
            (start + ((end - start) * current) / 10) * length,
          );
          if (!finite(candidate?.x) || !finite(candidate?.y)) return null;
          const squared = distance(candidate, point);
          if (squared < best) {
            nearest = candidate;
            best = squared;
          }
        }
        return { x: nearest.x, y: nearest.y };
      } catch {
        return null;
      }
    };
  } catch {
    return null;
  }
}

export function canvasEdgeNearestPoint(pathApi, point) {
  try {
    return createCanvasEdgeNearestLookup(pathApi)?.(point) ?? null;
  } catch {
    return null;
  }
}

export function canvasVisibleEdgeIds(edges, showEdges = true, selectedNodeIds = []) {
  const selected = new Set(selectedNodeIds);
  return edges
    .filter(
      (edge) =>
        !edge.hidden && (showEdges || selected.has(edge.source) || selected.has(edge.target)),
    )
    .map((edge) => edge.id);
}

export function canvasEdgePresentation({
  edge,
  sourceNode,
  targetNode,
  selectedEdge = false,
  selectedNodes = [],
  hovered = false,
  readonly = false,
  interactive = true,
  disabled = false,
}) {
  const related = selectedNodes.includes(edge.source) || selectedNodes.includes(edge.target),
    selectable = !disabled && edge.selectable !== false,
    selected = interactive && selectedEdge,
    highlighted = interactive && (selected || hovered || related);
  const name = (node, fallback) => node?.data?.name || node?.data?.label || fallback;
  return {
    interactive,
    selectable,
    deletable: !disabled && interactive && !readonly && edge.deletable !== false,
    focusable: edge.focusable !== false,
    stroke: selected
      ? 'var(--canvas-edge-selected)'
      : interactive && (hovered || related)
        ? 'var(--canvas-edge-hover)'
        : edge.style?.stroke || 'var(--canvas-edge)',
    strokeWidth: interactive && hovered ? 4 : selected ? 3 : 2,
    reference: interactive && sourceNode?.data?.type === 'reference',
    label: `连线：${name(sourceNode, edge.source)} → ${name(targetNode, edge.target)}`,
    highlighted,
  };
}

/** View selection never mutates an edge, node or the document history. */
export function selectCanvasEdgeIds(selected, id, { additive = false, toggle = additive } = {}) {
  if (!additive) return [id];
  if (selected.includes(id)) return toggle ? selected.filter((value) => value !== id) : selected;
  return [...selected, id];
}
