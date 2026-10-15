export const ASSET_LIBRARY_KEY = 'libtv-asset-library';
export const MAX_FOLDER_DEPTH = 3;
export const MAX_ASSET_SELECTION = 300;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ASSET_UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.mp4,.mp3';
export const DEFAULT_ASSET_TAGS = [
  { name: '角色', assetType: 1 },
  { name: '场景', assetType: 2 },
  { name: '物品', assetType: 3 },
  { name: '风格', assetType: 4 },
  { name: '音效', assetType: 5 },
  { name: '其它', assetType: 0 },
] as const;

export interface LibraryAsset {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'model';
  mimeType: string;
  url: string;
  folderId: string | null;
  tags: string[];
  assetType: number | null;
  bytes?: number;
  thumbnailUrl?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}
export interface LibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
}
export interface AssetLibrary {
  assets: LibraryAsset[];
  folders: LibraryFolder[];
  tags: string[];
}
export type LibraryEntry =
  { kind: 'asset'; value: LibraryAsset } | { kind: 'folder'; value: LibraryFolder };
export const emptyAssetLibrary: AssetLibrary = { assets: [], folders: [], tags: [] };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ]
    : [];
const folderId = (value: unknown): string | null =>
  value === null || value === undefined || value === 0 || value === '0' || value === ''
    ? null
    : String(value);

/** Read the legacy media array without rewriting or removing the user's old key. */
export function normalizeAssetLibrary(value: unknown): AssetLibrary {
  const source = Array.isArray(value) ? { assets: value } : record(value);
  if (!source) throw new Error('资产库数据格式错误');
  const rawAssets = source.assets;
  if (!Array.isArray(rawAssets)) throw new Error('资产列表数据格式错误');
  const assets = rawAssets.map((item): LibraryAsset => {
    const row = record(item);
    if (!row || typeof row.name !== 'string' || typeof row.url !== 'string' || !row.id)
      throw new Error('资产记录不完整');
    const mime =
      typeof row.mimeType === 'string'
        ? row.mimeType
        : typeof row.type === 'string' && row.type.includes('/')
          ? row.type
          : '';
    const type = ['image', 'video', 'audio', 'document', 'model'].includes(String(row.type))
      ? (row.type as LibraryAsset['type'])
      : mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('video/')
          ? 'video'
          : mime.startsWith('audio/')
            ? 'audio'
            : 'document';
    return {
      ...row,
      id: String(row.id),
      name: row.name,
      type,
      mimeType: mime,
      url: row.url,
      folderId: folderId(row.folderId),
      tags: strings(row.tags),
      assetType: typeof row.assetType === 'number' ? row.assetType : null,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
      updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    };
  });
  const folders = (Array.isArray(source.folders) ? source.folders : []).map(
    (item): LibraryFolder => {
      const row = record(item);
      if (!row || !row.id || typeof row.name !== 'string') throw new Error('文件夹数据格式错误');
      return {
        ...row,
        id: String(row.id),
        name: row.name,
        parentId: folderId(row.parentId),
        createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0,
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
      };
    },
  );
  const library = { assets, folders, tags: strings(source.tags) };
  if (
    new Set(assets.map((item) => item.id)).size !== assets.length ||
    new Set(folders.map((item) => item.id)).size !== folders.length
  )
    throw new Error('资产库包含重复记录');
  for (const folder of folders)
    if (folderPath(library, folder.id).length > MAX_FOLDER_DEPTH)
      throw new Error('资产库文件夹层级超出限制');
  for (const item of assets) if (item.folderId) folderPath(library, item.folderId);
  return library;
}

