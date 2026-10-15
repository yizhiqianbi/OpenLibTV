export const CLIP_DISCONNECT_BUSY = '智能剪辑进行中，暂时无法断开素材连线';
export const CLIP_DISCONNECT_DENIED = '部分节点正在被其他成员编辑，已保留选中';
export const CLIP_DISCONNECT_HTTP_FAILED = '删除已同步到本地，但同步到云端失败，请检查网络';
export const CLIP_DISCONNECT_UNAVAILABLE = '智能剪辑断线暂不可用：未连接编辑锁服务';
export const CLIP_DISCONNECT_FAILED = '智能剪辑连线未断开，请重试';

/** Source feedback distinguishes lock denial from an already-local HTTP failure. */
export function clipDisconnectFeedback(failures) {
  const selectedNodeIds = failures
    .filter((failure) => ['denied', 'timeout'].includes(failure.reason))
    .map((failure) => failure.nodeId);
  const messages = [];
  if (selectedNodeIds.length) messages.push(CLIP_DISCONNECT_DENIED);
  if (failures.some((failure) => failure.reason === 'http_failed'))
    messages.push(CLIP_DISCONNECT_HTTP_FAILED);
  return { selectedNodeIds, messages };
}
