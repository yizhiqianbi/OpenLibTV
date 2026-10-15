import {
  insertMarkToken,
  replaceFirstMarkToken,
  deleteFirstMarkToken,
} from './mark-token-model.js';
export {
  MARK_MAX_OCCURRENCES,
  markTokenOccurrences,
  insertMarkToken,
  replaceFirstMarkToken,
  replaceAllMarkTokens,
  deleteFirstMarkToken,
} from './mark-token-model.js';
import { markGeneratorCapability } from './mark-capability.js';
import {
  normalizeCanvasMarkResponse,
  validCanvasMarkResponseId,
} from '../../../../services/canvas-mark-source.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const validId = (value) => typeof value === 'string' && value.length > 0;
const validStableId = (value) => validId(value) && !/[:}]/.test(value);
export { markGeneratorCapability } from './mark-capability.js';

/** Source click mathematics intentionally does not clamp or apply natural-image offsets. */
export function normalizeMarkPoint(clientPoint, contentRect) {
  if (
    !finite(clientPoint?.x) ||
    !finite(clientPoint?.y) ||
    !['left', 'top', 'width', 'height'].every((key) => finite(contentRect?.[key])) ||
    contentRect.width <= 0 ||
    contentRect.height <= 0
  )
    return null;
  const relX = (clientPoint.x - contentRect.left) / contentRect.width;
  const relY = (clientPoint.y - contentRect.top) / contentRect.height;
  return finite(relX) && finite(relY) ? { relX, relY } : null;
}

export function makeMarkStableId(responseId, pointIndex) {
  return validCanvasMarkResponseId(responseId) && Number.isSafeInteger(pointIndex) && pointIndex > 0
    ? `${responseId}_${pointIndex}`
    : null;
}

function graphTarget(nodes, edges, targetNodeId) {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    !validId(targetNodeId) ||
    !nodes.every((node) => record(node) && validId(node.id)) ||
    new Set(nodes.map((node) => node.id)).size !== nodes.length
  )
    return null;
  const target = nodes.find((node) => node.id === targetNodeId);
  if (
    !markGeneratorCapability({ node: target, schema: { properties: { magic: true } } }) ||
    (target.data.params !== undefined && !record(target.data.params))
  )
    return null;
  const params = target.data.params ?? {};
  if (
    (params.prompt !== undefined && typeof params.prompt !== 'string') ||
    (params.magicList !== undefined && !record(params.magicList))
  )
    return null;
  return { target, params, prompt: params.prompt ?? '', magicList: params.magicList ?? {} };
}

const planParams = (nodes, edges, target, params) => ({
  nodes: nodes.map((node) =>
    node === target ? { ...node, data: { ...node.data, params } } : node,
  ),
  edges,
});

/** Caller supplies the latest projected graph and owns readiness, mode, media and CAS guards. */
export function planCanvasMarkResult({
  nodes,
  edges,
  targetNodeId,
  sourceNodeId,
  pointIndex,
  response,
  cursorOffset,
} = {}) {
  const context = graphTarget(nodes, edges, targetNodeId),
    normalized = normalizeCanvasMarkResponse(response),
    stableId = normalized && makeMarkStableId(normalized.id, pointIndex),
    source = Array.isArray(nodes) && nodes.find((node) => node.id === sourceNodeId),
    imageUrl = source?.data?.url?.[0];
  if (
    !context ||
    !stableId ||
    source?.type !== 'image' ||
    !Array.isArray(source.data?.url) ||
    typeof imageUrl !== 'string' ||
    imageUrl.length === 0
  )
    return null;
  const prompt = insertMarkToken(context.prompt, stableId, 0, cursorOffset);
  if (prompt === null) return null;
  return planParams(nodes, edges, context.target, {
    ...context.params,
    prompt,
    magicList: {
      ...context.magicList,
      [stableId]: { suggestions: normalized.suggestions, imageUrl },
    },
  });
}

function markMetadata(context, stableId) {
  if (!context || !validStableId(stableId) || !Object.hasOwn(context.magicList, stableId))
    return null;
  const entry = context.magicList[stableId];
  return record(entry) &&
    typeof entry.imageUrl === 'string' &&
    entry.imageUrl.length > 0 &&
    normalizeCanvasMarkResponse({ id: stableId, suggestions: entry.suggestions })
    ? entry
    : null;
}

export function selectCanvasMarkSuggestion({
  nodes,
  edges,
  targetNodeId,
  stableId,
  selectedIndex,
  knownSuggestions,
} = {}) {
  const context = graphTarget(nodes, edges, targetNodeId),
    metadata = markMetadata(context, stableId),
    hasEntry = context && Object.hasOwn(context.magicList, stableId),
    known =
      knownSuggestions === undefined
        ? null
        : normalizeCanvasMarkResponse({ id: stableId, suggestions: knownSuggestions }),
    suggestions = known?.suggestions ?? metadata?.suggestions;
  if (
    !context ||
    !validStableId(stableId) ||
    (hasEntry && !metadata) ||
    (knownSuggestions !== undefined && !known) ||
    !suggestions ||
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= suggestions.length
  )
    return null;
  const prompt = replaceFirstMarkToken(context.prompt, stableId, selectedIndex);
  if (prompt === context.prompt) return null;
  return planParams(nodes, edges, context.target, { ...context.params, prompt });
}

export function deleteCanvasMarkPoint({ nodes, edges, targetNodeId, stableId } = {}) {
  const context = graphTarget(nodes, edges, targetNodeId);
  if (!context || !validStableId(stableId)) return null;
  const hasEntry = Object.hasOwn(context.magicList, stableId);
  if (hasEntry && !markMetadata(context, stableId)) return null;
  const { [stableId]: _removed, ...remaining } = context.magicList;
  const prompt = deleteFirstMarkToken(context.prompt, stableId);
  if (!hasEntry && prompt === context.prompt) return null;
  return planParams(nodes, edges, context.target, {
    ...context.params,
    prompt,
    magicList:
      Object.keys(remaining).length > 0 ? (hasEntry ? remaining : context.magicList) : undefined,
  });
}
