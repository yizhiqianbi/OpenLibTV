import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from './script-model.js';
import { useScriptV2ReferenceImport } from './useScriptV2ReferenceImport.js';

describe('native script reference chooser ownership review', () => {
  it.each(['readonly', 'not-ready', 'deleted', 'generating', 'wrong-type'])(
    'retires a pending chooser after observing %s even if the original target is restored',
    (transition) => {
      const original = {
        documentKey: 'native-owner-review',
        ready: true,
        readonly: false,
        models,
        nodes: [createCanvasScriptNode({ id: 'script', position: { x: 0, y: 0 }, models })],
        edges: [],
      };
      let graph = original;
      const readFile = vi.fn(async () => 'data:image/png;base64,AA=='),
        commitGraph = vi.fn();
      const props = {
        supportContent: { data: support },
        getDocument: () => graph,
        readFile,
        commitGraph,
      };
      const hook = renderHook((value) => useScriptV2ReferenceImport({ ...props, ...value }), {
        initialProps: graph,
      });
      act(() => {
        expect(hook.result.current.open('script', 'upload')).toBe(true);
      });
      if (transition === 'readonly') graph = { ...original, readonly: true };
      else if (transition === 'not-ready') graph = { ...original, ready: false };
      else if (transition === 'deleted') graph = { ...original, nodes: [] };
      else if (transition === 'generating')
        graph = {
          ...original,
          nodes: original.nodes.map((node) => ({
            ...node,
            data: { ...node.data, taskInfo: { loading: true, status: 1 } },
          })),
        };
      else
        graph = {
          ...original,
          nodes: original.nodes.map((node) => ({ ...node, type: 'text', data: { type: 'text' } })),
        };
      hook.rerender(graph);
      graph = original;
      hook.rerender(graph);
      act(() => {
        expect(
          hook.result.current.addFiles([new File(['reference'], 'a.png', { type: 'image/png' })]),
        ).toBe(false);
      });
      expect(readFile).not.toHaveBeenCalled();
      expect(commitGraph).not.toHaveBeenCalled();
    },
  );
});
