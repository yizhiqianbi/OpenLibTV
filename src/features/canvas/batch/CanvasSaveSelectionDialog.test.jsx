import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, removeStoredValue, writeStoredValue } from '../../../services/storage.ts';
import { ASSET_LIBRARY_KEY } from '../../../services/asset-library/model.ts';
import CanvasSaveSelectionDialog from './CanvasSaveSelectionDialog.jsx';

const image = {
  id: 'image',
  type: 'image',
  data: { type: 'image', name: '画面', url: ['/actual.png'], taskInfo: { taskId: 'original' } },
};
const text = {
  id: 'text',
  type: 'text',
  data: { type: 'text', name: '旁白', content: ['首行', '第二行'] },
};
const empty = { id: 'empty', type: 'image', data: { type: 'image', url: [] } };
const folder = { id: 'folder', name: '场景', parentId: null, createdAt: 1, updatedAt: 1 };
const initial = { assets: [], folders: [folder], tags: ['已有标签'] };
const base = {
  documentKey: 'canvas-a',
  projectId: 'project-a',
  nodes: [image, text, empty],
  selectedIds: ['image', 'text', 'empty'],
};
const readLibrary = () => readStoredValue(ASSET_LIBRARY_KEY, null);
const canonicalWrites = (spy) => spy.mock.calls.filter(([key]) => key === ASSET_LIBRARY_KEY);

beforeEach(() => {
  removeStoredValue('libtv-assets');
  removeStoredValue(ASSET_LIBRARY_KEY);
  writeStoredValue(ASSET_LIBRARY_KEY, initial, { version: 1 });
});
afterEach(() => vi.restoreAllMocks());

