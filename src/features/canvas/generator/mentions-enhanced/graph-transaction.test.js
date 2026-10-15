// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGuardedMentionConnector } from './graph-transaction.js';
import { createCanvasMentionSource } from './canvas-reference-source.js';
import { commitCanvasMentionSelection } from './candidate-model.js';

const models = JSON.parse(
  readFileSync(new URL('../../../../../public/data/models.json', import.meta.url), 'utf8'),
);
const image = (id, data = {}) => ({
  id,
  type: 'image',
  data: {
    type: 'image',
    action: 'image_generate',
    url: [`https://example.com/${id}.png`],
    params: { model: models.default.image, prompt: 'saved', settings: { quality: 'keep' } },
    ...data,
  },
});
function fixture(options = {}) {
  let graph = {
    documentKey: 'doc',
    ready: true,
    readonly: false,
    nodes: [image('source'), image('target')],
    edges: [],
    models,
  };
  const commitGraph = vi.fn((next, { expectedGraph }) => {
    if (graph !== expectedGraph) return false;
    graph = next;
    return true;
  });
  const getGraph = () => graph;
  const connect = createGuardedMentionConnector({
    documentKey: 'doc',
    getGraph,
    commitGraph,
    createEdgeId: () => 'edge',
    ...options,
  });
  return {
    connect,
    commitGraph,
    getGraph,
    replace: (next) => {
      graph = next;
    },
  };
}

describe('synchronous verified graph transaction and candidate source', () => {
  it('publishes latest graph and pending prompt before codec token lookup, without overwriting other params', () => {
    const f = fixture();
    const insertMention = vi.fn();
    expect(
      commitCanvasMentionSelection({
        reference: { nodeId: 'source', kind: 'image', connected: false },
        targetNodeId: 'target',
        connect: (source, target) =>
          f.connect(source, target, { promptOverride: '150ms pending@' }),
        getLatestReference: (id) =>
          f.getGraph().edges.some((edge) => edge.source === id) ? { token: '{{Image 1}}' } : null,
        insertMention,
      }),
    ).toBe('mentionInserted');
    expect(insertMention).toHaveBeenCalledWith({ token: '{{Image 1}}' });
    expect(f.getGraph().nodes[1].data.params).toEqual({
      model: models.default.image,
      prompt: '150ms pending@',
      settings: { quality: 'keep' },
    });
    expect(f.getGraph().edges[0]).toEqual({
      id: 'edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'source',
      targetHandle: 'target',
    });
    expect(f.connect('source', 'target')).toBe(true);
    expect(f.commitGraph).toHaveBeenCalledTimes(1);
  });

  it('revalidates selected stale candidates against current capacity/model and refuses unavailable document boundaries', () => {
    for (const patch of [
      { documentKey: 'different' },
      { readonly: true },
      { readonly: undefined },
      { ready: false },
      { nodes: [] },
    ]) {
      const f = fixture();
      f.replace({ ...f.getGraph(), ...patch });
      expect(f.connect('source', 'target')).toBe(false);
      expect(f.commitGraph).not.toHaveBeenCalled();
    }
    const f = fixture();
    const current = f.getGraph();
    f.replace({
      ...current,
      nodes: [current.nodes[0], image('target', { refImages: Array(14).fill('full') })],
    });
    expect(f.connect('source', 'target')).toBe(false);
    expect(f.commitGraph).not.toHaveBeenCalled();
  });

  it('does not claim success for async/non-committing CAS and rejects graph changes during ID allocation', () => {
    const rejection = vi.fn();
    const f = fixture({ commitGraph: () => Promise.resolve(true), onRejected: rejection });
    expect(f.connect('source', 'target')).toBe(false);
    expect(rejection).toHaveBeenLastCalledWith('commitRejected');
    const emptyCommit = fixture({ commitGraph: () => true, onRejected: rejection });
    expect(emptyCommit.connect('source', 'target')).toBe(false);
    expect(rejection).toHaveBeenLastCalledWith('commitNotSynchronous');
    const stale = fixture({
      createEdgeId: () => {
        stale.replace({ ...stale.getGraph(), nodes: [] });
        return 'edge';
      },
    });
    expect(stale.connect('source', 'target')).toBe(false);
    expect(stale.commitGraph).not.toHaveBeenCalled();
  });

  it('does not mutate graph arrays or schema while making a real source menu with connected order and unknown eligibility', async () => {
    const f = fixture();
    f.replace({
      ...f.getGraph(),
      nodes: [...f.getGraph().nodes, image('unknown', { action: undefined })],
    });
    const previous = f.getGraph();
    const source = createCanvasMentionSource({
      documentKey: 'doc',
      targetNodeId: 'target',
      getGraph: f.getGraph,
      getOptions: () => [],
      preview: (node) => ({ previewMedia: 'image', previewUrl: node.data.url[0] }),
    });
    const candidates = await source.load();
    expect(candidates.map((item) => [item.nodeId, item.disabledReason])).toEqual([
      ['source', undefined],
      ['unknown', 'modelUnsupported'],
    ]);
    expect(f.getGraph()).toBe(previous);
    f.replace({
      ...f.getGraph(),
      nodes: [image('source'), image('target', { params: { model: 'unknown' } })],
    });
    const unverified = await source.load();
    expect(unverified[0].disabledReason).toBe('modelUnsupported');
  });

  it('cancels a yielded source load when the document switches, and keeps text connections token-free', async () => {
    const f = fixture();
    f.replace({
      ...f.getGraph(),
      nodes: [image('target'), ...Array.from({ length: 50 }, (_, index) => image(`i${index}`))],
    });
    const source = createCanvasMentionSource({
      documentKey: 'doc',
      targetNodeId: 'target',
      getGraph: f.getGraph,
    });
    const pending = source.load();
    f.replace({ ...f.getGraph(), documentKey: 'new' });
    await expect(pending).rejects.toThrow('取消');
    const text = { id: 'source', type: 'text', data: { type: 'text', content: ['text'] } };
    const fresh = fixture();
    fresh.replace({ ...fresh.getGraph(), nodes: [text, image('target')] });
    const consume = vi.fn();
    const lookup = vi.fn();
    expect(
      commitCanvasMentionSelection({
        reference: { nodeId: 'source', kind: 'text' },
        targetNodeId: 'target',
        connect: fresh.connect,
        consumeTextTrigger: consume,
        getLatestReference: lookup,
      }),
    ).toBe('textConnected');
    expect(consume).toHaveBeenCalledOnce();
    expect(lookup).not.toHaveBeenCalled();
  });
});
