import type { Page } from '../contracts.ts';
import { skillAttachmentType } from '../agent-handoff.js';
import { agentAssetReferences, agentAssetText, parseAgentAssetNodes } from '../agent-assets.ts';
import type { AssetPickerContext, AssetPickerFilters, PickerRecord } from './source.ts';

export type AssetMediaType = 'image' | 'video' | 'audio' | 'text';
export type AssetPickerType = 'all' | AssetMediaType;
export const ASSET_PICKER_PAGE_SIZE = 20;
export const ASSET_SEARCH_DELAY = 300;
export const ASSET_PICKER_TYPES = [
  { label: '全部', value: 'all' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '音频', value: 'audio' },
  { label: '文本', value: 'text' },
] as const;

export interface PickerAsset {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  thumbnailUrl?: string;
  mediaType: AssetMediaType;
  /** Optional source v2 node collection supplied by an operator adapter. */
  assetData?: string;
  content?: string;
  folderId: string | null;
  tags: string[];
  assetType?: number | null;
  ownerId?: string;
  createdAt: string | number;
}
export interface PickerFolder {
  kind: 'folder';
  id: string;
  name: string;
  parentId: string | null;
  coverUrl?: string;
  createdAt: string | number;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accept legacy MIME types, excluding unavailable and temporary media references. */
export function normalizePickerAsset(value: unknown): PickerAsset | null {
  const row = record(value);
  if (
    !row ||
    typeof row.id !== 'string' ||
    !row.id ||
    typeof row.name !== 'string' ||
    row.kind === 'folder' ||
    row.deletedAt
  )
    return null;
  const mimeType =
    typeof row.mimeType === 'string' ? row.mimeType : typeof row.type === 'string' ? row.type : '';
  let assetData = typeof row.assetData === 'string' ? row.assetData : undefined;
  const nodes = assetData ? parseAgentAssetNodes(assetData) : [];
  const text = assetData ? agentAssetText(assetData) : stringContent(row.content);
  const firstMedia = nodes.find(
    ({ data }) =>
      ['image', 'video', 'audio'].includes(String(data.type)) &&
      Array.isArray(data.url) &&
      data.url.some((url) => typeof url === 'string' && url && !url.startsWith('blob:')),
  );
  const mediaType =
    firstMedia?.data.type ??
    (['image', 'video', 'audio'].includes(String(row.type))
      ? row.type
      : text
        ? 'text'
        : skillAttachmentType({ name: row.name, type: mimeType }));
  if (!['image', 'video', 'audio', 'text'].includes(String(mediaType))) return null;
  // Rich v2 text/media need no fictitious URL. Binary documents are not plain text.
  const urls = firstMedia?.data.url;
  const nodeUrl = Array.isArray(urls)
    ? urls.find((url) => typeof url === 'string' && url && !url.startsWith('blob:'))
    : undefined;
  const url =
    typeof row.url === 'string' && row.url && !row.url.startsWith('blob:') ? row.url : nodeUrl;
  if (mediaType !== 'text' && !url) return null;
  if (mediaType === 'text' && !text) return null;
  if (mediaType === 'text' && !assetData)
    assetData = JSON.stringify({
      version: 2,
      items: [{ data: { type: 'text', name: row.name, content: [text] } }],
    });
  return {
    id: row.id,
    name: row.name,
    url: typeof url === 'string' ? url : '',
    mimeType,
    ...(typeof row.thumbnailUrl === 'string'
      ? { thumbnailUrl: row.thumbnailUrl }
      : typeof row.coverUrl === 'string'
        ? { thumbnailUrl: row.coverUrl }
        : {}),
    mediaType: mediaType as AssetMediaType,
    ...(assetData ? { assetData } : {}),
    ...(text ? { content: text } : {}),
    folderId: typeof row.folderId === 'string' && row.folderId ? row.folderId : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
    ...(typeof row.assetType === 'number' ? { assetType: row.assetType } : {}),
    ...(typeof row.ownerId === 'string' ? { ownerId: row.ownerId } : {}),
    createdAt:
      typeof row.createdAt === 'number' || typeof row.createdAt === 'string' ? row.createdAt : 0,
  };
}

function stringContent(value: unknown): string {
  return (
    typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.filter((item) => typeof item === 'string').join('\n')
        : ''
  ).trim();
}
export function normalizePickerFolder(value: unknown): PickerFolder | null {
  const row = record(value);
  if (
    !row ||
    !row.id ||
    typeof row.id !== 'string' ||
    typeof row.name !== 'string' ||
    row.deletedAt
  )
    return null;
  return {
    kind: 'folder',
    id: row.id,
    name: row.name,
    parentId: typeof row.parentId === 'string' && row.parentId ? row.parentId : null,
    ...(typeof row.coverUrl === 'string' ? { coverUrl: row.coverUrl } : {}),
    createdAt:
      typeof row.createdAt === 'number' || typeof row.createdAt === 'string' ? row.createdAt : 0,
  };
}
export function pickerFolders(records: readonly unknown[]): PickerFolder[] {
  const entries = new Map<string, PickerFolder>();
  for (const row of records) {
    const item = normalizePickerFolder(row);
    if (item) entries.set(item.id, item);
    else {
      const id = record(row)?.id;
      if (typeof id === 'string') entries.delete(id);
    }
  }
  return [...entries.values()];
}
export function pickerFolderPath(
  folders: readonly PickerFolder[],
  id: string | null,
): PickerFolder[] {
  const path: PickerFolder[] = [],
    visited = new Set<string>();
  while (id) {
    if (visited.has(id)) throw new AssetPageError('文件夹包含循环引用');
    visited.add(id);
    const folder = folders.find((item) => item.id === id);
    if (!folder) throw new AssetPageError('文件夹已不存在');
    path.unshift(folder);
    id = folder.parentId;
  }
  return path;
}
export function sortPickerEntries<T extends { createdAt: string | number }>(
  entries: readonly T[],
): T[] {
  const timestamp = (value: string | number) =>
    typeof value === 'number' ? value : Date.parse(value) || 0;
  return [...entries].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
}

/** Source 943317: global name search wins over tags, which win over the current folder. */
export function assetPickerRequest(
  query: string,
  type: AssetPickerType,
  context?: AssetPickerContext,
): AssetPickerFilters {
  const search = query.trim();
  const tagNames = context?.tagNames?.filter(Boolean) ?? [];
  return {
    limit: ASSET_PICKER_PAGE_SIZE,
    deleted: false,
    ...(search
      ? { query: search }
      : tagNames.length
        ? { tagNames: [...tagNames] }
        : context && { folderId: context.folderId ?? null }),
    ...(type === 'all' ? {} : { type }),
    ...(context?.orderBy ? { orderBy: context.orderBy } : {}),
    ...(context?.scope ? { scope: context.scope } : {}),
    ...(context?.scope === 'team' && context.teamId
      ? {
          teamId: context.teamId,
          ...(context.memberUserIds?.length ? { memberUserIds: [...context.memberUserIds] } : {}),
        }
      : {}),
  };
}

export function pickerEntries(records: readonly unknown[]): PickerAsset[] {
  const entries = new Map<string, PickerAsset>();
  for (const row of records) {
    if (record(row)?.kind === 'folder') continue;
    const item = normalizePickerAsset(row);
    if (item) entries.set(item.id, item);
    else {
      const id = record(row)?.id;
      if (typeof id === 'string') entries.delete(id);
    }
  }
  return [...entries.values()];
}

export function filterPickerEntries(
  entries: readonly PickerAsset[],
  query: string,
  type: AssetPickerType,
  context?: AssetPickerContext,
  tagOptions: readonly { name: string; assetType?: number | null }[] = [],
): PickerAsset[] {
  const search = query.trim().toLowerCase();
  return entries.filter(
    (item) =>
      item.name.toLowerCase().includes(search) &&
      (type === 'all' || item.mediaType === type) &&
      (search || !context
        ? true
        : context.tagNames?.length
          ? context.tagNames.some(
              (tag) =>
                item.tags.includes(tag) ||
                tagOptions.some(
                  (option) =>
                    option.name === tag &&
                    typeof option.assetType === 'number' &&
                    option.assetType === item.assetType,
                ),
            )
          : item.folderId === (context.folderId ?? null)) &&
      (context?.scope !== 'team' ||
        !context.memberUserIds?.length ||
        Boolean(item.ownerId && context.memberUserIds.includes(item.ownerId))),
  );
}

/** Records absent on another remote filter stay selected; observed deletions do not. */
export function reconcileSelectedAssets(
  selected: readonly PickerAsset[],
  records: readonly unknown[],
  pruneMissing: boolean,
): PickerAsset[] {
  const observed = new Map<string, unknown>();
  for (const row of records) {
    const item = record(row);
    if (item?.kind === 'folder') continue;
    if (typeof item?.id === 'string') observed.set(item.id, row);
  }
  return selected.flatMap((item) => {
    if (observed.has(item.id)) {
      const updated = normalizePickerAsset(observed.get(item.id));
      return updated ? [updated] : [];
    }
    return pruneMissing ? [] : [item];
  });
}

export interface AssetCursorState {
  records: PickerRecord[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  consumedCursors: string[];
}
export function emptyAssetCursorState(): AssetCursorState {
  return { records: [], total: 0, hasMore: false, nextCursor: null, consumedCursors: [] };
}
export class AssetPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetPageError';
  }
}

