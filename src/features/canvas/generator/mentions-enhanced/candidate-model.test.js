// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  canvasReferenceMenuModel,
  collectCanvasReferenceCandidates,
  commitCanvasMentionSelection,
  evaluateReferenceCandidate,
  presentCanvasReferenceCandidates,
} from './candidate-model.js';

const node = (id, type, data = {}) => ({ id, type, data: { type, ...data } });
const dependencies = () => ({
  canAcceptMore: vi.fn(() => true),
  validate: vi.fn(() => ({ allowed: true })),
});

describe('source whole-canvas reference candidates', () => {
  it('preserves original node order, bypasses validation for real connections and excludes only-virtual references', async () => {
    const target = node('target', 'video');
    const deps = dependencies();
    const nodes = [
      target,
      node('v', 'video'),
      node('virtual', 'image'),
      node('real', 'image'),
      node('text', 'text'),
      node('group', 'group'),
    ];
    const result = await collectCanvasReferenceCandidates({
      nodes,
      edges: [
        { source: 'virtual', target: 'target', data: { assetVirtual: true } },
        { source: 'real', target: 'target', data: { portraitVirtual: true } },
        { source: 'real', target: 'target' },
      ],
      targetNodeId: 'target',
      dependencies: deps,
    });
    expect(
      result.candidates.map(({ node: value, kind, connected }) => [value.id, kind, connected]),
    ).toEqual([
      ['v', 'video', false],
      ['real', 'image', true],
      ['text', 'text', false],
    ]);
    expect([...result.connectedNodeIds]).toEqual(['virtual', 'real']);
    expect(deps.validate.mock.calls.map(([source]) => source.id)).toEqual(['v', 'text']);
  });
  it('caches media limits per kind, counts actual connected media/refImages and never auto-switches model', async () => {
    const target = node('target', 'video', { refImages: ['stored'] });
    const deps = {
      canAcceptMore: vi.fn((_target, kind) => kind !== 'image'),
      validate: vi.fn((source) => ({
        allowed: true,
        switchToModel: source.id === 'switch' ? 'other-model' : undefined,
      })),
    };
    const result = await collectCanvasReferenceCandidates({
      nodes: [
        target,
        node('a', 'image'),
        node('b', 'image'),
        node('connected', 'video'),
        node('switch', 'video'),
        node('t', 'text'),
      ],
      edges: [{ source: 'connected', target: 'target' }],
      targetNodeId: 'target',
      dependencies: deps,
    });
    expect(
      result.candidates.map(({ node: value, blockReason }) => [value.id, blockReason]),
    ).toEqual([
      ['a', 'limit'],
      ['b', 'limit'],
      ['connected', undefined],
      ['switch', 'modelUnsupported'],
      ['t', undefined],
    ]);
    expect(deps.canAcceptMore).toHaveBeenCalledTimes(2);
    expect(result.limitCount).toBe(2);
    expect(evaluateReferenceCandidate(node('unknown', 'image'), target)).toEqual({
      available: false,
      reason: 'modelUnsupported',
    });
    expect(
      evaluateReferenceCandidate(node('unknown-capacity', 'image'), target, {
        validate: () => ({ allowed: true }),
      }).reason,
    ).toBe('modelUnsupported');
  });
  it('does not invent URL restrictions or deduplicate distinct source nodes with the same URL', async () => {
    const deps = dependencies();
    const result = await collectCanvasReferenceCandidates({
      nodes: [
        node('target', 'image'),
        node('a', 'image', { url: 'data:image/png;base64,a' }),
        node('b', 'image', { url: 'data:image/png;base64,a' }),
        node('c', 'image'),
      ],
      targetNodeId: 'target',
      dependencies: deps,
    });
    expect(result.candidates.map(({ node: value }) => value.id)).toEqual(['a', 'b', 'c']);
    expect(deps.validate).toHaveBeenCalledTimes(3);
  });
  it('cancels work at the 32-record boundary and supports the explicit script-v2 image-only branch', async () => {
    const request = new AbortController();
    const target = node('target', 'image');
    const pending = collectCanvasReferenceCandidates({
      nodes: [target, ...Array.from({ length: 40 }, (_, index) => node(String(index), 'image'))],
      targetNodeId: 'target',
      dependencies: dependencies(),
      signal: request.signal,
    });
    request.abort();
    expect(await pending).toBeNull();
    const imageOnly = await collectCanvasReferenceCandidates({
      nodes: [node('target', 'script-v2'), node('v', 'video'), node('i', 'image')],
      edges: [{ source: 'v', target: 'target' }],
      targetNodeId: 'target',
      dependencies: dependencies(),
      scriptV2ImageOnly: true,
    });
    expect(imageOnly.candidates.map(({ node: value }) => value.id)).toEqual(['i']);
    expect(imageOnly.connectedNodeIds.size).toBe(0);
  });
  it('uses token order then incoming edge order, retains disabled/missing media and appends virtual token options', () => {
    const options = [
      { nodeId: 'b', token: '{{Mixed 1}}', mediaType: 'video' },
      { nodeId: 'a', token: '{{Mixed 2}}', mediaType: 'image' },
      { nodeId: 'virtual', label: '主体', mediaType: 'subject' },
    ];
    const collected = {
      candidates: [
        { node: node('unconnected', 'image', { name: ' 山 ' }), kind: 'image', connected: false },
        { node: node('missing', 'video'), kind: 'video', connected: true },
        { node: node('a', 'image'), kind: 'image', connected: true },
        { node: node('b', 'video', { poster: ' /poster.webp ' }), kind: 'video', connected: true },
        { node: node('t', 'text'), kind: 'text', connected: true },
      ],
    };
    const presented = presentCanvasReferenceCandidates({
      collected,
      options,
      targetNodeId: 'target',
      edges: [
        { source: 't', target: 'target' },
        { source: 'missing', target: 'target' },
      ],
      preview: (value) => ({ previewUrl: `/${value.id}.webp`, previewMedia: 'image' }),
    });
    expect(presented.map((value) => value.nodeId)).toEqual([
      'b',
      'a',
      'virtual',
      't',
      'missing',
      'unconnected',
    ]);
    expect(presented.find((value) => value.nodeId === 'missing').disabledReason).toBe(
      'modelUnsupported',
    );
    expect(presented[0].thumbnailUrl).toBe('/poster.webp');
    expect(presented.at(-1).label).toBe('山');
  });
  it('searches labels only, groups unconnected media and excludes disabled/duplicate IDs from keyboard selection', () => {
    const all = [
      { nodeId: 'same', kind: 'video', connected: true, label: '山野' },
      { nodeId: 'same', kind: 'video', connected: true, label: '山野副本' },
      { nodeId: 'v', kind: 'video', label: '山野视频', disabledReason: 'limit' },
      { nodeId: 'i', kind: 'image', label: '山野图片' },
      { nodeId: 't', kind: 'text', label: '山野文本' },
      { nodeId: 'url', kind: 'image', label: '无关', previewUrl: '/山野.webp' },
    ];
    const result = canvasReferenceMenuModel(all, { search: ' 山野 ' });
    expect(
      result.entries.filter((entry) => entry.type === 'heading').map((entry) => entry.label),
    ).toEqual(['已引用', '图片', '视频', '文本']);
    expect(result.keyboardOptions.map((option) => option.nodeId)).toEqual(['same', 'i', 't']);
    expect(
      canvasReferenceMenuModel(all, { kind: 'video', hiddenKinds: ['video'] }).entries[0].type,
    ).toBe('empty');
  });
  it('connects before resolving a new token, consumes text @ without a token and preserves failed triggers', () => {
    const insertMention = vi.fn();
    const consumeTextTrigger = vi.fn();
    const onConnectFailed = vi.fn();
    const onConnectedWithoutMention = vi.fn();
    const calls = [];
    const args = {
      targetNodeId: 'target',
      connect: vi.fn(() => {
        calls.push('connect');
        return true;
      }),
      getLatestReference: vi.fn(() => {
        calls.push('resolve');
        return { token: '{{Mixed 4}}' };
      }),
      insertMention,
      consumeTextTrigger,
      onConnectFailed,
      onConnectedWithoutMention,
    };
    expect(
      commitCanvasMentionSelection({
        ...args,
        reference: { nodeId: 'new', kind: 'image', connected: false },
      }),
    ).toBe('mentionInserted');
    expect(calls).toEqual(['connect', 'resolve']);
    expect(insertMention).toHaveBeenCalledWith({ token: '{{Mixed 4}}' });
    expect(
      commitCanvasMentionSelection({
        ...args,
        reference: { nodeId: 'text', kind: 'text', connected: false },
      }),
    ).toBe('textConnected');
    expect(consumeTextTrigger).toHaveBeenCalledTimes(1);
    expect(
      commitCanvasMentionSelection({
        ...args,
        connect: () => false,
        reference: { nodeId: 'failed', kind: 'image', connected: false },
      }),
    ).toBe('connectFailed');
    expect(onConnectFailed).toHaveBeenCalledTimes(1);
    expect(
      commitCanvasMentionSelection({
        ...args,
        connect: () => Promise.resolve(true),
        reference: { nodeId: 'pending', kind: 'image', connected: false },
      }),
    ).toBe('connectFailed');
    expect(insertMention).toHaveBeenCalledTimes(1);
    expect(
      commitCanvasMentionSelection({
        ...args,
        getLatestReference: () => null,
        reference: { nodeId: 'new', kind: 'image', connected: false },
      }),
    ).toBe('connectedWithoutMention');
    expect(onConnectedWithoutMention).toHaveBeenCalledTimes(1);
  });
});
