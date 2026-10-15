const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const idValid = (value) => typeof value === 'string' && value.trim().length > 0;
const positionValid = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const width = 350,
  height = 350,
  gap = 100,
  margin = gap / 2;

const invalid = (reason) => ({
  valid: false,
  reason,
  addedNodes: [],
  addedEdges: [],
  scriptPatch: null,
  submitted: false,
});

/** Each empty-state entry depends only on its own preset fields. No IDs are allocated. */
export function validateScriptV2Presets(presets) {
  const text = presets?.textToScript,
    character = presets?.characterToScript,
    textValid =
      record(presets) &&
      record(text) &&
      typeof text.textPrompt === 'string' &&
      text.textPrompt.length > 0,
    characterValid =
      record(presets) &&
      record(character) &&
      typeof character.prompt === 'string' &&
      character.prompt.length > 0 &&
      Array.isArray(character.characterImages) &&
      [0, 1].every((index) => idValid(character.characterImages[index]));
  const action = (enabled) => ({ enabled, reason: enabled ? '' : 'invalid-presets' });
  return {
    valid: textValid && characterValid,
    reason: textValid && characterValid ? '' : 'invalid-presets',
    actions: {
      scriptToStoryboard: action(textValid),
      characterToStoryboard: action(characterValid),
    },
  };
}

function placementRect(node) {
  return {
    ...node.position,
    width: node.measured?.width ?? node.width ?? width,
    height: node.measured?.height ?? node.height ?? height,
  };
}

function rectValid(rect) {
  return (
    positionValid(rect) &&
    Number.isFinite(rect.width) &&
    rect.width >= 0 &&
    Number.isFinite(rect.height) &&
    rect.height >= 0
  );
}

/** Source store e5/e8: raw rectangles, 50px margin, downward-only, at most 30 passes. */
function place(position, obstacles) {
  let y = position.y;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const rect = { x: position.x, y, width, height };
    let shift = 0;
    for (const obstacle of obstacles) {
      if (
        rect.x < obstacle.x + obstacle.width + margin &&
        rect.x + rect.width + margin > obstacle.x &&
        rect.y < obstacle.y + obstacle.height + margin &&
        rect.y + rect.height + margin > obstacle.y
      ) {
        shift = Math.max(
          shift,
          Math.min(
            Math.abs(obstacle.y + obstacle.height + margin - rect.y),
            Math.abs(rect.y + rect.height + margin - obstacle.y),
          ),
        );
      }
    }
    if (shift === 0) break;
    y += shift;
  }
  return { x: position.x, y };
}

/** Shared source store e5 wrapper; it does not change the existing preset caller. */
export function resolveScriptV2ResourcePlacement({ position, nodes } = {}) {
  if (!positionValid(position) || !Array.isArray(nodes) || nodes.some((node) => !record(node)))
    return { valid: false, reason: 'invalid-geometry', position: null };
  const obstacles = nodes.map(placementRect);
  if (!obstacles.every(rectValid))
    return { valid: false, reason: 'invalid-geometry', position: null };
  const projected = place(position, obstacles);
  return positionValid(projected)
    ? { valid: true, reason: '', position: projected }
    : { valid: false, reason: 'invalid-geometry', position: null };
}

/**
 * tL/t_ add root resources before existing nodes. Caller prepends addedNodes,
 * appends addedEdges, and shallow-merges the optional script data patch in one CAS.
 * Neither source callback submits a task, selects nodes, fits, or writes dimensions.
 */
export function buildScriptV2PresetPlan({ kind, script, nodes, edges, presets, makeId } = {}) {
  if (!['scriptToStoryboard', 'characterToStoryboard'].includes(kind))
    return invalid('invalid-kind');
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return invalid('invalid-graph');
  const usedIds = new Set(),
    lookup = new Map(),
    obstacles = [];
  for (const node of nodes) {
    if (!record(node) || !idValid(node.id) || usedIds.has(node.id)) return invalid('invalid-graph');
    const rect = placementRect(node);
    if (!rectValid(rect)) return invalid('invalid-geometry');
    usedIds.add(node.id);
    lookup.set(node.id, node);
    obstacles.push(rect);
  }
  for (const edge of edges) {
    if (
      !record(edge) ||
      !idValid(edge.id) ||
      usedIds.has(edge.id) ||
      !idValid(edge.source) ||
      !idValid(edge.target)
    )
      return invalid('invalid-graph');
    usedIds.add(edge.id);
  }
  if (!idValid(script?.id)) return invalid('invalid-script');
  const target = lookup.get(script.id);
  if (!target) return invalid('no-script');
  if ((target.type || target.data?.type) !== 'script-v2') return invalid('not-v2-script');
  if (!record(target.data)) return invalid('invalid-script');
  const catalogue = validateScriptV2Presets(presets),
    textPreset = presets?.textToScript,
    characterPreset = presets?.characterToScript,
    character = kind === 'characterToStoryboard';
  if (!catalogue.actions[kind].enabled) return invalid('invalid-presets');
  if (typeof makeId !== 'function') return invalid('invalid-id-factory');
  try {
    const id = (prefix) => {
      const value = makeId(prefix);
      if (!idValid(value) || usedIds.has(value)) throw new Error('Invalid preset ID');
      usedIds.add(value);
      return value;
    };
    const x = target.position.x - width - gap,
      nodeIds = character ? [id('image'), id('image')] : [id('text')],
      initialY = character
        ? [
            target.position.y + height / 2 - 20 - Math.round(0.75 * width),
            target.position.y + height / 2 + 20,
          ]
        : [target.position.y],
      addedNodes = nodeIds.map((nodeId, index) => {
        const position = place({ x, y: initialY[index] }, obstacles);
        obstacles.push({ ...position, width, height });
        return {
          id: nodeId,
          type: character ? 'image' : 'text',
          data: character
            ? {
                type: 'image',
                name: `角色 ${index + 1}`,
                url: [characterPreset.characterImages[index]],
                alt: `角色参考图 ${index + 1}`,
                action: 'image_resource',
              }
            : {
                type: 'text',
                name: '文本',
                content: [textPreset.textPrompt],
                action: 'text_resource',
              },
          position,
          sourcePosition: 'right',
          targetPosition: 'left',
        };
      }),
      addedEdges = nodeIds.map((nodeId) => ({
        id: id('edge'),
        source: nodeId,
        sourceHandle: 'source',
        target: target.id,
        targetHandle: 'target',
      }));
    return {
      valid: true,
      reason: '',
      addedNodes,
      addedEdges,
      scriptPatch: character
        ? { params: { prompt: characterPreset.prompt }, action: 'script_generate' }
        : null,
      submitted: false,
    };
  } catch {
    return invalid('invalid-id');
  }
}
