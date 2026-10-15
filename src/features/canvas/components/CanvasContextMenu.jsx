import {
  ChevronRight,
  Plus,
  Upload,
  Maximize,
  Settings2,
  Trash2,
  Copy,
  HelpCircle,
} from 'lucide-react';
import { isCanvasGroup } from '../domain/groups.js';
export function CanvasContextMenu({
  context,
  contextNode,
  duplicate,
  fileInput,
  fit,
  remove,
  setContext,
  setDialog,
  setMenu,
  setPanel,
}) {
  return (
    <div
      className="cv-context cv-floating"
      style={{
        left: Math.min(context.x, window.innerWidth - 230),
        top: Math.min(context.y, window.innerHeight - 250),
      }}
    >
      {context.nodeId ? (
        <>
          {!isCanvasGroup(contextNode) && (
            <button
              onClick={() => {
                setPanel(context.nodeId);
                setContext(null);
              }}
            >
              <Settings2 size={15} />
              节点设置
            </button>
          )}
          <button
            onClick={() => {
              duplicate([context.nodeId]);
              setContext(null);
            }}
          >
            <Copy size={15} />
            创建副本 <small>⌘D</small>
          </button>
          <button
            onClick={() => {
              remove([context.nodeId], { trigger: 'menu' });
              setContext(null);
            }}
          >
            <Trash2 size={15} />
            删除 <small>⌫</small>
          </button>
        </>
      ) : (
        <>
          <button onClick={() => setMenu('add')}>
            <Plus size={15} />
            添加节点
            <ChevronRight size={13} />
          </button>
          <button
            onClick={() => {
              fileInput.current?.click();
              setContext(null);
            }}
          >
            <Upload size={15} />
            上传素材
          </button>
          <button
            onClick={() => {
              fit();
              setContext(null);
            }}
          >
            <Maximize size={15} />
            适应画布
          </button>
          <button
            onClick={() => {
              setDialog('shortcuts');
              setContext(null);
            }}
          >
            <HelpCircle size={15} />
            快捷键
          </button>
        </>
      )}
    </div>
  );
}
