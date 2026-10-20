import { vocalSplitBlockReason, vocalSplitChoice } from './domain/vocal-separation-model.js';

export async function runVocalSplitOperation({
  clipId,
  sourceNodeId,
  sourceUrl,
  session,
  choice,
  service,
  isCurrent,
}) {
  const normalizedChoice = vocalSplitChoice(choice);
  if (!normalizedChoice) return { ok: false, cancelled: true };
  if (typeof service !== 'function') return { ok: false, message: '人声分离服务尚未连接' };
  try {
    const result = await service({
      clipId,
      choice: normalizedChoice,
      sourceNodeId,
      sourceUrl,
      isCurrent,
    });
    if (!isCurrent()) return { ok: false, cancelled: true };
    return result?.ok
      ? { ok: true }
      : { ok: false, message: result?.message || '人声分离失败，请重试' };
  } catch (error) {
    return { ok: false, message: error.message || '人声分离失败，请重试' };
  }
}

export async function runVocalSplitAction({ clipId, choice, getState, service, notify }) {
  const captured = getState();
  const clip = captured?.timeline?.clips.find((item) => item.id === clipId);
  const media = clip?.sourceNodeId ? captured.mediaBySourceId.get(clip.sourceNodeId) : null;
  if (!clip || !media?.url) return false;
  const blockReason = vocalSplitBlockReason({ clip, media });
  if (blockReason) {
    notify?.(blockReason);
    return false;
  }
  const session = captured.draftSession;
  const isCurrent = () => getState()?.draftSession === session && !getState()?.conflicted;
  const result = await runVocalSplitOperation({
    clipId,
    sourceNodeId: clip.sourceNodeId,
    sourceUrl: media.url,
    session,
    choice,
    service,
    isCurrent,
  });
  if (result.ok) {
    notify?.('人声分离任务已提交，等待服务回写结果');
    return true;
  }
  if (!result.cancelled && isCurrent()) notify?.(result.message || '人声分离失败，请重试');
  return false;
}
