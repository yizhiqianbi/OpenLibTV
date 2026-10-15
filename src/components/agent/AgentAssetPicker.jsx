import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ListFilter } from 'lucide-react';
import Modal from '../Modal.jsx';
import { EditorDialog } from '../EditorDialog.jsx';
import Icon from '../Icon.jsx';
import AgentReferencePreview from './AgentReferencePreview.jsx';
import AssetPickerFilters from './AssetPickerFilters.jsx';
import AssetPickerCover from './AssetPickerCover.jsx';
import { asset } from '../../services/assets.ts';
import { useAssetLibrary } from '../../hooks/useAssetLibrary.ts';
import { DEFAULT_ASSET_TAGS } from '../../services/asset-library/model.ts';
import { api, serverConnected } from '../../services/api-client.ts';
import { collectionAssetPickerSource } from '../../services/asset-picker/source.ts';
import {
  ASSET_PICKER_TYPES,
  assetReference,
  filterPickerEntries,
  pickerEntries,
  pickerFolders,
  pickerFolderPath,
  pickerAssetReferences,
  pickerAssetText,
  reconcileSelectedAssets,
  sortPickerEntries,
} from '../../services/asset-picker/model.ts';
import { useAssetPickerPages } from '../../hooks/useAssetPickerPages.ts';
import './agent-asset-picker.css';

const operatorSource = serverConnected
  ? collectionAssetPickerSource(api.assets, api.folders)
  : null;

/**
 * The caller supplies a granted scope. Selection never creates subjects or team permissions.
 * isAssetDisabled returns a boolean or a title string; selected assets bypass this policy.
 * selectionFooter renders inside the existing footer and falls back when its result is empty.
 */
