import { describe, expect, it } from 'vitest';
import { agentAssetText } from '../agent-assets.ts';
import {
  assetPickerRequest,
  filterPickerEntries,
  normalizePickerAsset,
  pickerAssetReferences,
  pickerAssetText,
  pickerEntries,
  pickerFolders,
  pickerFolderPath,
  readAssetPage,
  sortPickerEntries,
} from './model.ts';
import { collectionAssetPickerSource, hydrateAssetPickerPage } from './source.ts';
const image = {
  id: 'image',
  name: '参考',
  type: 'image',
  url: '/image.png',
  folderId: 'nested',
  tags: ['验收'],
  createdAt: 1,
};

describe('shared asset browser record and navigation rules', () => {
  it('preserves rich v2 payloads and exposes standalone text without inventing a media URL', () => {
    const assetData = JSON.stringify({
      version: 2,
      items: [
        { data: { type: 'text', content: ['  第一行', '第二行  '] } },
        { data: { type: 'text', content: '末尾' } },
      ],
    });
    const item = normalizePickerAsset({ id: 'text', name: '分镜', assetData });
    expect(item).toMatchObject({
      mediaType: 'text',
      url: '',
      content: '第一行\n第二行\n\n末尾',
      assetData,
    });
    expect(pickerAssetReferences([item!])).toEqual([]);
    expect(pickerAssetText([item!])).toBe('第一行\n第二行\n\n末尾');
    const explicit = normalizePickerAsset({
      id: 'plain',
      name: '独立文本',
      type: 'text',
      content: '正文',
    });
    expect(agentAssetText(explicit!.assetData!)).toBe('正文');
    expect(
      normalizePickerAsset({
        id: 'pdf',
        name: '说明.pdf',
        type: 'document',
        mimeType: 'application/pdf',
        url: '/说明.pdf',
      }),
    ).toBeNull();
  });
  it('uses a sendable v2 URL and retains the original batch instead of flattening multi-media assets', () => {
    const assetData = JSON.stringify({
      version: 2,
      items: [
        { data: { type: 'image', url: ['blob:pending'] } },
        { data: { type: 'video', url: ['/clip.mp4', '/second.mp4'] } },
      ],
    });
    const item = normalizePickerAsset({ id: 'batch', name: '镜头', assetData });
    expect(item).toMatchObject({ mediaType: 'video', url: '/clip.mp4', assetData });
    expect(pickerAssetReferences([item!])).toHaveLength(2);
  });
  it('gives global name search priority over tags and folders while retaining team member filters', () => {
    const context = {
      scope: 'team' as const,
      teamId: 'team',
      folderId: 'nested',
      tagNames: ['角色'],
      memberUserIds: ['owner'],
      orderBy: 'created_at_desc' as const,
    };
    expect(assetPickerRequest(' 名称 ', 'text', context)).toEqual({
      query: '名称',
      type: 'text',
      limit: 20,
      deleted: false,
      scope: 'team',
      teamId: 'team',
      memberUserIds: ['owner'],
      orderBy: 'created_at_desc',
    });
    expect(assetPickerRequest('', 'all', context)).toMatchObject({ tagNames: ['角色'] });
    expect(assetPickerRequest('', 'all', { folderId: 'nested' })).toMatchObject({
      folderId: 'nested',
    });
    const entries = pickerEntries([
      image,
      { ...image, id: 'outside', name: '别处', folderId: null, tags: [] },
    ]);
    expect(
      filterPickerEntries(entries, '', 'all', { folderId: 'nested' }).map((item) => item.id),
    ).toEqual(['image']);
    expect(
      filterPickerEntries(entries, '别处', 'all', { folderId: 'nested', tagNames: ['验收'] }).map(
        (item) => item.id,
      ),
    ).toEqual(['outside']);
    expect(
      filterPickerEntries(entries, '', 'all', { tagNames: ['不存在'] }, [{ name: '不存在' }]),
    ).toEqual([]);
  });
  it('navigates folder paths, separates IDs from asset IDs and applies stable creation order', () => {
    const folders = pickerFolders([
      { id: 'root', name: '一级', createdAt: 3 },
      { id: 'nested', parentId: 'root', name: '二级', createdAt: 4 },
    ]);
    expect(pickerFolderPath(folders, 'nested').map((item) => item.name)).toEqual(['一级', '二级']);
    expect(() => pickerFolderPath(folders, 'missing')).toThrow('已不存在');
    expect(() =>
      pickerFolderPath([{ ...folders[0], parentId: 'nested' }, folders[1]], 'root'),
    ).toThrow('循环');
    expect(
      sortPickerEntries([
        { id: 'old', createdAt: 1 },
        { id: 'new', createdAt: 2 },
        { id: 'tie', createdAt: 2 },
      ]).map((item) => item.id),
    ).toEqual(['new', 'tie', 'old']);
    expect(
      pickerEntries([image, { kind: 'folder', id: image.id, name: '同ID文件夹' }]),
    ).toHaveLength(1);
    expect(
      readAssetPage({
        items: [
          { kind: 'folder', id: 'root', name: '目录' },
          { id: 'text', name: '正文', content: '正文' },
        ],
        total: 2,
        hasMore: false,
      }).items,
    ).toHaveLength(2);
  });
  it('wraps operator collections lazily and forwards folder filters and cancellation', async () => {
    const calls: unknown[] = [];
    const source = collectionAssetPickerSource(
      {
        list: async (filters, options) => {
          calls.push([filters, options]);
          return { items: [], total: 0, hasMore: false };
        },
      },
      {
        list: async (filters, options) => {
          calls.push([filters, options]);
          return {
            items: [
              {
                id: 'f',
                name: '目录',
                parentId: null,
                createdAt: '',
                updatedAt: '',
                deletedAt: null,
              },
            ],
            total: 1,
            hasMore: false,
          };
        },
      },
    );
    expect(calls).toEqual([]);
    const signal = new AbortController().signal;
    expect((await source.listFolders!({ folderId: 'parent' }, { signal })).items[0].kind).toBe(
      'folder',
    );
    expect(calls).toEqual([[{ folderId: 'parent' }, { signal }]]);
    await expect(
      hydrateAssetPickerPage(
        { items: [{ id: 'text', name: '未知正文', type: 'text' }], total: 1, hasMore: false },
        { list: async () => ({ items: [], total: 0, hasMore: false }) },
        { signal },
      ),
    ).rejects.toThrow('正文或详情读取接口');
  });
});
