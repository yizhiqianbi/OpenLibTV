import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Expand, LoaderCircle, Minus, X } from 'lucide-react';
import {
  flattenPublicRoleMaterials,
  PUBLIC_ROLE_PAGE_SIZES,
  publicRoleCompliancePlan,
  publicRoleConfirmUris,
  publicRoleRemainingCapacity,
  toggleRoleSelection,
  isRoleComplianceExpired,
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

const emptyPage = { list: [], total: 0 };
const complianceFailure =
  '您有图片未通过Seedance的合规检测，若为真人图片，请前往角色库进行真人资产录入后再使用';
const materialCount = (record) => {
  const value =
    record.materialCount ??
    record.mediaCount ??
    record.mediaItemCount ??
    record.imageCount ??
    record.assetCount;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 4;
};

export default function PublicCharacterLibrary({
  source,
  context,
  onConfirm,
  onClose,
  asset = identityRoleAsset,
  onNotice,
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [character, setCharacter] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warning, setWarning] = useState(null);
  const acceptedConfirmation = useRef(null);
  const acceptedMaterials = useRef(new Map());
  const startWork = useRoleLibraryWork(source, 'public');
  const catalogue = useRoleLibraryRead(
    source,
    `${page}:${pageSize}`,
    (options) => source.listCharacters({ page, pageSize, orderBy: 'updated_at_desc' }, options),
    emptyPage,
  );
  const detail = useRoleLibraryRead(
    source,
    character?.characterUuid ?? '',
    (options) => source.getCharacterDetail(character.characterUuid, options),
    null,
    !!character,
  );
  const record = detail.data?.characterUuid === character?.characterUuid ? detail.data : character;
  const materials = useMemo(() => flattenPublicRoleMaterials(record), [record]);
  const capacity = publicRoleRemainingCapacity(
    context.imageSelectableCount,
    context.existingImageUris,
  );
  const openCharacter = (value) => {
    acceptedConfirmation.current = null;
    setCharacter(value);
    setSelected(new Set());
    setPreview(null);
    setError(null);
    setWarning(null);
  };
  const back = () => {
    acceptedConfirmation.current = null;
    setCharacter(null);
    setSelected(new Set());
    setPreview(null);
    setError(null);
    setWarning(null);
  };
  const select = (url) => {
    if (busy) return;
    const next = toggleRoleSelection(selected, url, capacity);
    if (next !== selected) {
      acceptedConfirmation.current = null;
      setSelected(next);
    }
  };
  const confirm = async () => {
    if (busy || selected.size === 0) return;
    const work = startWork();
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const selectedKey = JSON.stringify([...selected]);
      if (acceptedConfirmation.current?.selectedKey === selectedKey) {
        const accepted = await onConfirm(acceptedConfirmation.current.payload);
        if (!work.current()) return;
        if (accepted === true) onClose();
        else setError('角色素材未保存，已保留选择，请重试');
        return;
      }
      let incoming = [...selected],
        assets = [];
      if (context.seedanceTabVisible) {
        const cached = [...selected].flatMap((url) => {
          const approved = acceptedMaterials.current.get(url);
          return approved && !isRoleComplianceExpired(approved.asset) ? [approved] : [];
        });
        const cachedUrls = new Set(cached.map((item) => item.url));
        const plan = publicRoleCompliancePlan({
          selected: new Set([...selected].filter((url) => !cachedUrls.has(url))),
          materials,
        });
        incoming = [...cached.map((item) => item.uri), ...plan.readyUris];
        assets = [...cached.map((item) => item.asset), ...plan.cachedAssets];
        if (plan.requests.length > 0) {
          const requests = new Map(plan.requests.map((request) => [request.url, request]));
          const result = await source.certifyImages(
            materials
              .filter((item) => requests.has(item.url))
              .map((item) => ({ ...item, force: requests.get(item.url).force })),
            { signal: work.signal },
          );
          if (!work.current()) return;
          incoming = [...incoming, ...result.images];
          assets = [...assets, ...result.assets];
          for (const record of result.assets) {
            const uri = record.assetId ? `asset://${record.assetId}` : record.assetUrl;
            if (
              record.assetType === 'image' &&
              record.status === 1 &&
              requests.has(record.assetUrl) &&
              result.images.includes(uri)
            )
              acceptedMaterials.current.set(record.assetUrl, {
                url: record.assetUrl,
                uri,
                asset: { ...record },
              });
          }
          if (result.partial || result.images.length < plan.requests.length) {
            setWarning(complianceFailure);
            onNotice?.(complianceFailure);
          }
        }
      }
      if (!work.current()) return;
      const selection = publicRoleConfirmUris({
        selected: new Set(incoming),
        existingImages: context.existingImageUris,
        existingVideos: context.existingVideoUris,
        existingAudios: context.existingAudioUris,
      });
      if (!selection) {
        setError(complianceFailure);
        return;
      }
      const payload = {
        images: [...selection.images],
        videos: [...selection.videos],
        audios: [...selection.audios],
        assets: assets.map((record) => ({ ...record })),
      };
      acceptedConfirmation.current = { selectedKey, payload };
      const accepted = await onConfirm(payload);
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
  const visiblePreview = preview !== null ? materials[preview] : null;
  return (
    <div className="cv-role-public" role="tabpanel" aria-label="公共角色库">
      {character && (
        <div className="cv-role-breadcrumb">
          <button onClick={back} disabled={busy}>
            <ArrowLeft size={14} />
            公共角色库
          </button>
          <span>/</span>
          <strong>{record?.name}</strong>
        </div>
      )}
      <div className={`cv-role-scroll ${character ? 'cv-role-detail-scroll' : ''}`}>
        {character ? (
          <>
            <RoleReadState
              loading={detail.loading && materials.length === 0}
              error={detail.error}
              retry={detail.retry}
              empty={!detail.loading && !detail.error && materials.length === 0 ? '暂无素材' : null}
            />
            {materials.length > 0 && (
              <div className="cv-role-material-grid">
                {materials.map((item, index) => {
                  const checked = selected.has(item.url),
                    limited = !checked && selected.size >= capacity;
                  return (
                    <div
                      key={item.url}
                      className={`cv-role-material ${limited ? 'is-limited' : ''}`}
                      role="button"
                      aria-label={`选择${item.name}`}
                      aria-pressed={checked}
                      aria-disabled={limited || busy}
                      tabIndex={limited || busy ? -1 : 0}
                      onClick={() => select(item.url)}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          !limited &&
                          !busy &&
                          ['Enter', ' '].includes(event.key)
                        ) {
                          event.preventDefault();
                          select(item.url);
                        }
                      }}
                    >
                      <div className="cv-role-material-image">
                        <img
                          src={asset(item.thumbUrl || item.url)}
                          alt={item.name}
                          draggable={false}
                        />
                        <span className="cv-role-gradient-top" />
                        <span className="cv-role-gradient-bottom" />
                        <span className={`cv-role-material-check ${checked ? 'is-checked' : ''}`}>
                          {checked && <Check size={12} />}
                        </span>
                        <button
                          className="cv-role-material-preview"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPreview(index);
                          }}
                        >
                          <Expand size={14} />
                          预览详情
                        </button>
                      </div>
                      <span className="cv-role-material-name">{item.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <RoleReadState
              loading={catalogue.loading && catalogue.data.list.length === 0}
              error={catalogue.error}
              retry={catalogue.retry}
              empty={
                !catalogue.loading && !catalogue.error && catalogue.data.list.length === 0
                  ? '暂无数据'
                  : null
              }
            />
            {catalogue.data.list.length > 0 && (
              <div className="cv-role-character-grid">
                {catalogue.data.list.map((item) => (
                  <button
                    className="cv-role-character"
                    key={item.characterUuid}
                    onClick={() => openCharacter(item)}
                  >
                    <div className="cv-role-character-cover">
                      {item.coverUrl && (
                        <img src={asset(item.coverUrl)} alt={item.name} draggable={false} />
                      )}
                      <span className="cv-role-gradient-top" />
                      <span className="cv-role-gradient-bottom" />
                      <span className="cv-role-character-count">{materialCount(item)} 个素材</span>
                    </div>
                    <strong>{item.name}</strong>
                    <span>{item.subtitle || item.summaryText || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer className="cv-role-footer">
        {!character && (
          <RolePagination
            page={page}
            pageSize={pageSize}
            pageSizes={PUBLIC_ROLE_PAGE_SIZES}
            total={catalogue.data.total}
            onPage={setPage}
            onPageSize={(value) => {
              setPageSize(value);
              setPage(1);
            }}
          />
        )}
      </footer>
      {(error || warning) && (
        <div className="cv-role-submit-feedback" role={error ? 'alert' : 'status'}>
          {error || warning}
        </div>
      )}
      {character && selected.size > 0 && (
        <div className="cv-role-selection-bar">
          <button
            aria-label="清空角色素材选择"
            disabled={busy}
            onClick={() => {
              acceptedConfirmation.current = null;
              setSelected(new Set());
            }}
          >
            <X size={16} />
          </button>
          <span className="cv-role-selection-divider" />
          <span className="cv-role-selection-count">
            <span className="cv-role-selection-icon">
              {selected.size >= capacity ? <Check size={12} /> : <Minus size={12} />}
            </span>
            已选择 {selected.size} 项
          </span>
          <button className="cv-role-primary" disabled={busy} onClick={() => void confirm()}>
            {busy && <LoaderCircle size={14} className="cv-role-spinner" />}
            {busy ? '正在审核中' : '应用'}
          </button>
        </div>
      )}
      {visiblePreview && (
        <RoleMediaPreview
          key={visiblePreview.url}
          item={visiblePreview}
          asset={asset}
          publicPreview
          onClose={() => setPreview(null)}
          position={preview}
          total={materials.length}
          onPrevious={
            materials.length > 1
              ? () => setPreview((value) => (value - 1 + materials.length) % materials.length)
              : undefined
          }
          onNext={
            materials.length > 1
              ? () => setPreview((value) => (value + 1) % materials.length)
              : undefined
          }
        />
      )}
    </div>
  );
}
