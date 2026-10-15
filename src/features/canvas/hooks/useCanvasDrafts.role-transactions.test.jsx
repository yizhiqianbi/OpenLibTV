import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';

const target = (prompt) => ({ id: 'target', type: 'video', data: { params: { prompt } } });
const sibling = (prompt) => ({ id: 'sibling', type: 'video', data: { params: { prompt } } });

describe('explicit graph prompt transactions preserve other pending input', () => {
  it('protects only the next explicit prompt while projecting the complete previous history', () => {
    const previousNodes = [target('{{Image 1}}'), sibling('old sibling')];
    const graph = {
      documentKey: 'doc',
      ready: true,
      readonly: false,
      models: {},
      nodes: previousNodes,
      edges: [{ id: 'old-edge', source: 'role', target: 'target' }],
    };
    const currentDocument = { current: graph };
    const recordSnapshot = vi.fn();
    const page = renderHook(() => {
      const drafts = useCanvasDrafts();
      const actions = useCanvasGraphActions({
        documentKey: 'doc',
        currentDocument,
        setNodes: vi.fn(),
        setEdges: vi.fn(),
        recordSnapshot,
        projectGraph: (snapshot, options) =>
          drafts.project({ ...snapshot, storageKey: 'doc' }, options),
      });
      return { drafts, actions };
    });
    page.result.current.drafts.register('doc', 'target', () => ({
      writable: true,
      basePrompt: '{{Image 1}}',
      value: '{{Image 1}} {{Image 2}}',
    }));
    page.result.current.drafts.register('doc', 'sibling', () => ({
      writable: true,
      basePrompt: 'old sibling',
      value: 'last sibling input',
    }));
    const next = { ...graph, nodes: [target('{{Image 1}}'), sibling('old sibling')], edges: [] };
    act(() =>
      expect(
        page.result.current.actions.commitGraph(next, {
          expectedGraph: graph,
          historySnapshot: {
            nodes: [target('{{Image 1}} {{Image 2}}'), sibling('old sibling')],
            edges: graph.edges,
          },
          explicitPromptNodeIds: ['target'],
        }),
      ).toBe(true),
    );
    expect(currentDocument.current.nodes.map((node) => node.data.params.prompt)).toEqual([
      '{{Image 1}}',
      'last sibling input',
    ]);
    expect(recordSnapshot).toHaveBeenCalledTimes(1);
    expect(recordSnapshot.mock.calls[0][0].nodes.map((node) => node.data.params.prompt)).toEqual([
      '{{Image 1}} {{Image 2}}',
      'last sibling input',
    ]);
    expect(recordSnapshot.mock.calls[0][0].edges).toBe(graph.edges);
  });
  it('keeps default projection behaviour without an explicit writer', () => {
    const page = renderHook(() => useCanvasDrafts());
    page.result.current.register('doc', 'target', () => ({
      writable: true,
      basePrompt: '{{Image 1}}',
      value: '{{Image 1}} {{Image 2}}',
    }));
    const document = { storageKey: 'doc', nodes: [target('{{Image 1}}')], edges: [] };
    expect(page.result.current.project(document).nodes[0].data.params.prompt).toBe(
      '{{Image 1}} {{Image 2}}',
    );
    expect(
      page.result.current.project(document, { explicitPromptNodeIds: ['missing'] }).nodes[0].data
        .params.prompt,
    ).toBe('{{Image 1}} {{Image 2}}');
  });
  it('does not suppress a per-row draft channel belonging to the same explicit node', () => {
    const row = { id: 'row', imageGenerationPrompt: 'old image', videoMotionPrompt: 'old video' };
    const node = {
      id: 'script',
      type: 'script-v2',
      data: {
        params: { prompt: 'old story' },
        rows: [row],
        assets: { characters: [], scenes: [], props: [] },
      },
    };
    const page = renderHook(() => useCanvasDrafts());
    page.result.current.register(
      'doc',
      'script',
      () => ({ writable: true, basePrompt: 'old story', value: 'pending story' }),
      'script-generator',
    );
    page.result.current.register('doc', 'script', () => ({
      writable: true,
      scriptPrompts: [
        {
          rowId: 'row',
          track: 'image',
          value: 'last image prompt',
          baseFingerprint: fingerprintScriptPromptBundle(getScriptPromptBundle(row, 'image')),
        },
      ],
    }));
    const result = page.result.current.project(
      { storageKey: 'doc', nodes: [node] },
      { explicitPromptNodeIds: ['script'] },
    );
    expect(result.nodes[0].data.params.prompt).toBe('old story');
    expect(result.nodes[0].data.rows[0].imageGenerationPrompt).toBe('last image prompt');
    expect(result.nodes[0].data.rows[0].videoMotionPrompt).toBe('old video');
  });
  it('does not extend an explicit prompt scope into another document', () => {
    const page = renderHook(() => useCanvasDrafts());
    page.result.current.register('first', 'target', () => ({
      writable: true,
      basePrompt: 'A',
      value: 'B',
    }));
    const other = { storageKey: 'second', nodes: [target('A')] };
    expect(page.result.current.project(other, { explicitPromptNodeIds: ['target'] })).toBe(other);
    expect(
      page.result.current.project({ storageKey: 'first', nodes: [target('A')] }).nodes[0].data
        .params.prompt,
    ).toBe('B');
  });
});
