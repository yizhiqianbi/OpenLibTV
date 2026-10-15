import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Maximize } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import './V2GenerationSelector.css';

const ratios = {
  '1:1': [11, 11],
  '4:3': [12, 9],
  '3:4': [9, 12],
  '3:2': [12, 8],
  '2:3': [8, 12],
  '16:9': [14, 8],
  '9:16': [8, 14],
  '2:1': [14, 7],
  '1:2': [7, 14],
  '21:9': [14, 6],
  '9:21': [6, 14],
  auto: [11, 11],
};
function caption(value) {
  if (value && typeof value === 'object') return value.zh ?? value['zh-CN'] ?? value.en ?? '';
  return value == null ? '' : String(value);
}
function ParameterIcon({ field, value }) {
  if (field.ratio || field.storedKey === 'aspectRatio' || field.key === 'aspectRatio') {
    const [width, height] = ratios[value] || [12, 9];
    return (
      <span className="cv-v2-generation-ratio-icon" aria-hidden="true">
        <span style={{ width, height }} />
      </span>
    );
  }
  if (field.key.startsWith('quality') || field.storedKey === 'quality')
    return (
      <span className="cv-v2-generation-quality-icon" aria-hidden="true">
        HD
      </span>
    );
  if (field.key.startsWith('resolution') || field.storedKey === 'resolution')
    return <Maximize size={14} aria-hidden="true" />;
  return null;
}
function useMenuPosition(menu) {
  const { open, triggerRef, popoverRef } = menu;
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    let frame;
    const place = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = popoverRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const width = Math.min(panel.width || 180, Math.max(1, window.innerWidth - 16));
      const below = Math.max(0, window.innerHeight - anchor.bottom - 12);
      const above = Math.max(0, anchor.top - 12);
      const height = Math.min(panel.height || 300, 300);
      const useBelow = below >= height || below >= above;
      const available = useBelow ? below : above;
      setPosition({
        position: 'fixed',
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
        top: useBelow
          ? anchor.bottom + 4
          : Math.max(8, anchor.top - 4 - Math.min(height, available)),
        maxHeight: Math.min(300, available),
        maxWidth: Math.max(1, window.innerWidth - 16),
        zIndex: 2000,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (triggerRef.current) observer?.observe(triggerRef.current);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [open, triggerRef, popoverRef]);
  return position || { position: 'fixed', visibility: 'hidden', zIndex: 2000 };
}
function Selector({
  label,
  value,
  options,
  onChange,
  disabled,
  icon,
  renderIcon,
  isCanvasLight,
  testId,
  title,
  portal,
  strictValues = false,
}) {
  const menu = useAgentToolbarPopover({ width: 180, maxHeight: 300, offset: 4, disabled });
  const position = useMenuPosition(menu);
  const matches = (candidate) =>
    strictValues ? candidate === value : String(candidate) === String(value);
  const selected = options.find((option) => matches(option.value));
  return (
    <>
      <button
        type="button"
        ref={menu.triggerRef}
        {...menu.triggerProps}
        aria-haspopup="menu"
        aria-label={label}
        className="cv-v2-generation-chip"
        disabled={disabled}
        title={title}
        data-testid={testId}
        data-selector-value={value}
      >
        {icon}
        <span>{caption(selected?.label) || String(value ?? '')}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {menu.open &&
        createPortal(
          <div
            ref={menu.popoverRef}
            {...menu.popoverProps}
            style={position}
            className={`cv-v2-generation-menu${isCanvasLight ? ' cv-v2-generation-light' : ''}`}
            role="menu"
            aria-label={label}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              const buttons = [
                ...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)'),
              ];
              if (!buttons.length) return;
              const index = buttons.indexOf(document.activeElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                      buttons.length;
              event.preventDefault();
              event.stopPropagation();
              buttons[next].focus();
            }}
          >
            {options.map((option) => (
              <button
                key={`${typeof option.value}:${String(option.value)}`}
                type="button"
                role="menuitem"
                disabled={option.disabled}
                title={option.disabledReason || option.reason}
                data-selected={matches(option.value)}
                onClick={() => {
                  if (option.disabled) return;
                  onChange?.(option.value);
                  menu.close({ restoreFocus: true });
                }}
              >
                {renderIcon?.(option)}
                <span>{caption(option.label) || String(option.value)}</span>
                {matches(option.value) && <Check size={12} aria-hidden="true" />}
              </button>
            ))}
          </div>,
          portal || document.body,
        )}
    </>
  );
}

export { caption as v2Caption, ParameterIcon as V2ParameterIcon, Selector as V2GenerationSelector };
