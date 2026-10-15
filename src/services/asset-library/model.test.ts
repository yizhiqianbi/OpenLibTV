import { describe, expect, it } from 'vitest';
import {
  createLibraryFolder,
  deleteLibraryEntries,
  emptyAssetLibrary,
  folderPath,
  libraryEntries,
  MAX_UPLOAD_BYTES,
  moveLibraryEntries,
  normalizeAssetLibrary,
  selectedLibraryEntries,
  setLibraryFolderCover,
  tagLibraryAssets,
  validateAssetUpload,
  validateLibrarySelection,
} from './model.ts';

function fixture() {
  let state = createLibraryFolder(emptyAssetLibrary, '角色', null, 'a', 1);
  state = createLibraryFolder(state, '人物', 'a', 'b', 2);
  state = createLibraryFolder(state, '主角', 'b', 'c', 3);
  state = createLibraryFolder(state, '场景', null, 'other', 4);
  state.assets = ['first', 'second', 'outside'].map((id, index) => ({
    id,
    name: id,
    type: 'image',
    mimeType: 'image/png',
    url: 'data:image/png;base64,AA==',
    folderId: ['b', 'c', 'other'][index],
    tags: [],
    assetType: null,
    createdAt: index,
    updatedAt: index,
  }));
  return state;
}
describe('asset library operations', () => {
  it('migrates the old MIME records without changing resource IDs or sources', () => {
    const url = 'data:audio/mpeg;base64,AA==';
    expect(
      normalizeAssetLibrary([{ id: 'old', name: '原素材.mp3', type: 'audio/mpeg', url }]).assets[0],
    ).toMatchObject({
      id: 'old',
      url,
      type: 'audio',
      mimeType: 'audio/mpeg',
      folderId: null,
      tags: [],
    });
  });
  it('rejects malformed and cyclic saved libraries', () => {
    expect(() => normalizeAssetLibrary({ assets: 'broken' })).toThrow();
    const state = fixture();
    state.folders[0].parentId = 'c';
    expect(() => normalizeAssetLibrary(state)).toThrow('循环');
  });
  it('requires trimmed folder names and permits exactly three levels', () => {
    const state = fixture();
    expect(folderPath(state, 'c').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(() => createLibraryFolder(state, '第四级', 'c', 'd')).toThrow();
    expect(() => createLibraryFolder(state, '   ', null, 'd')).toThrow('不能为空');
    expect(() => createLibraryFolder(state, '字'.repeat(21), null, 'd')).toThrow('20');
    expect(state.folders).toHaveLength(4);
  });
  it('rejects moving a folder into descendants or making its subtree too deep', () => {
    const state = fixture();
    expect(() => moveLibraryEntries(state, ['folder:a'], 'b')).toThrow('自身');
    expect(() => moveLibraryEntries(state, ['folder:a'], 'other')).toThrow('三级');
    expect(
      moveLibraryEntries(state, ['folder:b'], 'other').folders.find((item) => item.id === 'b')
        ?.parentId,
    ).toBe('other');
    expect(state.folders.find((item) => item.id === 'b')?.parentId).toBe('a');
  });
  it('moves overlapping folder and asset selections without flattening descendants', () => {
    const result = moveLibraryEntries(
      fixture(),
      ['folder:b', 'folder:c', 'asset:second', 'asset:outside'],
      null,
      10,
    );
    expect(result.folders.find((item) => item.id === 'b')?.parentId).toBeNull();
    expect(result.folders.find((item) => item.id === 'c')?.parentId).toBe('b');
    expect(result.assets.find((item) => item.id === 'second')?.folderId).toBe('c');
    expect(result.assets.find((item) => item.id === 'outside')?.folderId).toBeNull();
  });
  it('deduplicates descendants and deletes only the selected subtree', () => {
    const state = fixture();
    expect(
      selectedLibraryEntries(state, ['folder:a', 'folder:c', 'asset:second']).assets.map(
        (item) => item.id,
      ),
    ).toEqual(['first', 'second']);
    const result = deleteLibraryEntries(state, ['folder:a', 'asset:second']);
    expect(result.folders.map((item) => item.id)).toEqual(['other']);
    expect(result.assets.map((item) => item.id)).toEqual(['outside']);
  });
  it('keeps folder management usable above the batch selection limit', () => {
    const state = fixture();
    const template = state.assets[0];
    state.assets = Array.from({ length: 301 }, (_, index) => ({ ...template, id: String(index) }));
    expect(() => validateLibrarySelection(state, ['folder:a'])).toThrow('300');
    expect(deleteLibraryEntries(state, ['folder:a']).assets).toHaveLength(0);
  });
  it('also removes old soft-deleted records inside a deleted folder', () => {
    const state = fixture();
    state.assets[0].deletedAt = 20;
    const saved = deleteLibraryEntries(state, ['folder:a']);
    expect(() => normalizeAssetLibrary(saved)).not.toThrow();
    expect(saved.assets.map((item) => item.id)).toEqual(['outside']);
  });
  it('searches across folders and takes priority over tags', () => {
    const state = tagLibraryAssets(fixture(), ['asset:first'], ['角色', '特别'], 10);
    expect(
      libraryEntries(state, { folder: 'other', tags: ['角色'] }).map((entry) => entry.value.id),
    ).toEqual(['first']);
    expect(
      libraryEntries(state, { folder: 'b', tags: ['角色'], query: 'OUTSIDE' }).map(
        (entry) => entry.value.id,
      ),
    ).toEqual(['outside']);
    expect(state.tags).toEqual(['特别']);
    expect(state.assets[0].assetType).toBe(1);
  });
  it('accepts the source MIME/extension alternatives at the 20 MB boundary', () => {
    expect(validateAssetUpload({ name: 'uppercase.PNG', type: '', size: MAX_UPLOAD_BYTES })).toBe(
      'image',
    );
    expect(validateAssetUpload({ name: 'extensionless', type: 'video/mp4', size: 1 })).toBe(
      'video',
    );
    expect(() =>
      validateAssetUpload({ name: 'x.png', type: 'image/png', size: MAX_UPLOAD_BYTES + 1 }),
    ).toThrow('20 MB');
    expect(() => validateAssetUpload({ name: 'x.glb', type: '', size: 1 })).toThrow('不支持');
  });
  it('sets and clears a folder cover only from image assets in its subtree', () => {
    const state = fixture();
    state.assets.push(
      {
        ...state.assets[0],
        id: 'cover',
        name: '封面',
        folderId: 'c',
        url: 'data:image/png;base64,COVER',
        mimeType: 'image/png',
      },
      {
        ...state.assets[0],
        id: 'audio',
        name: '音频',
        folderId: 'c',
        type: 'audio',
        mimeType: 'audio/mpeg',
      },
    );
    const covered = setLibraryFolderCover(state, 'a', 'cover', 10);
    expect(covered.folders.find((item) => item.id === 'a')).toMatchObject({
      coverUrl: 'data:image/png;base64,COVER',
      updatedAt: 10,
    });
    expect(() => setLibraryFolderCover(state, 'a', 'audio')).toThrow('图片');
    expect(() => setLibraryFolderCover(state, 'a', 'outside')).toThrow('当前文件夹');
    const cleared = setLibraryFolderCover(covered, 'a', null, 11);
    expect(cleared.folders.find((item) => item.id === 'a')).not.toHaveProperty('coverUrl');
  });
});
