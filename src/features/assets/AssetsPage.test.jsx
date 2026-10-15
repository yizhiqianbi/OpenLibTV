import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AssetsPage from './AssetsPage.jsx';
import { readStoredValue, writeStoredValue } from '../../services/storage.ts';
import { ASSET_LIBRARY_KEY } from '../../services/asset-library/model.ts';

const props = () => ({ user: { name: '演示' }, login: vi.fn(), toast: vi.fn(), navigate: vi.fn() });
const fixture = [{ id: 'old', name: '素材', type: 'image/png', url: 'data:image/png;base64,AA==' }];
beforeEach(() => localStorage.clear());
function menu(name, action) {
  fireEvent.click(screen.getByRole('button', { name }));
  fireEvent.click(screen.getByRole('menuitem', { name: action, exact: true }));
}
it('migrates old assets and saves rename changes without removing the legacy key', () => {
  writeStoredValue('libtv-assets', fixture);
  const old = localStorage.getItem('libtv-assets');
  const view = render(<AssetsPage {...props()} />);
  menu('素材 更多操作', '重命名');
  fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
    target: { value: ' 新名称 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(readStoredValue(ASSET_LIBRARY_KEY, null).assets[0].name).toBe('新名称');
  expect(localStorage.getItem('libtv-assets')).toBe(old);
  view.unmount();
  render(<AssetsPage {...props()} />);
  expect(screen.getByRole('button', { name: '预览资产 新名称' })).toBeTruthy();
});
it('creates nested folders and returns through breadcrumbs after refreshing the library', () => {
  render(<AssetsPage {...props()} />);
  for (const name of ['一级', '二级', '三级']) {
    menu('新建', '新建文件夹');
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: `打开文件夹 ${name}` }));
  }
  fireEvent.click(screen.getByRole('button', { name: '新建', exact: true }));
  expect(screen.getByRole('menuitem', { name: '新建文件夹' }).disabled).toBe(true);
  const nav = screen.getByRole('navigation', { name: '资产文件夹路径' });
  fireEvent.click(within(nav).getByRole('button', { name: '一级', exact: true }));
  expect(screen.getByRole('button', { name: '打开文件夹 二级' })).toBeTruthy();
});
it('sets and clears a local folder cover from an image in its subtree', () => {
  const image = {
    id: 'cover-image',
    name: '场景图',
    type: 'image',
    mimeType: 'image/png',
    url: 'data:image/png;base64,COVER',
    folderId: 'folder',
    tags: [],
    assetType: null,
    createdAt: 1,
    updatedAt: 1,
  };
  writeStoredValue(ASSET_LIBRARY_KEY, {
    assets: [image],
    folders: [{ id: 'folder', name: '参考素材', parentId: null, createdAt: 1, updatedAt: 1 }],
    tags: [],
  });
  render(<AssetsPage {...props()} />);
  menu('参考素材 更多操作', '设置封面');
  expect(screen.getByRole('dialog', { name: '设置文件夹封面' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '使用 场景图 作为封面' }));
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(readStoredValue(ASSET_LIBRARY_KEY, null).folders[0].coverUrl).toBe(image.url);
  expect(document.querySelector(`img[src="${image.url}"]`)).toBeTruthy();

  menu('参考素材 更多操作', '设置封面');
  fireEvent.click(screen.getByRole('button', { name: '不使用封面' }));
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(readStoredValue(ASSET_LIBRARY_KEY, null).folders[0]).not.toHaveProperty('coverUrl');
});
it('moves an asset and applies global tags and cross-folder search', async () => {
  writeStoredValue(ASSET_LIBRARY_KEY, {
    assets: [{ ...fixture[0], type: 'image', mimeType: 'image/png', folderId: null, tags: [] }],
    folders: [{ id: 'folder', name: '文件夹', parentId: null }],
    tags: [],
  });
  render(<AssetsPage {...props()} />);
  menu('素材 更多操作', '移动到');
  fireEvent.click(
    within(screen.getByRole('dialog', { name: '移动到' })).getByRole('button', {
      name: '文件夹',
      exact: true,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: '确定', exact: true }));
  expect(screen.queryByRole('button', { name: '预览资产 素材' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '打开文件夹 文件夹' }));
  menu('素材 更多操作', '编辑标签');
  fireEvent.click(screen.getByRole('checkbox', { name: '角色' }));
  fireEvent.click(screen.getByRole('button', { name: '确定', exact: true }));
  fireEvent.click(
    within(screen.getByRole('group', { name: '素材标签' })).getByRole('button', { name: '角色' }),
  );
  expect(screen.getByRole('button', { name: '预览资产 素材' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '搜索', exact: true }));
  fireEvent.change(screen.getByRole('textbox', { name: '搜索资产' }), {
    target: { value: '不存在' },
  });
  await waitFor(() => expect(screen.getByText('未找到文件或文件夹')).toBeTruthy());
});
it('keeps preview mounted underneath rename and requires explicit deletion confirmation', () => {
  writeStoredValue('libtv-assets', fixture);
  render(<AssetsPage {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: '预览资产 素材' }));
  fireEvent.click(screen.getByRole('button', { name: '重命名', exact: true }));
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '关闭', exact: true }));
  menu('素材 更多操作', '删除');
  expect(readStoredValue('libtv-assets', []).length).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
  expect(screen.getByRole('button', { name: '预览资产 素材' })).toBeTruthy();
});
it('does not start authentication on mount and gates writes when anonymous', () => {
  const options = props();
  render(<AssetsPage {...options} user={null} />);
  expect(options.login).not.toHaveBeenCalled();
  menu('新建', '新建文件夹');
  expect(options.login).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
});
