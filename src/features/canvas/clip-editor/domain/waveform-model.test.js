import { describe, expect, it } from 'vitest';
import { normalizeWaveformPeaks, waveformPath } from './waveform-model.js';

describe('clip waveform model', () => {
  it('normalizes min/max order and clamps samples', () => {
    expect(normalizeWaveformPeaks({ peaks: [-2, 0.5, 0.8, -0.4, 1] })).toEqual([
      -1, 0.5, -0.4, 0.8,
    ]);
  });

  it('rejects missing and non-finite pairs without inventing samples', () => {
    expect(normalizeWaveformPeaks(null)).toEqual([]);
    expect(normalizeWaveformPeaks([Number.NaN, 1, 0.2])).toEqual([]);
    expect(normalizeWaveformPeaks([])).toEqual([]);
  });

  it('reduces long payloads to the requested pair count while preserving extrema', () => {
    expect(normalizeWaveformPeaks([-1, 0, -0.2, 0.4, 0.1, 0.9], { maxPairs: 2 })).toEqual([
      -1, 0.4, 0.1, 0.9,
    ]);
  });

  it('creates a closed path with a gain-scaled centerline', () => {
    const path = waveformPath([-1, 1, -0.5, 0.5], { gain: 0.5 });
    expect(path).toMatch(/^M0\.00 /);
    expect(path.endsWith('Z')).toBe(true);
    expect(waveformPath([], { gain: 1 })).toBe('');
  });

  it('keeps output bounded when a fader is muted or overdriven', () => {
    expect(waveformPath([-1, 1], { gain: 0 })).toContain('50.00');
    expect(waveformPath([-1, 1], { gain: 99 })).not.toContain('NaN');
  });
});