export function folderPath(library: AssetLibrary, id: string | null): LibraryFolder[] {
  const path: LibraryFolder[] = [];
  const visited = new Set<string>();
  while (id) {
    if (visited.has(id)) throw new Error('文件夹包含循环引用');
    visited.add(id);
    const folder = library.folders.find((item) => item.id === id);
    if (!folder) throw new Error('文件夹已不存在');
    path.unshift(folder);
    id = folder.parentId;
  }
  return path;
}
export function descendantFolderIds(library: AssetLibrary, id: string): Set<string> {
  const ids = new Set([id]);
  for (const current of ids)
    library.folders.filter((item) => item.parentId === current).forEach((item) => ids.add(item.id));
  return ids;
}
export function entryKey(entry: LibraryEntry): string {
  return `${entry.kind}:${entry.value.id}`;
}
export function libraryEntries(
  library: AssetLibrary,
  {
    folder = null,
    query = '',
    tags = [],
  }: { folder?: string | null; query?: string; tags?: string[] } = {},
): LibraryEntry[] {
  const keyword = query.trim().toLocaleLowerCase();
  const assets = library.assets
    .filter((item) => {
      if (item.deletedAt) return false;
      if (keyword) return item.name.toLocaleLowerCase().includes(keyword);
      if (tags.length) return tags.some((tag) => assetTags(item).includes(tag));
      return item.folderId === folder;
    })
    .map((value): LibraryEntry => ({ kind: 'asset', value }));
  const folders =
    !keyword && !tags.length
      ? library.folders
          .filter((item) => item.parentId === folder)
          .map((value): LibraryEntry => ({ kind: 'folder', value }))
      : [];
  return [...folders, ...assets].sort((a, b) => b.value.createdAt - a.value.createdAt);
}
export function assetTags(asset: LibraryAsset): string[] {
  const category = DEFAULT_ASSET_TAGS.find((item) => item.assetType === asset.assetType)?.name;
  return [...new Set([...(category ? [category] : []), ...asset.tags])];
}
export function selectedLibraryEntries(
  library: AssetLibrary,
  keys: string[],
): { assets: LibraryAsset[]; folders: LibraryFolder[] } {
  const selected = new Set(keys);
  const folders = library.folders.filter((item) => selected.has(`folder:${item.id}`));
  const descendants = new Set(
    folders.flatMap((item) => [...descendantFolderIds(library, item.id)]),
  );
  const assets = library.assets.filter(
    (item) =>
      !item.deletedAt &&
      (selected.has(`asset:${item.id}`) || (item.folderId && descendants.has(item.folderId))),
  );
  return { assets, folders };
}
export function validateLibrarySelection(library: AssetLibrary, keys: string[]) {
  const selection = selectedLibraryEntries(library, keys);
  if (selection.assets.length > MAX_ASSET_SELECTION)
    throw new Error(`单次最多选择 ${MAX_ASSET_SELECTION} 个资产`);
  return selection;
}
export function validateName(value: string, maximum: number): string {
  const name = value.trim();
  if (!name) throw new Error('名称不能为空');
  if (name.length > maximum) throw new Error(`名称最多 ${maximum} 个字符`);
  return name;
}
export function createLibraryFolder(
  library: AssetLibrary,
  name: string,
  parentId: string | null,
  id: string,
  now = Date.now(),
): AssetLibrary {
  if (folderPath(library, parentId).length >= MAX_FOLDER_DEPTH)
    throw new Error('二级文件夹下不可新建文件夹');
  return {
    ...library,
    folders: [
      ...library.folders,
      { id, name: validateName(name, 20), parentId, createdAt: now, updatedAt: now },
    ],
  };
}
export function renameLibraryEntry(
  library: AssetLibrary,
  key: string,
  name: string,
  now = Date.now(),
): AssetLibrary {
  const isFolder = key.startsWith('folder:');
  const id = key.slice(key.indexOf(':') + 1);
  const label = validateName(name, isFolder ? 20 : 50);
  const items = isFolder ? library.folders : library.assets;
  if (!items.some((item) => item.id === id)) throw new Error('资产已不存在');
  return {
    ...library,
    [isFolder ? 'folders' : 'assets']: items.map((item) =>
      item.id === id ? { ...item, name: label, updatedAt: now } : item,
    ),
  };
}

/**
 * Set or clear a folder's local cover from an image owned by that folder's
 * subtree. Covers are derived from an existing asset so the library never
 * stores a dangling arbitrary URL through this UI.
 */
