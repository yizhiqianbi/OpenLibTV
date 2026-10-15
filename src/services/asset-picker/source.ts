import type {
  Collection,
  AssetRecord,
  Folder,
  ListFilters,
  Page,
  RequestOptions,
} from '../contracts.ts';

export type AssetPickerScope = 'personal' | 'team';
export interface PickerRecord {
  id: string;
  name: string;
  type?: string;
  kind?: 'asset' | 'folder';
  url?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  coverUrl?: string;
  folderId?: string | null;
  parentId?: string | null;
  assetData?: string;
  /** Standalone text is an explicit operator record, never an inferred binary document. */
  content?: string | string[];
  tags?: string[];
  assetType?: number | null;
  ownerId?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  deletedAt?: string | number | null;
}
export interface AssetPickerFilters extends ListFilters {
  scope?: AssetPickerScope;
  teamId?: string;
  tagNames?: string[];
  memberUserIds?: string[];
  orderBy?: 'created_at_desc';
}
export interface AssetPickerContext {
  scope?: AssetPickerScope;
  teamId?: string;
  folderId?: string | null;
  tagNames?: readonly string[];
  memberUserIds?: readonly string[];
  orderBy?: 'created_at_desc';
}
export interface AssetPickerSource {
  list(
    filters?: AssetPickerFilters,
    options?: Pick<RequestOptions, 'signal'>,
  ): Promise<Page<PickerRecord>>;
  /** Optional detail read for standalone text/metadata records without their actual content. */
  get?(id: string, options?: Pick<RequestOptions, 'signal'>): Promise<PickerRecord>;
  /** Optional separate folder feed. list may alternatively include kind:folder entries. */
  listFolders?(
    filters?: AssetPickerFilters,
    options?: Pick<RequestOptions, 'signal'>,
  ): Promise<Page<PickerRecord>>;
  tags?: readonly { name: string; assetType?: number | null }[];
  /** Only supplied by an authorized operator adapter; absence is not an empty team roster. */
  members?: readonly { id: string; name: string }[];
}

/** Keep the existing collection endpoints; this adapter performs no requests at construction. */
export function collectionAssetPickerSource(
  assets: Pick<Collection<AssetRecord>, 'list'> & Partial<Pick<Collection<AssetRecord>, 'get'>>,
  folders?: Pick<Collection<Folder>, 'list'>,
): AssetPickerSource {
  return {
    list: (filters, options) => assets.list(filters, options),
    ...(assets.get ? { get: (id: string) => assets.get!(id) } : {}),
    ...(folders
      ? {
          listFolders: async (
            filters: AssetPickerFilters | undefined,
            options: Pick<RequestOptions, 'signal'> | undefined,
          ) => {
            const page = await folders.list(filters, options);
            return {
              ...page,
              items: page.items.map((item) => ({ ...item, kind: 'folder' as const })),
            };
          },
        }
      : {}),
  };
}

/** Only an injected adapter may load missing text; binary URLs are never fetched as text. */
export async function hydrateAssetPickerPage(
  page: Page<PickerRecord>,
  source: AssetPickerSource,
  options: Pick<RequestOptions, 'signal'>,
): Promise<Page<PickerRecord>> {
  const items = await Promise.all(
    page.items.map(async (item) => {
      const missingContent =
        !item.assetData && !item.content && (item.type === 'text' || !item.url);
      if (item.kind === 'folder' || !missingContent) return item;
      if (!source.get) {
        if (item.type === 'text') throw new Error('文本资产缺少正文或详情读取接口');
        return item;
      }
      const detail = await source.get!(item.id, options);
      if (detail?.id !== item.id || typeof detail.name !== 'string')
        throw new Error('资产详情数据格式错误');
      if (detail.type === 'text' && !detail.assetData && !detail.content)
        throw new Error('文本资产详情缺少正文');
      return { ...item, ...detail };
    }),
  );
  return { ...page, items };
}
