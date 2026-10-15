import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasAutosave } from './useCanvasDocument.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';
import { persistCanvasDocument } from '../persistence.js';

vi.mock('../persistence.js', async (load) => ({
  ...(await load()),
  persistCanvasDocument: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const script = {
  id: 'script',
  type: 'script-v2',
  data: { rows: [{ id: 'shot', imageGenerationPrompt: '旧图', imagePromptState: 'stale' }] },
};
const document = { key: 'first', storageKey: 'first', nodes: [script], edges: [], title: '分镜' };
const snapshot = {
  writable: true,
  scriptPrompts: [
    {
      rowId: 'shot',
      track: 'image',
      value: '最后半秒',
      baseFingerprint: fingerprintScriptPromptBundle(
        getScriptPromptBundle(script.data.rows[0], 'image'),
      ),
    },
  ],
};

function mount() {
  const previousSaves = persistCanvasDocument.mock.calls.length;
  const notify = vi.fn();
  const page = renderHook(
    ({ value, readonly }) => {
      const drafts = useCanvasDrafts({
        storageKey: value.storageKey,
        nodes: value.nodes,
        ready: true,
      });
      useCanvasAutosave(value, {
        loaded: true,
        readonly,
        user: { id: 'local' },
        setSaved: () => {},
        notify,
        projectDrafts: drafts.project,
        acknowledgeDrafts: drafts.acknowledge,
      });
      return drafts;
    },
    { initialProps: { value: document, readonly: false } },
  );
  act(() => vi.advanceTimersByTime(600));
  expect(persistCanvasDocument).toHaveBeenCalledTimes(previousSaves + 1);
  return { page, notify };
}

describe('settled canvas drafts at persistence boundary', () => {
  it('keeps a document-level failed save retry independently of a transient editor and clears the error only after persistence succeeds', () => {
    vi.useFakeTimers();
    let blocked = true;
    persistCanvasDocument.mockImplementation(() => {
      if (blocked) throw new Error('Quota');
    });
    const graph = {
      ...document,
      nodes: [{ ...script, data: { ...script.data, params: { prompt: '未保存的新剧情' } } }],
    };
    const page = renderHook(() =>
      useCanvasAutosave(graph, {
        loaded: true,
        readonly: false,
        user: true,
        setSaved: vi.fn(),
        notify: vi.fn(),
      }),
    );
    act(() => vi.advanceTimersByTime(600));
    expect(page.result.current.saveError).toBe('本机保存失败');
    expect(persistCanvasDocument).toHaveBeenCalledTimes(1);
    blocked = false;
    act(() => expect(page.result.current.retrySave()).toBe(true));
    expect(persistCanvasDocument.mock.calls[1][0].nodes).toEqual(graph.nodes);
    expect(page.result.current.saveError).toBe('');
    expect(persistCanvasDocument).toHaveBeenCalledTimes(2);
    page.unmount();
    expect(persistCanvasDocument).toHaveBeenCalledTimes(2);
  });

  it('does not carry an old document error or its captured retry into a new or readonly document', () => {
    vi.useFakeTimers();
    let blocked = true;
    persistCanvasDocument.mockImplementation(() => {
      if (blocked) throw new Error('Quota');
    });
    const page = renderHook(
      ({ value, readonly }) =>
        useCanvasAutosave(value, {
          loaded: true,
          readonly,
          user: true,
          setSaved: vi.fn(),
          notify: vi.fn(),
        }),
      { initialProps: { value: document, readonly: false } },
    );
    act(() => vi.advanceTimersByTime(600));
    const oldRetry = page.result.current.retrySave;
    const next = { ...document, storageKey: 'second', key: 'second', title: '另一个项目' };
    page.rerender({ value: next, readonly: false });
    expect(page.result.current.saveError).toBe('');
    const savesBefore = persistCanvasDocument.mock.calls.length;
    act(() => expect(oldRetry()).toBe(false));
    page.rerender({ value: next, readonly: true });
    act(() => expect(page.result.current.retrySave()).toBe(false));
    expect(persistCanvasDocument.mock.calls.length).toBe(savesBefore);
    blocked = false;
    page.unmount();
  });
  it('flushes an already committed graph before the next React document effect', () => {
    vi.useFakeTimers();
    const saved = vi.fn();
    const page = renderHook(() =>
      useCanvasAutosave(document, {
        loaded: true,
        readonly: false,
        user: true,
        setSaved: saved,
        notify: vi.fn(),
      }),
    );
    const committed = {
      documentKey: 'first',
      ready: true,
      readonly: false,
      nodes: [{ ...script, id: 'new' }],
      edges: [],
    };
    act(() => expect(page.result.current.flushGraph(committed)).toBe(true));
    expect(persistCanvasDocument).toHaveBeenCalledOnce();
    expect(persistCanvasDocument.mock.calls[0][0]).toMatchObject({
      storageKey: 'first',
      title: '分镜',
      nodes: [{ id: 'new' }],
    });
    expect(saved).toHaveBeenLastCalledWith(true);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument).toHaveBeenCalledOnce();
  });
  it.each(['wrong document', 'readonly graph', 'not ready graph'])(
    'refuses immediate flush for %s without replacing the pending save',
    (kind) => {
      vi.useFakeTimers();
      const page = renderHook(() =>
        useCanvasAutosave(document, {
          loaded: true,
          readonly: false,
          user: true,
          setSaved: vi.fn(),
          notify: vi.fn(),
        }),
      );
      const graph = {
        documentKey: kind === 'wrong document' ? 'second' : 'first',
        readonly: kind === 'readonly graph',
        ready: kind !== 'not ready graph',
        nodes: [],
        edges: [],
      };
      act(() => expect(page.result.current.flushGraph(graph)).toBe(false));
      act(() => vi.advanceTimersByTime(600));
      expect(persistCanvasDocument).toHaveBeenCalledOnce();
      expect(persistCanvasDocument.mock.calls[0][0].nodes).toEqual(document.nodes);
    },
  );
  it('retains a quota-failed immediate graph for the existing pagehide retry', () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const page = renderHook(() =>
      useCanvasAutosave(document, {
        loaded: true,
        readonly: false,
        user: true,
        setSaved: vi.fn(),
        notify,
      }),
    );
    persistCanvasDocument.mockImplementationOnce(() => {
      throw new Error('Quota');
    });
    const graph = { documentKey: 'first', ready: true, readonly: false, nodes: [], edges: [] };
    act(() => expect(page.result.current.flushGraph(graph)).toBe(false));
    expect(notify).toHaveBeenCalledWith('本机存储空间不足，请导出画布文件');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument.mock.calls.at(-1)[0].nodes).toEqual([]);
  });
  it('projects the latest live draft even when a previous autosave already persisted an earlier projection', () => {
    vi.useFakeTimers();
    let value = '先保存的草稿';
    const page = renderHook(() => {
      const drafts = useCanvasDrafts();
      useCanvasAutosave(document, {
        loaded: true,
        readonly: false,
        user: true,
        setSaved: () => {},
        notify: () => {},
        projectDrafts: drafts.project,
        acknowledgeDrafts: drafts.acknowledge,
      });
      return drafts;
    });
    page.result.current.register('first', 'script', () => ({
      ...snapshot,
      scriptPrompts: [{ ...snapshot.scriptPrompts[0], value }],
    }));
    act(() => vi.advanceTimersByTime(600));
    expect(persistCanvasDocument.mock.calls[0][0].nodes[0].data.rows[0].imageGenerationPrompt).toBe(
      '先保存的草稿',
    );
    value = '继续输入的新草稿';
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument.mock.calls[1][0].nodes[0].data.rows[0].imageGenerationPrompt).toBe(
      '继续输入的新草稿',
    );
  });
  it('saves a final-prompt draft on pagehide after the normal document save has already settled', () => {
    vi.useFakeTimers();
    const { page } = mount();
    page.result.current.register('first', 'script', () => snapshot);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument).toHaveBeenCalledTimes(2);
    expect(persistCanvasDocument.mock.calls[1][0].nodes[0].data.rows[0]).toMatchObject({
      imageGenerationPrompt: '最后半秒',
      imagePromptState: 'stale',
    });
  });
  it('persists a retained draft on immediate unmount and does not save an unchanged settled document again', () => {
    vi.useFakeTimers();
    const { page } = mount();
    page.result.current.register('first', 'script', () => snapshot)();
    page.unmount();
    expect(persistCanvasDocument).toHaveBeenCalledTimes(2);
    const other = mount();
    other.page.unmount();
    expect(persistCanvasDocument).toHaveBeenCalledTimes(3);
  });
  it('keeps a failed settled-draft save available for a later pagehide retry', () => {
    vi.useFakeTimers();
    const { page, notify } = mount();
    page.result.current.register('first', 'script', () => snapshot)();
    persistCanvasDocument.mockImplementationOnce(() => {
      throw new Error('Quota');
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(notify).toHaveBeenCalledWith('本机存储空间不足，请导出画布文件');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument).toHaveBeenCalledTimes(3);
    expect(persistCanvasDocument.mock.calls[2][0].nodes[0].data.rows[0].imageGenerationPrompt).toBe(
      '最后半秒',
    );
  });
  it('rejects settled draft projection when the current document becomes readonly', () => {
    vi.useFakeTimers();
    const { page } = mount();
    page.result.current.register('first', 'script', () => snapshot);
    page.rerender({ value: document, readonly: true });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(persistCanvasDocument).toHaveBeenCalledTimes(1);
  });
  it('flushes the departing document draft before staging a new project and keeps their identities separate', () => {
    vi.useFakeTimers();
    const { page } = mount();
    page.result.current.register('first', 'script', () => snapshot)();
    page.rerender({ value: { ...document, key: 'second', storageKey: 'second' }, readonly: false });
    expect(persistCanvasDocument.mock.calls[1][0]).toMatchObject({
      storageKey: 'first',
      nodes: [{ data: { rows: [{ imageGenerationPrompt: '最后半秒' }] } }],
    });
    act(() => vi.advanceTimersByTime(600));
    expect(persistCanvasDocument.mock.calls[2][0]).toMatchObject({
      storageKey: 'second',
      nodes: [{ data: { rows: [{ imageGenerationPrompt: '旧图' }] } }],
    });
  });
});
