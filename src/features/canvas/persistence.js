import { loadContent } from '../../services/content.ts';
import { fetchJson } from '../../services/json.ts';
import { readStoredState, readStoredValue, writeStoredValue } from '../../services/storage.ts';
import { mediaUrl, mergeCanvasProject, normalizeCanvasNodes } from './model.js';
import { normalizeAgentModeConfig } from '../../services/agent-mode-config.js';

export async function loadCanvasDocument(route) {
  const state = readStoredState(route.storageKey, null);
  // A previous failed write/remove does not invalidate a readable old snapshot.
  // Read, decoding and version failures must never become an empty editable project.
  if (state.error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(state.error.code))
    throw state.error;
  const stored = state.value;
  if (stored !== null) {
    if (
      typeof stored !== 'object' ||
      Array.isArray(stored) ||
      !Array.isArray(stored.nodes) ||
      (stored.edges !== undefined && !Array.isArray(stored.edges)) ||
      (stored.messages !== undefined && !Array.isArray(stored.messages))
    )
      throw new Error('项目数据格式异常，原数据已保留');
    return { snapshot: stored, title: stored.title, source: 'local' };
  }
  if (route.chatShare) {
    const shareId = route.query.get('shareId');
    if (!shareId) throw new Error('缺少 shareId');
    const shares = await loadContent('chat-shares');
    const share = shares[shareId];
    if (!share?.snapshot) throw new Error(share?.error || '加载分享失败');
    return {
      snapshot: share.snapshot,
      title: share.title,
      messages: Array.isArray(share.messages)
        ? share.messages
        : Array.isArray(share.snapshot.messages)
          ? share.snapshot.messages
          : [],
      source: 'chat',
    };
  }
  if (route.template) {
    const response = await loadContent(`gallery-details/${encodeURIComponent(route.template)}`);
    const detail = response?.detail;
    const snapshot = await fetchJson(
      detail?.snapshotPath ||
        `/data/canvas-snapshots/${encodeURIComponent(route.template)}.json.gz`,
    );
    return { snapshot, title: detail?.name, source: 'template' };
  }
  if (route.readonly || route.query.get('sourceProjectUuid')) {
    const example = await loadContent('canvas-example');
    return { snapshot: example.snapshot, title: example.name, source: 'example' };
  }
  return {
    snapshot: { nodes: [], edges: [] },
    title: route.importing ? 'Blender 创作项目' : '未命名项目',
    source: 'empty',
  };
}

export function writeCanvasSnapshot(id, snapshot) {
  writeStoredValue(`libtv.canvas.${id}`, snapshot);
}

export function persistCanvasDocument(
  { storageKey, key, title, nodes, edges, view, agentDraft, messages, agentConfig },
  now = Date.now(),
) {
  writeStoredValue(storageKey, {
    title,
    nodes,
    edges,
    view,
    agentDraft,
    messages,
    agentConfig,
    savedAt: now,
  });
  const project = {
    id: key,
    uuid: key,
    name: title,
    type: 'project',
    folder: null,
    date: now,
    updatedAt: now,
    nodeCount: nodes.length,
    cover: mediaUrl(nodes.find((node) => node.type === 'image') || {}),
  };
  const projects = readStoredValue('libtv-projects', []);
  writeStoredValue('libtv-projects', mergeCanvasProject(projects, project));
}

export function canvasDocumentState(document) {
  return {
    agentConfig: normalizeAgentModeConfig(document.snapshot.agentConfig),
    messages:
      document.source === 'chat' && Array.isArray(document.messages)
        ? document.messages
        : Array.isArray(document.snapshot.messages)
          ? document.snapshot.messages
          : [],
    title: document.title || '未命名项目',
    nodes: normalizeCanvasNodes(document.snapshot.nodes),
    edges: document.snapshot.edges || [],
  };
}
