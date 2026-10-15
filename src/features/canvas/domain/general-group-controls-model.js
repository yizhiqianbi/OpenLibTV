import {
  computeStoryboardNodeDimensionsFromRatio,
  reconcileStoryboardGridMembership,
  resolveStoryboardGridColumnCount,
} from './storyboard-grid-model.js';
import { planStoryboardGroupControl } from './storyboard-group-controls-model.js';

export const GENERAL_GROUP_COLORS = [
  '#7A7A7A',
  '#E74C3C',
  '#F28A2E',
  '#F4B740',
  '#2ECC71',
  '#08B6DD',
  '#3B82F6',
  '#8B5CF6',
  '#F63B97',
  '#E6E6E6',
];
export const GENERAL_GROUP_LAYOUTS = ['grid', 'horizontal', 'vertical'];

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const standaloneImage = (node) =>
  !!node.data?.standaloneStoryboardImageGrid && node.data?.storyboardGroupType === 'image';

function validateGraph(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) throw new Error('Invalid graph');
  const ids = new Set();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id))
      throw new Error('Invalid node ID');
    if (!finitePosition(node.position)) throw new Error('Invalid node position');
    ids.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of edges) {
    if (
      !edge ||
      typeof edge.id !== 'string' ||
      !edge.id ||
      edgeIds.has(edge.id) ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string'
    )
      throw new Error('Invalid edge');
    edgeIds.add(edge.id);
  }
}

/** Source updateNodeData canonicalizes legacy labels and deletes undefined patch values. */
function patchData(data, patch) {
  if (data != null && !object(data)) throw new Error('Invalid data');
  const result = { ...data, ...patch };
  if (!result.name && typeof result.label === 'string') result.name = result.label;
  delete result.label;
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete result[key];
  return result;
}

function numericNameOrder(children) {
  if (children.some((node) => node.data?.name != null && typeof node.data.name !== 'string'))
    throw new Error('Invalid child name');
  return [...children].sort((a, b) =>
    (a.data?.name ?? '').localeCompare(b.data?.name ?? '', undefined, { numeric: true }),
  );
}

/** Source tf uses a complete preferred actual order; incomplete order is wholly discarded. */
function orderedChildren(nodes, group) {
  const children = nodes.filter((node) => node.parentId === group.id);
  const preferred = group.data?.childNodeIds;
  if (
    preferred != null &&
    (!Array.isArray(preferred) || preferred.some((id) => typeof id !== 'string'))
  )
    throw new Error('Invalid preferred order');
  if (preferred?.length) {
    const lookup = new Map(children.map((node) => [node.id, node]));
    const ordered = preferred.filter((id) => lookup.has(id)).map((id) => lookup.get(id));
    if (ordered.length === children.length) {
      // The source's length gate can admit repeated IDs. Reject this corrupt input atomically.
      if (new Set(ordered.map((node) => node.id)).size !== children.length)
        throw new Error('Repeated preferred order');
      return ordered;
    }
  }
  return numericNameOrder(children);
}

function sourceNodeSize(node) {
  return {
    width: node.measured?.width ?? node.width ?? 200,
    height: node.measured?.height ?? node.height ?? 120,
  };
}

