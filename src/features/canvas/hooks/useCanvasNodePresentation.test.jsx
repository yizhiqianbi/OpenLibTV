import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasNodePresentation } from './useCanvasNodePresentation.js';

const reference = { type: 'node', id: 'n', nodeKey: 'n', name: '保存标签', projectId: 'a' };
const node = {
  id: 'n',
  position: { x: 1000, y: 1000 },
  width: 100,
  height: 100,
  data: { name: '当前节点' },
};
const bounds = { width: 800, height: 600 };

describe('Canvas node presentation controller', () => {
  it('fits readonly view without mutating nodes or selecting them; deletion is checked at click', () => {
    const setView = vi.fn();
    const { result, rerender } = renderHook((props) => useCanvasNodePresentation(props), {
      initialProps: {
        projectId: 'a',
        nodes: [node],
        documentReady: true,
        boardBounds: bounds,
        setView,
        readonly: true,
      },
    });
    const before = JSON.stringify(node);
    expect(result.current.onLocate(reference)).toBe(true);
    expect(setView).toHaveBeenCalledWith({ x: -650, y: -750, z: 1 }, { duration: 300 });
    expect(JSON.stringify(node)).toBe(before);
    const oldCallback = result.current.onLocate;
    rerender({
      projectId: 'a',
      nodes: [],
      documentReady: true,
      boardBounds: bounds,
      setView,
      readonly: true,
    });
    expect(oldCallback(reference)).toBe(false);
    expect(setView).toHaveBeenCalledTimes(1);
  });
  it('blocks loading, cross-project, stale-owner and unmounted callbacks even with identical node IDs', () => {
    const setView = vi.fn();
    const { result, rerender, unmount } = renderHook((props) => useCanvasNodePresentation(props), {
      initialProps: {
        projectId: 'a',
        nodes: [node],
        documentReady: false,
        boardBounds: bounds,
        setView,
      },
    });
    expect(result.current.onLocate(reference)).toBe(false);
    rerender({ projectId: 'a', nodes: [node], documentReady: true, boardBounds: bounds, setView });
    const callbackA = result.current.onLocate;
    rerender({ projectId: 'b', nodes: [node], documentReady: true, boardBounds: bounds, setView });
    expect(callbackA(reference)).toBe(false);
    expect(result.current.onLocate(reference)).toBe(false);
    const callbackB = result.current.onLocate;
    unmount();
    expect(callbackB({ ...reference, projectId: 'b' })).toBe(false);
    expect(setView).not.toHaveBeenCalled();
  });
  it('allows share replay current-node locating but does not invent cross-project navigation', async () => {
    const setView = vi.fn(),
      onError = vi.fn();
    let reject;
    const onOpenProject = vi.fn(
      () =>
        new Promise((resolve, fail) => {
          reject = fail;
        }),
    );
    const { result, rerender } = renderHook((props) => useCanvasNodePresentation(props), {
      initialProps: {
        projectId: 'b',
        nodes: [node],
        documentReady: true,
        isShareReplay: true,
        boardBounds: bounds,
        setView,
      },
    });
    expect(result.current.onLocate(reference)).toBe(true);
    expect(result.current.onOpenProject).toBeUndefined();
    rerender({
      projectId: 'b',
      nodes: [node],
      documentReady: true,
      isShareReplay: false,
      boardBounds: bounds,
      setView,
      onOpenProject,
      onError,
    });
    let pending;
    act(() => {
      pending = result.current.onOpenProject(reference);
    });
    expect(onOpenProject).toHaveBeenCalledWith({ nodeId: 'n', projectId: 'a' });
    rerender({
      projectId: 'c',
      nodes: [node],
      documentReady: true,
      isShareReplay: false,
      boardBounds: bounds,
      setView,
      onOpenProject,
      onError,
    });
    await act(async () => {
      reject(new Error('迟到失败'));
      expect(await pending).toBe(false);
    });
    expect(onError).not.toHaveBeenCalled();
  });
});
