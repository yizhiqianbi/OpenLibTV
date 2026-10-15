import React, { useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import {
  assetTags,
  entryKey,
  selectedLibraryEntries,
} from '../../../services/asset-library/model.ts';
import AssetLibraryMenu from './AssetLibraryMenu.jsx';
import AssetMedia from './AssetMedia.jsx';
import { ASSET_LIBRARY_DRAG_TYPE } from '../hooks/useAssetLibraryController.js';

function FolderCover({ folder }) {
  const [failed, setFailed] = useState(false);
  if (folder.coverUrl && !failed)
    return <img src={folder.coverUrl} alt="" aria-hidden="true" onError={() => setFailed(true)} />;
  return <Icon name="folder" size={62} />;
}

export default function AssetLibraryCard({ entry, controller: c, user }) {
  const key = entryKey(entry);
  const item = entry.value;
  const isFolder = entry.kind === 'folder';
  const members = isFolder ? selectedLibraryEntries(c.library, [key]).assets : [];
  const count = members.filter((item) =>
    c.selection.assets.some((chosen) => chosen.id === item.id),
  ).length;
  const checked =
    c.selected.includes(key) ||
    (isFolder && members.length > 0 && count === members.length) ||
    (!isFolder && c.selection.assets.some((chosen) => chosen.id === item.id));
  const menu = [
    { label: '重命名', onClick: () => c.show('rename', [key], { entry }) },
    { label: '移动到', onClick: () => c.show('move', [key]) },
    ...(!isFolder
      ? [{ label: '编辑标签', onClick: () => c.show('tags', [key], { initial: assetTags(item) }) }]
      : [
          {
            label: '设置封面',
            onClick: () => c.show('folder-cover', [key], { entry }),
          },
        ]),
    { label: '下载', disabled: c.busy, onClick: () => c.download([key]) },
    {
      label: '创建画布并添加',
      disabled: isFolder && !members.length,
      onClick: () => c.createCanvas([key]),
    },
    { label: '批量操作', onClick: () => c.enterBatch(key) },
    { label: '删除', danger: true, onClick: () => c.show('delete', [key]) },
  ];
  return (
    <article
      className={`asset-library-card ${checked && c.batch ? 'selected' : ''} ${c.dropTarget === item.id ? 'drop-target' : ''}`}
      draggable={!!user && !c.batch}
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_LIBRARY_DRAG_TYPE, JSON.stringify([key]));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => c.setDropTarget(null)}
      onDragOver={(event) => {
        if (isFolder && event.dataTransfer.types.includes(ASSET_LIBRARY_DRAG_TYPE)) {
          event.preventDefault();
          c.setDropTarget(item.id);
        }
      }}
      onDragLeave={() => {
        if (c.dropTarget === item.id) c.setDropTarget(null);
      }}
      onDrop={isFolder ? (event) => c.drop(event, item.id) : undefined}
    >
      <div className="asset-library-card-cover">
        <button
          className="asset-library-card-open"
          aria-label={isFolder ? `打开文件夹 ${item.name}` : `预览资产 ${item.name}`}
          onClick={() =>
            c.batch ? c.select(key) : isFolder ? c.changeFolder(item.id) : c.setPreview(item.id)
          }
        >
          {isFolder ? (
            <FolderCover folder={item} />
          ) : (
            <AssetMedia key={`${item.id}:${item.url}`} item={item} />
          )}
          {!isFolder && item.type === 'video' && (
            <span className="asset-library-video-mark">
              <Icon name="play-f" size={24} />
            </span>
          )}
        </button>
        {c.batch ? (
          <label className="asset-library-card-select">
            <input
              type="checkbox"
              aria-label={`选择 ${item.name}`}
              checked={checked}
              ref={(element) => {
                if (element)
                  element.indeterminate = isFolder && count > 0 && count < members.length;
              }}
              onChange={() => c.select(key)}
            />
          </label>
        ) : (
          <AssetLibraryMenu label={`${item.name} 更多操作`} items={menu} />
        )}
      </div>
      <p title={item.name}>{item.name}</p>
      {!isFolder && <small>{assetTags(item).join(' · ')}</small>}
    </article>
  );
}
