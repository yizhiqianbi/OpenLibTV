import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilmDocument } from './document.ts';
import {
  copyFilmDocument,
  deleteFilmDocument,
  FILM_DOCUMENT_PREFIX,
  listFilmDocuments,
  loadFilmDocument,
  renameFilmDocument,
  restoreFilmDocument,
  saveFilmDocument,
  subscribeFilmDocuments,
} from './repository.ts';

beforeEach(() => localStorage.clear());
describe('canonical film document repository', () => {
  it('lists canonical documents without an index, saves incomplete drafts and preserves UI revision', () => {
    const document = createFilmDocument('one');
    document.revision = 7;
    const saved = saveFilmDocument(document);
    expect(saved.revision).toBe(7);
    expect(listFilmDocuments().map((doc) => doc.id)).toEqual(['one']);
    expect(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)),
    ).toEqual([FILM_DOCUMENT_PREFIX + 'one']);
    saved.nodes[0].title = '外部改变';
    expect(loadFilmDocument('one')?.nodes[0].title).toBe('开始');
  });
  it('blocks overwriting malformed and future documents and surfaces broken listings', () => {
    localStorage.setItem(FILM_DOCUMENT_PREFIX + 'broken', '{bad JSON');
    expect(() => saveFilmDocument(createFilmDocument('broken'))).toThrow();
    expect(() => listFilmDocuments()).toThrow();
    expect(localStorage.getItem(FILM_DOCUMENT_PREFIX + 'broken')).toBe('{bad JSON');
    localStorage.setItem(
      FILM_DOCUMENT_PREFIX + 'future',
      JSON.stringify({ ...createFilmDocument('future'), schemaVersion: 2 }),
    );
    expect(() => saveFilmDocument(createFilmDocument('future'))).toThrow('版本不兼容');
  });
  it('copies actual graph data and keeps shared media references without copying a metadata-only card', () => {
    const document = createFilmDocument('source', '原作');
    document.media.push({
      id: 'media',
      type: 'image',
      name: '封面',
      mimeType: 'image/png',
      bytes: 2,
      width: 1,
      height: 1,
    });
    saveFilmDocument(document);
    const copy = copyFilmDocument('source');
    expect(copy.id).not.toBe(document.id);
    expect(loadFilmDocument(copy.id)?.nodes).toEqual(document.nodes);
    expect(copy.media[0].id).toBe('media');
  });
  it('soft deletes, rejects stale autosave resurrection, restores and permanently removes', () => {
    const document = saveFilmDocument(createFilmDocument('trash'));
    deleteFilmDocument('trash');
    expect(listFilmDocuments()[0].deletedAt).toBeTypeOf('number');
    expect(() => saveFilmDocument(document)).toThrow('回收站');
    expect(restoreFilmDocument('trash').deletedAt).toBeUndefined();
    deleteFilmDocument('trash', { permanent: true });
    expect(loadFilmDocument('trash')).toBeNull();
  });
  it('renames persisted documents and changes the document revision once', () => {
    saveFilmDocument(createFilmDocument('name'));
    expect(renameFilmDocument('name', ' 新标题 ')).toMatchObject({ title: '新标题', revision: 1 });
    expect(() => renameFilmDocument('name', ' ')).toThrow('不能为空');
  });
  it('notifies the same tab only after durable writes and listens for new cross-tab canonical keys', () => {
    const callback = vi.fn(() => {
      expect(loadFilmDocument('events')?.title).toBe('保存后');
    });
    const unsubscribe = subscribeFilmDocuments(callback);
    saveFilmDocument(createFilmDocument('events', '保存后'));
    expect(callback).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: FILM_DOCUMENT_PREFIX + 'new-tab',
        storageArea: localStorage,
      }),
    );
    expect(callback).toHaveBeenCalledTimes(2);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'libtv.canvas.other', storageArea: localStorage }),
    );
    expect(callback).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveFilmDocument(createFilmDocument('events', '保存后'));
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it('retains the previous canonical document and emits no success when storage hits quota', () => {
    saveFilmDocument(createFilmDocument('quota', '原内容'));
    const callback = vi.fn(),
      unsubscribe = subscribeFilmDocuments(callback);
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === FILM_DOCUMENT_PREFIX + 'quota' && value.includes('新内容'))
        throw new DOMException('full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    expect(() => saveFilmDocument(createFilmDocument('quota', '新内容'))).toThrow();
    expect(loadFilmDocument('quota')?.title).toBe('原内容');
    expect(callback).not.toHaveBeenCalled();
    spy.mockRestore();
    unsubscribe();
    expect(saveFilmDocument(createFilmDocument('quota', '新内容')).title).toBe('新内容');
  });
  it('isolates a broken subscriber so the durable write and other subscribers still succeed', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = subscribeFilmDocuments(() => {
      throw new Error('broken view');
    });
    const callback = vi.fn(),
      unsubscribe = subscribeFilmDocuments(callback);
    expect(saveFilmDocument(createFilmDocument('subscriber')).id).toBe('subscriber');
    expect(loadFilmDocument('subscriber')?.id).toBe('subscriber');
    expect(callback).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    broken();
    unsubscribe();
    log.mockRestore();
  });
});
