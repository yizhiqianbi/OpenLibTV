const validId = (value) => typeof value === 'string' && value.length > 0;
const validStableId = (value) => validId(value) && !/[:}]/.test(value);

export const MARK_MAX_OCCURRENCES = 20;

/** Every regex occurrence counts, including duplicate IDs and missing metadata. */
export function markTokenOccurrences(prompt) {
  if (typeof prompt !== 'string') return [];
  return Array.from(prompt.matchAll(/\{\{magic:([^:}]+):(\d+)\}\}/g), (match) => ({
    id: match[1],
    selectedIndex: Number(match[2]),
    from: match.index,
    to: match.index + match[0].length,
    token: match[0],
  }));
}

export function insertMarkToken(prompt, stableId, selectedIndex = 0, cursorOffset = null) {
  if (
    typeof prompt !== 'string' ||
    !validStableId(stableId) ||
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0 ||
    markTokenOccurrences(prompt).length >= MARK_MAX_OCCURRENCES
  )
    return null;
  const token = `{{magic:${stableId}:${selectedIndex}}}`;
  if (Number.isInteger(cursorOffset) && cursorOffset >= 0 && cursorOffset <= prompt.length) {
    const before = prompt.slice(0, cursorOffset),
      after = prompt.slice(cursorOffset);
    const prefix = before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
    const suffix = after && !after.startsWith(' ') && !after.startsWith('\n') ? ' ' : '';
    return `${before}${prefix}${token}${suffix}${after}`;
  }
  return prompt ? `${prompt} ${token}` : token;
}

function firstTokenRange(prompt, stableId) {
  if (typeof prompt !== 'string' || !validStableId(stableId)) return null;
  const prefix = `{{magic:${stableId}:`,
    from = prompt.indexOf(prefix);
  if (from < 0) return null;
  const end = prompt.indexOf('}}', from + prefix.length);
  return end < 0 ? null : { from, to: end + 2 };
}

export function replaceFirstMarkToken(prompt, stableId, selectedIndex) {
  if (typeof prompt !== 'string' || !Number.isSafeInteger(selectedIndex) || selectedIndex < 0)
    return null;
  const range = firstTokenRange(prompt, stableId);
  return range
    ? `${prompt.slice(0, range.from)}{{magic:${stableId}:${selectedIndex}}}${prompt.slice(range.to)}`
    : prompt;
}

/** Only adjacent ASCII spaces are swallowed; source's final trim also trims outer whitespace. */
export function deleteFirstMarkToken(prompt, stableId) {
  if (typeof prompt !== 'string' || !validStableId(stableId)) return null;
  const range = firstTokenRange(prompt, stableId);
  if (!range) return prompt;
  let { from, to } = range;
  while (from > 0 && prompt[from - 1] === ' ') from--;
  while (to < prompt.length && prompt[to] === ' ') to++;
  return `${prompt.slice(0, from)} ${prompt.slice(to)}`.trim();
}

/** Prompt badge menus update every valid occurrence; surface menus use the first-prefix helper. */
export function replaceAllMarkTokens(prompt, stableId, selectedIndex) {
  if (
    typeof prompt !== 'string' ||
    !validStableId(stableId) ||
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0
  )
    return null;
  return prompt.replace(/\{\{magic:([^:}]+):(\d+)\}\}/g, (token, id) =>
    id === stableId ? `{{magic:${stableId}:${selectedIndex}}}` : token,
  );
}
