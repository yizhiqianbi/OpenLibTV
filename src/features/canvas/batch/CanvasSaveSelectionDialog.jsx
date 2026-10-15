import { useRef, useState } from 'react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { useAssetLibrary } from '../../../hooks/useAssetLibrary.ts';
import {
  ASSET_LIBRARY_KEY,
  DEFAULT_ASSET_TAGS,
  folderPath,
  normalizeAssetLibrary,
} from '../../../services/asset-library/model.ts';
import { asset } from '../../../services/assets.ts';
import { storageRepository } from '../../../services/storage.ts';
import { canvasSelectionLibraryAssets, canvasSelectionMaterialItems } from './selection-actions.js';
import { canvasSelectionIds } from './model.js';
import './save-selection.css';

const ROOT = '__local-root__';
const errorText = (error) => error?.message || '本地保存失败，请检查存储空间后重试';
const readingFailed = (error) => error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(error.code);

function MaterialPreview({ item }) {
  const data = item.nodeData;
  const url = (Array.isArray(data.url) ? data.url : [data.url]).find(
    (value) => typeof value === 'string' && value.trim(),
  );
  if (data.type === 'image') return <img src={asset(url)} alt={item.name} />;
  if (data.type === 'video')
    return <video src={asset(url)} poster={asset(data.poster)} controls tabIndex={0} />;
  if (data.type === 'audio') return <audio src={asset(url)} controls tabIndex={0} />;
  if (data.type === 'text') return <pre>{data.content.join('\n')}</pre>;
  return <p>脚本 · {Array.isArray(data.rows) ? data.rows.length : 0} 个镜头</p>;
}

/** The owner key discards the previous document's form before another can be saved. */
export default function CanvasSaveSelectionDialog(props) {
  return (
    <SaveSelectionForm key={`${props.documentKey ?? ''}:${props.projectId ?? ''}`} {...props} />
  );
}

