import { readStoredString, writeStoredString } from './storage.ts';

export type RoleMediaType = 'image' | 'video' | 'audio';
export interface PublicRoleMaterial {
  url?: string | null;
  thumbUrl?: string;
  label?: string;
  assetId?: string;
  complianceCheckedAtMs?: number;
  createdAtMs?: number;
}
export interface PublicRoleCertificationRequest extends Omit<PublicRoleMaterial, 'url'> {
  url: string;
  force?: boolean;
}
export interface PublicRoleRecord {
  characterUuid: string;
  name: string;
  coverUrl?: string | null;
  subtitle?: string;
  summaryText?: string;
  materialCount?: number;
  mediaCount?: number;
  mediaItemCount?: number;
  imageCount?: number;
  assetCount?: number;
  mediaBlocks?: Array<{ blockName?: string; items?: PublicRoleMaterial[] | null }>;
}
export interface PublicRoleRequest {
  page: number;
  pageSize: 10 | 20 | 50;
  orderBy: 'updated_at_desc';
}
export interface PublicRolePage {
  list: PublicRoleRecord[];
  total: number;
}
export interface RoleAssetRecord {
  uuid: string;
  assetUrl: string;
  assetType: RoleMediaType;
  assetId?: string;
  status: number;
  exempt?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  complianceCheckedAtMs?: number;
  errorMessage?: string;
}
export interface RoleLibrarySelection {
  images: string[];
  videos: string[];
  audios: string[];
  assets?: RoleAssetRecord[];
}
export interface RoleSourceOptions {
  signal: AbortSignal;
}
export interface PublicRoleCertification {
  images: string[];
  assets: RoleAssetRecord[];
  partial?: boolean;
}

/** The operator provides authorized reads/writes. No account or original-site client is installed. */
export interface RoleLibraryAdapter {
  listCharacters?(request: PublicRoleRequest, options: RoleSourceOptions): Promise<PublicRolePage>;
  getCharacterDetail?(uuid: string, options: RoleSourceOptions): Promise<PublicRoleRecord>;
  listAssets?(options: RoleSourceOptions): Promise<RoleAssetRecord[]>;
  createAsset?(
    url: string,
    mediaType: RoleMediaType,
    options: RoleSourceOptions,
  ): Promise<RoleAssetRecord>;
  certifyImages?(
    materials: PublicRoleCertificationRequest[],
    options: RoleSourceOptions,
  ): Promise<PublicRoleCertification>;
  uploadAsset?(
    file: File,
    mediaType: RoleMediaType,
    options: RoleSourceOptions,
  ): Promise<RoleAssetRecord>;
  removeAsset?(uuid: string, options: RoleSourceOptions): Promise<void>;
}
export interface RoleLibrarySource {
  readonly mode: 'unavailable' | 'operator';
  readonly capabilities: Readonly<{
    publicCharacters: boolean;
    assets: boolean;
    certify: boolean;
    upload: boolean;
    create: boolean;
    remove: boolean;
  }>;
  listCharacters(request: PublicRoleRequest, options: RoleSourceOptions): Promise<PublicRolePage>;
  getCharacterDetail(uuid: string, options: RoleSourceOptions): Promise<PublicRoleRecord>;
  listAssets(options: RoleSourceOptions): Promise<RoleAssetRecord[]>;
  createAsset(
    url: string,
    mediaType: RoleMediaType,
    options: RoleSourceOptions,
  ): Promise<RoleAssetRecord>;
  certifyImages(
    materials: PublicRoleCertificationRequest[],
    options: RoleSourceOptions,
  ): Promise<PublicRoleCertification>;
  uploadAsset(
    file: File,
    mediaType: RoleMediaType,
    options: RoleSourceOptions,
  ): Promise<RoleAssetRecord>;
  removeAsset(uuid: string, options: RoleSourceOptions): Promise<void>;
}
export class RoleLibrarySourceError extends Error {
  constructor(
    readonly code: 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'INVALID_REQUEST' | 'CANCELLED',
    message: string,
  ) {
    super(message);
    this.name = code === 'CANCELLED' ? 'AbortError' : 'RoleLibrarySourceError';
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const validCharacter = (value: unknown): value is PublicRoleRecord =>
  record(value) &&
  text(value.characterUuid) &&
  typeof value.name === 'string' &&
  (value.coverUrl == null || typeof value.coverUrl === 'string') &&
  (value.mediaBlocks === undefined ||
    (Array.isArray(value.mediaBlocks) &&
      value.mediaBlocks.every(
        (block) =>
          record(block) &&
          (block.items == null ||
            (Array.isArray(block.items) &&
              block.items.every(
                (item) => record(item) && (item.url == null || typeof item.url === 'string'),
              ))),
      )));
const validAsset = (value: unknown): value is RoleAssetRecord =>
  record(value) &&
  text(value.uuid) &&
  text(value.assetUrl) &&
  ['image', 'video', 'audio'].includes(String(value.assetType)) &&
  typeof value.status === 'number' &&
  Number.isFinite(value.status);
const invalid = () => new RoleLibrarySourceError('INVALID_RESPONSE', '角色素材服务返回了无效数据');
const cancelled = () => new RoleLibrarySourceError('CANCELLED', '角色素材操作已取消');

/** Race cancellation even if an injected service ignores its signal. Late results never publish. */
function readOwned<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (cause: unknown, result?: T) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (cause) reject(cause);
      else resolve(result as T);
    };
    const abort = () => finish(cancelled());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw cancelled();
        return operation();
      })
      .then(
        (value) => finish(null, value),
        (cause) => finish(cause),
      );
  });
}

