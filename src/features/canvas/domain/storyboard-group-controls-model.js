import { canvasWorldPosition } from './groups.js';
import {
  computeStoryboardGridLayout,
  computeStoryboardNodeDimensionsFromRatio,
  computeStoryboardVariableGridLayout,
  extractStoryboardRatioFromNodeParams,
  getStoryboardFixedManualGridCapacity,
  reconcileStoryboardGridMembership,
  resolveStoryboardGridColumnCount,
  resolveStoryboardGridSlotCount,
} from './storyboard-grid-model.js';

export const STORYBOARD_GROUP_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const positiveSize = (size) =>
  Number.isFinite(size?.width) &&
  size.width > 0 &&
  Number.isFinite(size?.height) &&
  size.height > 0;
const standalone = (group) =>
  group?.type === 'group' &&
  group.data?.standaloneStoryboardImageGrid === true &&
  group.data?.storyboardGroupType === 'image';

function graphLookup(nodes) {
  if (!Array.isArray(nodes)) throw new Error('Invalid graph');
  const lookup = new Map();
  for (const node of nodes) {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      lookup.has(node.id) ||
      !finitePosition(node.position)
    )
      throw new Error('Invalid graph');
    lookup.set(node.id, node);
  }
  return lookup;
}

/** Source renderer tf: complete preferred actual order, otherwise numeric-name order. */
function orderedChildren(nodes, group) {
  const children = nodes.filter((node) => node.parentId === group.id);
  const preferred = group.data?.childNodeIds;
  if (
    preferred != null &&
    (!Array.isArray(preferred) || preferred.some((id) => typeof id !== 'string'))
  )
    throw new Error('Invalid child order');
  const actual = new Map(children.map((node) => [node.id, node]));
  const ordered = preferred?.filter((id) => actual.has(id)).map((id) => actual.get(id)) ?? [];
  if (ordered.length === children.length) {
    if (new Set(ordered.map((node) => node.id)).size !== children.length)
      throw new Error('Repeated child order');
    return ordered;
  }
  if (children.some((node) => node.data?.name != null && typeof node.data.name !== 'string'))
    throw new Error('Invalid child name');
  return [...children].sort((a, b) =>
    (a.data?.name ?? '').localeCompare(b.data?.name ?? '', undefined, { numeric: true }),
  );
}

/** Source updateNodeData deletes undefined patch fields and canonicalizes legacy labels. */
function patchData(data, patch) {
  if (data != null && !object(data)) throw new Error('Invalid data');
  const merged = { ...data, ...patch };
  const name = typeof merged.name === 'string' ? merged.name : undefined;
  if (!name && typeof merged.label === 'string') merged.name = merged.label;
  delete merged.label;
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete merged[key];
  return merged;
}

function absolutePosition(node, lookup) {
  const seen = new Set();
  let current = node;
  while (current) {
    if (seen.has(current.id) || !finitePosition(current.position))
      throw new Error('Invalid ancestry');
    seen.add(current.id);
    if (current.parentId && !lookup.has(current.parentId)) throw new Error('Missing parent');
    current = lookup.get(current.parentId);
  }
  return canvasWorldPosition(node, lookup);
}