describe('save actual canvas selection to the atomic local library', () => {
  it('commits media and multiline text together with shared folder/category/tags and bounded individual names', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const original = JSON.stringify(base.nodes);
    render(<CanvasSaveSelectionDialog {...base} onClose={onClose} onSaved={onSaved} />);
    expect(screen.getByText(/已忽略 1 个/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    await user.clear(screen.getByRole('textbox', { name: '资产名称 画面' }));
    fireEvent.change(screen.getByRole('textbox', { name: '资产名称 画面' }), {
      target: { value: '图'.repeat(55) },
    });
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    await user.click(screen.getByRole('checkbox', { name: '场景' }));
    await user.type(screen.getByRole('textbox', { name: '新标签' }), '验收');
    await user.click(screen.getByRole('button', { name: '添加标签' }));
    expect(readLibrary().tags).toEqual(['已有标签']);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(canonicalWrites(spy)).toHaveLength(1);
    const library = readLibrary();
    expect(library.assets).toHaveLength(2);
    expect(library.assets[0].name).toBe('图'.repeat(50));
    expect(library.assets.every((item) => item.folderId === 'folder' && item.assetType === 2)).toBe(
      true,
    );
    expect(library.assets.every((item) => item.projectUuid === 'project-a')).toBe(true);
    expect(library.tags).toEqual(['已有标签', '场景', '验收']);
    expect(library.folders).toEqual(initial.folders);
    expect(library.assets[1]).toMatchObject({ content: '首行\n第二行', type: 'document' });
    expect(JSON.parse(library.assets[0].assetData).items[0].data).not.toHaveProperty('taskInfo');
    expect(JSON.stringify(base.nodes)).toBe(original);
    expect(onSaved).toHaveBeenCalledWith(library.assets);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('retains the whole form after quota failure and retries once without duplicating or wiping existing assets', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const setItem = Storage.prototype.setItem;
    let fail = true;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === ASSET_LIBRARY_KEY && fail) {
        fail = false;
        throw new DOMException('full', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    });
    render(
      <CanvasSaveSelectionDialog
        {...base}
        selectedIds={['image']}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    await user.clear(screen.getByRole('textbox', { name: '资产名称' }));
    await user.type(screen.getByRole('textbox', { name: '资产名称' }), '保留名称');
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    await user.click(screen.getByRole('checkbox', { name: '已有标签' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert').textContent).toContain('标签已保留');
    expect(screen.getByRole('textbox', { name: '资产名称' }).value).toBe('保留名称');
    expect(screen.getByRole('combobox', { name: '保存位置' }).value).toBe('folder');
    expect(screen.getByRole('checkbox', { name: '已有标签' }).checked).toBe(true);
    expect(readLibrary().assets).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(readLibrary().assets).toHaveLength(1);
    expect(readLibrary().assets[0].name).toBe('保留名称');
    // The storage boundary rolls back the original document after the failed
    // atomic write. There are two save attempts and one unchanged rollback.
    const writes = canonicalWrites(spy);
    expect(writes.filter(([, value]) => JSON.parse(value).assets.length === 1)).toHaveLength(2);
    expect(writes.filter(([, value]) => JSON.parse(value).assets.length === 0)).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it('blocks a corrupt legacy library and readonly/loading documents without overwriting data', async () => {
    const user = userEvent.setup();
    removeStoredValue(ASSET_LIBRARY_KEY);
    localStorage.setItem('libtv-assets', '{broken');
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const onClose = vi.fn();
    const view = render(<CanvasSaveSelectionDialog {...base} onClose={onClose} />);
    expect(screen.getByRole('alert').textContent).toContain('资产库读取失败');
    expect(screen.getByRole('combobox', { name: '保存位置' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    expect(localStorage.getItem('libtv-assets')).toBe('{broken');
    expect(canonicalWrites(spy)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledOnce();
    act(() => removeStoredValue('libtv-assets'));
    view.rerender(<CanvasSaveSelectionDialog {...base} ready={false} onClose={onClose} />);
    expect(screen.getByText('正在加载画布，请稍候…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    view.rerender(<CanvasSaveSelectionDialog {...base} readonly onClose={onClose} />);
    expect(screen.getByText('只读画布不能保存资产。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    expect(canonicalWrites(spy)).toHaveLength(0);
    act(() => writeStoredValue(ASSET_LIBRARY_KEY, initial, { version: 1 }));
    view.rerender(<CanvasSaveSelectionDialog {...base} onClose={onClose} />);
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    // Another tab can change the raw value before its storage event is delivered.
    localStorage.setItem(ASSET_LIBRARY_KEY, '{late-broken');
    const writesBefore = canonicalWrites(spy).length;
    fireEvent.submit(screen.getByRole('button', { name: '保存' }).closest('form'));
    expect(localStorage.getItem(ASSET_LIBRARY_KEY)).toBe('{late-broken');
    expect(canonicalWrites(spy)).toHaveLength(writesBefore);
    expect(screen.getByText(/资产库读取失败/)).toBeTruthy();
  });

  it('clears the old document form on a same-instance switch and invalidates a removed folder', async () => {
    const user = userEvent.setup();
    const view = render(
      <CanvasSaveSelectionDialog {...base} selectedIds={['image']} onClose={vi.fn()} />,
    );
    await user.clear(screen.getByRole('textbox', { name: '资产名称' }));
    await user.type(screen.getByRole('textbox', { name: '资产名称' }), '旧文档名字');
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    await user.click(screen.getByRole('checkbox', { name: '角色' }));
    view.rerender(
      <CanvasSaveSelectionDialog
        {...base}
        documentKey="canvas-b"
        projectId="project-b"
        selectedIds={['text']}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: '资产名称' }).value).toBe('旁白');
    expect(screen.getByRole('combobox', { name: '保存位置' }).value).toBe('');
    expect(screen.getByRole('checkbox', { name: '角色' }).checked).toBe(false);
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    act(() => writeStoredValue(ASSET_LIBRARY_KEY, { ...initial, folders: [] }, { version: 1 }));
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    expect(readLibrary().assets).toHaveLength(0);
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), '__local-root__');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(readLibrary().assets[0]).toMatchObject({
      sourceNodeId: 'text',
      projectUuid: 'project-b',
      name: '旁白',
      folderId: null,
    });
  });

  it('does not commit on composition Enter, cancellation, or contentless selection', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const view = render(
      <CanvasSaveSelectionDialog {...base} selectedIds={['image']} onClose={onClose} />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    fireEvent.keyDown(screen.getByRole('textbox', { name: '资产名称' }), {
      key: 'Enter',
      isComposing: true,
      keyCode: 229,
    });
    expect(readLibrary().assets).toHaveLength(0);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    view.rerender(
      <CanvasSaveSelectionDialog {...base} selectedIds={['empty']} onClose={onClose} />,
    );
    expect(screen.getByText(/所选节点没有可保存的/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '保存' }).disabled).toBe(true);
    expect(readLibrary().assets).toHaveLength(0);
  });

  it('never repeats a committed write when a consumer callback fails', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn(() => {
      throw new Error('后续通知失败');
    });
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <CanvasSaveSelectionDialog
        {...base}
        selectedIds={['image']}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    await user.selectOptions(screen.getByRole('combobox', { name: '保存位置' }), 'folder');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('status').textContent).toContain('已保存到本地资产库');
    expect(screen.getByRole('button', { name: '已保存到本地' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '已保存到本地' }));
    expect(readLibrary().assets).toHaveLength(1);
    expect(canonicalWrites(spy)).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