export function setLibraryFolderCover(
  library: AssetLibrary,
  folderId: string,
  assetId: string | null,
  now = Date.now(),
): AssetLibrary {
  const folder = library.folders.find((item) => item.id === folderId);
  if (!folder) throw new Error('文件夹已不存在');
  let coverUrl: string | undefined;
  if (assetId !== null) {
    const asset = library.assets.find((item) => item.id === assetId);
    if (!asset || asset.deletedAt) throw new Error('封面资产已不存在');
    if (asset.type !== 'image' || !asset.mimeType.startsWith('image/'))
      throw new Error('文件夹封面必须使用图片资产');
    const descendants = descendantFolderIds(library, folderId);
    if (!asset.folderId || !descendants.has(asset.folderId))
      throw new Error('封面资产必须位于当前文件夹内');
    coverUrl = asset.url;
  }
  return {
    ...library,
    folders: library.folders.map((item) => {
      if (item.id !== folderId) return item;
      const next = { ...item, updatedAt: now };
      if (assetId === null) {
        delete next.coverUrl;
        return next;
      }
      next.coverUrl = coverUrl;
      return next;
    }),
  };
}
export function moveLibraryEntries(
  library: AssetLibrary,
  keys: string[],
  target: string | null,
  now = Date.now(),
): AssetLibrary {
  const { assets, folders } = selectedLibraryEntries(library, keys);
  const targetDepth = folderPath(library, target).length;
  const folderIds = new Set(folders.map((item) => item.id));
  const roots = folders.filter(
    (item) => !folderPath(library, item.parentId).some((parent) => folderIds.has(parent.id)),
  );
  const movingDescendants = new Set<string>();
  for (const root of roots) {
    const descendants = descendantFolderIds(library, root.id);
    if (target && descendants.has(target)) throw new Error('不能移动到自身或子文件夹');
    const baseDepth = folderPath(library, root.id).length - 1;
    const subtreeDepth = Math.max(
      ...[...descendants].map((id) => folderPath(library, id).length - baseDepth),
    );
    if (targetDepth + subtreeDepth > MAX_FOLDER_DEPTH) throw new Error('移动后文件夹最多为三级');
    descendants.forEach((id) => movingDescendants.add(id));
  }
  const rootIds = new Set(roots.map((item) => item.id));
  const assetIds = new Set(
    assets
      .filter((item) => !item.folderId || !movingDescendants.has(item.folderId))
      .map((item) => item.id),
  );
  return {
    ...library,
    folders: library.folders.map((item) =>
      rootIds.has(item.id) ? { ...item, parentId: target, updatedAt: now } : item,
    ),
    assets: library.assets.map((item) =>
      assetIds.has(item.id) ? { ...item, folderId: target, updatedAt: now } : item,
    ),
  };
}
export function deleteLibraryEntries(library: AssetLibrary, keys: string[]): AssetLibrary {
  const selected = selectedLibraryEntries(library, keys);
  const folderIds = new Set(
    selected.folders.flatMap((folder) => [...descendantFolderIds(library, folder.id)]),
  );
  const assetIds = new Set(selected.assets.map((item) => item.id));
  return {
    ...library,
    folders: library.folders.filter((item) => !folderIds.has(item.id)),
    assets: library.assets.filter(
      (item) => !assetIds.has(item.id) && (!item.folderId || !folderIds.has(item.folderId)),
    ),
  };
}
export function tagLibraryAssets(
  library: AssetLibrary,
  keys: string[],
  tags: string[],
  now = Date.now(),
): AssetLibrary {
  const selected = selectedLibraryEntries(library, keys);
  const ids = new Set(selected.assets.map((item) => item.id));
  const normalized = strings(tags);
  const category = DEFAULT_ASSET_TAGS.find((item) => normalized.includes(item.name));
  return {
    ...library,
    assets: library.assets.map((item) =>
      ids.has(item.id)
        ? { ...item, tags: normalized, assetType: category?.assetType ?? null, updatedAt: now }
        : item,
    ),
    tags: [
      ...new Set([
        ...library.tags,
        ...normalized.filter((name) => !DEFAULT_ASSET_TAGS.some((item) => item.name === name)),
      ]),
    ],
  };
}
export function validateAssetUpload(
  file: Pick<File, 'name' | 'type' | 'size'>,
): LibraryAsset['type'] {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name}：单个文件大小不能超过 20 MB`);
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimes = ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg', 'audio/mp3'];
  if (!['jpg', 'jpeg', 'png', 'mp4', 'mp3'].includes(extension || '') && !mimes.includes(file.type))
    throw new Error(`${file.name}：不支持的文件类型`);
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(extension || ''))
    return 'image';
  return file.type.startsWith('video/') || extension === 'mp4' ? 'video' : 'audio';
}