/** Explicit tH invocation also lays out empty grids; the membership effect does not. */
function reflow(nodes, groupId) {
  const group = nodes.find((node) => node.id === groupId);
  if (nodes.some((node) => node.parentId === groupId)) {
    const result = reconcileStoryboardGridMembership({ nodes, groupIds: [groupId] });
    if (!result.valid) throw new Error('Invalid reflow');
    const projected = result.nodes.find((node) => node.id === groupId);
    if (!positiveSize(projected)) throw new Error('Invalid projected bounds');
    return result.nodes.map((node) => {
      const previous = nodes.find((old) => old.id === node.id);
      return node.data !== previous.data ? { ...node, data: patchData(node.data, {}) } : node;
    });
  }
  const { cols, rows, totalSlots } = resolveStoryboardGridSlotCount(
    1,
    group.data?.storyboardManualGridCols,
    group.data?.storyboardManualGridRows,
  );
  const width = group.width ?? group.measured?.width ?? 0;
  const height = group.height ?? group.measured?.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
    throw new Error('Invalid empty bounds');
  const layout =
    group.data?.storyboardPreserveChildDimensions === true
      ? computeStoryboardVariableGridLayout([], totalSlots, group.data.storyboardManualGridCols)
      : computeStoryboardGridLayout(
          Math.max(48, (width - 8 - (cols - 1) * 4) / cols),
          Math.max(48, (height - 8 - (rows - 1) * 4) / rows),
          totalSlots,
          group.data?.storyboardManualGridCols,
        );
  if (!positiveSize(layout)) throw new Error('Invalid empty layout');
  const { width: _width, height: _height, ...style } = group.style ?? {};
  const next = {
    ...group,
    width: layout.width,
    height: layout.height,
    measured: { width: layout.width, height: layout.height },
    style,
    data: patchData(group.data, {
      childNodeIds: [],
      nodeWidth: layout.width,
      nodeHeight: layout.height,
      groupLayoutMode: 'grid',
    }),
  };
  return nodes.map((node) => (node.id === groupId ? next : node));
}

/** Source 713118 natural-image dimensions have a 5600 cap, unlike ratio's 1050 cap. */
export function computeStoryboardNaturalDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return { width: 350, height: 350 };
  return width >= height
    ? { width: Math.min(Math.round((width / height) * 350), 5600), height: 350 }
    : { width: 350, height: Math.min(Math.round((height / width) * 350), 5600) };
}

/** Source tZ owner signature intentionally excludes position, measured size and selection. */
export function captureStoryboardGroupControlSignature(nodes, groupId) {
  try {
    const group = graphLookup(nodes).get(groupId);
    if (group?.type !== 'group') return null;
    const data = group.data;
    return {
      group: {
        sourceScriptNodeId: data?.sourceScriptNodeId,
        storyboardGroupType: data?.storyboardGroupType,
        standaloneStoryboardImageGrid: data?.standaloneStoryboardImageGrid,
        storyboardManualGridCols: data?.storyboardManualGridCols,
        storyboardManualGridRows: data?.storyboardManualGridRows,
        storyboardPreserveChildDimensions: data?.storyboardPreserveChildDimensions,
      },
      children: orderedChildren(nodes, group).map((node) => ({
        id: node.id,
        parentId: node.parentId,
        type: node.type,
        displayUrl: Array.isArray(node.data?.url)
          ? node.data.url.find((url) => typeof url === 'string' && url.length > 0)
          : undefined,
        contentWidth:
          typeof node.data?.contentWidth === 'number' ? node.data.contentWidth : undefined,
        contentHeight:
          typeof node.data?.contentHeight === 'number' ? node.data.contentHeight : undefined,
        fallbackRatio: extractStoryboardRatioFromNodeParams(node.data?.params),
      })),
    };
  } catch {
    return null;
  }
}

