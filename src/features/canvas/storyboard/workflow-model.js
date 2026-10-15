// Public ScriptV2 module 272776 oZ/o0/o1/o5/aH and the e0 stage projection.
export const SCRIPT_WORKFLOW_STEPS = [
  { id: 'confirm-shots', stageId: 'shots', label: '确认镜头' },
  { id: 'prepare-assets', stageId: 'assets', label: '准备资产' },
  { id: 'compose-prompts', stageId: 'prompts', label: '合成提示词' },
];

export function normalizeScriptStep(value, fallback = 'confirm-shots') {
  return SCRIPT_WORKFLOW_STEPS.some((step) => step.id === value) ? value : fallback;
}

/** 959248 isTaskGenerating + 272776/sI: prompt recomposition keeps the output toolbar. */
export function scriptFullGenerationBusy(data) {
  const task = data?.taskInfo;
  return (
    task?.loading === true &&
    ![2, 3, 4].includes(Number(task.status)) &&
    task.scriptV2TaskMode !== 'recompute-batch-shots'
  );
}

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

/** 302098 normalizeScriptV2AssetsForRender excludes malformed, unidentified assets. */
function renderedAssets(assets) {
  return ['characters', 'scenes', 'props'].flatMap((key) =>
    Array.isArray(assets?.[key])
      ? assets[key].filter((item) => isRecord(item) && nonempty(item.id))
      : [],
  );
}

/** 272776 r7 reads linked nodes' taskInfo.loading; status alone does not imply busy. */
export function scriptAssetProgress(data, nodes = []) {
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const generatingLinkedNodeIds = [];
  const percentages = [];
  for (const item of renderedAssets(data?.assets)) {
    if (typeof item.linkedNodeId !== 'string' || !item.linkedNodeId) continue;
    const task = nodeLookup.get(item.linkedNodeId)?.data?.taskInfo;
    if (!task?.loading) continue;
    generatingLinkedNodeIds.push(item.linkedNodeId);
    if (typeof task.progressPercent === 'number') percentages.push(task.progressPercent);
  }
  if (!generatingLinkedNodeIds.length)
    return { inProgress: false, generatingCount: 0, progressPercent: undefined };
  return {
    inProgress: true,
    generatingCount: generatingLinkedNodeIds.length,
    generatingLinkedNodeIds,
    progressPercent: percentages.length
      ? Math.floor(percentages.reduce((sum, percent) => sum + percent, 0) / percentages.length)
      : undefined,
  };
}

export function hasScriptAssetMedia(item, getNodeUrl) {
  if (nonempty(item?.thumbnailUrl)) return true;
  if (!nonempty(item?.linkedNodeId) || typeof getNodeUrl !== 'function') return false;
  const media = getNodeUrl(item.linkedNodeId.trim());
  return nonempty(media) || nonempty(media?.url);
}

export function scriptPromptMissing(row) {
  return !nonempty(row?.imageGenerationPrompt) || !nonempty(row?.videoMotionPrompt);
}

export function scriptPromptsReady(row) {
  return row?.imagePromptState || row?.videoPromptState
    ? row.imagePromptState === 'synced' && row.videoPromptState === 'synced'
    : !scriptPromptMissing(row);
}

export function scriptPromptsGenerating(row) {
  return row?.imagePromptState === 'generating' || row?.videoPromptState === 'generating';
}

export function scriptPromptsUsable(row) {
  return !scriptPromptMissing(row) && !scriptPromptsGenerating(row);
}

export function scriptStageStatus(total, ready, forcePending = false) {
  return total === 0
    ? 'idle'
    : forcePending || ready !== total
      ? ready > 0
        ? 'partial'
        : 'idle'
      : 'ready';
}

/** Selection is row.id based; an omitted initial list selects only missing prompt pairs. */
export function scriptPromptSelection(rows, initialSelectedIds) {
  const values = Array.isArray(rows) ? rows : [];
  if (initialSelectedIds === undefined)
    return new Set(values.filter(scriptPromptMissing).map((row) => row.id));
  const valid = new Set(values.map((row) => row.id));
  return new Set([...initialSelectedIds].filter((id) => valid.has(id)));
}

/**
 * Read-only projection. getNodeUrl(id) accepts the source string or {url} result;
 * assetProgress is the linked-node task projection supplied by the caller.
 */
export function scriptWorkflowState(data, { getNodeUrl, assetProgress = {} } = {}) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const items = renderedAssets(data?.assets);
  const shotsReady = rows.filter((row) => nonempty(row.plotDescription)).length;
  const promptsReady = rows.filter(scriptPromptsReady).length;
  const assetsReady = items.filter((item) => hasScriptAssetMedia(item, getNodeUrl)).length;
  const assetsBusy = Boolean(assetProgress.inProgress);
  const generatingIds = new Set(assetProgress.generatingLinkedNodeIds ?? []);
  let loadingSlots = assetProgress.generatingLinkedNodeIds
    ? 0
    : (assetProgress.generatingCount ?? 0);
  const shots = {
    id: 'shots',
    title: '镜头',
    label: '确认镜头',
    hint: rows.length
      ? `${rows.length}个镜头${shotsReady === rows.length ? '已就绪' : '待核对'}`
      : '暂无镜头',
    total: rows.length,
    ready: shotsReady,
    status: scriptStageStatus(rows.length, shotsReady),
    color: 'orange',
    isBusy: false,
    segments: rows.map((row) => ({ status: nonempty(row.plotDescription) ? 'ready' : 'default' })),
  };
  const assets = {
    id: 'assets',
    title: '资产',
    label: '准备资产',
    hint: items.length
      ? `${assetsReady}/${items.length} 已生成${assetsReady < items.length ? `、还差 ${items.length - assetsReady} 个` : ''}`
      : '暂无资产',
    total: items.length,
    ready: assetsReady,
    status: scriptStageStatus(items.length, assetsReady, assetsBusy),
    color: 'cyan',
    isBusy: assetsBusy,
    segments: items.map((item) => {
      if (item.linkedNodeId && generatingIds.has(item.linkedNodeId)) return { status: 'loading' };
      if (hasScriptAssetMedia(item, getNodeUrl)) return { status: 'ready' };
      if (assetsBusy && loadingSlots > 0) {
        loadingSlots -= 1;
        return { status: 'loading' };
      }
      return { status: 'default' };
    }),
  };
  const prompts = {
    id: 'prompts',
    title: '提示词',
    label: '合成提示词',
    hint: rows.length ? `${promptsReady}/${rows.length} 已合成` : '暂无提示词',
    total: rows.length,
    ready: promptsReady,
    status: scriptStageStatus(rows.length, promptsReady),
    color: 'gray',
    isBusy: rows.some(scriptPromptsGenerating),
    segments: rows.map((row) => ({
      status: scriptPromptsReady(row)
        ? 'ready'
        : scriptPromptsGenerating(row)
          ? 'loading'
          : 'default',
    })),
  };
  const readyCount = [shots, assets, prompts].filter((stage) => stage.status === 'ready').length;
  const promptsUsableForGeneration = rows.length > 0 && rows.every(scriptPromptsUsable);
  return {
    shots,
    assets,
    prompts,
    readyCount,
    totalCount: 3,
    allReady: readyCount === 3,
    promptsUsableForGeneration,
    outputGenerationReady:
      shots.status === 'ready' && assets.status === 'ready' && promptsUsableForGeneration,
  };
}
