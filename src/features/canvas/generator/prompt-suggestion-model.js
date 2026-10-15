import { listNodePromptReferences, parseNodePrompt } from './node-prompt-model.js';

// Public source 884894: local name matching, with ordinal references taking precedence.
const genericName = /^(?:图片|图像|视频|音频|文本|素材|image|video|audio|text|clip)\s*\d*$/i;
const asciiWord = /[0-9A-Za-z_]/;
const separators = /[-_·•|/\\\s,，、+()（）[\]【】]+/;
const extension =
  /\.(?:png|jpe?g|webp|gif|bmp|svg|mp4|mov|webm|mkv|avi|mp3|wav|m4a|aac|flac|ogg)$/i;
const stopWords = new Set(
  '副本 备份 最终 最终版 终稿 定稿 初稿 未命名 新建 原图 大图 小图 缩略图 参考 参考图 设定 设定图 copy final draft version untitled image video audio photo pic 近景 中景 远景 特写 全景 大特写 俯视 仰视 平视 正面 侧面 背面 半身 全身 横版 竖版 高清 模糊 正片 背景 前景'.split(
    ' ',
  ),
);
const fullWidth = (text) =>
  text.replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 65248));
const usableName = (name) => name.trim().length >= 2 && !genericName.test(name.trim());
const ordinalWords = {
  image: [
    '参考图片',
    '图片节点',
    '图像节点',
    '素材图片',
    '图节点',
    '参考图',
    '素材图',
    '底图',
    '图片',
    '图像',
    '照片',
    '相片',
    '图',
    'reference image',
    'ref image',
    'images',
    'image',
    'picture',
    'photos',
    'photo',
    'pics',
    'pic',
    'img',
  ],
  video: [
    '参考视频',
    '视频节点',
    '视频素材',
    '视频片段',
    '影片片段',
    '视频',
    '影片',
    '片段',
    '镜头素材',
    'reference video',
    'ref video',
    'videos',
    'video',
    'clips',
    'clip',
    'movie',
    'vid',
  ],
  audio: [
    '参考音频',
    '音频节点',
    '音频素材',
    '音频',
    '声音',
    '音乐',
    '语音',
    '配音',
    '人声',
    'reference audio',
    'ref audio',
    'audios',
    'audio',
    'sound',
    'music',
    'voice',
    'bgm',
  ],
  subject: [
    '元素节点',
    '主体节点',
    '主体',
    '元素',
    '角色',
    'elements',
    'element',
    'subject',
    'character',
  ],
  any: ['素材节点', '参考节点', '素材', '参考', 'assets', 'asset', 'reference', 'ref'],
};
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = Object.values(ordinalWords).flat().map(escapeRegex).join('|');
const open = '[【\\[［（(《「“"]';
const close = '[】\\]］）)》」”"]';
const number = '(?:[0-9]{1,2}|[０-９]{1,2}|[一二两三四五六七八九十]{1,3})';
const measure = '(?:\\s*(?:张|个|段|幅|条|部|号|只|位))?';
const typeFirst = new RegExp(
  `(?:(${open})\\s*)?(${words})(?:\\s*(?:#|＃|:|：|-|_|第)\\s*|\\s*)(${number})${measure}(?:\\s*(${close}))?`,
  'gi',
);
const numberFirst = new RegExp(
  `(?:(${open})\\s*)?第\\s*(${number})${measure}\\s*(${words})(?:\\s*(${close}))?`,
  'gi',
);
const diagramPrefixes = new Set(
  '地 拼 构 截 贴 插 简 草 蓝 版 试 企 意 力 绘 制 示意 效果 流程 结构 思维导'.split(' '),
);
const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function promptOrdinal(text) {
  const value = fullWidth(text).trim();
  if (/^\d+$/.test(value)) {
    const result = Number(value);
    return result >= 1 && result <= 99 ? result : null;
  }
  if (!/^[一二两三四五六七八九十]+$/.test(value)) return null;
  const ten = value.indexOf('十');
  if (ten < 0) return value.length === 1 ? (digits[value] ?? null) : null;
  const before = value.slice(0, ten);
  const after = value.slice(ten + 1);
  const tens = before ? digits[before] : 1;
  const ones = after ? digits[after] : 0;
  const result = tens * 10 + ones;
  return Number.isInteger(result) && result >= 1 && result <= 99 ? result : null;
}

export function promptSuggestionPool(references, configuration) {
  const options = listNodePromptReferences(references, configuration).filter(
    (option) => option.nodeId && !option.missing && !option.isAsset,
  );
  const names = new Map();
  for (const key of [
    'imageList',
    'videoList',
    'audioList',
    'mixedList',
    'elementList',
    'subjectList',
  ])
    for (const item of references?.[key] ?? []) {
      const id = item.nodeId ?? item.uuid;
      const name = item.label ?? item.name;
      if (id && typeof name === 'string' && usableName(name) && !names.has(id))
        names.set(id, name.trim());
    }
  const variants = new Map();
  for (const option of options) {
    const name = names.get(option.nodeId);
    if (!name || name.includes('\n')) continue;
    const normalized = fullWidth(name).replace(extension, '').trim();
    const candidates = [
      normalized,
      ...normalized.split(separators),
      normalized.replace(new RegExp(separators.source, 'g'), ''),
    ];
    for (const variant of new Set(candidates)) {
      if (!usableName(variant) || /^\d+$/.test(variant) || stopWords.has(variant.toLowerCase()))
        continue;
      const key = variant.toLowerCase();
      const tier = key === name.toLowerCase() ? 0 : 1;
      const group = variants.get(key) ?? new Map();
      const previous = group.get(option.nodeId);
      if (!previous || tier < previous.tier)
        group.set(option.nodeId, { nodeId: option.nodeId, name: variant, tier });
      variants.set(key, group);
    }
  }
  const candidates = [];
  for (const group of variants.values()) {
    const tier = Math.min(...Array.from(group.values(), (item) => item.tier));
    const best = Array.from(group.values()).filter((item) => item.tier === tier);
    if (best.length === 1) candidates.push(best[0]);
  }
  return { options, candidates };
}

