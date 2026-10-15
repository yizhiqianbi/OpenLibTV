import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Clock,
  ImageIcon,
  LoaderCircle,
  Music,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { DialogFocusBoundary } from '../../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../../hooks/useDialogBehavior.js';
import {
  COMPLIANCE_ROLE_PAGE_SIZES,
  complianceRoleSelectionUris,
  isRoleComplianceExpired,
  roleAssetKey,
  toggleRoleSelection,
  validateRoleUploadMetadata,
  roleUploadSizeError,
} from './role-library-model.js';
import {
  identityRoleAsset,
  RoleMediaPreview,
  RolePagination,
  RoleReadState,
} from './RoleLibraryChrome.jsx';
import {
  roleSourceMessage,
  useRoleLibraryRead,
  useRoleLibraryWork,
} from './useRoleLibraryRequests.js';
import { readRoleUploadMetadata } from './readRoleUploadMetadata.js';

const emptyAssets = [];
const tabs = [
  ['portrait', '真人人像'],
  ['image', '图片'],
  ['video', '视频'],
  ['audio', '音频'],
];
const accepts = {
  image: 'image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif',
  video: 'video/mp4,video/quicktime',
  audio: 'audio/wav,audio/mpeg',
};
const uploadHints = {
  image: '请上传<30M的图片',
  video: '请上传2-30秒的视频',
  audio: '请上传2-15秒的音频',
};

export function DeleteRoleAsset({ item, pending, error, unavailable, onDelete, onClose }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose });
  const type = { image: '图片', video: '视频', audio: '音频' }[item.assetType];
  return createPortal(
    <div
      className="cv-role-delete-overlay nopan"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="确实删除？"
        tabIndex={-1}
        className="cv-role-delete-dialog"
      >
        <DialogFocusBoundary edge="start" />
        <h3>确实删除？</h3>
        <p>删除{type}后将无法恢复</p>
        {(error || unavailable) && <p role="alert">{error || '素材删除服务未连接'}</p>}
        <div>
          <button onClick={onClose}>取消</button>
          <button className="cv-role-primary" disabled={pending || unavailable} onClick={onDelete}>
            {pending ? '删除中…' : '删除'}
          </button>
        </div>
        <DialogFocusBoundary edge="end" />
      </section>
    </div>,
    document.body,
  );
}

