import { normalizeWaveformPeaks } from './domain/waveform-model.js';

const DEFAULT_PAIR_COUNT = 256;

function assertNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function defaultAudioContextFactory() {
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

/** Extract min/max amplitude pairs from a decoded browser AudioBuffer. */
export function extractWaveformFromAudioBuffer(
  audioBuffer,
  { pairCount = DEFAULT_PAIR_COUNT, signal } = {},
) {
  assertNotAborted(signal);
  const frameCount = Math.floor(Number(audioBuffer?.length) || 0);
  const channels = Math.max(0, Math.floor(Number(audioBuffer?.numberOfChannels) || 0));
  if (!frameCount || !channels || typeof audioBuffer?.getChannelData !== 'function')
    throw new Error('无法读取音频波形');
  const count = Math.max(
    1,
    Math.min(Math.floor(Number(pairCount) || DEFAULT_PAIR_COUNT), frameCount),
  );
  const channelData = Array.from({ length: channels }, (_, index) =>
    audioBuffer.getChannelData(index),
  );
  const peaks = [];
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * frameCount) / count);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * frameCount) / count));
    let minimum = 1;
    let maximum = -1;
    let seenSample = false;
    for (let frame = start; frame < Math.min(end, frameCount); frame++) {
      for (const channel of channelData) {
        const sample = Number(channel?.[frame]);
        if (!Number.isFinite(sample)) continue;
        seenSample = true;
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
      }
    }
    if (!seenSample) throw new Error('无法读取音频波形');
    peaks.push(minimum, maximum);
  }
  return {
    status: 'ready',
    duration: Number.isFinite(Number(audioBuffer.duration)) ? Number(audioBuffer.duration) : 0,
    peaks: normalizeWaveformPeaks(peaks, { maxPairs: count }),
  };
}

/**
 * Decode a local or CORS-readable audio URL for the timeline waveform.
 * Failure is deliberately surfaced to the caller; the timeline keeps the
 * clip usable and simply omits a waveform when the browser cannot decode it.
 */
export async function extractWaveformFromUrl(
  url,
  {
    signal,
    fetchImpl = globalThis.fetch,
    audioContextFactory = defaultAudioContextFactory,
    pairCount = DEFAULT_PAIR_COUNT,
  } = {},
) {
  if (typeof url !== 'string' || !url.trim()) throw new Error('当前没有可读取的音频地址');
  if (typeof fetchImpl !== 'function') return { status: 'unsupported', peaks: [] };
  assertNotAborted(signal);
  const response = await fetchImpl(url, { signal });
  if (!response?.ok) throw new Error('无法读取音频波形');
  const bytes = await response.arrayBuffer();
  assertNotAborted(signal);
  const context = audioContextFactory();
  if (!context?.decodeAudioData) return { status: 'unsupported', peaks: [] };
  try {
    const audioBuffer = await context.decodeAudioData(bytes.slice(0));
    return extractWaveformFromAudioBuffer(audioBuffer, { pairCount, signal });
  } finally {
    await context.close?.();
  }
}