const overlap = (first, second) => first.start < second.end && second.start < first.end;
function longestNonOverlapping(matches) {
  const result = [];
  for (const match of matches.sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  ))
    if (!result.some((item) => overlap(item, match))) result.push(match);
  return result.sort((a, b) => a.start - b.start);
}
function nameMatches(text, candidates) {
  const lower = text.toLowerCase();
  const matches = [];
  for (const candidate of candidates) {
    const name = candidate.name.toLowerCase();
    for (let start = lower.indexOf(name); start >= 0; start = lower.indexOf(name, start + 1)) {
      const end = start + name.length;
      if (
        (asciiWord.test(name[0]) && start > 0 && asciiWord.test(lower[start - 1])) ||
        (asciiWord.test(name.at(-1)) && end < text.length && asciiWord.test(lower[end]))
      )
        continue;
      matches.push({ nodeId: candidate.nodeId, start, end, matchedText: text.slice(start, end) });
    }
  }
  return longestNonOverlapping(matches);
}
function ordinalMatches(text, options) {
  const byGroup = new Map();
  const byOrdinal = new Map();
  for (const option of options) {
    const ordinal = option.displayIndex ?? option.index;
    const key = `${option.mediaType}:${ordinal}`;
    if (!byGroup.has(key)) byGroup.set(key, option);
    const items = byOrdinal.get(ordinal) ?? [];
    if (!items.some((item) => item.nodeId === option.nodeId)) items.push(option);
    byOrdinal.set(ordinal, items);
  }
  const result = [];
  for (const [pattern, reversed] of [
    [typeFirst, false],
    [numberFirst, true],
  ]) {
    for (const match of text.matchAll(pattern)) {
      const [matchedText, opening, first, second, closing] = match;
      if (!!opening !== !!closing) continue;
      const type = reversed ? second : first;
      const ordinal = promptOrdinal(reversed ? first : second);
      const startType = match.index + matchedText.indexOf(type);
      if (!reversed && startType > 0) {
        if (/^[a-z]/i.test(type) && asciiWord.test(text[startType - 1])) continue;
        if (
          type === '图' &&
          [1, 2, 3].some((length) =>
            diagramPrefixes.has(text.slice(Math.max(0, startType - length), startType)),
          )
        )
          continue;
      }
      const kind = Object.keys(ordinalWords).find((key) =>
        ordinalWords[key].some((word) => word.toLowerCase() === type.toLowerCase()),
      );
      const option =
        kind === 'any'
          ? byOrdinal.get(ordinal)?.length === 1
            ? byOrdinal.get(ordinal)[0]
            : null
          : byGroup.get(`${kind}:${ordinal}`);
      if (option)
        result.push({
          nodeId: option.nodeId,
          start: match.index,
          end: match.index + matchedText.length,
          matchedText,
          replaceMatched: true,
        });
    }
  }
  return longestNonOverlapping(result);
}

export function suggestionRejectionKey(match, value) {
  return `${match.nodeId}|${value.slice(Math.max(0, match.start - 6), match.end)}`;
}

export function findPromptSuggestions(
  value,
  pool,
  { mode = 'caret', caret, region, rejected = new Set() } = {},
) {
  const matches = [];
  let offset = 0;
  for (const part of parseNodePrompt(value)) {
    if (part.kind === 'text') {
      let lineOffset = offset;
      for (const line of part.text.split('\n')) {
        const ordinals = ordinalMatches(line, pool.options);
        const names = nameMatches(line, pool.candidates).filter(
          (match) => !ordinals.some((ordinal) => overlap(match, ordinal)),
        );
        matches.push(
          ...[...ordinals, ...names].map((match) => ({
            ...match,
            start: lineOffset + match.start,
            end: lineOffset + match.end,
          })),
        );
        lineOffset += line.length + 1;
      }
      offset += part.text.length;
    } else offset += part.token.length;
  }
  const eligible = matches.filter((match) => {
    if (rejected.has(suggestionRejectionKey(match, value))) return false;
    const option = pool.options.find((item) => item.nodeId === match.nodeId);
    const after = value.slice(match.end).trimStart();
    if (after.startsWith(option.token)) return false;
    return mode === 'batch'
      ? region && match.start >= region.start && match.end <= region.end
      : match.end === caret;
  });
  eligible.sort((a, b) => a.start - b.start);
  return mode === 'batch' ? eligible : eligible.slice(0, 1);
}
