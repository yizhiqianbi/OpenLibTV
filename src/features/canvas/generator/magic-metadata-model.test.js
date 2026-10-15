import { describe, expect, it } from 'vitest';
import { patchCanvasMagicPrompt } from './magic-metadata-model.js';
import { projectCanvasNodeDraft } from '../domain/draft-projection.js';

describe('ordinary prompt magic metadata pruning', () => {
  it('retains referenced ID metadata unchanged across duplicates and selected indexes', () => {
    const metadata = { same: { suggestions: [{ label: '真实' }] } };
    const params = {
      prompt: 'old',
      magicList: metadata,
      model: 'keep',
      advancedSettings: { x: 3 },
    };
    const next = patchCanvasMagicPrompt(params, '{{magic:same:0}} {{magic:same:123}}');
    expect(next.magicList).toBe(metadata);
    expect(next).toEqual({ ...params, prompt: '{{magic:same:0}} {{magic:same:123}}' });
    expect(params.prompt).toBe('old');
  });

  it('only removes unused metadata, preserving raw unknown/case-sensitive/malformed tokens', () => {
    const keep = { imageUrl: '/keep.png' };
    const params = { magicList: { keep, removed: { imageUrl: '/removed.png' } }, count: 4 };
    const text =
      '{{magic:keep:0001}} {{Magic:removed:0}} {{magic:removed:nope}} {{magic:unknown:0}}';
    const next = patchCanvasMagicPrompt(params, text);
    expect(next).toEqual({ count: 4, prompt: text, magicList: { keep } });
    expect(next.magicList.keep).toBe(keep);
    expect(params.magicList).toHaveProperty('removed');
  });

  it('removes the final metadata key when the last magic token is deleted', () => {
    const params = {
      prompt: '{{magic:last:0}}',
      magicList: { last: { imageUrl: '/last.png' } },
      settings: { ratio: '1:1' },
    };
    expect(patchCanvasMagicPrompt(params, '')).toEqual({
      ...params,
      prompt: '',
      magicList: undefined,
    });
  });

  it('keeps unchanged objects and existing empty metadata containers', () => {
    const params = { prompt: 'text', magicList: {} };
    expect(patchCanvasMagicPrompt(params, 'text')).toBe(params);
    expect(patchCanvasMagicPrompt(params, 'new').magicList).toBe(params.magicList);
  });

  it('does not silently transform a malformed metadata container', () => {
    const params = { magicList: ['unreadable'] };
    expect(patchCanvasMagicPrompt(params, 'new')).toEqual({ ...params, prompt: 'new' });
    expect(patchCanvasMagicPrompt(null, 'new')).toBeNull();
    expect(patchCanvasMagicPrompt({}, 4)).toBeNull();
  });

  it('projects the last unflushed deletion with metadata, preserving baseline guards and other fields', () => {
    const node = {
      id: 'target',
      type: 'image',
      data: {
        params: {
          model: 'real',
          prompt: 'before {{magic:last:0}}',
          magicList: { last: { imageUrl: '/last.png' } },
          count: 3,
          settings: { ratio: '3:2' },
          focusRegion: { nodeId: 'source' },
        },
      },
    };
    const draft = { writable: true, basePrompt: node.data.params.prompt, value: 'before' };
    const next = projectCanvasNodeDraft(node, draft);
    expect(next.data.params).toEqual({
      ...node.data.params,
      prompt: 'before',
      magicList: undefined,
    });
    expect(node.data.params.magicList).toHaveProperty('last');
    expect(
      projectCanvasNodeDraft(
        { ...node, data: { ...node.data, params: { ...node.data.params, prompt: 'external' } } },
        draft,
      ).data.params.prompt,
    ).toBe('external');
    expect(projectCanvasNodeDraft(node, { ...draft, writable: false })).toBe(node);
  });
});