function layoutChildren(children, group, mode, getNodeSize) {
  const sizes = children.map((node) => getNodeSize(node));
  if (
    sizes.some(
      (size) =>
        !Number.isFinite(size?.width) ||
        !Number.isFinite(size?.height) ||
        size.width <= 0 ||
        size.height <= 0,
    )
  )
    throw new Error('Invalid child dimensions');
  const maxWidth = Math.max(...sizes.map((size) => size.width));
  const maxHeight = Math.max(...sizes.map((size) => size.height));
  let x = 36;
  let y = 66;
  const positions = new Map();
  if (mode === 'horizontal') {
    children.forEach((node, index) => {
      positions.set(node.id, { x, y });
      x += sizes[index].width + 36;
    });
    return { positions, width: x, height: 102 + maxHeight };
  }
  if (mode === 'vertical') {
    children.forEach((node, index) => {
      positions.set(node.id, { x, y });
      y += sizes[index].height + 36;
    });
    return { positions, width: 72 + maxWidth, height: y };
  }
  const manualCols = group.data?.storyboardManualGridCols;
  if (manualCols != null && (typeof manualCols !== 'number' || !Number.isFinite(manualCols)))
    throw new Error('Invalid manual columns');
  const cols = resolveStoryboardGridColumnCount(children.length, manualCols);
  const rows = Math.ceil(children.length / cols);
  children.forEach((node, index) =>
    positions.set(node.id, {
      x: 36 + (index % cols) * (maxWidth + 36),
      y: 66 + Math.floor(index / cols) * (maxHeight + 36),
    }),
  );
  return {
    positions,
    width: 72 + cols * maxWidth + (cols - 1) * 36,
    height: 102 + rows * maxHeight + (rows - 1) * 36,
  };
}

function shellBackground(data, color) {
  if (color) return `${color}1A`;
  return standaloneImage({ data }) ||
    (data?.sourceScriptNodeId && data?.storyboardGroupType === 'video')
    ? 'var(--storyboard-group-shell-bg, #212121)'
    : 'var(--canvas-group-bg)';
}

/** Source 612574 count-name update, using the archived Chinese application's locale. */
function convertedCountName(name, count) {
  if (typeof name === 'string' && name.length && !/^分(?:组|镜组)\s*\d+\s*个节点$/.test(name))
    return {};
  return { name: `分镜组 ${count} 个节点` };
}

function equalProjection(previous, next) {
  if (previous === next) return true;
  if (
    previous == null ||
    next == null ||
    typeof previous !== 'object' ||
    typeof next !== 'object' ||
    Array.isArray(previous) !== Array.isArray(next)
  )
    return false;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every(
      (key) => Object.hasOwn(next, key) && equalProjection(previous[key], next[key]),
    )
  );
}

// Every projection retains graph order and the identity of untouched nodes. Do not
// stringify unrelated media payloads, or rewalk shared data/URL arrays on affected nodes.
function graphProjectionChanged(previous, next) {
  return (
    previous !== next &&
    (previous.length !== next.length ||
      next.some((node, index) => !equalProjection(previous[index], node)))
  );
}

/**
 * Source General toolbar t_/t1/t$: pure graph projection, without service or history side effects.
 * getNodeSize is an explicit caller renderer adapter; omitted, dimensions use exact source tm.
 */
