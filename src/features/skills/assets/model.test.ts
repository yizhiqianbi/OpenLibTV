import { describe, expect, it } from 'vitest';
import type { AssetRecord, Page } from '../../../services/contracts.ts';
import {
  advanceAssetPage,
  emptyAssetCursorState,
  filterPickerEntries,
  pickerEntries,
  readAssetPage,
  reconcileSelectedAssets,
} from './model.ts';

const image = {
  id: 'image',
  name: '参考.png',
  type: 'image',
  mimeType: 'image/png',
  url: '/reference.png',
  bytes: 10,
  folderId: null,
  createdAt: '2026-10-11',
  updatedAt: '2026-10-11',
  deletedAt: null,
} satisfies AssetRecord;
const page = (items: AssetRecord[], hasMore: boolean, nextCursor?: string): Page<AssetRecord> => ({
  items,
  total: 101,
  hasMore,
  nextCursor,
});

describe('asset picker records and cursor boundary', () => {
  it('deduplicates records, keeps their order and updates the current media URL', () => {
    const initial = advanceAssetPage(emptyAssetCursorState(), page([image], true, 'opaque-next'));
    const updated = { ...image, url: '/replacement.png' };
    const second = { ...image, id: 'second' };
    const result = advanceAssetPage(initial, page([updated, second], false), 'opaque-next');
    expect(result.records).toEqual([updated, second]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('rejects missing and cyclic cursors and duplicate-only or empty nonterminal pages', () => {
    expect(() => advanceAssetPage(emptyAssetCursorState(), page([image], true))).toThrow(
      '缺少下一页游标',
    );
    const initial = advanceAssetPage(emptyAssetCursorState(), page([image], true, 'next'));
    expect(() =>
      advanceAssetPage(initial, page([{ ...image, id: 'other' }], true, 'next'), 'next'),
    ).toThrow('游标重复');
    expect(() => advanceAssetPage(initial, page([image], true, 'new-next'), 'next')).toThrow(
      '没有新增记录',
    );
    expect(() => advanceAssetPage(initial, page([], true, 'new-next'), 'next')).toThrow(
      '没有新增记录',
    );
    expect(advanceAssetPage(initial, page([], false), 'next').records).toEqual([image]);
  });

  it('does not infer private pagination or silently accept malformed operator responses', () => {
    expect(() => readAssetPage({ list: [image], total: 101 })).toThrow('分页数据格式');
    expect(() => readAssetPage({ items: [image], total: -1, hasMore: false })).toThrow(
      '分页数据格式',
    );
    expect(() =>
      readAssetPage({ items: [{ ...image, id: null }], total: 1, hasMore: false }),
    ).toThrow('记录不完整');
    expect(() => readAssetPage({ items: [image], total: 1, hasMore: true, nextCursor: 2 })).toThrow(
      '游标格式',
    );
  });

  it('keeps selections across remote filters, refreshes observed records, and prunes real removals', () => {
    const selected = pickerEntries([image]);
    expect(reconcileSelectedAssets(selected, [], false)).toEqual(selected);
    expect(reconcileSelectedAssets(selected, [{ ...image, url: '/new.png' }], false)[0].url).toBe(
      '/new.png',
    );
    expect(reconcileSelectedAssets(selected, [{ ...image, deletedAt: 'now' }], false)).toEqual([]);
    expect(reconcileSelectedAssets(selected, [], true)).toEqual([]);
  });

  it('filters local legacy MIME entries while excluding deleted, temporary and unsupported media', () => {
    const entries = pickerEntries([
      { ...image, type: 'image/png' },
      { ...image, id: 'video', name: '片段.MP4', type: 'video', mimeType: 'video/mp4' },
      { ...image, id: 'removed', deletedAt: 2 },
      { ...image, id: 'temporary', url: 'blob:local' },
      { ...image, id: 'document', name: '说明.pdf', type: 'document', mimeType: 'application/pdf' },
    ]);
    expect(entries.map((item) => item.id)).toEqual(['image', 'video']);
    expect(filterPickerEntries(entries, '  片段.mp4 ', 'video').map((item) => item.id)).toEqual([
      'video',
    ]);
    expect(filterPickerEntries(entries, '参考', 'audio')).toEqual([]);
    expect(pickerEntries([image, { ...image, deletedAt: 'now' }])).toEqual([]);
  });
});
