import React, { useEffect, useRef, useState } from 'react';
import Icon from '../../../components/Icon.jsx';

export default function AssetLibraryMenu({ label = '更多操作', children, primary = false, items }) {
  const [open, setOpen] = useState(false);
  const element = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!element.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        element.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const hover = (value) => {
    if (!primary) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(value), value ? 80 : 160);
  };
  return (
    <div
      ref={element}
      className={`asset-library-menu ${primary ? 'primary' : ''}`}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
    >
      <button
        className={primary ? 'white-button' : 'icon-button'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          clearTimeout(timer.current);
          setOpen((value) => !value);
        }}
      >
        {children || <Icon name="more" />}
      </button>
      {open && (
        <div
          className="asset-library-menu-panel"
          role="menu"
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const options = Array.from(
              event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
            );
            const index = options.indexOf(document.activeElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
            options[next]?.focus();
          }}
        >
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.label}
              disabled={item.disabled}
              className={item.danger ? 'danger' : ''}
              title={item.reason}
              onClick={(event) => {
                event.stopPropagation();
                element.current?.querySelector('button')?.focus();
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
