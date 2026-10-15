import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DialogFocusBoundary } from '../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import './ScriptRegenerateConfirmation.css';

/** 944733 compact confirm; the unavailable writer never clears or rewrites the script. */
export function ScriptRegenerateConfirmation({ onClose }) {
  const dialog = useRef(null);
  const unavailableId = useId();
  useDialogBehavior(dialog, { onClose });
  return createPortal(
    <div
      className="cv-script-regenerate-overlay"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        ref={dialog}
        className="cv-script-regenerate-confirm"
        role="dialog"
        aria-modal="true"
        aria-label="重新生成脚本"
        tabIndex={-1}
      >
        <DialogFocusBoundary edge="start" />
        <h2>重新生成脚本</h2>
        <p>重新生成会覆盖当前脚本内容及最终提示词，是否继续？</p>
        <p id={unavailableId} className="cv-script-regenerate-unavailable" role="status">
          脚本生成服务尚未连接，当前脚本已保留
        </p>
        <div className="cv-script-regenerate-buttons">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="cv-script-regenerate-start"
            disabled
            aria-describedby={unavailableId}
          >
            开始生成
          </button>
        </div>
        <DialogFocusBoundary edge="end" />
      </section>
    </div>,
    document.body,
  );
}