/** Only documented operator Page fields control pagination; never infer cursors from IDs. */
export function readAssetPage(value: unknown): Page<PickerRecord> {
  const page = record(value);
  if (
    !page ||
    !Array.isArray(page.items) ||
    typeof page.total !== 'number' ||
    !Number.isFinite(page.total) ||
    page.total < 0 ||
    typeof page.hasMore !== 'boolean'
  )
    throw new AssetPageError('资产分页数据格式错误');
  for (const value of page.items) {
    const item = record(value);
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.name !== 'string' ||
      (item.kind !== 'folder' &&
        item.type !== 'text' &&
        typeof item.url !== 'string' &&
        typeof item.assetData !== 'string' &&
        typeof item.content !== 'string' &&
        !Array.isArray(item.content))
    )
      throw new AssetPageError('资产记录不完整');
  }
  if (
    page.nextCursor !== undefined &&
    page.nextCursor !== null &&
    typeof page.nextCursor !== 'string'
  )
    throw new AssetPageError('资产分页游标格式错误');
  return page as unknown as Page<PickerRecord>;
}

export function mergeAssetRecords(
  current: readonly PickerRecord[],
  incoming: readonly PickerRecord[],
): PickerRecord[] {
  const key = (item: PickerRecord) => `${item.kind === 'folder' ? 'folder' : 'asset'}:${item.id}`;
  const records = new Map(current.map((item) => [key(item), item]));
  for (const item of incoming) records.set(key(item), item);
  return [...records.values()];
}

