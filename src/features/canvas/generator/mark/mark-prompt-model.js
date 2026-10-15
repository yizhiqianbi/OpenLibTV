import { markTokenOccurrences, replaceAllMarkTokens } from './mark-token-model.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const label = (value) => typeof value === 'string' && value.length > 0;

/** Only real current metadata can turn a token into a labelled badge. Unknown tokens remain text. */
export function resolveMarkPromptToken(token, magicList) {
  if (typeof token !== 'string' || !record(magicList)) return null;
  const match = token.match(/^\{\{magic:([^:}]+):(\d+)\}\}$/);
  if (!match || !Object.hasOwn(magicList, match[1])) return null;
  const entry = magicList[match[1]];
  const index = Number(match[2]);
  if (!record(entry) || !Array.isArray(entry.suggestions) || !Number.isSafeInteger(index))
    return null;
  const suggestion = entry.suggestions[index];
  if (!record(suggestion) || !label(suggestion.label)) return null;
  const options = entry.suggestions.flatMap((item, optionIndex) =>
    record(item) && label(item.label) ? [{ index: optionIndex, label: item.label }] : [],
  );
  return {
    kind: 'magic',
    token,
    magicId: match[1],
    magicIndex: index,
    label: suggestion.label,
    imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : '',
    options,
  };
}

export function markPromptTokens(value, magicList) {
  return markTokenOccurrences(value).flatMap((item) => {
    const part = resolveMarkPromptToken(item.token, magicList);
    return part ? [{ ...part, from: item.from, to: item.to }] : [];
  });
}

/** Prompt menus update all valid same-ID occurrences; surface menus use the separate first helper. */
export function selectMarkPromptSuggestion(value, magicList, id, index) {
  if (!Number.isSafeInteger(index) || index < 0) return null;
  const part = resolveMarkPromptToken(`{{magic:${id}:${index}}}`, magicList);
  return part ? replaceAllMarkTokens(value, id, index) : null;
}

/** Preserve plain-text selection offsets across canonical token length changes. */
export function mapMarkPromptSelectionOffset(value, id, index, offset) {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > value.length
  )
    return null;
  let delta = 0;
  for (const token of markTokenOccurrences(value)) {
    if (token.id !== id) continue;
    const size = `{{magic:${id}:${index}}}`.length;
    if (offset >= token.to) delta += size - token.token.length;
    else if (offset > token.from) return token.from + delta + size;
    else break;
  }
  return offset + delta;
}
