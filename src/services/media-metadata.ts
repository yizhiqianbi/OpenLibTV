export type VideoMetadata = {
  width?: number;
  height?: number;
  durationSec?: number;
  byteSize?: number;
};
export type VideoMetadataResult = { metadata: VideoMetadata; errors: string[] };
export type VideoMetadataOptions = {
  signal?: AbortSignal;
  needSize?: boolean;
  timeoutMs?: number;
  createVideo?: () => HTMLVideoElement;
  readSize?: (url: string, signal: AbortSignal) => Promise<number | undefined>;
};
const positive = (value: number) => Number.isFinite(value) && value > 0;
const aborted = () => new DOMException('Media metadata read cancelled', 'AbortError');

/** Reads an existing resource; no upload, playback, account, or generation request. */
export async function probeVideoMetadata(
  url: string,
  {
    signal,
    needSize = false,
    timeoutMs = 12_000,
    createVideo = () => document.createElement('video'),
    readSize = async (source, abortSignal) => {
      const response = await fetch(source, {
        method: 'HEAD',
        credentials: 'omit',
        signal: abortSignal,
      });
      if (!response.ok) throw new Error('素材大小读取失败');
      const value = Number(response.headers.get('Content-Length'));
      return positive(value) ? value : undefined;
    },
  }: VideoMetadataOptions = {},
): Promise<VideoMetadataResult> {
  if (signal?.aborted) throw aborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const media = new Promise<VideoMetadata>((resolve, reject) => {
      const video = createVideo();
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        const metadata: VideoMetadata = {};
        if (positive(video.videoWidth)) metadata.width = video.videoWidth;
        if (positive(video.videoHeight)) metadata.height = video.videoHeight;
        if (positive(video.duration)) metadata.durationSec = video.duration;
        video.removeEventListener('loadedmetadata', loaded);
        video.removeEventListener('error', failed);
        controller.signal.removeEventListener('abort', cancelled);
        video.pause();
        video.removeAttribute('src');
        video.load();
        if (error) reject(error);
        else resolve(metadata);
      };
      const loaded = () => finish();
      const failed = () => finish(new Error('素材时长和尺寸读取失败'));
      const cancelled = () => finish(aborted());
      video.addEventListener('loadedmetadata', loaded);
      video.addEventListener('error', failed);
      controller.signal.addEventListener('abort', cancelled, { once: true });
      video.preload = 'metadata';
      video.muted = true;
      video.src = url;
      video.load();
    });
    const size = needSize ? readSize(url, controller.signal) : Promise.resolve(undefined);
    const [mediaResult, sizeResult] = await Promise.allSettled([media, size]);
    if (signal?.aborted) throw aborted();
    const metadata = mediaResult.status === 'fulfilled' ? mediaResult.value : {};
    const errors: string[] = [];
    if (mediaResult.status === 'rejected') errors.push('素材时长和尺寸读取失败');
    if (sizeResult.status === 'fulfilled' && sizeResult.value) metadata.byteSize = sizeResult.value;
    else if (needSize) errors.push('素材大小尚未读取');
    return { metadata, errors };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