/** Pure source controls. The caller owns confirmation, async images, graph CAS and history. */
export function planStoryboardGroupControl({
  nodes,
  edges = [],
  groupId,
  command,
  dimensions,
} = {}) {
  const invalid = (reason) => ({ valid: false, changed: false, nodes, edges, reason });
  const result = (next = nodes, nextEdges = edges, extra = {}) => ({
    valid: true,
    changed: next !== nodes || nextEdges !== edges,
    nodes: next,
    edges: nextEdges,
    ...extra,
  });
  try {
    const lookup = graphLookup(nodes);
    if (
      !Array.isArray(edges) ||
      edges.some(
        (edge) =>
          !edge ||
          typeof edge.id !== 'string' ||
          !edge.id ||
          typeof edge.source !== 'string' ||
          typeof edge.target !== 'string',
      ) ||
      new Set(edges.map((edge) => edge.id)).size !== edges.length
    )
      return invalid('invalidEdges');
    const group = lookup.get(groupId);
    if (group?.type !== 'group' || !object(command)) return invalid('invalidTarget');
    if (command.type === 'rename') {
      if (typeof command.value !== 'string') return invalid('invalidName');
      if (group.data?.name === command.value) return result();
      return result(
        nodes.map((node) =>
          node.id === groupId
            ? { ...node, data: patchData(node.data, { name: command.value }) }
            : node,
        ),
      );
    }
    if (!standalone(group)) return invalid('unsupportedGroup');
    const children = orderedChildren(nodes, group);
    if (command.type === 'aspect') {
      if (group.data?.sourceScriptNodeId) return invalid('scriptLinked');
      if (!STORYBOARD_GROUP_ASPECTS.includes(command.value)) return invalid('invalidAspect');
      const images = children.filter((node) => node.type === 'image');
      if (!images.length) return result();
      const size = computeStoryboardNodeDimensionsFromRatio(command.value);
      const ids = new Set(images.map((node) => node.id));
      const next = nodes.map((node) => {
        if (node.id === groupId)
          return {
            ...node,
            data: patchData(node.data, { storyboardPreserveChildDimensions: undefined }),
          };
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
            params: { ...params, settings: { ...params?.settings, ratio: command.value } },
            contentWidth: undefined,
            contentHeight: undefined,
          }),
        };
      });
      return result(reflow(next, groupId));
    }
    if (command.type === 'grid') {
      if (
        !Number.isInteger(command.cols) ||
        command.cols < 1 ||
        command.cols > 5 ||
        (command.rows !== undefined &&
          (!Number.isInteger(command.rows) || command.rows < 1 || command.rows > 5))
      )
        return invalid('invalidGrid');
      const capacity =
        command.rows === undefined
          ? null
          : getStoryboardFixedManualGridCapacity(command.cols, command.rows);
      const images = children.filter((node) => node.type === 'image');
      const overflow = capacity === null ? [] : images.slice(capacity);
      const removed = new Set(overflow.map((node) => node.id));
      const origin = overflow.length ? absolutePosition(group, lookup) : null;
      let next = nodes.map((node) => {
        if (node.id === groupId)
          return {
            ...node,
            data: patchData(node.data, {
              storyboardManualGridCols: command.cols,
              storyboardManualGridRows: command.rows,
              ...(overflow.length
                ? { childNodeIds: images.slice(0, capacity).map((image) => image.id) }
                : {}),
            }),
          };
        if (!removed.has(node.id)) return node;
        const { parentId: _parent, extent: _extent, ...rest } = node;
        return { ...rest, position: absolutePosition(node, lookup) };
      });
      if (overflow.length) next.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
      next = reflow(next, groupId);
      if (overflow.length) {
        const updated = next.find((node) => node.id === groupId);
        const x = origin.x + (updated.width ?? updated.measured?.width ?? 0) + 100;
        let y = origin.y;
        const positions = new Map();
        for (const node of overflow) {
          const height = node.measured?.height ?? node.height ?? 120;
          if (!Number.isFinite(height) || height < 0) throw new Error('Invalid overflow size');
          positions.set(node.id, { x, y });
          y += height + 100;
        }
        next = next.map((node) =>
          positions.has(node.id) ? { ...node, position: positions.get(node.id) } : node,
        );
      }
      return result(next, edges, {
        fitGroupId: groupId,
        detachedIds: overflow.map((node) => node.id),
        immediateFlush: overflow.length > 0,
      });
    }
    if (command.type === 'toggleShotNumbers')
      return result(
        nodes.map((node) =>
          node.id === groupId
            ? {
                ...node,
                data: patchData(node.data, {
                  showStoryboardShotNumbers: !node.data?.showStoryboardShotNumbers,
                }),
              }
            : node,
        ),
      );
    if (command.type === 'clear') {
      if (!children.length) return result();
      const removed = new Set(children.map((node) => node.id));
      // Source deleteNodesBatch iv then deleteNodes iv: two snapshot passes, not
      // an edge-order-dependent or unlimited recursive cascade.
      for (let pass = 0; pass < 2; pass++) {
        const baseline = new Set(removed);
        for (const edge of edges) {
          if (!baseline.has(edge.source) || baseline.has(edge.target)) continue;
          const params = lookup.get(edge.target)?.data?.params;
          if (
            params?.segmentRemakeLock === true &&
            params.segmentRemakeDraft?.phase === 'editing' &&
            params.segmentRemakeDraft.sourceNodeId === edge.source
          )
            removed.add(edge.target);
        }
      }
      if (removed.has(groupId)) return invalid('cyclicDeleteCascade');
      let next = nodes
        .filter((node) => !removed.has(node.id))
        .map((node) => {
          const patch = {};
          for (const key of ['linkedImageGroupId', 'linkedVideoGroupId'])
            if (node.data?.[key] && removed.has(node.data[key])) patch[key] = undefined;
          const data = Object.keys(patch).length ? patchData(node.data, patch) : node.data;
          if (!removed.has(node.parentId)) return data === node.data ? node : { ...node, data };
          const { parentId: _parent, extent: _extent, ...rest } = node;
          return { ...rest, data, position: absolutePosition(node, lookup) };
        });
      next = next.map((node) =>
        node.id === groupId ? { ...node, data: patchData(node.data, { childNodeIds: [] }) } : node,
      );
      next = reflow(next, groupId);
      return result(
        next,
        edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
        { removedIds: nodes.filter((node) => removed.has(node.id)).map((node) => node.id) },
      );
    }
    if (command.type === 'convertToNormal') {
      if (group.data?.sourceScriptNodeId) return invalid('scriptLinked');
      const sizes = new Map(
        children.map((node) => {
          const data = node.data;
          const persisted = { width: data?.contentWidth, height: data?.contentHeight };
          const loaded =
            dimensions instanceof Map ? dimensions.get(node.id) : dimensions?.[node.id];
          if (!positiveSize(persisted) && loaded != null && !positiveSize(loaded))
            throw new Error('Invalid conversion dimensions');
          const size = positiveSize(persisted)
            ? persisted
            : (loaded ??
              computeStoryboardNodeDimensionsFromRatio(
                extractStoryboardRatioFromNodeParams(data?.params) ?? '16:9',
              ));
          return [node.id, { width: size.width, height: size.height }];
        }),
      );
      let layout;
      if (children.length) {
        const width = Math.max(...Array.from(sizes.values(), (size) => size.width));
        const height = Math.max(...Array.from(sizes.values(), (size) => size.height));
        const cols = resolveStoryboardGridColumnCount(children.length);
        const rows = Math.ceil(children.length / cols);
        layout = {
          width: 72 + cols * width + (cols - 1) * 36,
          height: 102 + rows * height + (rows - 1) * 36,
          positions: new Map(
            children.map((node, index) => [
              node.id,
              {
                x: 36 + (index % cols) * (width + 36),
                y: 66 + Math.floor(index / cols) * (height + 36),
              },
            ]),
          ),
        };
        if (!positiveSize(layout)) throw new Error('Invalid ordinary layout');
      }
      const preserve = group.data.storyboardPreserveChildDimensions === true;
      const { width: _width, height: _height, ...style } = object(group.style) ? group.style : {};
      const next = nodes.map((node) => {
        if (node.id === groupId)
          return {
            ...node,
            ...(layout
              ? {
                  width: layout.width,
                  height: layout.height,
                  measured: { width: layout.width, height: layout.height },
                }
              : {}),
            style,
            data: patchData(node.data, {
              standaloneStoryboardImageGrid: undefined,
              storyboardManualGridCols: undefined,
              storyboardManualGridRows: undefined,
              showStoryboardShotNumbers: undefined,
              storyboardGroupType: undefined,
              storyboardPreserveChildDimensions: undefined,
            }),
          };
        const size = sizes.get(node.id);
        if (!size) return node;
        return {
          ...node,
          ...size,
          measured: { ...size },
          position: layout.positions.get(node.id),
          data:
            node.type === 'image'
              ? patchData(node.data, {
                  _explicitContentDims: preserve ? true : undefined,
                  contentWidth: preserve ? size.width : undefined,
                  contentHeight: preserve ? size.height : undefined,
                })
              : node.data,
        };
      });
      return result(next);
    }
    return invalid('unsupportedCommand');
  } catch {
    return invalid('invalidControlGraph');
  }
}
