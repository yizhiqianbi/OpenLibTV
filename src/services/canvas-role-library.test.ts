import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRoleLibrarySource,
  readRoleLibraryTab,
  writeRoleLibraryTab,
  type PublicRolePage,
  type RoleAssetRecord,
} from './canvas-role-library.ts';

const request = { page: 1, pageSize: 10 as const, orderBy: 'updated_at_desc' as const };
const role = { characterUuid: 'real-id', name: '测试角色', coverUrl: '/cover.png' };
const asset: RoleAssetRecord = {
  uuid: 'uuid',
  assetId: 'asset-id',
  assetType: 'image',
  assetUrl: '/asset.png',
  status: 1,
  complianceCheckedAtMs: 123,
};
const options = () => ({ signal: new AbortController().signal });
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('role library service boundary', () => {
  it('reports unavailable reads and writers without calling HTTP or manufacturing empty lists', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const source = createRoleLibrarySource();
    expect(source.mode).toBe('unavailable');
    expect(Object.values(source.capabilities).every((value) => value === false)).toBe(true);
    await expect(source.listCharacters(request, options())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(source.listAssets(options())).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(source.certifyImages([{ url: '/image.png' }], options())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(source.createAsset('/image.png', 'image', options())).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('delegates the evidenced list request and preserves records without injecting content', async () => {
    const listCharacters = vi.fn(async () => ({ list: [role], total: 37 }));
    const getCharacterDetail = vi.fn(async () => role);
    const source = createRoleLibrarySource({ listCharacters, getCharacterDetail });
    const owned = options();
    const page = await source.listCharacters(request, owned);
    expect(listCharacters).toHaveBeenCalledWith(request, owned);
    expect(page).toEqual({ list: [role], total: 37 });
    expect(source.capabilities.publicCharacters).toBe(true);
    expect(source.capabilities.certify).toBe(false);
  });
  it('rejects invalid page size before calling the service', async () => {
    const listCharacters = vi.fn(async () => ({ list: [], total: 0 }));
    await expect(
      createRoleLibrarySource({ listCharacters }).listCharacters(
        { ...request, pageSize: 3 as 10 },
        options(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(listCharacters).not.toHaveBeenCalled();
  });
  it('preserves a real service failure instead of turning it into a successful empty catalogue', async () => {
    const error = new Error('用户未授权');
    const source = createRoleLibrarySource({ listCharacters: vi.fn().mockRejectedValue(error) });
    await expect(source.listCharacters(request, options())).rejects.toBe(error);
  });
  it('rejects malformed lists and a detail from another character', async () => {
    const source = createRoleLibrarySource({
      listCharacters: async () => ({ list: [{}], total: 1 }) as PublicRolePage,
      getCharacterDetail: async () => ({ ...role, characterUuid: 'wrong' }),
    });
    await expect(source.listCharacters(request, options())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(source.getCharacterDetail(role.characterUuid, options())).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
  it('allows source details with empty material URLs for the pure flatten rule to skip', async () => {
    const detail = {
      ...role,
      mediaBlocks: [
        { blockName: '状态', items: [{ url: '' }, { url: null }, { url: '/valid.png' }] },
      ],
    };
    const source = createRoleLibrarySource({ getCharacterDetail: async () => detail });
    await expect(source.getCharacterDetail(role.characterUuid, options())).resolves.toEqual(detail);
  });
  it('does not invoke an adapter after an already aborted read', async () => {
    const listCharacters = vi.fn(async () => ({ list: [role], total: 1 }));
    const controller = new AbortController();
    controller.abort();
    await expect(
      createRoleLibrarySource({ listCharacters }).listCharacters(request, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(listCharacters).not.toHaveBeenCalled();
  });
  it('cancels an ignoring adapter immediately and ignores its late result', async () => {
    let resolve!: (page: PublicRolePage) => void;
    const pending = new Promise<PublicRolePage>((done) => {
      resolve = done;
    });
    const source = createRoleLibrarySource({ listCharacters: async () => pending });
    const controller = new AbortController();
    const result = source.listCharacters(request, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    resolve({ list: [role], total: 1 });
    await pending;
  });
  it('requires explicit certification results and never stamps a current certificate time', async () => {
    const certifyImages = vi.fn(async () => ({
      images: ['asset://asset-id'],
      assets: [asset],
      partial: true,
    }));
    const source = createRoleLibrarySource({ certifyImages });
    const materials = [{ url: '/asset.png', force: true }];
    const own = options();
    expect(await source.certifyImages(materials, own)).toEqual({
      images: ['asset://asset-id'],
      assets: [asset],
      partial: true,
    });
    expect(certifyImages).toHaveBeenCalledWith(materials, own);
    expect(asset.complianceCheckedAtMs).toBe(123);
  });
  it('keeps upload/create/delete as separate optional operator capabilities', async () => {
    const uploadAsset = vi.fn(async () => asset),
      createAsset = vi.fn(async () => asset),
      removeAsset = vi.fn(async () => {});
    const source = createRoleLibrarySource({ uploadAsset, createAsset, removeAsset });
    const file = new File(['image'], 'role.png', { type: 'image/png' }),
      own = options();
    await expect(source.uploadAsset(file, 'image', own)).resolves.toEqual(asset);
    await expect(source.createAsset('/asset.png', 'image', own)).resolves.toEqual(asset);
    await source.removeAsset('uuid', own);
    expect(uploadAsset).toHaveBeenCalledWith(file, 'image', own);
    expect(createAsset).toHaveBeenCalledWith('/asset.png', 'image', own);
    expect(removeAsset).toHaveBeenCalledWith('uuid', own);
  });
  it('rejects a writer returning another media kind', async () => {
    const source = createRoleLibrarySource({
      uploadAsset: async () => ({ ...asset, assetType: 'video' }),
    });
    await expect(
      source.uploadAsset(new File(['i'], 'i.png'), 'image', options()),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('uses the raw source preference key only while the Seedance tab is available', () => {
    const key = 'libtv:role-library:active-tab-v1';
    expect(readRoleLibraryTab(false)).toBe('public');
    expect(readRoleLibraryTab(true)).toBe('seedance');
    writeRoleLibraryTab('public', true);
    expect(localStorage.getItem(key)).toBe('public');
    expect(readRoleLibraryTab(true)).toBe('public');
    writeRoleLibraryTab('seedance', false);
    expect(localStorage.getItem(key)).toBe('public');
  });
});