function SaveSelectionForm({
  nodes,
  selectedIds,
  projectId,
  onClose,
  onSaved,
  ready = true,
  readonly = false,
}) {
  const library = useAssetLibrary();
  const [renames, setRenames] = useState({});
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState([]);
  const [customTag, setCustomTag] = useState('');
  const [feedback, setFeedback] = useState('');
  const [committed, setCommitted] = useState(false);
  const committedRef = useRef(false);
  const items = canvasSelectionMaterialItems(nodes, selectedIds);
  const ignored = canvasSelectionIds(nodes, selectedIds).length - items.length;
  const single = items.length === 1;
  const blocked = readingFailed(library.error);
  const disabled = !ready || readonly || !!blocked || committed;
  const availableTags = [
    ...new Set([...DEFAULT_ASSET_TAGS.map((tag) => tag.name), ...library.value.tags, ...tags]),
  ];
  const nameFor = (item) => renames[item.nodeId] ?? item.name;
  const validFolder = folder === ROOT || library.value.folders.some((item) => item.id === folder);
  const canSave =
    !disabled &&
    items.length > 0 &&
    validFolder &&
    (!single || nameFor(items[0]).trim().length > 0);
  const close = () => onClose?.();
  const addTag = () => {
    const value = customTag.trim();
    if (!value || disabled) return;
    setTags((previous) => [...new Set([...previous, value])]);
    setCustomTag('');
  };
  const save = (event) => {
    event.preventDefault();
    if (!canSave || committedRef.current) return;
    setFeedback('');
    let saved;
    try {
      const folderId = folder === ROOT ? null : folder;
      const assetType = DEFAULT_ASSET_TAGS.find((tag) => tags.includes(tag.name))?.assetType ?? 0;
      const normalizedNames = Object.fromEntries(
        items.map((item) => [item.nodeId, nameFor(item).trim() || item.name]),
      );
      saved = canvasSelectionLibraryAssets(nodes, selectedIds, {
        folderId,
        tags,
        assetType,
        renames: normalizedNames,
      }).map((item) => ({ ...item, ...(projectId ? { projectUuid: projectId } : {}) }));
      const success = library.setValue((previous) => {
        // A cross-tab storage event may arrive after the click. Check the real
        // read/parse result before committing, not just the previous render.
        const canonical = storageRepository.readStoredState(ASSET_LIBRARY_KEY, previous, {
          version: 1,
          migrate: normalizeAssetLibrary,
        });
        if (readingFailed(canonical.error)) throw canonical.error;
        let current = normalizeAssetLibrary(canonical.value);
        if (storageRepository.getSnapshot(ASSET_LIBRARY_KEY).raw === null) {
          const legacy = storageRepository.readStoredState('libtv-assets', []);
          if (readingFailed(legacy.error)) throw legacy.error;
          current = normalizeAssetLibrary(legacy.value);
        }
        if (folderId) folderPath(current, folderId);
        return normalizeAssetLibrary({
          ...current,
          assets: [...current.assets, ...saved],
          tags: [...new Set([...current.tags, ...tags])],
        });
      });
      if (!success) {
        setFeedback('本地保存失败，请检查存储空间后重试；名称、位置和标签已保留。');
        return;
      }
    } catch (error) {
      setFeedback(errorText(error));
      return;
    }
    committedRef.current = true;
    setCommitted(true);
    try {
      onSaved?.(saved);
      close();
    } catch (error) {
      // The atomic write succeeded. A consumer failure must not offer a second save.
      setFeedback(`已保存到本地资产库；后续操作失败：${errorText(error)}`);
    }
  };
  return (
    <div className="cv-save-selection-overlay">
      <EditorDialog title="保存资产" onClose={close}>
        <form
          className="cv-save-selection"
          onSubmit={save}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
            )
              event.preventDefault();
          }}
        >
          <p className="cv-save-selection-note">保存到本机资产库，未提交原站或运营服务器。</p>
          {!ready && <p role="status">正在加载画布，请稍候…</p>}
          {readonly && <p role="status">只读画布不能保存资产。</p>}
          {blocked && (
            <p role="alert">资产库读取失败，请先修复已有数据：{errorText(library.error)}</p>
          )}
          {ignored > 0 && (
            <p role="status">已忽略 {ignored} 个没有可保存内容的节点；分组不会自动展开为资产。</p>
          )}
          {!items.length && <p role="status">所选节点没有可保存的图片、视频、音频、文本或脚本。</p>}
          <div className={'cv-save-selection-body' + (single ? ' is-single' : '')}>
            <section className="cv-save-selection-previews" aria-label="待保存资产">
              {items.map((item) => (
                <article key={item.nodeId}>
                  <div className="cv-save-selection-preview">
                    <MaterialPreview item={item} />
                  </div>
                  {!single && (
                    <input
                      aria-label={`资产名称 ${item.name}`}
                      maxLength={50}
                      value={nameFor(item)}
                      disabled={disabled}
                      onChange={(event) =>
                        setRenames((previous) => ({
                          ...previous,
                          [item.nodeId]: event.target.value.slice(0, 50),
                        }))
                      }
                    />
                  )}
                </article>
              ))}
              {!single && items.length > 0 && <p>已选择 {items.length} 个资产</p>}
            </section>
            <div className="cv-save-selection-fields">
              {single && (
                <label>
                  资产名称 <span aria-hidden="true">*</span>
                  <div className="cv-save-selection-name">
                    <input
                      aria-label="资产名称"
                      maxLength={50}
                      value={nameFor(items[0])}
                      disabled={disabled}
                      onChange={(event) =>
                        setRenames({ [items[0].nodeId]: event.target.value.slice(0, 50) })
                      }
                    />
                    <span>{nameFor(items[0]).length}/50</span>
                  </div>
                </label>
              )}
              <label>
                保存位置 <span aria-hidden="true">*</span>
                <select
                  aria-label="保存位置"
                  value={folder}
                  disabled={disabled}
                  onChange={(event) => setFolder(event.target.value)}
                >
                  <option value="">请选择文件夹</option>
                  <option value={ROOT}>本地资产库根目录</option>
                  {library.value.folders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {folderPath(library.value, item.id)
                        .map((parent) => parent.name)
                        .join(' / ')}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset disabled={disabled}>
                <legend>设置标签</legend>
                <div className="cv-save-selection-tags">
                  {availableTags.map((tag) => (
                    <label key={tag}>
                      <input
                        type="checkbox"
                        checked={tags.includes(tag)}
                        onChange={() =>
                          setTags((previous) =>
                            previous.includes(tag)
                              ? previous.filter((value) => value !== tag)
                              : [...previous, tag],
                          )
                        }
                      />
                      {tag}
                    </label>
                  ))}
                </div>
                <div className="cv-save-selection-new-tag">
                  <input
                    aria-label="新标签"
                    placeholder="新标签"
                    maxLength={10}
                    value={customTag}
                    onChange={(event) => setCustomTag(event.target.value.slice(0, 10))}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229)
                        addTag();
                    }}
                  />
                  <button type="button" disabled={!customTag.trim()} onClick={addTag}>
                    添加标签
                  </button>
                </div>
              </fieldset>
              {feedback && <p role={committed ? 'status' : 'alert'}>{feedback}</p>}
              <footer>
                <button type="button" onClick={close}>
                  取消
                </button>
                <button type="submit" className="cv-save-selection-primary" disabled={!canSave}>
                  {committed ? '已保存到本地' : '保存'}
                </button>
              </footer>
            </div>
          </div>
        </form>
      </EditorDialog>
    </div>
  );
}
