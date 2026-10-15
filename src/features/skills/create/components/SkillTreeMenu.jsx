import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '../../../../hooks/useDialogBehavior.js';

export default function SkillTreeMenu({ items, onClose, x = 0, y = 0, label }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose, initialFocus: 'first' });
  return createPortal(
    <div
      className="secondary-skill-menu-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="menu"
        aria-label={label}
        className="secondary-skill-tree-menu"
        style={{
          left: Math.max(8, Math.min(x, window.innerWidth - 148)),
          top: Math.max(8, Math.min(y, window.innerHeight - items.length * 34 - 16)),
        }}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const fields = [...ref.current.querySelectorAll('button:not(:disabled)')];
          const index = fields.indexOf(document.activeElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? fields.length - 1
                : (index + (event.key === 'ArrowUp' ? -1 : 1) + fields.length) % fields.length;
          fields[next]?.focus();
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              onClose();
              item.action();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
