const DEFAULT_MAX_PAIRS = 256;

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Normalize the min/max pair format used by the source waveform service.
 * Invalid samples are discarded as a whole pair so a late/partial payload
 * cannot draw a misleading half-bar.
 */
export function normalizeWaveformPeaks(input, { maxPairs = DEFAULT_MAX_PAIRS } = {}) {
  const raw = input?.peaks ?? input;
  if (!raw || typeof raw[Symbol.iterator] !== 'function') return [];
  const values = [];
  const rawValues = Array.from(raw);
  for (let index = 0; index + 1 < rawValues.length; index += 2) {
    const first = finite(rawValues[index]);
    const second = finite(rawValues[index + 1]);
    if (first === null || second === null) continue;
    values.push(clamp(first, -1, 1), clamp(second, -1, 1));
  }
  const pairCount = Math.floor(values.length / 2);
  if (!pairCount) return [];
  const limit = Math.max(1, Math.floor(Number(maxPairs) || DEFAULT_MAX_PAIRS));
  if (pairCount <= limit) {
    const pairs = [];
    for (let index = 0; index < pairCount; index++) {
      const first = values[index * 2];
      const second = values[index * 2 + 1];
      pairs.push(Math.min(first, second), Math.max(first, second));
    }
    return pairs;
  }

  const reduced = [];
  for (let bucket = 0; bucket < limit; bucket++) {
    const start = Math.ceil((bucket * pairCount) / limit);
    const end = Math.max(start + 1, Math.ceil(((bucket + 1) * pairCount) / limit));
    let minimum = 1;
    let maximum = -1;
    for (let index = start; index < Math.min(end, pairCount); index++) {
      minimum = Math.min(minimum, values[index * 2], values[index * 2 + 1]);
      maximum = Math.max(maximum, values[index * 2], values[index * 2 + 1]);
    }
    reduced.push(minimum, maximum);
  }
  return reduced;
}

/** Create one filled SVG path from normalized min/max pairs. */
export function waveformPath(peaks, { gain = 1 } = {}) {
  const normalized = normalizeWaveformPeaks(peaks);
  const pairCount = normalized.length / 2;
  if (!pairCount) return '';
  const amplitude = clamp(Number(gain) || 0, 0, 2);
  const upper = [];
  const lower = [];
  for (let index = 0; index < pairCount; index++) {
    const x = pairCount === 1 ? 0 : (index / (pairCount - 1)) * 100;
    const minimum = normalized[index * 2] * amplitude;
    const maximum = normalized[index * 2 + 1] * amplitude;
    const top = clamp(50 - maximum * 46, 2, 98);
    const bottom = clamp(50 - minimum * 46, 2, 98);
    upper.push(`${index ? 'L' : 'M'}${x.toFixed(2)} ${top.toFixed(2)}`);
    lower.push(`L${x.toFixed(2)} ${bottom.toFixed(2)}`);
  }
  return `${upper.join(' ')} ${lower.reverse().join(' ')} Z`;
}

export const waveformDefaults = Object.freeze({ maxPairs: DEFAULT_MAX_PAIRS });
