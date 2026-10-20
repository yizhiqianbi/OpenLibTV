import { describe, expect, it, vi } from 'vitest';
import { extractWaveformFromAudioBuffer, extractWaveformFromUrl } from './waveform-service.js';

function fakeBuffer() {
  return {
    numberOfChannels: 2,
    sampleRate: 8000,
    length: 4,
    duration: 4 / 8000,
    getChannelData: (index) =>
      index === 0 ? new Float32Array([-1, -0.2, 0.2, 0.8]) : new Float32Array([0, 0.4, -0.6, 1]),
  };
}

describe('clip waveform service', () => {
  it('extracts channel extrema into bounded pairs', () => {
    const result = extractWaveformFromAudioBuffer(fakeBuffer(), { pairCount: 2 });
    expect(result).toMatchObject({ status: 'ready', duration: 4 / 8000 });
    expect(result.peaks[0]).toBe(-1);
    expect(result.peaks[1]).toBeCloseTo(0.4);
    expect(result.peaks[2]).toBeCloseTo(-0.6);
    expect(result.peaks[3]).toBe(1);
  });

  it('fetches, decodes and closes the context', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const decodeAudioData = vi.fn().mockResolvedValue(fakeBuffer());
    const result = await extractWaveformFromUrl('blob:audio', {
      fetchImpl: vi
        .fn()
        .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) }),
      audioContextFactory: () => ({ decodeAudioData, close }),
      pairCount: 2,
    });
    expect(result.peaks[0]).toBe(-1);
    expect(result.peaks[1]).toBeCloseTo(0.4);
    expect(result.peaks[2]).toBeCloseTo(-0.6);
    expect(result.peaks[3]).toBe(1);
    expect(decodeAudioData).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps unsupported browsers explicit and preserves cancellation', async () => {
    await expect(
      extractWaveformFromUrl('/audio.wav', {
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)),
        }),
        audioContextFactory: () => null,
      }),
    ).resolves.toMatchObject({ status: 'unsupported', peaks: [] });
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractWaveformFromUrl('/audio.wav', { fetchImpl: vi.fn(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does not turn an all-invalid decoded buffer into a full-height waveform', () => {
    expect(() =>
      extractWaveformFromAudioBuffer({
        numberOfChannels: 1,
        length: 2,
        duration: 1,
        getChannelData: () => new Float32Array([Number.NaN, Number.NaN]),
      }),
    ).toThrow('无法读取音频波形');
  });
});
