import { describe, expect, it } from 'vitest';
import {
  mapMarkPromptSelectionOffset,
  markPromptTokens,
  resolveMarkPromptToken,
  selectMarkPromptSuggestion,
} from './mark-prompt-model.js';

const magicList = {
  'api-id_1': {
    imageUrl: 'https://images.test/source.png',
    suggestions: [
      { label: '红色衣服' },
      { label: '人物', bbox: { x: 1, y: 2, width: 3, height: 4 } },
    ],
  },
};
describe('real magic prompt metadata', () => {
  it('keeps source label, selected index zero and canonical token identity without using bbox as a label', () => {
    expect(resolveMarkPromptToken('{{magic:api-id_1:0}}', magicList)).toEqual({
      kind: 'magic',
      token: '{{magic:api-id_1:0}}',
      magicId: 'api-id_1',
      magicIndex: 0,
      label: '红色衣服',
      imageUrl: magicList['api-id_1'].imageUrl,
      options: [
        { index: 0, label: '红色衣服' },
        { index: 1, label: '人物' },
      ],
    });
    expect(resolveMarkPromptToken('{{magic:api-id_1:1}}', magicList).label).toBe('人物');
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { 'api-id_1': {} },
    { 'api-id_1': { suggestions: [] } },
    { 'api-id_1': { suggestions: ['猜测标签'] } },
    { 'api-id_1': { suggestions: [{ bbox: {} }] } },
    { 'api-id_1': { suggestions: [{ label: '' }] } },
    { 'api-id_1': { suggestions: [{ label: 0 }] } },
  ])('does not invent a badge for absent or malformed metadata: %j', (metadata) => {
    expect(resolveMarkPromptToken('{{magic:api-id_1:0}}', metadata)).toBeNull();
  });

  it.each([
    '{{magic:missing:0}}',
    '{{magic:api-id_1:2}}',
    '{{magic:api-id_1:-1}}',
    '{{Magic:api-id_1:0}}',
    '{{magic:api-id_1:0}',
    '{{magic:api:id_1:0}}',
    '{{magic:api-id_1:99999999999999999999}}',
  ])('preserves unknown, unsupported and invalid token spelling: %s', (token) => {
    expect(resolveMarkPromptToken(token, magicList)).toBeNull();
  });

  it('rejects inherited entries and preserves raw option indices when malformed suggestions are skipped', () => {
    expect(resolveMarkPromptToken('{{magic:api-id_1:0}}', Object.create(magicList))).toBeNull();
    const metadata = { id: { suggestions: [{ label: '真实A' }, null, { label: '真实B' }] } };
    expect(resolveMarkPromptToken('{{magic:id:2}}', metadata).options).toEqual([
      { index: 0, label: '真实A' },
      { index: 2, label: '真实B' },
    ]);
  });

  it('reports correct plain-text ranges for real badges while retaining unknown special and media strings', () => {
    const value = '前 {{Image 1}} {{magic:missing:0}} {{magic:api-id_1:01}} 后';
    const parts = markPromptTokens(value, magicList);
    expect(parts).toHaveLength(1);
    expect(parts[0].from).toBe(value.indexOf('{{magic:api-id_1:01}}'));
    expect(parts[0].to).toBe(parts[0].from + '{{magic:api-id_1:01}}'.length);
    expect(parts[0].token).toBe('{{magic:api-id_1:01}}');
    expect(parts[0].label).toBe('人物');
  });

  it('updates every same-ID legal occurrence once, retaining other IDs and malformed strings without metadata mutation', () => {
    const value =
      '{{magic:api-id_1:0}} {{Image 1}} {{magic:api-id_1:01}} {{magic:other:0}} {{magic:api-id_1:x}}';
    const before = JSON.stringify(magicList);
    expect(selectMarkPromptSuggestion(value, magicList, 'api-id_1', 1)).toBe(
      '{{magic:api-id_1:1}} {{Image 1}} {{magic:api-id_1:1}} {{magic:other:0}} {{magic:api-id_1:x}}',
    );
    expect(selectMarkPromptSuggestion(value, magicList, 'api-id_1', 9)).toBeNull();
    expect(JSON.stringify(magicList)).toBe(before);
  });

  it('maps caret zero, positions inside an atomic token, and positions after repeated tokens', () => {
    const value = 'A {{magic:api-id_1:001}} B {{magic:api-id_1:01}} C';
    const next = selectMarkPromptSuggestion(value, magicList, 'api-id_1', 1);
    expect(mapMarkPromptSelectionOffset(value, 'api-id_1', 1, 0)).toBe(0);
    expect(mapMarkPromptSelectionOffset(value, 'api-id_1', 1, 4)).toBe(
      2 + '{{magic:api-id_1:1}}'.length,
    );
    expect(mapMarkPromptSelectionOffset(value, 'api-id_1', 1, value.length)).toBe(next.length);
    expect(mapMarkPromptSelectionOffset(value, 'api-id_1', 1, -1)).toBeNull();
  });
});
