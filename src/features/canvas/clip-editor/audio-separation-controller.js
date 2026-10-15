import { attachDetachedAudio } from './domain/audio-separation-model.js';

function waitForReady({ session, signal, getState, subscribe, timeoutMs = 15000 }) {
  return new Promise((resolve) => {
    let timer = null;
    let finished = false;
    const check = () => {
      const candidate = getState();
      if (
        candidate?.draftSession === session &&
        candidate.initialized &&
        candidate.ready &&
        !candidate.conflicted
      )
        finish(candidate);
    };
    const finish = (value) => {
      if (finished) return;
      finished = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      unsubscribe?.();
      signal?.removeEventListener('abort', onAbort);
      resolve(value);
    };
    const onAbort = () => finish(null);
    const unsubscribe = subscribe(check);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = globalThis.setTimeout(() => finish(null), timeoutMs);
    check();
  });
}

/** Runs the asynchronous browser extraction/upload phase outside the Canvas entry chunk. */
export async function runDetachedAudioOperation({
  clipId,
  captured,
  media,
  session,
  signal,
  extractAudio,
  uploadFiles,
  getState,
  subscribe,
  isCurrentSession,
  acceptEdit,
}) {
  try {
    const extracted = await extractAudio(media.url, { signal });
    if (!isCurrentSession()) return { ok: false, cancelled: true };
    const uploaded = await uploadFiles([extracted.file], {
      targetId: captured.nodeId,
      signal,
      isCurrent: isCurrentSession,
    });
    const audioNode = uploaded?.find((item) => item.type === 'audio');
    if (!audioNode || !isCurrentSession()) return { ok: false, message: '分离音轨未能加入画布' };
    const readyState = await waitForReady({ session, signal, getState, subscribe });
    if (!readyState || !isCurrentSession())
      return { ok: false, message: '分离音轨仍在准备，请稍后重试' };
    const audioMedia = readyState.mediaBySourceId.get(audioNode.id);
    const audioUrl = audioNode.data?.url?.[0] || audioMedia?.url;
    const durationSec = audioMedia?.metadata?.sourceDuration || extracted.durationSec;
    const result = attachDetachedAudio(readyState.timeline, {
      videoClipId: clipId,
      audioId: audioNode.id,
      audioSourceNodeId: audioNode.id,
      url: audioUrl,
      durationSec,
    });
    if (result.status !== 'detached' || !acceptEdit(result))
      return { ok: false, message: '分离音轨未能保存到时间轴' };
    return { ok: true };
  } catch (error) {
    if (signal?.aborted || !isCurrentSession()) return { ok: false, cancelled: true };
    return { ok: false, message: error.message || '分离音轨失败，请重试' };
  }
}
