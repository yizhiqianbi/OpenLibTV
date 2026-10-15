export const VOCAL_SPLIT_CHOICES = Object.freeze([
  { value: 'vocals', label: '仅保留人声' },
  { value: 'background', label: '仅保留背景音' },
  { value: 'sfx', label: '仅保留音效' },
]);

export function vocalSplitBlockReason({ clip, sourceNode, media, maxDurationSec = 180 } = {}) {
  if (!clip || clip.type === 'audio') return '请先选中视频片段';
  if (clip.loading === true) return '请等待视频片段加载完成';
  if (clip.embedAudioMuted === true) return '该片段已做人声分离或音视频分离';
  if (sourceNode?.data?.videoHasAudioTrack === false) return '当前视频无音轨，无法使用人声分离';
  if (!media?.url?.trim()) return '当前没有可分离的视频地址';
  const duration = Number(media.metadata?.sourceDuration ?? clip.sourceDuration ?? 0);
  if (Number.isFinite(duration) && duration > maxDurationSec)
    return `视频时长超过 ${Math.round(maxDurationSec / 60)} 分钟，暂不支持人声分离`;
  return null;
}

export function vocalSplitChoice(value) {
  return VOCAL_SPLIT_CHOICES.find((choice) => choice.value === value)?.value || null;
}
