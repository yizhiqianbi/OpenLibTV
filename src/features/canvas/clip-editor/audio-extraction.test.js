import { describe, expect, it, vi } from 'vitest';
import { encodePcmWav, extractEmbeddedAudioAsWav } from './audio-extraction.js';

function fakeBuffer() {
  return {
    numberOfChannels: 1,
    sampleRate: 8000,
    length: 3,
    duration: 3 / 8000,
    getChannelData: () => new Float32Array([-1, 0, 1]),
  };
}

describe('embedded audio extraction', () => {
  it('writes a valid mono PCM WAV header and samples', async () => {
    const blob = encodePcmWav(fakeBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 3 * 2);
    const view = new DataView(await blob.arrayBuffer());
    expect(new TextDecoder().decode(new Uint8Array(view.buffer, 0, 4))).toBe('RIFF');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(48, true)).toBe(32767);
  });

  it('fetches, decodes, closes the context and returns a real WAV file', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const decodeAudioData = vi.fn().mockResolvedValue(fakeBuffer());
    const file = { name: '分离音轨.wav', type: 'audio/wav' };
    const result = await extractEmbeddedAudioAsWav('blob:video', {
      fetchImpl: vi
        .fn()
        .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
      audioContextFactory: () => ({ decodeAudioData, close }),
      fileFactory: vi.fn().mockReturnValue(file),
    });
    expect(result).toMatchObject({ file, durationSec: 3 / 8000 });
    expect(decodeAudioData).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps remote failures and cancellation explicit', async () => {
    await expect(
      extractEmbeddedAudioAsWav('/missing.mp4', {
        fetchImpl: vi.fn().mockResolvedValue({ ok: false }),
        audioContextFactory: () => ({ decodeAudioData: vi.fn(), close: vi.fn() }),
      }),
    ).rejects.toThrow('无法读取视频内嵌音轨');
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractEmbeddedAudioAsWav('blob:video', {
        signal: controller.signal,
        fetchImpl: vi.fn(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
