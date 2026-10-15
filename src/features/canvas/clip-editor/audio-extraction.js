const WAV_HEADER_BYTES = 44;

function assertNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index++)
    view.setUint8(offset + index, value.charCodeAt(index));
}

/** Encode an AudioBuffer into the PCM WAV file used by the local audio-node adapter. */
export function encodePcmWav(audioBuffer) {
  const channels = Math.max(1, Math.min(2, Math.floor(audioBuffer?.numberOfChannels || 0)));
  const sampleRate = Math.max(1, Math.floor(audioBuffer?.sampleRate || 0));
  const frameCount = Math.max(0, Math.floor(audioBuffer?.length || 0));
  if (!sampleRate || !frameCount || !audioBuffer?.getChannelData)
    throw new Error('无法读取视频内嵌音轨');
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frameCount * blockAlign;
  const output = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(output);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  const tracks = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
  let offset = WAV_HEADER_BYTES;
  for (let frame = 0; frame < frameCount; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, Number(tracks[channel]?.[frame] ?? 0)));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([output], { type: 'audio/wav' });
}

/**
 * Decode a video URL locally and return a real WAV File. This is intentionally
 * adapter-shaped: remote URLs still need CORS and an operational service, while
 * data/blob URLs from local uploads can be handled entirely in the browser.
 */
export async function extractEmbeddedAudioAsWav(
  url,
  {
    signal,
    fetchImpl = globalThis.fetch,
    audioContextFactory = () => {
      const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
      return Constructor ? new Constructor() : null;
    },
    fileFactory = (parts, name, options) => new File(parts, name, options),
  } = {},
) {
  if (typeof url !== 'string' || !url.trim()) throw new Error('当前没有可分离的视频地址');
  if (typeof fetchImpl !== 'function') throw new Error('当前浏览器不支持读取视频音轨');
  assertNotAborted(signal);
  const response = await fetchImpl(url, { signal });
  if (!response?.ok) throw new Error('无法读取视频内嵌音轨');
  const bytes = await response.arrayBuffer();
  assertNotAborted(signal);
  const context = audioContextFactory();
  if (!context?.decodeAudioData) throw new Error('当前浏览器不支持读取视频音轨');
  try {
    const audioBuffer = await context.decodeAudioData(bytes.slice(0));
    assertNotAborted(signal);
    const durationSec = Number(audioBuffer.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0)
      throw new Error('视频没有可读取的内嵌音轨');
    return {
      file: fileFactory([encodePcmWav(audioBuffer)], '分离音轨.wav', { type: 'audio/wav' }),
      durationSec,
    };
  } finally {
    await context.close?.();
  }
}
