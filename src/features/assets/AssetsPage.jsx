import React from 'react';
import Icon from '../../components/Icon.jsx';
import { ListFilter } from 'lucide-react';
import { DEFAULT_ASSET_TAGS } from '../../services/asset-library/model.ts';
import {
  ASSET_LIBRARY_DRAG_TYPE,
  useAssetLibraryController,
} from './hooks/useAssetLibraryController.js';
import AssetLibraryCard from './components/AssetLibraryCard.jsx';
import AssetLibraryMenu from './components/AssetLibraryMenu.jsx';
import AssetLibraryOverlays from './components/AssetLibraryOverlays.jsx';
import './library.css';

export default function AssetsPage(props) {
  const c = useAssetLibraryController(props);
  const tags = [...new Set([...DEFAULT_ASSET_TAGS.map((item) => item.name), ...c.library.tags])];
  return (
    <div className="asset-library-page page-inner">
      <header className="asset-library-header">
        <h1>资产</h1>
      </header>
      <div className="asset-library-layout">
        <aside className="asset-library-sidebar">
          <button className="active" onClick={() => c.changeFolder(null)}>
            <Icon name="folder" />
            个人素材库
          </button>
        </aside>
        <section className="asset-library-content" aria-label="个人素材库">
          <div className="asset-library-toolbar">
            <nav
              aria-label="资产文件夹路径"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(ASSET_LIBRARY_DRAG_TYPE))
                  event.preventDefault();
              }}
              onDrop={(event) => c.drop(event, null)}
            >
              <button onClick={() => c.changeFolder(null)}>个人素材库</button>
              {c.path.map((item) => (
                <React.Fragment key={item.id}>
                  <Icon name="right-s" size={14} />
                  <button
                    onClick={() => c.changeFolder(item.id)}
                    onDragOver={(event) => {
                      if (event.dataTransfer.types.includes(ASSET_LIBRARY_DRAG_TYPE)) {
                        event.preventDefault();
                        event.stopPropagation();
                      }
                    }}
                    onDrop={(event) => {
                      event.stopPropagation();
                      c.drop(event, item.id);
                    }}
                  >
                    {item.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
            <div className="asset-library-tools">
              {c.searchOpen ? (
                <div className="asset-library-search">
                  <Icon name="search" size={14} />
                  <input
                    aria-label="搜索资产"
                    placeholder="搜索资产"
                    autoFocus
                    value={c.query}
                    onChange={(event) => c.setQuery(event.target.value)}
                  />
                  <button
                    aria-label="取消搜索"
                    onClick={() => {
                      c.setQuery('');
                      c.setSearchOpen(false);
                    }}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ) : (
                <button
                  className="icon-button"
                  aria-label="搜索"
                  onClick={() => c.setSearchOpen(true)}
                >
                  <Icon name="search" size={18} />
                </button>
              )}
              <button
                className={`icon-button ${c.tags.length ? 'active' : ''}`}
                aria-label="筛选素材类型"
                onClick={() => c.setDialog({ type: 'filter' })}
              >
                <ListFilter size={18} aria-hidden="true" />
                {c.tags.length > 0 && (
                  <span className="asset-library-filter-count">{c.tags.length}</span>
                )}
              </button>
              <AssetLibraryMenu
                primary
                label="新建"
                items={[
                  {
                    label: '新建文件夹',
                    icon: 'folder-add',
                    disabled: c.path.length >= 3,
                    reason: c.path.length >= 3 ? '二级文件夹下不可新建文件夹' : '',
                    onClick: () => c.show('create-folder', [], { parentId: c.folder }),
                  },
                  { label: '上传资产', icon: 'upload', onClick: () => c.show('upload') },
                ]}
              >
                <Icon name="add" size={16} />
                新建
              </AssetLibraryMenu>
            </div>
          </div>
          <div className="asset-library-tag-tabs" role="group" aria-label="素材标签">
            <button className={!c.tags.length ? 'active' : ''} onClick={() => c.applyTags([])}>
              全部
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                className={c.tags.length === 1 && c.tags[0] === tag ? 'active' : ''}
                onClick={() => c.applyTags([tag])}
              >
                {tag}
              </button>
            ))}
          </div>
          {(c.error || c.pathError) && (
            <div className="asset-library-error" role="alert">
              <p>{c.pathError || '资产库存储不可用，请重试。当前数据未被覆盖。'}</p>
              <button
                className="soft-button"
                onClick={() => (c.pathError ? c.changeFolder(null) : window.location.reload())}
              >
                {c.pathError ? '返回个人素材库' : '重新加载'}
              </button>
            </div>
          )}
          {!c.pathError && (
            <div className="asset-library-grid">
              {c.entries.slice(0, c.limit).map((entry) => (
                <AssetLibraryCard
                  key={`${entry.kind}:${entry.value.id}`}
                  entry={entry}
                  controller={c}
                  user={props.user}
                />
              ))}
              {!c.entries.length && (
                <div className="empty-state asset-library-empty">
                  <Icon name="assets-empty" size={72} />
                  <p>
                    {c.search.trim()
                      ? '未找到文件或文件夹'
                      : c.tags.length
                        ? '没有匹配的资产'
                        : '暂无资产'}
                  </p>
                  {c.search.trim() ? (
                    <>
                      <span>未找到匹配的资源，请尝试其他搜索词</span>
                      <button className="soft-button" onClick={() => c.setQuery('')}>
                        清空关键词
                      </button>
                    </>
                  ) : (
                    !c.tags.length && (
                      <button className="soft-button" onClick={() => c.show('upload')}>
                        上传资产
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
          {c.entries.length > c.limit && (
            <div ref={c.more} className="asset-library-more">
              <button className="soft-button" onClick={c.loadMore}>
                加载更多
              </button>
            </div>
          )}
          {c.batch && (
            <div className="asset-library-batch-bar">
              <span>
                已选择 {c.selection.assets.length} 个资产
                {c.selection.folders.length ? `，${c.selection.folders.length} 个文件夹` : ''}
              </span>
              <button
                disabled={!c.selected.length || c.busy}
                onClick={() => c.createCanvas(c.selected)}
              >
                创建画布并添加
              </button>
              <button
                disabled={!c.selected.length || c.busy}
                onClick={() => c.download(c.selected)}
              >
                {c.busy ? '下载中…' : '下载'}
              </button>
              <button disabled={!c.selected.length || c.busy} onClick={() => c.show('move')}>
                移动
              </button>
              <button
                disabled={!c.selection.assets.length || c.busy}
                onClick={() => c.show('tags', c.selected, { initial: [], batch: true })}
              >
                标签
              </button>
              <button disabled={!c.selected.length || c.busy} onClick={() => c.show('delete')}>
                删除
              </button>
              <button onClick={c.exitBatch}>退出</button>
            </div>
          )}
        </section>
      </div>
      <AssetLibraryOverlays controller={c} />
    </div>
  );
}
