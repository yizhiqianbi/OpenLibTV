import { cloneSnapshot, createLocalId } from '../editor/model.js';
import { resolveGeneratorParams } from './generator/schema.js';
import { createCanvasScriptNode, SCRIPT_NODE_TYPES } from './storyboard/script-model.js';
import {
  canvasCopyMembers,
  canvasWorldPosition,
  cloneCanvasSelection,
  isCanvasGroup,
} from './domain/groups.js';

export const mediaUrl = (node) =>
  Array.isArray(node.data?.url) ? node.data.url[0] : node.data?.url;

export function resolveCanvasRoute(path, search = '', templateUuid, embedded = false) {
  const query = new URLSearchParams(path.includes('?') ? path.split('?')[1] : search);
  const chatShare = path.includes('/canvas/chat-share');
  const readonly = embedded || path.includes('/canvas/share') || chatShare;
  const importing = path.includes('/canvas/import/blender');
  const template = templateUuid || query.get('templateUuid');
  const key =
    query.get('projectId') ||
    query.get('project') ||
    query.get('shareId') ||
    template ||
    query.get('draftPromptId') ||
    'new';
  return {
    query,
    chatShare,
    readonly,
    importing,
    template,
    key,
    storageKey: `libtv.canvas.${key}`,
  };
}

export function normalizeCanvasNodes(nodes = []) {
  return nodes.map((node) => ({
    ...node,
    width: node.width || node.measured?.width,
    height: node.height || node.measured?.height,
  }));
}

export function duplicateCanvasNodes(nodes, ids, makeId = createLocalId) {
  return cloneCanvasSelection(nodes, ids, makeId);
}

export function duplicateCanvasSelection(nodes, edges, ids, makeId = createLocalId) {
  const originals = canvasCopyMembers(nodes, ids);
  const copies = duplicateCanvasNodes(nodes, ids, makeId);
  const mapping = new Map(originals.map((node, index) => [node.id, copies[index].id]));
  const copiedEdges = edges
    .filter((edge) => mapping.has(edge.source) && mapping.has(edge.target))
    .map((edge) => ({
      ...cloneSnapshot(edge),
      id: makeId(),
      source: mapping.get(edge.source),
      target: mapping.get(edge.target),
    }));
  return { nodes: copies, edges: copiedEdges };
}

export function removeCanvasNodes(nodes, edges, ids) {
  const removed = new Set(ids),
    lookup = new Map(nodes.map((node) => [node.id, node]));
  const retained = nodes
    .filter((node) => !removed.has(node.id))
    .map((node) => {
      if (!removed.has(node.parentId)) return node;
      const world = canvasWorldPosition(node, lookup);
      const seen = new Set();
      let parent = lookup.get(node.parentId);
      while (parent && removed.has(parent.id) && !seen.has(parent.id)) {
        seen.add(parent.id);
        parent = lookup.get(parent.parentId);
      }
      const parentWorld = parent ? canvasWorldPosition(parent, lookup) : { x: 0, y: 0 };
      const { parentId: _parent, extent: _extent, ...rest } = node;
      return {
        ...rest,
        ...(parent ? { parentId: parent.id } : {}),
        position: { x: world.x - parentWorld.x, y: world.y - parentWorld.y },
      };
    });
  return {
    nodes: retained.map((node) =>
      isCanvasGroup(node)
        ? {
            ...node,
            data: {
              ...node.data,
              childNodeIds: retained
                .filter((child) => child.parentId === node.id)
                .map((child) => child.id),
            },
          }
        : node,
    ),
    edges: edges.filter((edge) => !ids.includes(edge.source) && !ids.includes(edge.target)),
  };
}

export function createCanvasNode({ type, label, nodes, position, models, makeId = createLocalId }) {
  if (SCRIPT_NODE_TYPES.includes(type))
    return createCanvasScriptNode({
      type,
      label: `${label}节点 ${nodes.filter((node) => node.type === type).length + 1}`,
      position,
      models,
      makeId,
    });
  const params = {
    prompt: '',
    model: models?.default?.[type] || '',
    settings: {},
    advancedSettings: {},
  };
  const schema = models?.[type + 'Models']?.[params.model];
  return {
    id: makeId(),
    type,
    position,
    width: 350,
    height: type === 'video-clip' ? 350 : type === 'text' || type === 'reference' ? 220 : 230,
    data: {
      type,
      action:
        type === 'video-clip'
          ? 'video_clip_resource'
          : ['image', 'video', 'audio', 'text'].includes(type)
            ? type + '_generate'
            : undefined,
      name: `${label}节点 ${nodes.filter((node) => node.type === type).length + 1}`,
      text: '',
      url: [],
      params: schema ? resolveGeneratorParams(params, schema, type) : params,
    },
  };
}

export function mergeCanvasProject(projects, project) {
  const next = [...projects];
  const index = next.findIndex((item) => item.id === project.id || item.uuid === project.id);
  if (index < 0) next.unshift(project);
  else next[index] = { ...next[index], ...project, folder: next[index].folder ?? null };
  return next;
}
