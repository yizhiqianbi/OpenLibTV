import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';

function fixture() {
  const node = {
    id: 'script',
    type: 'script-v2',
    data: {
      params: { prompt: '{{Image 1}}' },
      assets: { characters: [], scenes: [], props: [] },
      rows: [
        {
          id: 'shot',
          plotDescription: 'old plot',
          imageGenerationPrompt: 'old image',
          videoMotionPrompt: 'old motion',
        },
      ],
    },
  };
  const row = node.data.rows[0];
  const draft = {
    writable: true,
    scriptPrompts: [
      {
        rowId: row.id,
        track: 'image',
        value: 'last image draft',
        baseFingerprint: fingerprintScriptPromptBundle(getScriptPromptBundle(row, 'image')),
      },
    ],
  };
  return { node, draft, document: { storageKey: 'doc', nodes: [node], edges: [] } };
}

it.each([false, true])(
  'consumes a %s retired script-generator prompt while retaining default-channel row drafts and other documents',
  (retire) => {
    const f = fixture();
    const hook = renderHook(() => useCanvasDrafts());
    let prompt = { writable: true, value: '{{Image 1}} {{Image 2}}', basePrompt: '{{Image 1}}' };
    const accept = vi.fn((value) => {
      prompt = { ...prompt, value, basePrompt: value };
      return true;
    });
    const rowRelease = hook.result.current.register('doc', 'script', () => f.draft);
    const promptRelease = hook.result.current.register(
      'doc',
      'script',
      () => prompt,
      'script-generator',
      accept,
    );
    if (retire) {
      rowRelease();
      promptRelease();
    }
    hook.result.current.register(
      'other',
      'script',
      () => ({ writable: true, value: 'other document last input', basePrompt: '{{Image 1}}' }),
      'script-generator',
    );
    hook.result.current.consume(f.document, { explicitPromptNodeIds: ['script'] });
    const projected = hook.result.current.project(f.document);
    expect(projected.nodes[0].data.params.prompt).toBe('{{Image 1}}');
    expect(projected.nodes[0].data.rows[0].imageGenerationPrompt).toBe('last image draft');
    expect(projected.nodes[0].data.rows[0].videoMotionPrompt).toBe('old motion');
    expect(accept).toHaveBeenCalledTimes(retire ? 0 : 1);
    const other = hook.result.current.project({ ...f.document, storageKey: 'other' });
    expect(other.nodes[0].data.params.prompt).toBe('other document last input');
    expect(other.nodes[0].data.rows).toBe(f.node.data.rows);
  },
);

it('successful node removal retires all its channels; late cleanup cannot re-register old inputs or rows', () => {
  const f = fixture();
  const hook = renderHook(() => useCanvasDrafts());
  const rows = hook.result.current.register('doc', 'script', () => f.draft);
  const prompt = hook.result.current.register(
    'doc',
    'script',
    () => ({ writable: true, value: 'last prompt', basePrompt: '{{Image 1}}' }),
    'script-generator',
  );
  const previous = hook.result.current.project(f.document);
  hook.result.current.consume({ ...f.document, nodes: [] }, { removedNodeIds: ['script'] });
  rows();
  prompt();
  expect(previous.nodes[0].data.params.prompt).toBe('last prompt');
  expect(previous.nodes[0].data.rows[0].imageGenerationPrompt).toBe('last image draft');
  expect(hook.result.current.project(f.document)).toBe(f.document);
});

it('an interrupted accept callback cannot restore its captured prompt during save retry', () => {
  const f = fixture();
  const hook = renderHook(() => useCanvasDrafts());
  hook.result.current.register(
    'doc',
    'script',
    () => ({ writable: true, value: '{{Image 1}} {{Image 2}}', basePrompt: '{{Image 1}}' }),
    'script-generator',
    () => {
      throw new Error('input retired during redraw');
    },
  );
  expect(() =>
    hook.result.current.consume(f.document, { explicitPromptNodeIds: ['script'] }),
  ).not.toThrow();
  expect(hook.result.current.project(f.document)).toBe(f.document);
});

it('a temporarily unreadable row draft remains available after recovery without throwing from post-CAS consumption', () => {
  const f = fixture();
  const hook = renderHook(() => useCanvasDrafts());
  let failed = true;
  hook.result.current.register('doc', 'script', () => {
    if (failed) throw new Error('row input updating');
    return f.draft;
  });
  expect(() =>
    hook.result.current.consume(f.document, { explicitPromptNodeIds: ['script'] }),
  ).not.toThrow();
  failed = false;
  expect(hook.result.current.project(f.document).nodes[0].data.rows[0].imageGenerationPrompt).toBe(
    'last image draft',
  );
});

it('a cached script-row shape stays registered when its post-CAS read temporarily fails', () => {
  const f = fixture();
  const hook = renderHook(() => useCanvasDrafts());
  let failed = false;
  hook.result.current.register('doc', 'script', () => {
    if (failed) throw new Error('row redraw after accepted graph');
    return f.draft;
  });
  expect(hook.result.current.project(f.document).nodes[0].data.rows[0].imageGenerationPrompt).toBe(
    'last image draft',
  );
  failed = true;
  expect(() =>
    hook.result.current.consume(f.document, { explicitPromptNodeIds: ['script'] }),
  ).not.toThrow();
  failed = false;
  expect(hook.result.current.project(f.document).nodes[0].data.rows[0].imageGenerationPrompt).toBe(
    'last image draft',
  );
});
