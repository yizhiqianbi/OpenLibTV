import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SkillAssetPicker from '../components/SkillAssetPicker.jsx';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function media(index, type = 'image') {
  return {
    id: `asset-${index}`,
    name: `素材 ${index}.${type === 'image' ? 'png' : 'mp4'}`,
    type,
    mimeType: type === 'image' ? 'image/png' : 'video/mp4',
    url: `/media/${index}`,
    bytes: 10,
    folderId: null,
    createdAt: '2026-10-11',
    updatedAt: '2026-10-11',
    deletedAt: null,
  };
}
const page = (items, hasMore = false, nextCursor = null, total = items.length) => ({
  items,
  total,
  hasMore,
  nextCursor,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
const picker = (source, onPick = vi.fn()) => (
  <SkillAssetPicker assetSource={source} onClose={vi.fn()} onPick={onPick} />
);
async function settle(request, value) {
  await act(async () => {
    request.resolve(value);
    await request.promise;
  });
}
async function registeredObserver(observers, previous) {
  let observer;
  await waitFor(() => {
    observer = observers.at(-1);
    expect(observer).toBeDefined();
    if (previous) expect(observer).not.toBe(previous);
    expect(observer.observe).toHaveBeenCalled();
  });
  return observer;
}

describe('operator asset picker asynchronous pages', () => {
  it('ignores a queued old scroll observer after a category refresh', async () => {
    const observers = [];
    class Observer {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const videoPage = deferred();
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page([media(1)], true, 'image-next', 2))
        .mockReturnValueOnce(videoPage.promise)
        .mockResolvedValueOnce(page([media(3, 'video')], true, 'video-after', 3)),
    };
    const view = render(picker(source));
    await screen.findByRole('checkbox', { name: '选择 素材 1.png' });
    const oldObserver = await registeredObserver(observers);
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    await settle(videoPage, page([media(2, 'video')], true, 'video-next', 2));
    const categoryObserver = await registeredObserver(observers, oldObserver);
    act(() => oldObserver.callback([{ isIntersecting: true }]));
    expect(source.list).toHaveBeenCalledTimes(2);
    expect(oldObserver.disconnect).toHaveBeenCalled();
    act(() => categoryObserver.callback([{ isIntersecting: true }]));
    await screen.findByRole('checkbox', { name: '选择 素材 3.mp4' });
    expect(source.list.mock.calls[2][0]).toMatchObject({ cursor: 'video-next', type: 'video' });
    expect(screen.queryByRole('checkbox', { name: '选择 素材 1.png' })).toBeNull();
    const lastObserver = await registeredObserver(observers, categoryObserver);
    view.unmount();
    act(() => lastObserver.callback([{ isIntersecting: true }]));
    expect(source.list).toHaveBeenCalledTimes(3);
  });

  it('selects the second page and the 101st asset, then stops at the real terminal page', async () => {
    const records = Array.from({ length: 101 }, (_, index) => media(index + 1));
    const cursors = Array.from({ length: 6 }, (_, index) => `opaque-${index}:?token=a&b`);
    const source = {
      list: vi.fn(async ({ cursor, limit }) => {
        const index = cursor ? cursors.indexOf(cursor) : 0;
        const items = records.slice(index * limit, (index + 1) * limit);
        const hasMore = (index + 1) * limit < records.length;
        return page(items, hasMore, hasMore ? cursors[index + 1] : null, 101);
      }),
    };
    const onPick = vi.fn();
    render(picker(source, onPick));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 素材 1.png' }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 素材 21.png' }));
    for (let index = 2; index < 6; index++) {
      fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
      await screen.findByRole('checkbox', {
        name: `选择 素材 ${Math.min(index * 20 + 1, 101)}.png`,
      });
    }
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 素材 101.png' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(101);
    expect(screen.queryByRole('button', { name: '加载更多' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加 (3)' }));
    expect(onPick.mock.calls[0][0].map((item) => item.metadata.mediaAssetUuid)).toEqual([
      'asset-1',
      'asset-21',
      'asset-101',
    ]);
    expect(source.list).toHaveBeenCalledTimes(6);
    expect(source.list.mock.calls[1][0]).toMatchObject({
      limit: 20,
      cursor: cursors[1],
      deleted: false,
    });
  });

  it('retains loaded assets and cross-page selections on failure, then retries that same cursor', async () => {
    const failedPage = deferred();
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page([media(1)], true, 'second', 2))
        .mockReturnValueOnce(failedPage.promise)
        .mockResolvedValueOnce(page([media(1), media(2)], false, null, 2)),
    };
    const onPick = vi.fn();
    render(picker(source, onPick));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 素材 1.png' }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await act(async () => {
      failedPage.reject(new Error('网络暂不可用'));
    });
    expect(screen.getByRole('alert').textContent).toContain('网络暂不可用');
    expect(screen.getByRole('checkbox', { name: '选择 素材 1.png' }).checked).toBe(true);
    expect(screen.getByRole('button', { name: '添加 (1)' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 素材 2.png' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(source.list.mock.calls[2][0].cursor).toBe('second');
    fireEvent.click(screen.getByRole('button', { name: '添加 (2)' }));
    expect(onPick.mock.calls[0][0].map((item) => item.metadata.mediaAssetUuid)).toEqual([
      'asset-1',
      'asset-2',
    ]);
  });

  it('cancels old-category pages and ignores late results while keeping hidden selected records', async () => {
    const oldPage = deferred(),
      videoPage = deferred(),
      refreshedPage = deferred();
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page([media(1)], true, 'image-next', 2))
        .mockReturnValueOnce(oldPage.promise)
        .mockReturnValueOnce(videoPage.promise)
        .mockReturnValueOnce(refreshedPage.promise),
    };
    const onPick = vi.fn();
    render(picker(source, onPick));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 素材 1.png' }));
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(source.list.mock.calls[1][1].signal.aborted).toBe(true);
    expect(source.list.mock.calls[2][0]).toMatchObject({
      limit: 20,
      deleted: false,
      type: 'video',
      scope: 'personal',
      orderBy: 'created_at_desc',
    });
    await settle(videoPage, page([media(3, 'video')]));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 素材 3.mp4' }));
    await settle(oldPage, page([media(2)]));
    expect(screen.queryByRole('checkbox', { name: '选择 素材 2.png' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await settle(refreshedPage, page([{ ...media(1), url: '/updated/1' }]));
    expect(screen.getByRole('checkbox', { name: '选择 素材 1.png' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '添加 (2)' }));
    expect(onPick.mock.calls[0][0]).toMatchObject([
      { source: { value: '/updated/1' }, metadata: { mediaAssetUuid: 'asset-1' } },
      { metadata: { mediaAssetUuid: 'asset-3' } },
    ]);
  });

  it('debounces search, aborts immediately, and never revives results after unmount', async () => {
    vi.useFakeTimers();
    const initial = deferred(),
      searchPage = deferred();
    const source = {
      list: vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(searchPage.promise),
    };
    const first = render(picker(source));
    fireEvent.change(screen.getByRole('textbox', { name: '搜索资产' }), {
      target: { value: '素材' },
    });
    expect(source.list.mock.calls[0][1].signal.aborted).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索资产' }), {
      target: { value: '素材 9' },
    });
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(source.list).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(source.list.mock.calls[1][0]).toMatchObject({
      limit: 20,
      deleted: false,
      query: '素材 9',
      scope: 'personal',
      orderBy: 'created_at_desc',
    });
    await settle(initial, page([media(1)]));
    expect(screen.queryByRole('checkbox')).toBeNull();
    first.unmount();
    expect(source.list.mock.calls[1][1].signal.aborted).toBe(true);
    const nextSource = { list: vi.fn().mockResolvedValue(page([media(10)])) };
    render(picker(nextSource));
    await act(async () => {
      await Promise.resolve();
    });
    await settle(searchPage, page([media(9)]));
    expect(screen.queryByRole('checkbox', { name: '选择 素材 9.png' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '选择 素材 10.png' })).toBeTruthy();
  });

  it('uses the source scroll boundary, deduplicates parallel load requests, and halts cyclic pages', async () => {
    const observers = [];
    class Observer {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    }
    vi.stubGlobal('IntersectionObserver', Observer);
    const more = deferred();
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page([media(1)], true, 'next', 3))
        .mockReturnValueOnce(more.promise),
    };
    render(picker(source));
    await screen.findByRole('checkbox', { name: '选择 素材 1.png' });
    const observer = await registeredObserver(observers);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 素材 1.png' }));
    expect(observer.options).toMatchObject({ rootMargin: '160px', threshold: 0.01 });
    act(() => {
      observer.callback([{ isIntersecting: true }]);
      observer.callback([{ isIntersecting: true }]);
    });
    expect(source.list).toHaveBeenCalledTimes(2);
    await settle(more, page([media(2)], true, 'next', 3));
    expect(screen.getByRole('alert').textContent).toContain('游标重复');
    expect(screen.getByRole('checkbox', { name: '选择 素材 1.png' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: '选择 素材 2.png' })).toBeTruthy();
    act(() => observer.callback([{ isIntersecting: true }]));
    await waitFor(() => expect(source.list).toHaveBeenCalledTimes(2));
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
