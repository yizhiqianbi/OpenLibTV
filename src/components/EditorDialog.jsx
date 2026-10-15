import { DialogFocusBoundary } from './DialogFocusBoundary.jsx';
import { useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogBehavior } from '../hooks/useDialogBehavior.js';

/** Modal used by the canvas and studio without changing the site-wide modal. */
export function EditorDialog({
  title,
  titleActions,
  children,
  onClose,
  wide = false,
  closeOnBackdrop = true,
  showCloseButton = true,
  className = '',
  overlayClassName = '',
}) {
  const container = useRef();
  useDialogBehavior(container, { onClose });
  return (
    <div
      className={'cv-modal-overlay ' + overlayClassName}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={container}
        className={'cv-dialog ' + (wide ? 'cv-dialog-wide ' : '') + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <DialogFocusBoundary edge="start" />
        <header>
          <h2>{title}</h2>
          {titleActions}
          {onClose && showCloseButton && (
            <button aria-label="关闭" onClick={onClose}>
              <X size={18} />
            </button>
          )}
        </header>
        {children}
        <DialogFocusBoundary edge="end" />
      </section>
    </div>
  );
}
