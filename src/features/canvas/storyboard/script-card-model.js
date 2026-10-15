import { createStoryboardRow } from './rows.js';
import { scriptAssetProgress, scriptWorkflowState } from './workflow-model.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stageIds = ['shots', 'assets', 'prompts'];
const stageLabels = ['确认镜头', '准备资产', '合成提示词'];
const terminal = new Set([2, 3, 4]);
const isRecompute = (task) => task?.scriptV2TaskMode === 'recompute-batch-shots';

/** Source 182004 l only normalizes finite numbers or nonblank numeric strings. */
function taskStatus(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}
const generating = (task) => task?.loading === true && !terminal.has(taskStatus(task.status));
const failed = (task) => task?.loading === false && [3, 4].includes(taskStatus(task.status));
const center = (index) => (286 / 3) * (index + 0.5);

/**
 * Source 276204 uses raw numeric status for its label, unlike terminal-status
 * helpers. Only supplied task data is projected; benefit/bus state is not inferred.
 */
export function projectScriptTaskBadge(taskInfo) {
  const status = taskInfo?.status,
    progressPercent = taskInfo?.progressPercent,
    normalizedStatus = taskStatus(status),
    remainSeconds = taskInfo?.delayInfo?.remainSeconds,
    queueing = status === 0 && remainSeconds > 0,
    pct = progressPercent && progressPercent > 0 ? ` ${progressPercent}%` : '';
  let label;
  if (queueing) {
    const waitTime =
      typeof remainSeconds !== 'number' || Number.isNaN(remainSeconds) || remainSeconds <= 0
        ? '0秒'
        : remainSeconds > 120
          ? `${Math.ceil(remainSeconds / 60)}分钟`
          : `${remainSeconds}秒`;
    label = `排队中，预计等待${waitTime}`;
  } else {
    label = `${status === 0 || status === 1 ? '生成中' : '准备中'}${pct}...`;
  }
  return {
    valid: record(taskInfo),
    label,
    queueing,
    status,
    progressPercent,
    fillPercent:
      typeof progressPercent === 'number' && Number.isFinite(progressPercent)
        ? Math.min(100, Math.max(0, progressPercent))
        : 0,
    normalizedStatus,
    failureLabel: normalizedStatus === 4 ? '生成超时' : '生成失败',
    benefitUnsupported: !!taskInfo?.benefitTag,
  };
}

/** Full failure keeps source truthy task ID/reason; recompute footer trims separately. */
export function projectScriptTaskFailure(taskInfo) {
  const normalizedStatus = taskStatus(taskInfo?.status),
    timeout = normalizedStatus === 4;
  return {
    valid: record(taskInfo) && failed(taskInfo),
    label: timeout ? '生成超时' : '生成失败',
    timeout,
    normalizedStatus,
    taskId: taskInfo?.taskId || undefined,
    failedReason: taskInfo?.failedReason || undefined,
  };
}

/** sg is a display track. Its active index neither navigates nor adds stage click actions. */
export function projectScriptCompactProgress(workflow) {
  if (!stageIds.every((id) => record(workflow?.[id])))
    return { valid: false, stages: [], connectors: [], activeIndex: -1 };
  const stages = stageIds.map((id) => workflow[id]),
    firstIncomplete = stages.findIndex((stage) => stage.status !== 'ready'),
    activeIndex = firstIncomplete >= 0 ? firstIncomplete : stages.length - 1;
  return {
    valid: true,
    activeIndex,
    stages: stages.map((stage, index) => ({
      id: stageIds[index],
      status: stage.status,
      visualState:
        stage.status === 'ready'
          ? 'ready'
          : index === activeIndex || stage.status === 'partial' || stage.isBusy
            ? 'active'
            : 'idle',
      label: stageLabels[index],
      number: index + 1,
    })),
    connectors: stages.slice(0, -1).map((stage, index) => ({
      id: stageIds[index],
      complete: stage.status === 'ready',
      left: center(index) + 12 + (center(index + 1) - center(index) - 24 - 55) / 2,
      width: 55,
    })),
  };
}

