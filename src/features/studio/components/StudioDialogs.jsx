import { Download, Sparkles } from 'lucide-react';
import { EditorDialog as StudioModal } from '../../../components/EditorDialog.jsx';
import { download as saveFile } from '../../editor/browser.js';
import { deleteStudioDocument } from '../persistence.js';
export function StudioDialogs({
  busy,
  dialog,
  duration,
  exportGLB,
  exportType,
  frames,
  id,
  navigate,
  notify,
  objects,
  onProjectDeleted,
  ratio,
  screenshot,
  setDialog,
  setExportType,
  share,
  title,
  toCanvas,
}) {
  return (
    <>
      {dialog === 'export' && (
        <StudioModal title="导出" onClose={() => setDialog(null)}>
          <nav className="cv-studio-export-tabs">
            {[
              ['image', '图片'],
              ['video', '视频'],
              ['asset', '3D 资产'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={exportType === key ? 'active' : ''}
                onClick={() => setExportType(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="cv-studio-export-field">
            <span>格式</span>
            <strong>
              {exportType === 'image' ? 'PNG' : exportType === 'video' ? 'WEBM' : 'GLB'}
            </strong>
          </div>
          <div className="cv-studio-export-field">
            <span>分辨率</span>
            <strong>当前视窗</strong>
          </div>
          {exportType === 'video' && (
            <p className="cv-dialog-copy">
              {frames.length
                ? '动画视频导出暂不可用，可导出 GLB 或 PNG。'
                : '当前场景没有动画，无法导出视频或转交画布'}
            </p>
          )}
          <div className="cv-studio-export-footer">
            <button
              disabled={busy || exportType === 'video'}
              onClick={() => {
                exportType === 'asset' ? exportGLB() : screenshot();
              }}
            >
              <Download size={15} />
              下载
            </button>
            {exportType === 'image' && (
              <button className="canvas" onClick={toCanvas}>
                <Sparkles size={15} />
                去画布生成
              </button>
            )}
          </div>
        </StudioModal>
      )}
      {dialog === 'share' && (
        <StudioModal title="分享项目" onClose={() => setDialog(null)}>
          <p className="cv-dialog-copy">个人项目链接，访问仍受项目权限限制。</p>
          <input
            className="cv-search-input"
            readOnly
            value={window.location.origin + '/animation-preview?projectId=' + id}
          />
          <button className="cv-wide-primary" onClick={share}>
            复制链接
          </button>
        </StudioModal>
      )}
      {dialog === 'history' && (
        <StudioModal title="已保存的版本" onClose={() => setDialog(null)}>
          <p className="cv-dialog-copy">当前项目已保存到此浏览器</p>
          <button
            className="cv-wide-primary"
            onClick={() => {
              saveFile(
                title + '.json',
                JSON.stringify({ title, objects, frames, duration, ratio }, null, 2),
                'application/json',
              );
              setDialog(null);
            }}
          >
            导出版本
          </button>
        </StudioModal>
      )}
      {dialog === 'delete' && (
        <StudioModal title="删除 3D-BOX" onClose={() => setDialog(null)}>
          <p className="cv-dialog-copy">确定删除“{title}”吗？删除后无法恢复。</p>
          <button
            className="cv-wide-primary"
            onClick={() => {
              try {
                deleteStudioDocument(id);
                onProjectDeleted?.();
                navigate?.('/3d-box');
              } catch {
                notify('删除失败，请检查浏览器存储空间。');
              }
            }}
          >
            删除
          </button>
        </StudioModal>
      )}
    </>
  );
}
