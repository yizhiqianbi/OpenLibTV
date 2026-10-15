import { describe, expect, it } from 'vitest';
import {
  findPromptSuggestions,
  promptOrdinal,
  promptSuggestionPool,
  suggestionRejectionKey,
} from './prompt-suggestion-model.js';

const refs = {
  imageList: [
    { nodeId: 'fox', label: '红狐-全身.png', url: '/fox.png' },
    { nodeId: 'forest', label: '森林', url: '/forest.png' },
  ],
};
const all = (value, references = refs, config) =>
  findPromptSuggestions(value, promptSuggestionPool(references, config), {
    mode: 'batch',
    region: { start: 0, end: value.length },
  });

describe('source automatic reference matching', () => {
  it('expands filename and separator variants, skips stop words, and matches the longest occurrence', () => {
    expect(all('红狐-全身.png，红狐，全身，森林')).toEqual([
      expect.objectContaining({ nodeId: 'fox', matchedText: '红狐-全身' }),
      expect.objectContaining({ nodeId: 'fox', matchedText: '红狐' }),
      expect.objectContaining({ nodeId: 'forest', matchedText: '森林' }),
    ]);
  });
  it('keeps only unambiguous names, while an exact name outranks a competing variant', () => {
    const references = {
      imageList: [
        { nodeId: 'a', label: '红狐-近景' },
        { nodeId: 'b', label: '红狐-远景' },
      ],
    };
    expect(all('红狐', references)).toEqual([]);
    references.imageList.push({ nodeId: 'c', label: '红狐' });
    expect(all('红狐', references)[0].nodeId).toBe('c');
    references.imageList.push({ nodeId: 'd', label: '红狐' });
    expect(all('红狐', references)).toEqual([]);
  });
  it('uses ASCII word boundaries and ignores generic names, digits, multiline labels and asset pseudo-options', () => {
    const references = {
      imageList: [
        { nodeId: 'cat', label: 'Cat' },
        { nodeId: 'generic', label: '图片1' },
        { nodeId: 'digit', label: '42' },
        { nodeId: 'lines', label: '红狐\n森林' },
        { nodeId: 'asset', assetId: 'remote', label: '城堡' },
      ],
    };
    expect(
      all('copycat cat CAT catwalk 城堡 42 红狐', references).map((match) => match.matchedText),
    ).toEqual(['cat', 'CAT']);
  });
  it.each([
    ['图1', 'fox'],
    ['第二张图片', 'forest'],
    ['【参考图片：２】', 'forest'],
    ['image #1', 'fox'],
    ['（第两幅图像）', 'forest'],
    ['素材1', 'fox'],
  ])('resolves ordinal %s from the current reference list', (value, nodeId) => {
    expect(all(value)).toEqual([
      expect.objectContaining({ nodeId, matchedText: value, replaceMatched: true }),
    ]);
  });
  it('rejects diagram prefixes, unbalanced brackets, invalid ordinals and ambiguous generic ordinals', () => {
    const references = { ...refs, audioList: [{ nodeId: 'sound', label: '旋律' }] };
    expect(all('地图1 拼图1 效果图1 【图1 图0 图100 素材1', references)).toEqual([]);
  });
  it('uses display indices across mixed references and does not interpret tokens as prose', () => {
    const references = {
      mixedList: [
        { nodeId: 'fox', label: '红狐', mediaType: 'image' },
        { nodeId: 'clip', label: '奔跑', mediaType: 'video' },
      ],
    };
    expect(
      all('{{Mixed 1}} 视频2 图片1', references, { mentionListType: 'mixed' }).map(
        (match) => match.nodeId,
      ),
    ).toEqual(['clip', 'fox']);
    expect(all('视频1', references, { mentionListType: 'mixed' })).toEqual([]);
    expect(all('红狐 {{Mixed 1}}', references, { mentionListType: 'mixed' })).toEqual([]);
  });
  it('only suggests at the caret word end or inside the actual pasted region', () => {
    const value = '森林 红狐 森林';
    const pool = promptSuggestionPool(refs);
    expect(findPromptSuggestions(value, pool, { caret: 4 })).toEqual([]);
    expect(findPromptSuggestions(value, pool, { caret: 5 })[0].nodeId).toBe('fox');
    expect(
      findPromptSuggestions(value, pool, { mode: 'batch', region: { start: 3, end: 5 } }).map(
        (match) => match.nodeId,
      ),
    ).toEqual(['fox']);
    expect(findPromptSuggestions(value, pool, { mode: 'batch' })).toEqual([]);
  });
  it('caches rejection by element and six preceding characters, so changed context can suggest again', () => {
    const pool = promptSuggestionPool(refs);
    const value = '夜里红狐';
    const match = findPromptSuggestions(value, pool, { caret: value.length })[0];
    const rejected = new Set([suggestionRejectionKey(match, value)]);
    expect(findPromptSuggestions(value, pool, { caret: value.length, rejected })).toEqual([]);
    expect(findPromptSuggestions('白天红狐', pool, { caret: 4, rejected })).toHaveLength(1);
  });
  it('parses supported Chinese and full-width numbers within 1..99', () => {
    expect(['１', '两', '十', '十二', '二十三', '九十九'].map(promptOrdinal)).toEqual([
      1, 2, 10, 12, 23, 99,
    ]);
    expect(['0', '100', '一二', '二十十', '百'].map(promptOrdinal)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
  it('does not join ordinals across a line break or an existing atomic reference', () => {
    expect(all('图片\n1 图片{{Image 1}}2')).toEqual([]);
    expect(all('森林\n红狐').map((match) => match.start)).toEqual([0, 3]);
  });
});
