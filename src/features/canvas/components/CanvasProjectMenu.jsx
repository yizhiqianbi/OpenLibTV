import { Plus, FolderOpen, Download, Copy, Pencil } from 'lucide-react';
import { createLocalId as uid } from '../../editor/model.js';
export function CanvasProjectMenu({ copyCanvas, navigate, setDialog, setMenu, setRename }) {
  return (
    <div className="cv-project-menu cv-floating">
      <button
        onClick={() => {
          setRename(true);
          setMenu(null);
        }}
      >
        <Pencil size={15} />
        重命名项目
      </button>
      <button
        onClick={() => {
          setMenu(null);
          copyCanvas();
        }}
      >
        <Copy size={15} />
        创建副本
      </button>
      <button
        onClick={() => {
          setMenu(null);
          setDialog('export');
        }}
      >
        <Download size={15} />
        导出画布
      </button>
      <button onClick={() => navigate?.('/project')}>
        <FolderOpen size={15} />
        全部项目
      </button>
      <hr />
      <button
        onClick={() => {
          navigate?.('/canvas?projectId=' + uid());
          setMenu(null);
        }}
      >
        <Plus size={15} />
        新建项目
      </button>
    </div>
  );
}
