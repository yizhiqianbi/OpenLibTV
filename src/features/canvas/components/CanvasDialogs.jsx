import React from 'react';
import { EditorDialog as Dialog } from '../../../components/EditorDialog.jsx';
import { download } from '../../editor/browser.js';
import { typeInfo } from '../catalog.js';
import { mediaUrl } from '../model.js';
import { Download, Type, ArrowRight, Copy, Upload, FileText } from 'lucide-react';
export function CanvasDialogs(p) {
  const {
    dialog,
    agentDraft,
    agentConfig,
    messages,
    setDialog,
    nodes,
    edges,
    title,
    setTitle,
    view,
    search,
    setSearch,
    setSelected,
    fit,
    setPanel,
    shareUrl,
    setShareUrl,
    share,
    notify,
    library,
    libraryTab,
    setLibraryTab,
    fileInput,
    readonly,
    addNode,
    setNodes,
    src,
    getSnapshot,
  } = p;
  const close = () => setDialog(null);
  if (dialog === 'shortcuts')
    return (
      <Dialog title="快捷键" onClose={close} wide>
        <div className="cv-shortcuts">
          {[
            [
              '创作',
              [
                ['文本节点', 'T'],
                ['图片节点', 'I'],
                ['视频节点', 'F'],
                ['复制', '⌘ C'],
                ['粘贴', '⌘ V'],
                ['创建副本', '⌘ D'],
                ['删除节点', 'Delete'],
              ],
            ],
            [
              '缩放',
              [
                ['适应画布', '1'],
                ['恢复 100%', '0'],
                ['缩放画布', '⌘ + 滚轮'],
              ],
            ],
            [
              '移动画布',
              [
                ['选择工具', 'V'],
                ['抓手工具', 'H'],
                ['移动画布', 'Space + 拖拽'],
                ['撤销', '⌘ Z'],
                ['重做', '⇧ ⌘ Z'],
                ['取消选择', 'Esc'],
              ],
            ],
          ].map(([heading, items]) => (
            <section key={heading}>
              <h3>{heading}</h3>
              {items.map(([a, b]) => (
                <div key={a}>
                  <span>{a}</span>
                  <kbd>{b}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Dialog>
    );
  if (dialog === 'share')
    return (
      <Dialog title="分享项目" onClose={close}>
        <p className="cv-dialog-copy">获得链接的人可以查看分享快照。后续修改需要更新分享内容。</p>
        <label className="cv-share-control">
          <span>公开访问</span>
          <input
            type="checkbox"
            checked={!!shareUrl}
            onChange={(e) => {
              if (e.target.checked) share();
              else setShareUrl('');
            }}
          />
        </label>
        {shareUrl && (
          <div className="cv-copy-field">
            <input readOnly value={shareUrl} />
            <button
              aria-label="复制分享链接"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  notify('已复制');
                } catch {
                  notify('复制失败，请手动复制分享链接');
                }
              }}
            >
              <Copy size={16} />
            </button>
          </div>
        )}
        <button className="cv-wide-primary" onClick={share}>
          {shareUrl ? '同步最新内容' : '开启分享并复制链接'}
        </button>
      </Dialog>
    );
  if (dialog === 'export')
    return (
      <Dialog title="导出画布" onClose={close}>
        <div className="cv-export-options">
          <button
            onClick={() => {
              download(
                title + '.json',
                JSON.stringify(
                  getSnapshot?.() || {
                    title,
                    nodes,
                    edges,
                    view,
                    agentDraft,
                    messages,
                    agentConfig,
                  },
                  null,
                  2,
                ),
              );
              close();
              notify('画布已导出');
            }}
          >
            <FileText size={26} />
            <span>
              画布文件<small>保存节点、连线与生成参数</small>
            </span>
            <Download size={18} />
          </button>
          <button
            onClick={() => {
              download(
                title + '.txt',
                (getSnapshot?.().nodes || nodes)
                  .map(
                    (n) =>
                      `${n.data.name || typeInfo(n.type).label}\n${n.data.text || n.data.params?.prompt || ''}`,
                  )
                  .join('\n\n'),
                'text/plain',
              );
              close();
            }}
          >
            <Type size={26} />
            <span>
              提示词与文本<small>导出画布的全部创作文本</small>
            </span>
            <Download size={18} />
          </button>
        </div>
      </Dialog>
    );
  if (dialog === 'publish')
    return (
      <Dialog title="发布作品" onClose={close}>
        <label className="cv-modal-label">
          作品标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="cv-modal-label">
          作品简介
          <textarea rows={4} placeholder="分享作品的故事与创作过程" />
        </label>
        <button
          className="cv-wide-primary"
          onClick={() => notify('发布服务未连接，作品仍保存在本机')}
        >
          发布作品
        </button>
      </Dialog>
    );
  if (dialog === 'search')
    return (
      <Dialog title="搜索节点" onClose={close}>
        <input
          className="cv-search-input"
          autoFocus
          placeholder="搜索节点名称或提示词"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="cv-search-results">
          {nodes
            .filter((n) => JSON.stringify(n.data).toLowerCase().includes(search.toLowerCase()))
            .slice(0, 80)
            .map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setSelected([n.id]);
                  fit([n]);
                  close();
                  setPanel(n.id);
                }}
              >
                {React.createElement(typeInfo(n.type).icon, { size: 17 })}
                <span>{n.data.name || typeInfo(n.type).label}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          {!nodes.length && <p>暂无节点</p>}
        </div>
      </Dialog>
    );
  if (dialog === 'assets')
    return (
      <Dialog title="资产库" onClose={close} wide>
        <nav className="cv-library-tabs">
          {['图片', '视频', '音频', '角色'].map((x) => (
            <button
              className={libraryTab === x ? 'active' : ''}
              key={x}
              onClick={() => setLibraryTab(x)}
            >
              {x}
            </button>
          ))}
          <button onClick={() => fileInput.current?.click()}>
            <Upload size={15} />
            上传
          </button>
        </nav>
        <div className="cv-library-grid">
          {library.slice(0, 36).map((item, i) => {
            const url = libraryTab === '视频' ? item.finalOutput : item.coverUrl;
            return (
              <button
                key={item.templateUuid || i}
                onClick={() => {
                  if (readonly) {
                    notify('只读模式');
                    return;
                  }
                  const n = addNode(libraryTab === '视频' ? 'video' : 'image');
                  if (n) {
                    setNodes((list) =>
                      list.map((x) =>
                        x.id === n.id
                          ? { ...x, data: { ...x.data, name: item.name || '素材', url: [url] } }
                          : x,
                      ),
                    );
                    close();
                  }
                }}
              >
                <img src={src(item.coverUrl)} alt={item.name || '素材'} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </Dialog>
    );
  if (dialog?.preview)
    return (
      <Dialog title={dialog.preview.data.name || '预览'} onClose={close} wide>
        <div className="cv-full-preview">
          {dialog.preview.type === 'image' ? (
            <img src={src(mediaUrl(dialog.preview))} alt="预览" />
          ) : dialog.preview.type === 'audio' ? (
            <audio controls tabIndex={0} autoPlay src={src(mediaUrl(dialog.preview))} />
          ) : (
            <video controls tabIndex={0} autoPlay src={src(mediaUrl(dialog.preview))} />
          )}
        </div>
      </Dialog>
    );
  return null;
}
