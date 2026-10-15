import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAgentToolbarPopover } from '../../../../hooks/useAgentToolbarPopover.js';
import './mark-prompt.css';

const stop = (event) => event.stopPropagation();

/** Menu for a current atomic DOM badge; no React root is created inside contentEditable. */
export default function MarkPromptBadge({
  anchor,
  part,
  disabled,
  onSelect,
  onClose,
  focus = false,
}) {
  const popover = useAgentToolbarPopover({
    width: 220,
    maxHeight: 209,
    offset: 4,
    disabled: disabled || !part || part.options.length <= 1,
    onClose,
  });
  const [placement, setPlacement] = useState(null);
  const { triggerRef, popoverRef, openPopover, close } = popover;
  useLayoutEffect(() => {
    triggerRef.current = anchor;
    if (anchor?.isConnected && !disabled && part?.options.length > 1) openPopover({ focus });
  }, [anchor, disabled, part?.options.length, focus, triggerRef, openPopover]);
  useLayoutEffect(() => {
    if (!popover.open) return;
    let frame;
    let current = true;
    const follow = () => {
      if (!current) return;
      if (!anchor?.isConnected) return close();
      const rect = anchor.getBoundingClientRect();
      const size = popoverRef.current?.getBoundingClientRect();
      if (size) {
        const width = size.width || 220;
        const height = size.height || 209;
        const below = window.innerHeight - rect.bottom - 4;
        const above = rect.top - 4;
        const top = below >= height || below >= above ? rect.bottom + 4 : rect.top - height - 4;
        const next = {
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          top: Math.max(8, top),
        };
        setPlacement((previous) =>
          previous?.left === next.left && previous?.top === next.top ? previous : next,
        );
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      current = false;
      cancelAnimationFrame(frame);
    };
  }, [popover.open, anchor, close, popoverRef]);
  if (!popover.open || !part || disabled) return null;
  return createPortal(
    <div
      {...popover.popoverProps}
      ref={popoverRef}
      role="menu"
      aria-label="元素建议"
      className="node-generator-magic-menu nodrag nopan nowheel"
      style={{
        ...popover.popoverStyle,
        width: 'max-content',
        maxWidth: 'min(220px, calc(100vw - 16px))',
        ...placement,
      }}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      {part.options.map((option) => (
        <button
          key={option.index}
          type="button"
          role="menuitemradio"
          aria-checked={option.index === part.magicIndex}
          disabled={typeof onSelect !== 'function'}
          onMouseDown={(event) => {
            event.preventDefault();
            if (event.button === 0 && anchor?.isConnected) {
              onSelect?.(part.magicId, option.index);
              close();
            }
          }}
          onClick={(event) => {
            if (event.detail === 0 && anchor?.isConnected) {
              onSelect?.(part.magicId, option.index);
              close();
            }
          }}
        >
          <span>{option.label}</span>
          {option.index === part.magicIndex && (
            <span className="node-generator-magic-current" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>,
    anchor.ownerDocument.body,
  );
}
