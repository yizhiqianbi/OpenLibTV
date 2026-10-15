const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Source core w: prompt edits prune metadata by exact lower-case token IDs, never by point count. */
export function patchCanvasMagicPrompt(params, prompt) {
  if (!record(params) || typeof prompt !== 'string') return null;
  let next = params.prompt === prompt ? params : { ...params, prompt };
  const metadata = params.magicList;
  if (!record(metadata) || Object.keys(metadata).length === 0) return next;
  const used = new Set();
  for (const match of prompt.matchAll(/\{\{magic:([^:}]+):(\d+)\}\}/g)) used.add(match[1]);
  if (Object.keys(metadata).every((id) => used.has(id))) return next;
  const remaining = Object.fromEntries(Object.entries(metadata).filter(([id]) => used.has(id)));
  next = { ...next, magicList: Object.keys(remaining).length ? remaining : undefined };
  return next;
}
