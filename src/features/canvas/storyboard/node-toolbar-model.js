import { isScriptV2 } from './script-model.js';
import { scriptFullGenerationBusy } from './workflow-model.js';

const header = '开始批量生成前，请先完成：';
const requirements = {
  shots: '「确认镜头」— 至少 1 条镜头有画面内容',
  assets: '「准备资产」— 为角色 / 场景 / 道具准备形象图',
  prompts: '「合成提示词」— 每镜生成分镜与视频运动提示词',
  rows: '至少保留 1 个镜头',
  video: '切换到支持「首帧生视频」的视频模型',
};

/** 182004 normalizes finite numeric/string statuses; 959248/M also requires loading=false. */
function failedFullGeneration(task) {
  const value = task?.status;
  const status =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : undefined;
  return (
    task?.loading === false &&
    Number.isFinite(status) &&
    [3, 4].includes(status) &&
    task.scriptV2TaskMode !== 'recompute-batch-shots'
  );
}

/** 272776 sx/sv at 1326947: do not replace usable prompts with synced-stage readiness. */
function batchDisabledReason(workflow, { rowsEmpty = false, videoUnavailable = false } = {}) {
  const steps = [];
  if (workflow?.shots?.status !== 'ready') steps.push(requirements.shots);
  if (workflow?.assets?.status !== 'ready') steps.push(requirements.assets);
  if (!workflow?.promptsUsableForGeneration) steps.push(requirements.prompts);
  if (rowsEmpty) steps.push(requirements.rows);
  if (videoUnavailable) steps.push(requirements.video);
  return steps.length
    ? `${header}\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`
    : '';
}

const action = (enabled, disabledReason = '') => ({
  enabled,
  disabledReason: enabled ? '' : disabledReason,
});

/**
 * 272776 sT/eK + si at 1387014/1314283. The caller supplies its existing workflow and
 * source ea selection/focus result; this projection does not scan the graph again.
 * videoAvailable is source Z: any global support.video candidate usable for mixed(1),
 * regardless of its catalogue disable metadata. Unknown support stays unavailable.
 * ready/tablePending/tableError and hidden-owner action guards are local safety adapters.
 * Service availability is deliberately owned by the request controller, not si's gates.
 */
export function describeScriptV2NodeToolbar({
  node,
  workflow,
  selectionEligible = false,
  ready = false,
  readonly = false,
  tablePending = false,
  tableError = false,
  videoAvailable = false,
} = {}) {
  const v2 = isScriptV2(node);
  const data = node?.data;
  const hasRows = Array.isArray(data?.rows) && data.rows.length > 0;
  const fullGenerationBusy = v2 && scriptFullGenerationBusy(data);
  const visible = Boolean(
    v2 &&
    selectionEligible &&
    !readonly &&
    !fullGenerationBusy &&
    (hasRows || failedFullGeneration(data?.taskInfo)),
  );
  const ownerReason = !v2
    ? '当前节点不是新版脚本'
    : readonly
      ? '只读画布无法操作脚本工具栏'
      : !ready
        ? '画布尚未就绪'
        : !selectionEligible
          ? '请先选中脚本节点'
          : tablePending
            ? '正在保存脚本，请稍后再试'
            : tableError
              ? '脚本保存失败，请先重试'
              : fullGenerationBusy
                ? '脚本正在生成，请稍后再试'
                : !visible
                  ? '当前脚本暂无可用工具栏'
                  : '';
  const available = visible && !ownerReason;
  const imageReady = Boolean(workflow?.outputGenerationReady);
  const videoReady = imageReady && hasRows && Boolean(videoAvailable);
  return {
    visible,
    fullGenerationBusy,
    actions: {
      regenerate: action(available, ownerReason),
      image: action(available && imageReady, ownerReason || batchDisabledReason(workflow)),
      video: action(
        available && videoReady,
        ownerReason ||
          batchDisabledReason(workflow, {
            rowsEmpty: !hasRows,
            videoUnavailable: !videoAvailable,
          }),
      ),
      // si provides a download title, but no readiness tooltip for disabled exports.
      download: action(available && Boolean(workflow?.allReady), ownerReason),
    },
  };
}
