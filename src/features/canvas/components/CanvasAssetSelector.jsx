import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Grid2X2, Plus, Upload } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import { pickerAssetReferences, pickerAssetText } from '../../../services/asset-picker/model.ts';
import { canInsertAgentAssets, CHAT_ASSET_MAX_PER_KIND } from '../../../services/agent-assets.ts';
import './canvas-asset-selector.css';

const AssetPicker = lazy(() => import('../../../components/agent/AgentAssetPicker.jsx'));

export default function CanvasAssetSelector({
  inputRef,
  fileInput,
  readOnly,
  user,
  login,
  toast,
  onOpen,
  assetSource,
}) {
  const [library, setLibrary] = useState(false);
  const focusAfterPick = useRef(false);
  useEffect(() => {
    if (readOnly) setLibrary(false);
  }, [readOnly]);
  useEffect(() => {
    if (!library && focusAfterPick.current) {
      focusAfterPick.current = false;
      if (!readOnly) inputRef.current?.focus();
    }
  }, [library, readOnly, inputRef]);
  const menu = useAgentToolbarPopover({
    width: 160,
    maxHeight: 76,
    offset: 6,
    closeDelay: 400,
    closeOnOutsideScroll: true,
    disabled: readOnly,
    onOpen,
  });
  const requireUser = () => {
    if (readOnly) return false;
    if (user) return true;
    login?.();
    return false;
  };
  const pick = (items) => {
    if (!requireUser() || !inputRef.current) return false;
    const references = pickerAssetReferences(items);
    if (!canInsertAgentAssets(references)) {
      toast?.(`单次最多各选 ${CHAT_ASSET_MAX_PER_KIND} 个图片 / 视频 / 音频`);
      return false;
    }
    if (references.length) inputRef.current.insertReferences(references);
    else {
      const text = pickerAssetText(items);
      if (!text) {
        toast?.('素材内容不可用');
        return false;
      }
      inputRef.current.insertPlainText(text);
    }
    focusAfterPick.current = true;
    setLibrary(false);
    return true;
  };
  return (
    <div className="cv-agent-asset-selector">
      <button
        type="button"
        ref={menu.triggerRef}
        {...menu.triggerProps}
        title="上传参考素材"
        aria-label="添加参考素材"
        aria-haspopup="menu"
        disabled={readOnly}
      >
        <Plus size={18} />
      </button>
      {menu.open &&
        createPortal(
          <div
            ref={menu.popoverRef}
            {...menu.popoverProps}
            role="menu"
            aria-label="添加参考素材"
            className="cv-agent-asset-menu"
            style={menu.popoverStyle}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                if (!requireUser()) return;
                menu.close();
                fileInput.current?.click();
              }}
            >
              <Upload size={13} />
              <span>本地上传</span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="dialog"
              onClick={() => {
                if (!requireUser()) return;
                menu.close({ restoreFocus: true });
                setLibrary(true);
              }}
            >
              <Grid2X2 size={13} />
              <span>素材库添加</span>
            </button>
          </div>,
          document.body,
        )}
      {library && !readOnly && (
        <Suspense fallback={<span role="status">加载资产库...</span>}>
          <AssetPicker
            assetSource={assetSource}
            onClose={() => {
              setLibrary(false);
            }}
            onPickAssets={pick}
          />
        </Suspense>
      )}
    </div>
  );
}