function withPercent(label, percent) {
  return typeof percent === 'number' && Number.isFinite(percent) ? `${label} ${percent}%` : label;
}

function promptPercent(progressByShot) {
  const values = record(progressByShot) ? Object.values(progressByShot) : [];
  if (!values.length) return undefined;
  return Math.min(
    100,
    Math.max(0, Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length)),
  );
}

function promptNotice(task) {
  if (!isRecompute(task) || !failed(task)) return null;
  const reason = typeof task.failedReason === 'string' ? task.failedReason.trim() : undefined;
  return reason?.includes('取消')
    ? { kind: 'cancelled' }
    : {
        kind: 'failed',
        taskId: typeof task.taskId === 'string' ? task.taskId.trim() || '--' : '--',
        reason,
      };
}

/**
 * Source sT/eB chooses the surface independently of workflow readiness. Optional
 * live progress is controller data; missing percentages are never synthesized.
 */
export function projectScriptV2Card({
  node,
  nodes = [],
  edges = [],
  readonly = false,
  workflow,
  assetProgress,
  promptProgress,
} = {}) {
  const invalid = (reason) => ({ valid: false, reason, canOpen: false, showOpenButton: false });
  if ((node?.type || node?.data?.type) !== 'script-v2') return invalid('not-v2-script');
  if (
    !record(node.data) ||
    !Array.isArray(nodes) ||
    nodes.some((item) => !record(item)) ||
    !Array.isArray(edges)
  )
    return invalid('invalid-input');
  const rows = node.data.rows ?? [];
  if (!Array.isArray(rows) || !rows.every(record)) return invalid('invalid-rows');
  const assets = assetProgress ?? scriptAssetProgress(node.data, nodes),
    stages =
      workflow ??
      scriptWorkflowState(node.data, {
        getNodeUrl: (id) => nodes.find((item) => item.id === id)?.data?.url?.[0],
        assetProgress: assets,
      }),
    compact = projectScriptCompactProgress(stages);
  if (!compact.valid) return invalid('invalid-workflow');
  const task = node.data.taskInfo,
    recompute = isRecompute(task),
    fullGenerationBusy = generating(task) && !recompute,
    fullGenerationFailed = failed(task) && !recompute,
    hasConnection = edges.some((edge) => edge?.source === node.id || edge?.target === node.id),
    kind = fullGenerationBusy
      ? 'generating'
      : fullGenerationFailed
        ? 'failed'
        : rows.length
          ? 'resource'
          : hasConnection
            ? 'pending'
            : 'empty_generate',
    labels = [],
    recomputing = !!promptProgress?.inProgress || (recompute && generating(task));
  if (assets.inProgress) labels.push(withPercent('资产生成中', assets.progressPercent));
  if (recomputing)
    labels.push(withPercent('合成提示词中', promptPercent(promptProgress?.progressByShot)));
  return {
    valid: true,
    reason: '',
    kind,
    title: node.data.title || node.data.name || node.data.label || '脚本',
    workflow: stages,
    compact,
    fullGenerationBusy,
    canOpen: !readonly && (kind === 'resource' || kind === 'failed'),
    showOpenButton: !readonly && kind === 'resource',
    generatingLabel: labels.length ? `${labels.join('，')}...` : undefined,
    notice: kind === 'resource' ? promptNotice(task) : null,
  };
}

/** Source tO writes a blank first row and empty assets; caller opens confirm-shots separately. */
export function createScriptV2ManualPatch({ makeId } = {}) {
  if (typeof makeId !== 'function') throw new Error('创建镜头需要标识生成器');
  return {
    rows: [createStoryboardRow(1, makeId)],
    assets: { characters: [], scenes: [], props: [] },
    viewMode: 'table',
    activeViewId: 'default',
  };
}
