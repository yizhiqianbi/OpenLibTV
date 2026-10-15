import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ToolbarTooltip({
  label,
  children,
  position = 'top',
  maxWidth = 260,
  withArrow = false,
  className = '',
}) {
  const id = useId();
  const target = useRef(null);
  const tooltip = useRef(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState({ maxWidth });
  const [side, setSide] = useState(position);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = target.current?.getBoundingClientRect();
      const size = tooltip.current?.getBoundingClientRect();
      if (!rect || !size) return;
      const right = position === 'right';
      const placement = right
        ? rect.right + size.width + 16 > window.innerWidth
          ? 'left'
          : 'right'
        : rect.top - size.height - 8 < 8
          ? 'bottom'
          : 'top';
      setSide(placement);
      const left = right
        ? placement === 'right'
          ? rect.right + 8
          : rect.left - size.width - 8
        : rect.left + rect.width / 2 - size.width / 2;
      const top = right
        ? rect.top + rect.height / 2 - size.height / 2
        : placement === 'top'
          ? rect.top - size.height - 8
          : rect.bottom + 8;
      setStyle({
        maxWidth: Math.min(maxWidth, window.innerWidth - 16),
        left: Math.max(8, Math.min(left, window.innerWidth - size.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - size.height - 8)),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, position, maxWidth]);
  if (!label) return children;
  return (
    <span
      ref={target}
      className={`cv-agent-toolbar-tooltip-target ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className={`cv-agent-toolbar-tooltip ${withArrow ? 'cv-agent-toolbar-tooltip-arrow' : ''}`}
            data-side={side}
            style={style}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
