import React, { useRef, useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import Icon from '../../../components/Icon.jsx';
import {
  ASSET_UPLOAD_ACCEPT,
  DEFAULT_ASSET_TAGS,
  assetTags,
  descendantFolderIds,
  folderPath,
  moveLibraryEntries,
  validateName,
} from '../../../services/asset-library/model.ts';
import AssetFolderTree from './AssetFolderTree.jsx';
import AssetMedia from './AssetMedia.jsx';
import { useAssetUploads } from '../hooks/useAssetUploads.js';

const errorText = (error) => error.message || '操作失败，请重试';
export function AssetNameDialog({ title, initial = '', maximum = 20, onClose, onSave }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const save = (event) => {
    event.preventDefault();
    try {
      if (onSave(validateName(name, maximum)) !== false) onClose();
      else setError('保存失败，请检查本机存储空间后重试');
    } catch (error) {
      setError(errorText(error));
    }
  };
  return (
    <Modal
      title={title}
      className="asset-library-name-dialog"
      onClose={onClose}
      closeOnClickOutside={false}
    >
      <h2>{title}</h2>
      <form onSubmit={save}>
        <label>
          名称 <span className="required">*</span>
          <div className="asset-library-name-input">
            <input
              aria-label="名称"
              placeholder="请输入名称"
              autoFocus
              maxLength={maximum}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) {
                  if (event.key === 'Enter') event.preventDefault();
                }
              }}
            />
            <span>
              {name.length}/{maximum}
            </span>
          </div>
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" className="soft-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="white-button" disabled={!name.trim()}>
            保存
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function AssetTagChoices({ library, value, onChange }) {
  const [custom, setCustom] = useState('');
  const [newTags, setNewTags] = useState([]);
  const tags = [
    ...new Set([
      ...DEFAULT_ASSET_TAGS.map((item) => item.name),
      ...library.tags,
      ...newTags,
      ...value,
    ]),
  ];
  const add = () => {
    const name = custom.trim();
    if (name) {
      setNewTags((items) => [...new Set([...items, name])]);
      onChange([...new Set([...value, name])]);
      setCustom('');
    }
  };
  return (
    <div className="asset-library-tag-choices">
      <div>
        {tags.map((tag) => (
          <label key={tag}>
            <input
              type="checkbox"
              checked={value.includes(tag)}
              onChange={() =>
                onChange(
                  value.includes(tag) ? value.filter((item) => item !== tag) : [...value, tag],
                )
              }
            />
            {tag}
          </label>
        ))}
      </div>
      <div className="asset-library-custom-tag">
        <input
          aria-label="新标签"
          placeholder="创建新标签"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="soft-button" disabled={!custom.trim()} onClick={add}>
          添加
        </button>
      </div>
    </div>
  );
}
export function AssetTagsDialog({
  library,
  initial = [],
  filter = false,
  batch = false,
  onClose,
  onSave,
}) {
  const [tags, setTags] = useState(initial);
  const [error, setError] = useState('');
  const title = filter ? '筛选素材类型' : '编辑标签';
  return (
    <Modal title={title} className="asset-library-tags-dialog" onClose={onClose}>
      <h2>{title}</h2>
      {batch && <p className="muted">所选资产的标签将替换为当前选择。</p>}
      <AssetTagChoices library={library} value={tags} onChange={setTags} />
      {error && <p role="alert">{error}</p>}
      <footer>
        {filter && (
          <button className="soft-button" onClick={() => setTags([])}>
            重置
          </button>
        )}
        <button className="soft-button" onClick={onClose}>
          取消
        </button>
        <button
          className="white-button"
          onClick={() => {
            try {
              if (onSave(tags) !== false) onClose();
              else setError('保存失败，请重试');
            } catch (error) {
              setError(errorText(error));
            }
          }}
        >
          确定
        </button>
      </footer>
    </Modal>
  );
}
export function AssetMoveDialog({ library, keys, onClose, onSave, onCreateFolder }) {
  const [target, setTarget] = useState(null);
  const [creating, setCreating] = useState(undefined);
  const [error, setError] = useState('');
  const reason = (id) => {
    try {
      moveLibraryEntries(library, keys, id);
      return '';
    } catch (error) {
      return errorText(error);
    }
  };
  return (
    <>
      <Modal title="移动到" className="asset-library-move-dialog" onClose={onClose}>
        <h2>移动到</h2>
        <AssetFolderTree
          library={library}
          value={target}
          onChange={setTarget}
          disabled={(id) => !!reason(id)}
          onCreate={setCreating}
        />
        {error && <p role="alert">{error}</p>}
        <footer>
          <button className="soft-button" onClick={onClose}>
            取消
          </button>
          <button
            className="white-button"
            disabled={!!reason(target)}
            onClick={() => {
              try {
                if (onSave(target) !== false) onClose();
                else setError('移动失败，请重试');
              } catch (error) {
                setError(errorText(error));
              }
            }}
          >
            确定
          </button>
        </footer>
      </Modal>
      {creating !== undefined && (
        <AssetNameDialog
          title="新建文件夹"
          onClose={() => setCreating(undefined)}
          onSave={(name) => {
            const id = onCreateFolder(name, creating);
            if (id) setTarget(id);
            return !!id;
          }}
        />
      )}
    </>
  );
}
export function AssetDeleteDialog({ count, folderCount, onClose, onSave }) {
  const [error, setError] = useState('');
  return (
    <Modal title="删除资产" className="asset-library-delete-dialog" onClose={onClose}>
      <h2>{folderCount ? '删除文件夹' : '删除资产'}</h2>
      <p>
        确定删除所选的 {folderCount ? `${folderCount} 个文件夹及其中` : ''}
        {count} 个资产？删除后无法恢复。
      </p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="soft-button" onClick={onClose}>
          取消
        </button>
        <button
          className="asset-library-danger-button"
          onClick={() => {
            try {
              if (onSave() !== false) onClose();
              else setError('删除失败，请重试');
            } catch (error) {
              setError(errorText(error));
            }
          }}
        >
          删除
        </button>
      </footer>
    </Modal>
  );
}

