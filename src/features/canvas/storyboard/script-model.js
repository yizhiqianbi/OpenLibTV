import { createStoryboardRow, storyboardRows } from './rows.js';
import {
  scriptWorkflowState,
  scriptAssetProgress,
  SCRIPT_WORKFLOW_STEPS,
} from './workflow-model.js';

export const SCRIPT_NODE_TYPES = ['script', 'storyboard', 'script-v2'];
export const isCanvasScriptNode = (node) => SCRIPT_NODE_TYPES.includes(node?.type);
export const isScriptV2 = (value) => (value?.type || value?.data?.type) === 'script-v2';
export const emptyScriptAssets = () => ({ characters: [], scenes: [], props: [] });
export const scriptAssets = (data) =>
  Object.entries(emptyScriptAssets()).map(([key]) => ({
    key,
    items: Array.isArray(data?.assets?.[key]) ? data.assets[key] : [],
  }));
export const scriptDefaultViews = (type) => [
  { id: 'default', type: 'table', name: '脚本视图' },
  type === 'script-v2'
    ? { id: 'asset', type: 'asset', name: '资产视图' }
    : { id: 'creative', type: 'creative', name: '创意视图' },
];
/** Explicit creation, never an import-time migration of a public or readonly snapshot. */
export function createCanvasScriptNode({
  type = 'script-v2',
  id,
  position = { x: 0, y: 0 },
  label = '脚本',
  models,
  makeId = () => crypto.randomUUID(),
} = {}) {
  if (!SCRIPT_NODE_TYPES.includes(type)) throw new Error('不支持的脚本节点类型');
  const width = type === 'script-v2' ? 350 : 800;
  const height = type === 'script-v2' ? 350 : 400;
  return {
    id: id || makeId(),
    type,
    position,
    width,
    height,
    measured: { width, height },
    data: {
      type,
      name: label,
      action: 'script_generate',
      rows: [],
      assets: emptyScriptAssets(),
      views: scriptDefaultViews(type),
      viewMode: 'table',
      activeViewId: 'default',
      params: { ...(models?.default?.text ? { model: models.default.text } : {}), prompt: '' },
    },
  };
}
export const manualScriptPatch = (makeId) => ({
  rows: [createStoryboardRow(1, makeId)],
  assets: emptyScriptAssets(),
  viewMode: 'table',
  activeViewId: 'default',
});
export function scriptNodeState(node, edges = []) {
  if (node?.data?.taskInfo?.loading) return 'generating';
  if ([3, 4].includes(Number(node?.data?.taskInfo?.status))) return 'failed';
  if (storyboardRows(node?.data).length) return 'resource';
  return edges.some((edge) => edge.target === node?.id || edge.source === node?.id)
    ? 'pending'
    : 'empty';
}
export function scriptAssetUrl(item, nodes) {
  if (typeof item?.thumbnailUrl === 'string' && item.thumbnailUrl.trim()) return item.thumbnailUrl;
  const url = nodes.find((node) => node.id === item?.linkedNodeId)?.data?.url;
  return Array.isArray(url)
    ? url.find((value) => typeof value === 'string' && value.trim()) || ''
    : typeof url === 'string'
      ? url
      : '';
}
/** 272776 o0/o1/o5/aH: availability is not an approval or generation claim. */
export function scriptStages(data, nodes = []) {
  const workflow = scriptWorkflowState(data, {
    getNodeUrl: (id) => nodes.find((node) => node.id === id)?.data?.url?.[0],
    assetProgress: scriptAssetProgress(data, nodes),
  });
  return SCRIPT_WORKFLOW_STEPS.map(({ stageId }) => workflow[stageId]);
}
export function patchScriptAsset(data, key, id, patch) {
  if (!['characters', 'scenes', 'props'].includes(key)) return {};
  return {
    assets: {
      ...emptyScriptAssets(),
      ...data.assets,
      [key]: (data.assets?.[key] || []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    },
  };
}