/** Broken responses cannot continuously append duplicate pages or cycle the same cursor. */
export function advanceAssetPage(
  current: AssetCursorState,
  page: Page<PickerRecord>,
  cursor?: string,
): AssetCursorState {
  const consumedCursors = cursor ? [...current.consumedCursors, cursor] : current.consumedCursors;
  const nextCursor = page.hasMore ? page.nextCursor : null;
  if (page.hasMore) {
    if (!nextCursor?.trim()) throw new AssetPageError('资产分页缺少下一页游标');
    if (consumedCursors.includes(nextCursor))
      throw new AssetPageError('资产分页游标重复，加载已停止');
    const key = (item: PickerRecord) => `${item.kind === 'folder' ? 'folder' : 'asset'}:${item.id}`;
    const knownIds = new Set(current.records.map(key));
    if (!page.items.some((item) => !knownIds.has(key(item))))
      throw new AssetPageError('资产分页没有新增记录，加载已停止');
  }
  return {
    records: mergeAssetRecords(current.records, page.items),
    total: page.total,
    hasMore: page.hasMore,
    nextCursor: nextCursor || null,
    consumedCursors,
  };
}

export function assetReference(item: PickerAsset) {
  if (item.mediaType === 'text') throw new AssetPageError('文本资产需要通过纯文本入口添加');
  return {
    id: crypto.randomUUID(),
    name: item.name,
    type: item.mediaType,
    status: 'ready',
    source: {
      type: item.url.startsWith('data:') ? 'data' : 'url',
      value: item.url,
      mimeType: item.mimeType,
    },
    metadata: { mediaAssetUuid: item.id },
  };
}

export function pickerAssetReferences(items: readonly PickerAsset[]) {
  return items.flatMap((item) =>
    item.assetData
      ? agentAssetReferences(item.assetData, { assetName: item.name, assetUuid: item.id })
      : item.mediaType === 'text'
        ? []
        : [assetReference(item)],
  );
}
export function pickerAssetText(items: readonly PickerAsset[]): string {
  return items
    .map((item) => (item.assetData ? agentAssetText(item.assetData) : item.content || ''))
    .filter(Boolean)
    .join('\n\n');
}
