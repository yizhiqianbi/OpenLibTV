import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCanvasSnapshotActions } from './useCanvasSnapshotActions.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it.each(['project change', 'unmount'])(
  'ignores delayed clipboard feedback after %s',
  async (change) => {
    let reject;
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => new Promise((_, failed) => (reject = failed))) },
    });
    const notify = vi.fn(),
      setShareUrl = vi.fn();
    const options = {
      documentKey: 'first',
      ready: true,
      readonly: false,
      user: { name: 'local' },
      notify,
      setShareUrl,
      document: { title: '第一项目', nodes: [], edges: [], messages: [] },
      projectDrafts: (snapshot) => snapshot,
    };
    const page = renderHook((value) => useCanvasSnapshotActions(value), { initialProps: options });
    let task;
    act(() => {
      task = page.result.current.share();
    });
    expect(setShareUrl).toHaveBeenCalledOnce();
    const id = new URL(setShareUrl.mock.calls[0][0]).searchParams.get('shareId');
    expect(JSON.parse(localStorage.getItem(`libtv.canvas.${id}`)).title).toBe('第一项目');
    if (change === 'unmount') page.unmount();
    else
      page.rerender({
        ...options,
        documentKey: 'second',
        document: { ...options.document, title: '第二项目' },
      });
    await act(async () => {
      reject(new Error('clipboard denied'));
      await task;
    });
    expect(notify).not.toHaveBeenCalled();
    expect(setShareUrl).toHaveBeenCalledOnce();
  },
);