export function AssetFolderCoverDialog({ folder, library, onClose, onSave }) {
  const descendants = descendantFolderIds(library, folder.id);
  const candidates = library.assets.filter(
    (asset) =>
      !asset.deletedAt &&
      asset.type === 'image' &&
      asset.mimeType.startsWith('image/') &&
      asset.folderId &&
      descendants.has(asset.folderId),
  );
  const current = candidates.find((asset) => asset.url === folder.coverUrl)?.id || null;
  const [assetId, setAssetId] = useState(current);
  const [error, setError] = useState('');
  return (
    <Modal title="设置文件夹封面" className="asset-library-folder-cover-dialog" onClose={onClose}>
      <h2>设置文件夹封面</h2>
      <p className="muted">从当前文件夹及其子文件夹的图片资产中选择封面。</p>
      <div className="asset-library-cover-choices" role="group" aria-label="文件夹封面候选">
        <button
          type="button"
          className={!assetId ? 'active' : ''}
          aria-pressed={!assetId}
          onClick={() => setAssetId(null)}
        >
          <span className="asset-library-cover-empty">
            <Icon name="folder" size={34} />
          </span>
          <span>不使用封面</span>
        </button>
        {candidates.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className={assetId === asset.id ? 'active' : ''}
            aria-label={`使用 ${asset.name} 作为封面`}
            aria-pressed={assetId === asset.id}
            onClick={() => setAssetId(asset.id)}
          >
            <img src={asset.thumbnailUrl || asset.url} alt="" />
            <span title={asset.name}>{asset.name}</span>
          </button>
        ))}
      </div>
      {!candidates.length && (
        <p className="asset-library-cover-empty-hint">当前文件夹暂无图片资产。</p>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="soft-button" onClick={onClose}>
          取消
        </button>
        <button
          className="white-button"
          onClick={() => {
            try {
              if (onSave(assetId) !== false) onClose();
              else setError('保存失败，请重试');
            } catch (error) {
              setError(errorText(error));
            }
          }}
        >
          保存
        </button>
      </footer>
    </Modal>
  );
}

