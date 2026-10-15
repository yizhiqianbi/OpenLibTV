import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useStudioImport } from './useStudioImport.js';

function pendingImport() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
function actions(importGLB) {
  return {
    viewport: { current: { importGLB } },
    record: vi.fn(),
    setObjects: vi.fn(),
    setSelected: vi.fn(),
    setBusy: vi.fn(),
    notify: vi.fn(),
  };
}

it('aborts a project-owned import and ignores its late completion on route change', async () => {
  const pending = pendingImport(),
    importGLB = vi.fn().mockReturnValue(pending.promise),
    state = actions(importGLB);
  const { result, rerender } = renderHook(({ projectId }) => useStudioImport(projectId, state), {
    initialProps: { projectId: 'first' },
  });
  let completion;
  act(() => {
    completion = result.current({ name: 'fixture.glb' });
  });
  const signal = importGLB.mock.calls[0][1].signal;
  rerender({ projectId: 'next' });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    pending.resolve({ id: 'late' });
    await completion;
  });
  expect(state.setObjects).not.toHaveBeenCalled();
  expect(state.record).not.toHaveBeenCalled();
  expect(state.setBusy).toHaveBeenLastCalledWith(false);
});

it('commits validated serializable imports and keeps busy until all concurrent imports finish', async () => {
  const first = pendingImport(),
    second = pendingImport();
  const importGLB = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    state = actions(importGLB);
  const { result } = renderHook(() => useStudioImport('project', state));
  let one, two;
  act(() => {
    one = result.current({ name: 'one.glb' });
    two = result.current({ name: 'two.glb' });
  });
  const object = { id: 'one', type: 'glb', dataUrl: 'data:model/gltf-binary;base64,first' };
  await act(async () => {
    first.resolve(object);
    await one;
  });
  expect(state.setBusy).toHaveBeenLastCalledWith(true);
  expect(state.setObjects.mock.calls[0][0]([{ id: 'existing' }])).toEqual([
    { id: 'existing' },
    object,
  ]);
  await act(async () => {
    second.resolve({ id: 'two' });
    await two;
  });
  expect(state.setBusy).toHaveBeenLastCalledWith(false);
  expect(state.record).toHaveBeenCalledTimes(2);
});