function AssetCard({
  item,
  selected,
  limited,
  selectable,
  expired,
  busy,
  asset,
  onSelect,
  onDelete,
  onPreview,
  onRecheck,
}) {
  const video = useRef(null);
  const [imageFailed, setImageFailed] = useState(false);
  const type = item.assetType;
  useEffect(() => {
    const element = video.current;
    return () => {
      if (element) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    };
  }, []);
  return (
    <div
      className={`cv-role-asset ${limited ? 'is-limited' : ''}`}
      role="button"
      aria-label={`选择${item.uuid}`}
      aria-pressed={selected}
      aria-disabled={!selectable || busy}
      tabIndex={selectable && !busy ? 0 : -1}
      onClick={() => {
        if (selectable && !busy) onSelect();
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          selectable &&
          !busy &&
          ['Enter', ' '].includes(event.key)
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => {
        const element = video.current;
        if (element) {
          element.currentTime = 0;
          element.play()?.catch(() => {});
        }
      }}
      onMouseLeave={() => video.current?.pause()}
    >
      {type === 'audio' ? (
        <Music size={36} className="cv-role-asset-placeholder" />
      ) : type === 'video' ? (
        <video
          ref={video}
          src={asset(item.assetUrl)}
          muted
          loop
          playsInline
          preload="metadata"
          disablePictureInPicture
        />
      ) : !imageFailed ? (
        <img
          src={asset(item.assetUrl)}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <ImageIcon size={24} className="cv-role-asset-placeholder" />
      )}
      {item.status === 0 && (
        <div className="cv-role-asset-state">
          <Clock size={16} />
          <span>正在审核中</span>
        </div>
      )}
      {item.status === 2 && (
        <div className="cv-role-asset-state">
          <AlertTriangle size={16} />
          <span>未通过审核</span>
          <small>{item.errorMessage || '内容可能涉及版权问题'}</small>
        </div>
      )}
      {expired && item.status === 1 && (
        <div className="cv-role-asset-state is-expired">
          <AlertTriangle size={16} />
          <span>核验已过期，请重新核验</span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRecheck();
            }}
          >
            重新核验
          </button>
        </div>
      )}
      {item.status === 1 && (
        <span className={`cv-role-asset-check ${selected ? 'is-selected' : ''}`}>
          {selected && <Check size={12} />}
        </span>
      )}
      <div className="cv-role-asset-actions">
        <button
          aria-label={`删除${item.uuid}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={12} />
        </button>
        {item.status === 1 && (
          <button
            aria-label={`预览${item.uuid}`}
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
          >
            {type === 'image' ? <ImageIcon size={12} /> : <Play size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ComplianceAssetLibrary({
  source,
  context,
  onConfirm,
  onClose,
  asset = identityRoleAsset,
}) {
  const [tab, setTab] = useState('image');
  const [pages, setPages] = useState({ portrait: 1, image: 1, video: 1, audio: 1 });
  const [pageSize, setPageSize] = useState(15);
  const [selections, setSelections] = useState(() => ({
    images: new Set(context.existingImageIds ?? []),
    videos: new Set(context.existingVideoIds ?? []),
    audios: new Set(context.existingAudioIds ?? []),
  }));
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const input = useRef(null);
  const startWork = useRoleLibraryWork(source, 'seedance');
  const listing = useRoleLibraryRead(
    source,
    'assets',
    (options) => source.listAssets(options),
    emptyAssets,
  );
  const polling = useRef(0);
  const {
    data: listedAssets,
    loading: loadingAssets,
    error: assetsError,
    retry: retryAssets,
  } = listing;
  useEffect(() => {
    if (loadingAssets || assetsError || !listedAssets.some((item) => item.status === 0)) return;
    if (polling.current >= 60) return;
    const timer = setTimeout(() => {
      polling.current++;
      retryAssets();
    }, 3000);
    return () => clearTimeout(timer);
  }, [listedAssets, assetsError, loadingAssets, retryAssets]);
  const type = tab === 'portrait' ? 'image' : tab;
  const selectionType = `${type}s`;
  const selected = selections[selectionType];
  const capacity = Math.max(0, context[`${type}SelectableCount`] ?? 0);
  const matching = useMemo(
    () => listing.data.filter((item) => item.assetType === type),
    [listing.data, type],
  );
  const page = Math.min(pages[tab], Math.max(1, Math.ceil(matching.length / pageSize)));
  const visible = matching.slice((page - 1) * pageSize, page * pageSize);
  const assetsByKey = useMemo(
    () => new Map(listing.data.map((item) => [roleAssetKey(item), item])),
    [listing.data],
  );
  const setPage = (value) => setPages((previous) => ({ ...previous, [tab]: value }));
  const toggle = (key) => {
    if (!busy && capacity > 0)
      setSelections((previous) => ({
        ...previous,
        [selectionType]: toggleRoleSelection(previous[selectionType], key, capacity),
      }));
  };
  const blocked = (message) => setError(message);
  const upload = async (event) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0 || busy) return;
    const work = startWork();
    setBusy(true);
    setError(null);
    let failures = 0;
    try {
      for (let index = 0; index < files.length; index++) {
        if (!work.current()) return;
        setProgress({ current: index + 1, total: files.length });
        try {
          const sizeError = roleUploadSizeError(type, files[index].size);
          if (sizeError) throw new Error(sizeError);
          const metadata = await readRoleUploadMetadata(files[index], type, {
            signal: work.signal,
          });
          if (!work.current()) return;
          const failure = validateRoleUploadMetadata({
            type,
            size: files[index].size,
            ...metadata,
          });
          if (failure) throw new Error(failure);
          await source.uploadAsset(files[index], type, { signal: work.signal });
        } catch (cause) {
          if (work.current()) {
            failures++;
            setError(roleSourceMessage(cause, '审核失败，请更换素材后重试'));
          }
        }
      }
      if (work.current()) {
        polling.current = 0;
        listing.retry();
        if (failures === 0) setError(null);
      }
    } finally {
      if (work.current()) {
        setBusy(false);
        setProgress(null);
      }
      work.finish();
    }
  };
  const remove = async () => {
    if (busy || !deleting) return;
    const item = deleting,
      work = startWork();
    setBusy(true);
    setError(null);
    try {
      await source.removeAsset(item.uuid, { signal: work.signal });
      if (!work.current()) return;
      const key = roleAssetKey(item);
      setSelections((previous) =>
        Object.fromEntries(
          Object.entries(previous).map(([type, values]) => [
            type,
            new Set([...values].filter((value) => value !== key)),
          ]),
        ),
      );
      setDeleting(null);
      polling.current = 0;
      listing.retry();
    } catch (cause) {
      if (work.current()) setError(roleSourceMessage(cause, '删除失败，请重试'));
    } finally {
      if (work.current()) setBusy(false);
      work.finish();
    }
  };
  const recheck = async (item) => {
    if (busy) return;
    if (item.assetType !== 'image' || !source.capabilities.certify) {
      blocked('素材重新核验服务未连接，已保留原素材');
      return;
    }
    const work = startWork();
    setBusy(true);
    setError(null);
    try {
      const result = await source.certifyImages(
        [
          {
            url: item.assetUrl,
            assetId: item.assetId,
            complianceCheckedAtMs: item.complianceCheckedAtMs,
            createdAtMs: item.createdAtMs,
            force: true,
          },
        ],
        { signal: work.signal },
      );
      if (!work.current()) return;
      const replacement = result.assets.find(
        (record) =>
          record.assetType === 'image' &&
          record.status === 1 &&
          record.assetUrl === item.assetUrl &&
          result.images.includes(record.assetId ? `asset://${record.assetId}` : record.assetUrl),
      );
      if (!replacement || isRoleComplianceExpired(replacement))
        throw new Error('素材未通过合规核验，已保留原素材');
      if (replacement.uuid !== item.uuid)
        await source.removeAsset(item.uuid, { signal: work.signal });
      if (!work.current()) return;
      const key = roleAssetKey(item);
      setSelections((previous) => ({
        ...previous,
        images: new Set([...previous.images].filter((value) => value !== key)),
      }));
      polling.current = 0;
      listing.retry();
    } catch (cause) {
      if (work.current()) setError(roleSourceMessage(cause, '素材重新核验失败，已保留原素材'));
    } finally {
      if (work.current()) setBusy(false);
      work.finish();
    }
  };
  const confirm = async () => {
    if (busy || listing.loading || listing.error || tab === 'portrait') return;
    const work = startWork();
    setBusy(true);
    setError(null);
    try {
      const selection = complianceRoleSelectionUris({ ...selections, assetsByKey });
      const accepted = await onConfirm({
        images: selection.images,
        videos: selection.videos,
        audios: selection.audios,
        assets: selection.assets,
      });
      if (!work.current()) return;
      if (accepted === true) onClose();
      else setError('角色素材未保存，已保留选择，请重试');
    } catch (cause) {
      if (work.current()) setError(roleSourceMessage(cause, '角色素材未保存，已保留选择，请重试'));
    } finally {
      if (work.current()) setBusy(false);
      work.finish();
    }
  };
  return (
    <div className="cv-role-compliance" role="tabpanel" aria-label="Seedance合规素材库">
      <div className="cv-role-media-tabs" role="tablist" aria-label="合规素材类型">
        {tabs.map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            key={key}
            onClick={() => {
              setTab(key);
              setError(null);
            }}
          >
            {label}
            {key === 'portrait' && <span>NEW</span>}
          </button>
        ))}
        <small>
          已选 {selected.size}/{capacity}
        </small>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={accepts[type]}
        aria-label="上传合规素材"
        onChange={(event) => void upload(event)}
        hidden
      />
      <div className="cv-role-scroll">
        {tab === 'portrait' ? (
          <>
            <div className="cv-role-asset-grid">
              <button
                className="cv-role-upload-card"
                onClick={() => blocked('真人资产授权与录入服务未连接')}
              >
                <Plus size={16} />
                <span>录入新的真人</span>
              </button>
            </div>
            <RoleReadState error="真人资产授权与录入服务未连接" />
          </>
        ) : (
          <>
            <RoleReadState
              loading={listing.loading && listing.data.length === 0}
              error={listing.error}
              retry={listing.retry}
            />
            <div className="cv-role-asset-grid">
              {page === 1 && (
                <div className="cv-role-upload-card">
                  {busy && progress ? (
                    <>
                      <LoaderCircle size={20} className="cv-role-spinner" />
                      <span>
                        上传中...({progress.current}/{progress.total})
                      </span>
                    </>
                  ) : (
                    <>
                      <div>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (!source.capabilities.upload) blocked('素材上传服务未连接');
                            else input.current?.click();
                          }}
                        >
                          本地上传
                        </button>
                        <button disabled={busy} onClick={() => blocked('历史资产选择服务未连接')}>
                          历史资产选择
                        </button>
                        {type === 'image' && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setTab('portrait');
                              setError(null);
                            }}
                          >
                            真人资产录入
                          </button>
                        )}
                      </div>
                      <small>{uploadHints[type]}</small>
                    </>
                  )}
                </div>
              )}
              {visible.map((item) => {
                const key = roleAssetKey(item),
                  checked = selected.has(key),
                  expired = isRoleComplianceExpired(item),
                  limited = !checked && selected.size >= capacity;
                return (
                  <AssetCard
                    key={item.uuid}
                    item={item}
                    selected={checked}
                    expired={expired}
                    limited={limited}
                    selectable={item.status === 1 && !expired && !limited}
                    busy={busy}
                    asset={asset}
                    onSelect={() => toggle(key)}
                    onPreview={() => setPreview(item)}
                    onDelete={() => {
                      setError(null);
                      setDeleting(item);
                    }}
                    onRecheck={() => void recheck(item)}
                  />
                );
              })}
              {visible.length === 0 && page > 1 && !listing.loading && !listing.error && (
                <div className="cv-role-empty">暂无素材</div>
              )}
            </div>
          </>
        )}
      </div>
      {error && !deleting && (
        <div className="cv-role-inline-error" role="alert">
          {error}
        </div>
      )}
      <footer className="cv-role-footer">
        <RolePagination
          page={page}
          pageSize={pageSize}
          pageSizes={COMPLIANCE_ROLE_PAGE_SIZES}
          total={tab === 'portrait' ? 0 : matching.length}
          onPage={setPage}
          onPageSize={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
        <button
          className="cv-role-primary"
          disabled={busy || listing.loading || !!listing.error || tab === 'portrait'}
          onClick={() => void confirm()}
        >
          {busy && !progress && <LoaderCircle size={14} className="cv-role-spinner" />}确定
        </button>
      </footer>
      {preview && (
        <RoleMediaPreview
          key={preview.uuid}
          item={preview}
          asset={asset}
          onClose={() => setPreview(null)}
        />
      )}
      {deleting && (
        <DeleteRoleAsset
          item={deleting}
          pending={busy}
          error={error}
          unavailable={!source.capabilities.remove}
          onDelete={() => void remove()}
          onClose={() => {
            setDeleting(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