export function createRoleLibrarySource(adapter: RoleLibraryAdapter = {}): RoleLibrarySource {
  const capabilities = Object.freeze({
    publicCharacters:
      typeof adapter.listCharacters === 'function' &&
      typeof adapter.getCharacterDetail === 'function',
    assets: typeof adapter.listAssets === 'function',
    certify: typeof adapter.certifyImages === 'function',
    upload: typeof adapter.uploadAsset === 'function',
    create: typeof adapter.createAsset === 'function',
    remove: typeof adapter.removeAsset === 'function',
  });
  const unavailable = (message: string): never => {
    throw new RoleLibrarySourceError('UNAVAILABLE', message);
  };
  const source: RoleLibrarySource = {
    mode: Object.values(capabilities).some(Boolean) ? 'operator' : 'unavailable',
    capabilities,
    async listCharacters(request, { signal }) {
      if (
        !Number.isInteger(request.page) ||
        request.page < 1 ||
        ![10, 20, 50].includes(request.pageSize) ||
        request.orderBy !== 'updated_at_desc'
      )
        throw new RoleLibrarySourceError('INVALID_REQUEST', '角色目录分页参数无效');
      const reader = adapter.listCharacters;
      if (!reader) return unavailable('公共角色目录服务未连接');
      const result = await readOwned(
        () => reader.call(adapter, { ...request }, { signal }),
        signal,
      );
      if (
        !record(result) ||
        !Array.isArray(result.list) ||
        !result.list.every(validCharacter) ||
        typeof result.total !== 'number' ||
        !Number.isFinite(result.total) ||
        result.total < 0
      )
        throw invalid();
      return result;
    },
    async getCharacterDetail(uuid, { signal }) {
      const reader = adapter.getCharacterDetail;
      if (!reader) return unavailable('公共角色详情服务未连接');
      const result = await readOwned(() => reader.call(adapter, uuid, { signal }), signal);
      if (!validCharacter(result) || result.characterUuid !== uuid) throw invalid();
      return result;
    },
    async listAssets({ signal }) {
      const reader = adapter.listAssets;
      if (!reader) return unavailable('Seedance合规素材服务未连接');
      const result = await readOwned(() => reader.call(adapter, { signal }), signal);
      if (!Array.isArray(result) || !result.every(validAsset)) throw invalid();
      return result;
    },
    async certifyImages(materials, { signal }) {
      const writer = adapter.certifyImages;
      if (!writer) return unavailable('素材合规校验服务未连接，已保留选择');
      const result = await readOwned(() => writer.call(adapter, materials, { signal }), signal);
      if (
        !record(result) ||
        !Array.isArray(result.images) ||
        !result.images.every(text) ||
        !Array.isArray(result.assets) ||
        !result.assets.every(validAsset)
      )
        throw invalid();
      return result;
    },
    async createAsset(url, mediaType, { signal }) {
      const writer = adapter.createAsset;
      if (!writer) return unavailable('素材保存与合规服务未连接');
      const result = await readOwned(
        () => writer.call(adapter, url, mediaType, { signal }),
        signal,
      );
      if (!validAsset(result) || result.assetType !== mediaType) throw invalid();
      return result;
    },
    async uploadAsset(file, mediaType, { signal }) {
      const writer = adapter.uploadAsset;
      if (!writer) return unavailable('素材上传服务未连接');
      const result = await readOwned(
        () => writer.call(adapter, file, mediaType, { signal }),
        signal,
      );
      if (!validAsset(result) || result.assetType !== mediaType) throw invalid();
      return result;
    },
    async removeAsset(uuid, { signal }) {
      const writer = adapter.removeAsset;
      if (!writer) return unavailable('素材删除服务未连接');
      await readOwned(() => writer.call(adapter, uuid, { signal }), signal);
    },
  };
  return Object.freeze(source);
}
export const unavailableRoleLibrarySource = createRoleLibrarySource();

export type RoleLibraryTab = 'public' | 'seedance';
const activeTabKey = 'libtv:role-library:active-tab-v1';
export function readRoleLibraryTab(seedanceVisible: boolean): RoleLibraryTab {
  if (!seedanceVisible) return 'public';
  const tab = readStoredString(activeTabKey, '');
  return tab === 'public' || tab === 'seedance' ? tab : 'seedance';
}
export function writeRoleLibraryTab(tab: RoleLibraryTab, seedanceVisible: boolean) {
  if (seedanceVisible) writeStoredString(activeTabKey, tab);
}