export default function AgentAssetPicker({ scope = 'personal', teamId, ...props }) {
  return (
    <ScopedAssetPicker key={`${scope}:${teamId || ''}`} {...props} scope={scope} teamId={teamId} />
  );
}
function ScopedAssetPicker({
  onClose,
  onPick,
  onPickAssets,
  onPickText,
  isAssetDisabled,
  onSelectDisabledAsset,
  selectionFooter,
  getPreviewAsset,
  assetSource,
  scope,
  teamId,
  title = '从资产库添加',
}) {
  const { value: localLibrary, error: localError } = useAssetLibrary();
  const source = assetSource === undefined ? operatorSource : assetSource;
  const available = scope !== 'team' || Boolean(teamId && source);
  const [query, setQuery] = useState(''),
    [type, setType] = useState('all'),
    [path, setPath] = useState([]);
  const [filters, setFilters] = useState({ tagNames: [], memberUserIds: [] });
  const [selected, setSelected] = useState([]),
    [preview, setPreview] = useState(null),
    [filterOpen, setFilterOpen] = useState(false);
  const [submitError, setSubmitError] = useState(null),
    [submitting, setSubmitting] = useState(false);
  const alive = useRef(true),
    sourceIdentity = useRef(source),
    submission = useRef(null);
  const folderId = path.at(-1)?.id || null;
  const context = useMemo(
    () => ({ scope, teamId, folderId, ...filters, orderBy: 'created_at_desc' }),
    [scope, teamId, folderId, filters],
  );
  const pages = useAssetPickerPages(available ? source : null, query, type, context);
  const folderSource = useMemo(
    () =>
      source?.listFolders
        ? { list: (values, options) => source.listFolders(values, options) }
        : null,
    [source],
  );
  // Global search and tags return assets, never folder matches, in source 943317.
  const folderPages = useAssetPickerPages(
    available && !query.trim() && !filters.tagNames.length ? folderSource : null,
    '',
    'all',
    context,
  );
  const records = useMemo(
    () => (source ? pages.records : available ? localLibrary.assets : []),
    [source, pages.records, available, localLibrary.assets],
  );
  const folderRecords = useMemo(
    () =>
      source
        ? [...pages.records.filter((item) => item.kind === 'folder'), ...folderPages.records]
        : available
          ? localLibrary.folders
          : [],
    [source, pages.records, folderPages.records, available, localLibrary.folders],
  );
  const folders = useMemo(() => pickerFolders(folderRecords), [folderRecords]);
  const tags = useMemo(() => {
    const options = source
      ? source.tags || []
      : [
          ...DEFAULT_ASSET_TAGS,
          ...localLibrary.tags
            .filter((name) => !DEFAULT_ASSET_TAGS.some((tag) => tag.name === name))
            .map((name) => ({ name })),
        ];
    return [...new Map(options.map((tag) => [tag.name, tag])).values()];
  }, [source, localLibrary.tags]);
  const members = scope === 'team' && teamId ? source?.members : undefined;
  const entries = useMemo(() => pickerEntries(records), [records]);
  const shown = useMemo(
    () =>
      sortPickerEntries(
        filterPickerEntries(entries, query, type, source ? undefined : context, tags),
      ),
    [entries, query, type, source, context, tags],
  );
  const shownFolders =
    query.trim() || filters.tagNames.length
      ? []
      : sortPickerEntries(folders.filter((folder) => folder.parentId === (folderId ?? null)));
  const error = useMemo(
    () =>
      !available
        ? new Error(teamId ? '团队资产库服务尚未接入' : '缺少团队信息')
        : source
          ? pages.error || folderPages.error
          : localError,
    [available, teamId, source, pages.error, folderPages.error, localError],
  );
  const loading = Boolean(source && (pages.loading || folderPages.loading)),
    loadingMore = Boolean(source && (pages.loadingMore || folderPages.loadingMore));
  const hasMore = pages.hasMore || folderPages.hasMore;
  const loadAssetPage = pages.loadMore;
  const loadFolderPage = folderPages.loadMore;
  const scrollRef = useRef(null),
    sentinelRef = useRef(null),
    filterRef = useRef(null);
  const currentSelection = useMemo(
    () =>
      sourceIdentity.current !== source
        ? []
        : reconcileSelectedAssets(selected, records, !source && !localError),
    [selected, records, source, localError],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (sourceIdentity.current !== source) {
      sourceIdentity.current = source;
      setSelected([]);
      setPath([]);
      setPreview(null);
      setFilterOpen(false);
      submission.current = null;
      setSubmitting(false);
      setFilters({ tagNames: [], memberUserIds: [] });
    } else
      setSelected((previous) => reconcileSelectedAssets(previous, records, !source && !localError));
  }, [records, source, localError]);
  useEffect(() => {
    if (!source && !localError && path.length) {
      const current = folders.find((folder) => folder.id === folderId);
      if (!current) setPath(path.filter((folder) => folders.some((item) => item.id === folder.id)));
      else {
        const updated = pickerFolderPath(folders, current.id);
        if (JSON.stringify(updated) !== JSON.stringify(path)) setPath(updated);
      }
    }
  }, [source, localError, path, folders, folderId]);
  const loadMore = () => {
    if (!pages.error) pages.loadMore();
    if (!folderPages.error) folderPages.loadMore();
  };
  useEffect(() => {
    if (!source || !hasMore || loading || loadingMore || error) return;
    const root = scrollRef.current,
      target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          loadAssetPage();
          loadFolderPage();
        }
      },
      { root, rootMargin: '160px', threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [source, hasMore, loading, loadingMore, error, loadAssetPage, loadFolderPage]);
  const toggle = (item) => {
    setSubmitError(null);
    setSelected((previous) =>
      previous.some((selected) => selected.id === item.id)
        ? previous.filter((selected) => selected.id !== item.id)
        : [...previous, item],
    );
  };
  const openFolder = (folder) => {
    setPath((previous) => [...previous, folder]);
    setQuery('');
    setPreview(null);
  };
  const canSelect = (item) => item.mediaType !== 'text' || Boolean(onPickAssets || onPickText);
  const openPreview = (item) => {
    item = getPreviewAsset ? getPreviewAsset(item) : item;
    if (!item) return;
    if (item.mediaType === 'text') setPreview({ text: true, item });
    else {
      const reference = assetReference(item);
      setPreview({
        ...reference,
        source: { ...reference.source, value: asset(item.url) },
        ...(item.poster ? { poster: asset(item.poster) } : {}),
      });
    }
  };
  const submit = async () => {
    if (submission.current || !currentSelection.length) return;
    const token = {};
    submission.current = token;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (onPickAssets) await onPickAssets(currentSelection);
      else {
        const references = pickerAssetReferences(currentSelection);
        if (references.length) await onPick?.(references);
        else {
          const text = pickerAssetText(currentSelection);
          if (text) await onPickText?.(text);
        }
      }
    } catch (reason) {
      if (alive.current && submission.current === token)
        setSubmitError(reason instanceof Error ? reason : new Error('添加资产失败，请重试'));
    } finally {
      if (alive.current && submission.current === token) {
        submission.current = null;
        setSubmitting(false);
      }
    }
  };
  const rootLabel = scope === 'team' ? '团队资产库' : '个人资产库';
  const footer = selectionFooter?.({
    selected: currentSelection,
    submitting,
    submit,
    onClose,
  });
  return (
    <>
      <Modal className="skill-detail-modal sk-asset-picker" title={title} onClose={onClose}>
        <h2>{title}</h2>
        <div className="agent-asset-picker-toolbar">
          <nav aria-label="资产文件夹" className="agent-asset-breadcrumb">
            <button
              type="button"
              onClick={() => {
                setPath([]);
                setQuery('');
              }}
            >
              {rootLabel}
            </button>
            {path.map((folder, index) => (
              <React.Fragment key={folder.id}>
                <ChevronRight size={16} />
                <button
                  type="button"
                  aria-current={index === path.length - 1 ? 'page' : undefined}
                  onClick={() => {
                    setPath((previous) => previous.slice(0, index + 1));
                    setQuery('');
                  }}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="search-field">
            <input
              aria-label="搜索资产"
              placeholder="搜索资产"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Icon name="search" />
            {query && (
              <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>
          <button
            ref={filterRef}
            type="button"
            className="agent-asset-filter-trigger"
            aria-label="筛选"
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
            data-active={Boolean(filters.tagNames.length || filters.memberUserIds.length)}
            onClick={() => setFilterOpen(true)}
          >
            <ListFilter size={18} />
          </button>
        </div>
        <div className="skill-filters">
          <div className="skill-categories">
            {ASSET_PICKER_TYPES.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === type}
                className={value === type ? 'active' : ''}
                onClick={() => setType(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {(filters.tagNames.length > 0 || filters.memberUserIds.length > 0) && (
            <button
              type="button"
              className="soft-button"
              onClick={() => setFilters({ tagNames: [], memberUserIds: [] })}
            >
              清除筛选
            </button>
          )}
        </div>
        <div className="skill-modal-scroll" ref={scrollRef} aria-busy={loading || loadingMore}>
          {loading && <p role="status">加载资产...</p>}
          {!loading && !error && !shown.length && !shownFolders.length && !hasMore && (
            <div className="empty-state">
              <Icon name="assets-empty" size={72} />
              <p>{query.trim() || filters.tagNames.length ? '未找到匹配的资产' : '暂无资产'}</p>
              {query.trim() && (
                <button type="button" className="soft-button" onClick={() => setQuery('')}>
                  清空关键词
                </button>
              )}
            </div>
          )}
          <div className="asset-grid">
            {shownFolders.map((folder) => (
              <article key={`folder:${folder.id}`} className="agent-asset-folder">
                <button
                  type="button"
                  className="agent-asset-preview"
                  aria-label={`打开文件夹 ${folder.name}`}
                  onClick={() => openFolder(folder)}
                >
                  <AssetPickerCover item={folder} />
                </button>
                <button
                  type="button"
                  className="agent-asset-name"
                  onClick={() => openFolder(folder)}
                >
                  {folder.name}
                </button>
              </article>
            ))}
            {shown.map((item) => {
              const checked = currentSelection.some((selected) => selected.id === item.id);
              const policy = !checked && isAssetDisabled?.(item, currentSelection);
              const policyDisabled = Boolean(policy);
              const mediaDisabled = !checked && !canSelect(item);
              const disabledTitle = mediaDisabled
                ? '此入口仅支持媒体资产'
                : policyDisabled
                  ? typeof policy === 'string'
                    ? policy
                    : '此素材暂不可选择'
                  : undefined;
              return (
                <article
                  key={`asset:${item.id}`}
                  onClick={() => openPreview(item)}
                  data-selected={checked}
                >
                  <button
                    type="button"
                    className="agent-asset-preview"
                    aria-label={`预览 ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPreview(item);
                    }}
                  >
                    <AssetPickerCover item={item} />
                  </button>
                  <p title={item.name}>{item.name}</p>
                  <label onClick={(event) => event.stopPropagation()} title={disabledTitle}>
                    <input
                      type="checkbox"
                      aria-label={`选择 ${item.name}`}
                      aria-disabled={policyDisabled || mediaDisabled || submitting || undefined}
                      title={disabledTitle}
                      disabled={mediaDisabled || submitting}
                      checked={checked}
                      onChange={() => {
                        if (policyDisabled) onSelectDisabledAsset?.(item, currentSelection);
                        else toggle(item);
                      }}
                    />
                    选择
                  </label>
                </article>
              );
            })}
          </div>
          {error && (
            <div role="alert" className="sk-asset-picker-status">
              <p>
                {source ? '资产加载失败' : available ? '本地资产库读取失败' : '无法加载团队资产库'}
              </p>
              <p className="muted">{error.message}</p>
              {source && available && (
                <button
                  type="button"
                  className="soft-button"
                  onClick={() => {
                    pages.retry();
                    folderPages.retry();
                  }}
                >
                  重试
                </button>
              )}
            </div>
          )}
          {source && hasMore && !error && (
            <div className="sk-asset-picker-status">
              {loadingMore && <p role="status">加载更多资产...</p>}
              <button
                type="button"
                className="soft-button"
                disabled={loading || loadingMore}
                onClick={loadMore}
              >
                加载更多
              </button>
              <div className="sk-asset-picker-sentinel" ref={sentinelRef} aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="sk-asset-picker-footer">
          {footer || (
            <>
              <span>已选择 {currentSelection.length} 项素材</span>
              {currentSelection.length > 0 && (
                <button
                  type="button"
                  className="soft-button"
                  disabled={submitting}
                  onClick={() => setSelected([])}
                >
                  清空选择
                </button>
              )}
              {submitError && <p role="alert">{submitError.message}</p>}
              <button
                type="button"
                className="white-button"
                disabled={!currentSelection.length || submitting}
                onClick={submit}
              >
                {submitting
                  ? '添加中...'
                  : `添加${currentSelection.length ? ` (${currentSelection.length})` : ''}`}
              </button>
            </>
          )}
          {footer && submitError && <p role="alert">{submitError.message}</p>}
        </div>
      </Modal>
      {filterOpen && (
        <AssetPickerFilters
          anchor={filterRef}
          tags={tags}
          members={members}
          value={filters}
          onClose={() => setFilterOpen(false)}
          onApply={(value) => {
            setFilters(value);
            if (value.tagNames.length) setPath([]);
            setFilterOpen(false);
          }}
        />
      )}
      {preview &&
        (preview.text ? (
          <EditorDialog title={preview.item.name} onClose={() => setPreview(null)} wide>
            <pre className="agent-asset-text-preview">{preview.item.content}</pre>
          </EditorDialog>
        ) : (
          <AgentReferencePreview reference={preview} onClose={() => setPreview(null)} />
        ))}
    </>
  );
}
