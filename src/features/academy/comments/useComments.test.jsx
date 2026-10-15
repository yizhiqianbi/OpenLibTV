import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useComments } from './useComments.js';
import { fixtureViewer } from './comments.fixture.js';

function source(key) {
  return {
    key,
    fetchPage: vi.fn(async () => ({
      list: [{ id: key, replies: [] }],
      page: 1,
      total: 1,
      commentCount: 1,
    })),
  };
}

it('does not reload a prior source when an old delete operation resolves after a route change', async () => {
  let finish;
  const oldSource = source('old'),
    newSource = source('new');
  oldSource.remove = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ current }) => useComments({ source: current, viewer: fixtureViewer }),
    { initialProps: { current: oldSource } },
  );
  await waitFor(() => expect(result.current.comments[0]?.id).toBe('old'));
  let removing;
  act(() => {
    removing = result.current.remove({ id: 'old' });
  });
  rerender({ current: newSource });
  await waitFor(() => expect(result.current.comments[0]?.id).toBe('new'));
  await act(async () => {
    finish();
    await removing;
  });
  expect(result.current.comments[0].id).toBe('new');
  expect(oldSource.fetchPage).toHaveBeenCalledTimes(1);
});
