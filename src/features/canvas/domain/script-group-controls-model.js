const hasUrl = (value) =>
  (Array.isArray(value) ? value : [value]).some(
    (url) => typeof url === 'string' && url.trim().length > 0,
  );

/** Group renderer eX matches actual image children to script rows, not array indices. */
export function canvasGroupVideoAvailability(nodes, groupId) {
  const group = nodes.find((node) => node.id === groupId);
  const data = group?.data;
  const linked = Boolean(data?.sourceScriptNodeId);
  const image = linked && data.storyboardGroupType !== 'video';
  if (!image || data.sourceScriptVersion === 'v2') return { visible: false, enabled: false };
  const script = nodes.find((node) => node.id === data.sourceScriptNodeId);
  const children = nodes.filter((node) => node.parentId === groupId && node.type === 'image');
  const byRow = new Map();
  for (const child of children) {
    const key = child.data?.scriptRowHiddenUuid;
    if (key && Array.isArray(child.data?.url) && hasUrl(child.data.url) && !byRow.has(key))
      byRow.set(key, child);
  }
  const readyCount = (Array.isArray(script?.data?.rows) ? script.data.rows : []).filter(
    (row) => row.hiddenUuid && byRow.has(row.hiddenUuid),
  ).length;
  const replaced = script?.data?.linkedImageGroupId && script.data.linkedImageGroupId !== groupId;
  return {
    visible: true,
    enabled: !replaced && readyCount > 0,
    readyCount,
    reason: replaced
      ? '当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组'
      : readyCount <= 0
        ? '请先生成至少 1 张分镜图后再批量生成视频'
        : undefined,
  };
}

/** Actual tz caller: v1 image content does not enable the helper's regenerate branch. */
export function canvasScriptGroupRunConfirmation(nodes, groupId) {
  const group = nodes.find((node) => node.id === groupId);
  if (group?.type !== 'group' || !group.data?.sourceScriptNodeId) return null;
  const video = group.data.storyboardGroupType === 'video';
  const mode = video ? 'storyboard-video-regenerate' : 'storyboard-image-regenerate';
  const v2 = group.data.sourceScriptVersion === 'v2';
  if (v2) return { mode, kind: 'power', title: '整组执行', confirmText: '开始执行' };
  if (!video)
    return {
      mode,
      kind: 'simple',
      title: '生成分镜图',
      message: '将对组内所有分镜图开始生成，是否继续？',
      confirmText: '开始生成',
    };
  const pending = nodes.filter((node) => {
    if (node.parentId !== groupId || node.type !== 'video') return false;
    const status = node.data?.taskInfo?.status;
    const failed =
      ((typeof status === 'number' && Number.isFinite(status)) ||
        (typeof status === 'string' && status.trim())) &&
      [3, 4].includes(Number(status)) &&
      node.data?.taskInfo?.loading === false;
    return !node.data?.url?.length || failed;
  }).length;
  return {
    mode,
    kind: 'simple',
    title: '重新生成视频',
    message: pending
      ? `将对 ${pending} 个未完成视频重新生成，是否继续？`
      : '所有视频重新生成，是否继续？',
    confirmText: '开始生成',
  };
}
