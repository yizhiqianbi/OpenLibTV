import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from '../storyboard/script-model.js';
import { useCanvasReferencePick } from './useCanvasReferencePick.js';

afterEach(() => vi.unstubAllGlobals());

describe('reference pick continuous input review', () => {
  it('retains every accepted source deselection before the next animation frame', () => {
    const frames = new Map();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    const image = (id) => ({
      id,
      type: 'image',
      position: { x: 0, y: 0 },
      data: { type: 'image', name: id, url: [`/${id}.png`], action: 'image_resource' },
    });
    let graph = {
      documentKey: 'review',
      ready: true,
      readonly: false,
      models,
      nodes: [
        createCanvasScriptNode({ id: 'script', position: { x: 400, y: 0 }, models }),
        image('a'),
        image('b'),
      ],
      edges: [],
    };
    let selection = ['a'];
    const hook = renderHook(() =>
      useCanvasReferencePick({
        ...graph,
        supportContent: { data: support },
        getDocument: () => graph,
        commitGraph: (next, { expectedGraph }) => {
          if (graph !== expectedGraph) return false;
          graph = next;
          return true;
        },
        flushGraph: () => true,
        setSelected: (next) => {
          selection = typeof next === 'function' ? next(selection) : next;
        },
      }),
    );
    act(() => {
      expect(hook.result.current.enter('script')).toBe(true);
    });
    act(() => {
      expect(hook.result.current.pick('a')).toBe(true);
      expect(hook.result.current.pick('b')).toBe(true);
    });
    expect(graph.edges.map((edge) => edge.source)).toEqual(['a', 'b']);
    act(() => {
      for (const callback of [...frames.values()]) callback();
      frames.clear();
    });
    expect(selection).toEqual(['script']);
  });

  it('adds the explicit target after a plain pane click without clearing unrelated selection', () => {
    const frames = new Map();
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    const graph = {
      documentKey: 'pane-review',
      ready: true,
      readonly: false,
      models,
      nodes: [createCanvasScriptNode({ id: 'script', position: { x: 400, y: 0 }, models })],
      edges: [],
    };
    let selection = ['unrelated'];
    const board = document.createElement('main');
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    const commitGraph = vi.fn(),
      flushGraph = vi.fn();
    const hook = renderHook(() =>
      useCanvasReferencePick({
        ...graph,
        supportContent: { data: support },
        getDocument: () => graph,
        commitGraph,
        flushGraph,
        board: { current: board },
        getView: () => ({ x: 0, y: 0, z: 1 }),
        space: { current: false },
        tool: 'select',
        setSelected: (next) => {
          selection = typeof next === 'function' ? next(selection) : next;
        },
      }),
    );
    const event = {
      target: board,
      button: 0,
      pointerId: 1,
      clientX: 40,
      clientY: 60,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    act(() => {
      expect(hook.result.current.enter('script')).toBe(true);
    });
    expect(selection).toEqual(['unrelated']);
    act(() => {
      expect(hook.result.current.beginBox(event)).toBe(true);
      expect(hook.result.current.endBox(event)).toBe(true);
    });
    act(() => {
      for (const callback of [...frames.values()]) callback();
      frames.clear();
    });
    expect(selection).toEqual(['unrelated', 'script']);
    expect(commitGraph).not.toHaveBeenCalled();
    expect(flushGraph).not.toHaveBeenCalled();
    expect(hook.result.current.active).toBe(true);
  });
});
