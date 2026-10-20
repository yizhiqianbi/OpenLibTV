import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Upload } from 'lucide-react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import { useContent } from '../../../hooks/useContent.ts';

function SlotHistory({ onClose, onPick, src }) {
  const content = useContent('gallery', []);
  const data = content.data;
  const items = Array.isArray(data)
    ? data
    : data?.items || data?.list || data?.data?.items || data?.data?.list || [];
  return (
    <EditorDialog title="从历史记录中选择" onClose={onClose} wide>
      {content.loading ? (
        <p role="status">正在加载图片…</p>
      ) : content.error ? (
        <div role="alert">
          <p>图片加载失败</p>
          <button onClick={content.reload}>重试</button>
        </div>
      ) : (
        <div className="cv-library-grid">
          {items.slice(0, 36).map((item, index) => (
            <button
              key={item.templateUuid || index}
              type="button"
              onClick={() => {
                if (onPick(item)) onClose();
              }}
            >
              <img
                src={src(item.thumbnailUrl || item.coverUrl || item.imageUrl || item.url)}
                alt={item.name || '图片'}
              />
              <span>{item.name || '图片'}</span>
            </button>
          ))}
          {!items.length && <p>暂无图片</p>}
        </div>
      )}
    </EditorDialog>
  );
}

/** The non-modal source slot menu shares popover dismissal and the common dialog stack. */
export function StoryboardSlotPicker({ slots, request, src }) {
  const file = useRef(null);
  const fileOwner = useRef(null);
  const [history, setHistory] = useState(false);
  const popover = useAgentToolbarPopover({ width: 218, maxHeight: 120, disabled: !slots.target });
  const openPopover = popover.openPopover;
  useEffect(() => {
    if (!slots.target) setHistory(false);
  }, [slots.target]);
  useEffect(() => {
    setHistory(false);
  }, [request]);
  useEffect(() => {
    if (!request?.element?.isConnected || !slots.target) return;
    popover.triggerRef.current = request.element;
    openPopover({ focus: request.focus });
  }, [request, slots.target, openPopover, popover.triggerRef]);
  const close = () => {
    setHistory(false);
    slots.close(slots.target);
  };
  return (
    <>
      {popover.open &&
        createPortal(
          <div
            ref={popover.popoverRef}
            {...popover.popoverProps}
            style={popover.popoverStyle}
            className="cv-storyboard-slot-menu cv-floating"
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              disabled={slots.busy}
              onClick={() => {
                popover.close({ restoreFocus: true });
                fileOwner.current = slots.target;
                file.current?.click();
              }}
            >
              <Upload size={15} />
              从本地上传图片
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                popover.close({ restoreFocus: true });
                setHistory(true);
              }}
            >
              <History size={15} />
              从历史记录中选择
            </button>
          </div>,
          document.body,
        )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        aria-label="上传分镜图片"
        hidden
        onChange={async (event) => {
          const owner = fileOwner.current;
          fileOwner.current = null;
          const image = event.target.files?.[0];
          event.target.value = '';
          if (image && owner && (await slots.upload(image, owner)) && slots.isCurrent(owner)) {
            setHistory(false);
            slots.close(owner);
          }
        }}
      />
      {history && slots.target && <SlotHistory src={src} onPick={slots.pick} onClose={close} />}
    </>
  );
}
