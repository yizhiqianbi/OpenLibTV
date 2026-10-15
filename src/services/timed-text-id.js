import { timedTextDigestSync } from './timed-text-digest.ts';

/** An identifier digest; this service supplies no authentication or authorization. */
export async function timedTextDigest(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Source iP: deterministic cue anchor. */
export async function createTimedTextCueId(text, start, duration, namespace = '', existing = []) {
  const body = `${namespace.trim()}|${text.trim()}|${Math.round((Number.isFinite(start) ? start : 0) * 1000)}|${Math.round((Number.isFinite(duration) ? duration : 0) * 1000)}`;
  const hash = (await timedTextDigest(body)).slice(0, 6);
  const base = `c-${hash}`,
    used = new Set(existing.map((cue) => cue.cueId));
  let result = base,
    ordinal = 2;
  while (used.has(result)) result = `${base}-${ordinal++}`;
  return result;
}

export function createTimedTextCueIdSync(text, start, duration, namespace = '', existing = []) {
  const body = `${namespace.trim()}|${text.trim()}|${Math.round((Number.isFinite(start) ? start : 0) * 1000)}|${Math.round((Number.isFinite(duration) ? duration : 0) * 1000)}`;
  const base = `c-${timedTextDigestSync(body).slice(0, 6)}`;
  const used = new Set(existing.map((cue) => cue.cueId));
  let value = base,
    ordinal = 2;
  while (used.has(value)) value = `${base}-${ordinal++}`;
  return value;
}
