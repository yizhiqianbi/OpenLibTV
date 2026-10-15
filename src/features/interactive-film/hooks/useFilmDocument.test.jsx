import React, { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFilmDocument } from '../../../services/interactive-film/document.ts';
import {
  deleteFilmDocument,
  FILM_DOCUMENT_PREFIX,
  listFilmDocuments,
  loadFilmDocument,
  saveFilmDocument,
} from '../../../services/interactive-film/repository.ts';
import { useFilmDocument } from './useFilmDocument.js';

beforeEach(() => localStorage.clear());
function fixture(id = 'controller') {
  const document = saveFilmDocument(createFilmDocument(id, '原始标题'));
  return { source: document, ...renderHook(() => useFilmDocument(id)) };
}
function failTitle(title) {
  const original = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key.startsWith(FILM_DOCUMENT_PREFIX) && value.includes(title))
      throw new DOMException('full', 'QuotaExceededError');
    original.call(this, key, value);
  });
}

describe('mounted film document controller preserves edits and document ownership', () => {
  it('persists the final actual input change before immediate load and unmount', () => {
    saveFilmDocument(createFilmDocument('input', '原始标题'));
    const observed = [],
      controllers = [];
    function InputEditor() {
      const controller = useFilmDocument('input');
      controllers[0] = controller;
      return (
        <input
          aria-label="作品标题"
          value={controller.document.title}
          onChange={(event) => {
            const title = event.target.value;
            controller.commit((previous) => ({ ...previous, title }));
            observed.push(loadFilmDocument('input').title);
          }}
        />
      );
    }
    const page = render(<InputEditor />);
    fireEvent.change(screen.getByRole('textbox', { name: '作品标题' }), {
      target: { value: '最后一个输入字符' },
    });
    expect(observed).toEqual(['最后一个输入字符']);
    expect(controllers[0].saved).toBe(true);
    const commit = controllers[0].commit;
    page.unmount();
    expect(commit((previous) => ({ ...previous, title: '迟到输入' }))).toBe(false);
    expect(loadFilmDocument('input').title).toBe('最后一个输入字符');
  });
  it('keeps a failed save in memory and retries the same revision without losing the prior durable document', () => {
    const page = fixture('quota');
    const quota = failTitle('未保存草稿');
    act(() =>
      expect(page.result.current.commit((previous) => ({ ...previous, title: '未保存草稿' }))).toBe(
        false,
      ),
    );
    expect(page.result.current.document).toMatchObject({ title: '未保存草稿', revision: 1 });
    expect(page.result.current.saved).toBe(false);
    expect(loadFilmDocument('quota').title).toBe('原始标题');
    quota.mockRestore();
    act(() => expect(page.result.current.retrySave()).toBe(true));
    expect(loadFilmDocument('quota')).toMatchObject({ title: '未保存草稿', revision: 1 });
    expect(page.result.current.error).toBeNull();
    expect(page.result.current.saved).toBe(true);
  });
  it('retains quota-failed input across unrelated same-tab project notifications', () => {
    const page = fixture('dirty');
    const quota = failTitle('保留草稿');
    act(() => page.result.current.commit((previous) => ({ ...previous, title: '保留草稿' })));
    quota.mockRestore();
    act(() => saveFilmDocument(createFilmDocument('other', '另一个项目')));
    expect(page.result.current.document.title).toBe('保留草稿');
    expect(page.result.current.saved).toBe(false);
    act(() => expect(page.result.current.retrySave()).toBe(true));
    expect(loadFilmDocument('dirty').title).toBe('保留草稿');
  });
  it('does not erase history or reset the current draft from its own synchronous save notifications', () => {
    const page = fixture();
    act(() => {
      expect(page.result.current.commit((previous) => ({ ...previous, title: '一次' }))).toBe(true);
      expect(
        page.result.current.commit((previous) => ({ ...previous, title: previous.title + '二次' })),
      ).toBe(true);
    });
    expect(page.result.current.document).toMatchObject({ title: '一次二次', revision: 2 });
    expect(page.result.current.canUndo).toBe(true);
    act(() => page.result.current.undo());
    expect(page.result.current.document).toMatchObject({ title: '一次', revision: 3 });
    expect(page.result.current.canRedo).toBe(true);
    act(() => page.result.current.redo());
    expect(loadFilmDocument('controller')).toMatchObject({ title: '一次二次', revision: 4 });
    expect(page.result.current.canRedo).toBe(false);
  });
  it('loads changed external content even when a caller reused the same revision, and clears local history', () => {
    const page = fixture('external');
    act(() => page.result.current.commit((previous) => ({ ...previous, title: '本地已保存' })));
    const external = loadFilmDocument('external');
    act(() => saveFilmDocument({ ...external, title: '外部的同 revision 编辑' }));
    expect(page.result.current.document.title).toBe('外部的同 revision 编辑');
    expect(page.result.current.canUndo).toBe(false);
    expect(page.result.current.saved).toBe(true);
    expect(page.result.current.error).toBeNull();
  });
  it('preserves a dirty draft when another view changes the source and prevents overwrite on retry', () => {
    const page = fixture('conflict');
    const quota = failTitle('当前脏草稿');
    act(() => page.result.current.commit((previous) => ({ ...previous, title: '当前脏草稿' })));
    quota.mockRestore();
    act(() => saveFilmDocument({ ...page.source, title: '外部新版本', revision: 2 }));
    expect(page.result.current.document.title).toBe('当前脏草稿');
    expect(page.result.current.error.message).toContain('导出当前草稿');
    act(() => expect(page.result.current.retrySave()).toBe(false));
    expect(loadFilmDocument('conflict').title).toBe('外部新版本');
  });
  it.each([false, true])(
    'does not resurrect an externally deleted project (permanent=%s)',
    (permanent) => {
      const page = fixture(`delete-${permanent}`);
      act(() => deleteFilmDocument(page.source.id, { permanent }));
      expect(page.result.current.error.message).toContain('已删除');
      expect(page.result.current.saved).toBe(false);
      page.rerender();
      act(() => {
        expect(page.result.current.commit((previous) => ({ ...previous, title: '复活' }))).toBe(
          false,
        );
        expect(page.result.current.retrySave()).toBe(false);
        saveFilmDocument(createFilmDocument('unrelated'));
      });
      const stored = loadFilmDocument(page.source.id);
      if (permanent) expect(stored).toBeNull();
      else expect(stored.deletedAt).toBeTypeOf('number');
      page.unmount();
    },
  );
  it('refuses corrupt, future and missing sources instead of creating replacement projects', () => {
    localStorage.setItem(FILM_DOCUMENT_PREFIX + 'broken', '{invalid JSON');
    const broken = renderHook(() => useFilmDocument('broken'));
    expect(broken.result.current.document).toBeNull();
    expect(broken.result.current.error.message).toContain('原数据已保留');
    expect(broken.result.current.error.message).toContain('broken');
    act(() => expect(broken.result.current.retrySave()).toBe(false));
    expect(localStorage.getItem(FILM_DOCUMENT_PREFIX + 'broken')).toBe('{invalid JSON');
    broken.unmount();
    const futureValue = JSON.stringify({ ...createFilmDocument('future'), schemaVersion: 9 });
    localStorage.setItem(FILM_DOCUMENT_PREFIX + 'future', futureValue);
    const future = renderHook(() => useFilmDocument('future'));
    expect(future.result.current.document).toBeNull();
    expect(localStorage.getItem(FILM_DOCUMENT_PREFIX + 'future')).toBe(futureValue);
    future.unmount();
    const missing = renderHook(() => useFilmDocument('missing'));
    expect(missing.result.current.error.message).toContain('不存在');
    expect(loadFilmDocument('missing')).toBeNull();
  });
  it('keeps the current graph and stops writes after a cross-tab corruption event', () => {
    const page = fixture('corrupt-live');
    act(() => {
      localStorage.setItem(FILM_DOCUMENT_PREFIX + 'corrupt-live', '{bad JSON');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: FILM_DOCUMENT_PREFIX + 'corrupt-live',
          storageArea: localStorage,
        }),
      );
    });
    expect(page.result.current.document.title).toBe('原始标题');
    expect(page.result.current.error.message).toContain('原数据已保留');
    act(() =>
      expect(page.result.current.commit((previous) => ({ ...previous, title: '覆盖' }))).toBe(
        false,
      ),
    );
    expect(localStorage.getItem(FILM_DOCUMENT_PREFIX + 'corrupt-live')).toBe('{bad JSON');
  });
  it('creates exactly one persisted document under StrictMode replay', () => {
    const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>;
    const page = renderHook(() => useFilmDocument(), { wrapper });
    expect(listFilmDocuments()).toHaveLength(1);
    expect(listFilmDocuments()[0].id).toBe(page.result.current.document.id);
    expect(page.result.current.saved).toBe(true);
  });
  it('retains a new document when initial persistence fails, including unrelated notifications before retry', () => {
    const quota = failTitle('未命名影游');
    const page = renderHook(() => useFilmDocument());
    const draftId = page.result.current.document.id;
    expect(page.result.current.saved).toBe(false);
    expect(loadFilmDocument(draftId)).toBeNull();
    quota.mockRestore();
    act(() => saveFilmDocument(createFilmDocument('another', '另一个作品')));
    expect(page.result.current.document.id).toBe(draftId);
    act(() => expect(page.result.current.retrySave()).toBe(true));
    expect(loadFilmDocument(draftId).id).toBe(draftId);
  });
});
