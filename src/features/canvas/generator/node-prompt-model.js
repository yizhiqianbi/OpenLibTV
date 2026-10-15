import { markPromptTokens } from './mark/mark-prompt-model.js';

const TOKEN_TYPES = {
  Image: { list: 'imageList', type: 'image' },
  Portrait: { list: 'portraitList', type: 'image' },
  Video: { list: 'videoList', type: 'video' },
  Audio: { list: 'audioList', type: 'audio' },
  Mixed: { list: 'mixedList', type: 'mixed' },
  Element: { list: 'elementList', type: 'subject' },
};
const LIST_TOKENS = {
  image: 'Image',
  imageList: 'Image',
  portrait: 'Portrait',
  portraitList: 'Portrait',
  video: 'Video',
  videoList: 'Video',
  audio: 'Audio',
  audioList: 'Audio',
  mixed: 'Mixed',
  mixedList: 'Mixed',
  subject: 'Element',
  subjectList: 'Element',
  element: 'Element',
  elementList: 'Element',
};
const MEDIA_LABELS = { image: '图片', video: '视频', audio: '音频', subject: '主体' };
export const NODE_PROMPT_REFERENCE_MIME = 'application/x-liblib-reference';
export const NODE_PROMPT_MENTION_MIME = 'application/x-liblib-mention';
const tokenPattern = () => /\{\{(Image|Portrait|Video|Audio|Mixed|Element)\s+(\d+)\}\}/g;

export function getPromptReferenceList(references, tokenType) {
  const info = TOKEN_TYPES[tokenType];
  if (!info) return [];
  const list = references?.[info.list];
  if (Array.isArray(list)) return list;
  if (tokenType === 'Portrait') return references?.imageList ?? [];
  if (tokenType === 'Element') return references?.subjectList ?? [];
  return [];
}

export function resolveNodePromptReference(tokenType, index, references = {}, token) {
  const info = TOKEN_TYPES[tokenType];
  if (!info) return null;
  const item = getPromptReferenceList(references, tokenType)[index - 1];
  const nodeId = item?.nodeId ?? item?.uuid ?? '';
  const mediaType = info.type === 'mixed' ? (item?.mediaType ?? 'image') : info.type;
  const mixedIndex = nodeId
    ? (references.mixedList ?? []).findIndex((reference) => reference.nodeId === nodeId)
    : -1;
  const displayIndex = mixedIndex >= 0 && mediaType !== 'subject' ? mixedIndex + 1 : index;
  return {
    kind: 'reference',
    token: token ?? `{{${tokenType} ${index}}}`,
    tokenType,
    listType: info.list.replace(/List$/, ''),
    index,
    displayIndex,
    nodeId,
    mediaType,
    url: typeof item?.url === 'string' ? item.url : (item?.coverUrl ?? ''),
    label: `${MEDIA_LABELS[mediaType] ?? MEDIA_LABELS.image}${displayIndex}`,
    missing: !item,
    isAsset: !!item?.assetId,
  };
}

/** Ordinary references are unchanged; magic badges require explicit real metadata. */
export function parseNodePrompt(value = '', references = {}, { magicList } = {}) {
  const text = typeof value === 'string' ? value : '';
  const parts = [];
  let offset = 0;
  const tokens = [
    ...Array.from(text.matchAll(tokenPattern()), (match) => ({
      from: match.index,
      to: match.index + match[0].length,
      part: resolveNodePromptReference(match[1], Number(match[2]), references, match[0]),
    })),
    ...markPromptTokens(text, magicList).map(({ from, to, ...part }) => ({ from, to, part })),
  ].sort((a, b) => a.from - b.from);
  for (const token of tokens) {
    if (token.from > offset) parts.push({ kind: 'text', text: text.slice(offset, token.from) });
    parts.push(token.part);
    offset = token.to;
  }
  if (offset < text.length) parts.push({ kind: 'text', text: text.slice(offset) });
  return parts;
}

export function serializeNodePrompt(parts = []) {
  return parts
    .map((part) => (['reference', 'magic'].includes(part.kind) ? part.token : (part.text ?? '')))
    .join('');
}

export function listNodePromptReferences(
  references = {},
  { mentionListType = 'separate', mentionTypes } = {},
) {
  const types = mentionListType === 'mixed' ? ['Mixed'] : ['Image', 'Video', 'Audio'];
  types.push('Element');
  return types
    .filter((tokenType) => !mentionTypes || mentionTypes.includes(TOKEN_TYPES[tokenType].type))
    .flatMap((tokenType) =>
      getPromptReferenceList(references, tokenType).map((item, offset) => {
        const option = resolveNodePromptReference(tokenType, offset + 1, references);
        return {
          ...option,
          optionLabel:
            tokenType === 'Image' && item.label
              ? item.label
              : tokenType === 'Element' && item.name
                ? `${option.label} · ${item.name}`
                : option.label,
        };
      }),
    );
}

export function promptReferenceFromDrop(raw, references = {}) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const tokenType = LIST_TOKENS[payload?.listType];
  if (!tokenType || !Number.isSafeInteger(payload?.index) || payload.index < 0) return null;
  const option = resolveNodePromptReference(tokenType, payload.index + 1, references);
  return option.missing ? null : option;
}

export function findPromptMentionTrigger(value, caret) {
  const offset = Math.min(Math.max(0, caret), value.length);
  const character = value[offset - 1];
  if (character !== '@' && character !== '＠') return null;
  for (const match of value.matchAll(tokenPattern())) {
    if (offset > match.index && offset < match.index + match[0].length) return null;
  }
  return { start: offset - 1, end: offset };
}

/** A selection intersecting a reference consumes the entire atomic token. */
export function replaceNodePromptRange(value, start, end, insertion, { magicList } = {}) {
  let from = Math.min(Math.max(0, start), value.length);
  let to = Math.min(Math.max(from, end), value.length);
  for (const match of value.matchAll(tokenPattern())) {
    const tokenEnd = match.index + match[0].length;
    if (from > match.index && from < tokenEnd) from = match.index;
    if (to > match.index && to < tokenEnd) to = tokenEnd;
  }
  for (const token of markPromptTokens(value, magicList)) {
    if (from > token.from && from < token.to) from = token.from;
    if (to > token.from && to < token.to) to = token.to;
  }
  return {
    value: value.slice(0, from) + insertion + value.slice(to),
    caret: from + insertion.length,
  };
}
