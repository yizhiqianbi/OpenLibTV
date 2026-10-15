const scriptTypes = new Set(['script', 'script-v2']);
const linkedGroup = (node) =>
  node?.type === 'group' &&
  typeof node.data?.sourceScriptNodeId === 'string' &&
  node.data.sourceScriptNodeId.length > 0;
const hasGeneratedContent = (node) =>
  [node?.data?.url, node?.data?.content].some(
    (items) =>
      Array.isArray(items) && items.some((item) => typeof item === 'string' && item.trim()),
  );
const notice = (title, message) => ({
  title,
  message,
  confirmText: '确定删除',
  cancelText: '取消',
});

function groupNotice(groups) {
  if (!groups.length) return null;
  const video = groups.some((node) => node.data?.storyboardGroupType === 'video');
  const image = groups.some((node) => node.data?.storyboardGroupType !== 'video');
  if (video && image)
    return notice(
      '删除分镜组',
      '删除后组内所有节点及其与脚本的关联关系将消失，无法重新生成关联分镜图和批量生视频了。确定要删除吗？',
    );
  return video
    ? notice(
        '删除分镜视频组',
        '删除分镜视频组后，组内所有视频及其与分镜图的关联关系将消失。确定要删除吗？',
      )
    : notice(
        '删除分镜图组',
        '删除分镜图组后，组内所有分镜图及其与脚本的关联关系将消失。确定要删除吗？',
      );
}

/** Keyboard onBeforeDelete and menu delete have distinct source qualification rules. */
export function canvasDeletionConfirmation({
  nodes = [],
  nodeIds = [],
  trigger = 'keyboard',
  isMac = false,
} = {}) {
  const ids = new Set(Array.isArray(nodeIds) ? nodeIds : []);
  const selected = Array.isArray(nodes) ? nodes.filter((node) => node && ids.has(node.id)) : [];
  if (!selected.length || !['keyboard', 'menu'].includes(trigger)) return null;
  const undo = isMac ? '⌘Z' : 'Ctrl+Z';
  if (
    selected.some((node) =>
      trigger === 'keyboard' ? scriptTypes.has(node.type) : node.type === 'script',
    )
  )
    return notice(
      '确认删除',
      `删除当前节点后，数据可能会丢失，也可通过 ${undo} 撤销。确定要删除吗？`,
    );
  const oldGroups = selected.filter(
    (node) => linkedGroup(node) && node.data.sourceScriptVersion !== 'v2',
  );
  const grouped = groupNotice(oldGroups);
  if (grouped) return grouped;
  if (trigger === 'keyboard')
    return selected.some((node) => node.type === 'video' && node.data?.openingUsed)
      ? notice(
          '确认删除该节点？',
          '删除该视频节点后，与「创意片头」相关的生成内容也将被永久删除，已发送到画布的内容不受影响',
        )
      : null;
  // Linked v2 groups take the source direct branch, even with generated URLs.
  return selected.some(
    (node) =>
      !(linkedGroup(node) && node.data.sourceScriptVersion === 'v2') && hasGeneratedContent(node),
  )
    ? notice('删除节点', `该节点包含已生成的内容，删除后可通过 ${undo} 撤销。确定删除？`)
    : null;
}