export function planCanvasGeneralGroupControl({
  nodes,
  edges = [],
  groupId,
  command,
  getNodeSize = sourceNodeSize,
} = {}) {
  const invalid = (reason) => ({ valid: false, changed: false, nodes, edges, reason });
  const result = (next = nodes, metadata = {}) => {
    const changed = graphProjectionChanged(nodes, next);
    return { valid: true, changed, nodes: changed ? next : nodes, edges, ...metadata };
  };
  try {
    validateGraph(nodes, edges);
    const group = nodes.find((node) => node.id === groupId);
    if (group?.type !== 'group' || !object(command) || (group.data != null && !object(group.data)))
      return invalid('invalidTarget');
    if (command.type === 'rename')
      return planStoryboardGroupControl({ nodes, edges, groupId, command });
    if (standaloneImage(group)) return invalid('unsupportedGroup');
    if (command.type === 'color') {
      const color = command.value;
      if (color !== null && (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)))
        return invalid('invalidColor');
      return result(
        nodes.map((node) =>
          node.id === groupId
            ? {
                ...node,
                zIndex: -1001,
                style: {
                  background: shellBackground(node.data, color),
                  border: `1px solid ${color ? `${color}33` : 'var(--canvas-group-border)'}`,
                },
                data: patchData(node.data, { groupColor: color }),
              }
            : node,
        ),
      );
    }
    if (command.type === 'layout') {
      if (!GENERAL_GROUP_LAYOUTS.includes(command.mode)) return invalid('invalidLayout');
      if (typeof getNodeSize !== 'function') return invalid('invalidSizeAdapter');
      const children = orderedChildren(nodes, group);
      if (!children.length) return result();
      if (group.style != null && !object(group.style)) throw new Error('Invalid group style');
      const layout = layoutChildren(children, group, command.mode, getNodeSize);
      const { width: _width, height: _height, ...gridStyle } = group.style ?? {};
      return result(
        nodes.map((node) => {
          if (node.id === groupId)
            return {
              ...node,
              width: layout.width,
              height: layout.height,
              measured: { width: layout.width, height: layout.height },
              style: command.mode === 'grid' ? gridStyle : { ...group.style },
              data: patchData(node.data, {
                nodeWidth: layout.width,
                nodeHeight: layout.height,
                groupLayoutMode: command.mode,
                ...(command.mode === 'grid'
                  ? { childNodeIds: children.map((child) => child.id) }
                  : {}),
              }),
            };
          const position = layout.positions.get(node.id);
          return position ? { ...node, position } : node;
        }),
      );
    }
    if (command.type === 'convertToStoryboard') {
      if (group.data?.sourceScriptNodeId) return invalid('scriptLinked');
      const children = nodes.filter((node) => node.parentId === groupId);
      if (!children.length || children.some((node) => node.type !== 'image'))
        return invalid('requiresImages');
      // Validate final tH preferred ordering before any image patch is projected.
      orderedChildren(nodes, group);
      const initialOrder = numericNameOrder(children);
      const ids = new Set(initialOrder.map((node) => node.id));
      const size = computeStoryboardNodeDimensionsFromRatio('16:9');
      const cols = Math.ceil(Math.sqrt(initialOrder.length));
      let next = nodes.map((node) => {
        if (node.id === groupId) {
          const data = patchData(node.data, {
            storyboardGroupType: 'image',
            standaloneStoryboardImageGrid: true,
            storyboardManualGridCols: cols,
            storyboardManualGridRows: cols,
            ...convertedCountName(node.data?.name, children.length),
          });
          const color = data.groupColor ?? null;
          return {
            ...node,
            data,
            style: {
              ...(object(node.style) ? node.style : {}),
              background: shellBackground(data, color),
              border: `1px solid ${color ? `${color}33` : 'var(--canvas-group-border)'}`,
            },
          };
        }
        if (!ids.has(node.id)) return node;
        const params = node.data?.params;
        if (
          (params != null && !object(params)) ||
          (params?.settings != null && !object(params.settings))
        )
          throw new Error('Invalid image params');
        return {
          ...node,
          ...size,
          measured: { ...size },
          data: patchData(node.data, {
            params: { ...params, settings: { ...params?.settings, ratio: '16:9' } },
            contentWidth: undefined,
            contentHeight: undefined,
            ...(node.data?.scriptRowHiddenUuid
              ? { scriptRowHiddenUuid: undefined, taskInfo: undefined }
              : {}),
          }),
        };
      });
      const reflow = reconcileStoryboardGridMembership({ nodes: next, groupIds: [groupId] });
      if (!reflow.valid) return invalid('invalidReflow');
      next = reflow.nodes.map((node) =>
        node.id === groupId || ids.has(node.id)
          ? { ...node, data: patchData(node.data, {}) }
          : node,
      );
      const projected = next.find((node) => node.id === groupId);
      if (!Number.isFinite(projected.width) || !Number.isFinite(projected.height))
        return invalid('invalidReflow');
      return result(next, { fitGroupId: groupId });
    }
    return invalid('unsupportedCommand');
  } catch {
    return invalid('invalidControlGraph');
  }
}