export function AssetUploadDialog({ library, currentFolder, onClose, onSave, onCreateFolder }) {
  const uploads = useAssetUploads();
  const input = useRef(null);
  const [name, setName] = useState(null);
  const [folder, setFolder] = useState(currentFolder || library.folders[0]?.id || null);
  const [tags, setTags] = useState([]);
  const [creating, setCreating] = useState(undefined);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const ready = uploads.files.filter((item) => item.status === 'ready');
  const single = uploads.files.length === 1 ? uploads.files[0] : null;
  const singleName = name && single && name.id === single.id ? name.value : single?.name || '';
  const validName = !single || singleName.trim();
  const missingFolder =
    library.folders.length > 0 && folder && !library.folders.some((item) => item.id === folder);
  return (
    <>
      <Modal
        title="上传资产"
        className="asset-library-upload-dialog"
        onClose={onClose}
        closeOnClickOutside={false}
      >
        <h2>上传资产</h2>
        <div className="asset-library-upload-layout">
          <div
            className={`asset-library-upload-drop ${dragOver ? 'drag-over' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              uploads.addFiles(event.dataTransfer.files);
            }}
          >
            <button className="asset-library-file-trigger" onClick={() => input.current?.click()}>
              <Icon name="upload" size={32} />
              <strong>点击上传或拖拽文件到此处</strong>
              <span>支持 JPG、JPEG、PNG、MP4、MP3</span>
              <span>单个文件不超过 20 MB</span>
            </button>
            <input
              ref={input}
              type="file"
              aria-label="上传素材文件"
              multiple
              hidden
              accept={ASSET_UPLOAD_ACCEPT}
              onChange={(event) => {
                uploads.addFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <ul className="asset-library-upload-files">
              {uploads.files.map((file) => (
                <li key={file.id}>
                  <div>
                    {file.status === 'ready' && file.type === 'image' ? (
                      <img src={file.url} alt="" />
                    ) : (
                      <Icon
                        name={file.type === 'audio' ? 'audio-file' : 'assets-empty'}
                        size={28}
                      />
                    )}
                    <span title={file.fileName}>
                      {file.fileName}
                      <small>
                        {file.status === 'reading'
                          ? '读取中…'
                          : file.status === 'ready'
                            ? '已读取'
                            : file.error}
                      </small>
                    </span>
                  </div>
                  {file.status === 'error' && (
                    <button onClick={() => uploads.retryFile(file.id)}>重试</button>
                  )}
                  <button
                    aria-label={`移除 ${file.fileName}`}
                    onClick={() => uploads.removeFile(file.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="asset-library-upload-fields">
            {uploads.files.length === 1 && (
              <label>
                名称 <span className="required">*</span>
                <input
                  aria-label="资产名称"
                  maxLength={50}
                  value={singleName}
                  onChange={(event) => setName({ id: single.id, value: event.target.value })}
                />
              </label>
            )}
            <label>
              保存到文件夹 <span className="required">*</span>
            </label>
            {missingFolder && <p role="alert">原文件夹已被删除，请重新选择保存位置。</p>}
            {!library.folders.length ? (
              <div className="asset-library-default-folder">
                <Icon name="folder" />
                待整理<span>保存时创建</span>
              </div>
            ) : (
              <AssetFolderTree
                library={library}
                value={folder}
                onChange={setFolder}
                onCreate={setCreating}
              />
            )}
            <button className="soft-button" onClick={() => setCreating(null)}>
              <Icon name="add" size={14} />
              新建文件夹
            </button>
            <label>素材标签</label>
            <AssetTagChoices library={library} value={tags} onChange={setTags} />
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <footer>
          <span className="muted">本地演示资产保存在当前浏览器</span>
          <button className="soft-button" onClick={onClose}>
            取消
          </button>
          <button
            className="white-button"
            disabled={!ready.length || uploads.reading || !validName || !!missingFolder}
            onClick={() => {
              try {
                const files = ready.map((file) => ({
                  ...file,
                  name: validateName(single ? singleName : file.name, 50),
                }));
                if (onSave(files, library.folders.length ? folder : null, tags) !== false) {
                  if (ready.length === uploads.files.length) onClose();
                  else {
                    ready.forEach((file) => uploads.removeFile(file.id));
                    setName(null);
                    setError('其余文件未保存，可重试或移除；已保存的文件不会重复提交。');
                  }
                } else
                  setError(
                    '保存失败，本机存储空间可能不足。已读取的文件仍保留，可移除部分文件后重试。',
                  );
              } catch (error) {
                setError(errorText(error));
              }
            }}
          >
            保存{ready.length > 1 ? ` ${ready.length} 个资产` : ''}
          </button>
        </footer>
      </Modal>
      {creating !== undefined && (
        <AssetNameDialog
          title="新建文件夹"
          onClose={() => setCreating(undefined)}
          onSave={(label) => {
            const id = onCreateFolder(label, creating);
            if (id) setFolder(id);
            return !!id;
          }}
        />
      )}
    </>
  );
}
export function AssetPreviewDialog({
  item,
  library,
  onClose,
  onDownload,
  onCreateCanvas,
  onRename,
  onEditTags,
}) {
  const path = folderPath(library, item.folderId);
  return (
    <Modal title={item.name} className="asset-library-preview-dialog" onClose={onClose}>
      <div className="asset-library-preview-media">
        <AssetMedia key={`${item.id}:${item.url}`} item={item} preview />
      </div>
      <div className="asset-library-preview-info">
        <h2>{item.name}</h2>
        <dl>
          <dt>所在文件夹</dt>
          <dd>{path.map((folder) => folder.name).join(' / ') || '个人素材库'}</dd>
          <dt>创建于</dt>
          <dd>{item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : '—'}</dd>
          <dt>素材类型</dt>
          <dd>
            {
              { image: '图片', video: '视频', audio: '音频', document: '文档', model: '模型' }[
                item.type
              ]
            }
          </dd>
          {!!item.bytes && (
            <>
              <dt>文件大小</dt>
              <dd>{(item.bytes / 1024 / 1024).toFixed(2)} MB</dd>
            </>
          )}
        </dl>
        <div className="asset-library-preview-tags">
          {assetTags(item).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <footer>
          <button className="soft-button" onClick={onRename}>
            重命名
          </button>
          <button className="soft-button" onClick={onEditTags}>
            编辑标签
          </button>
          <button className="soft-button" onClick={onDownload}>
            下载
          </button>
          <button className="white-button" onClick={onCreateCanvas}>
            创建画布并添加
          </button>
        </footer>
      </div>
    </Modal>
  );
}
