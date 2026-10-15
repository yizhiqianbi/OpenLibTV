import { DialogFocusBoundary } from './DialogFocusBoundary.jsx';
import React, { useRef } from 'react';
import Icon from './Icon.jsx';
import { useDialogBehavior } from '../hooks/useDialogBehavior.js';
export default function Modal({
  children,
  onClose,
  className = '',
  title,
  closeButton = true,
  closeOnClickOutside = true,
  closeOnEscape = true,
}) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose, closeOnEscape });
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnClickOutside && e.target === e.currentTarget) onClose?.();
      }}
    >
      <section
        ref={ref}
        tabIndex={-1}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || '弹窗'}
      >
        <DialogFocusBoundary edge="start" />
        {closeButton && (
          <button className="modal-close icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={20} />
          </button>
        )}
        {children}
        <DialogFocusBoundary edge="end" />
      </section>
    </div>
  );
}
