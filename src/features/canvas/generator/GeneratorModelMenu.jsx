import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';

export default function GeneratorModelMenu({
  model,
  models,
  modelKeys,
  disabled,
  onChange,
  portalTarget,
  renderIcon,
  menuClassName = '',
}) {
  const menu = useAgentToolbarPopover({ width: 360, maxHeight: 400, offset: 4, disabled });
  const entries = Object.entries(models)
    .filter(([key]) => !modelKeys || modelKeys.includes(key))
    .sort((a, b) => Number(!!a[1].disabled) - Number(!!b[1].disabled));
  const current = models[model];
  useLayoutEffect(() => {
    if (!menu.open) return;
    const frame = requestAnimationFrame(() =>
      menu.popoverRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [menu.open, menu.popoverRef]);
  return (
    <>
      <button
        type="button"
        aria-label="选择生成模型"
        aria-haspopup="listbox"
        disabled={disabled}
        ref={menu.triggerRef}
        {...menu.triggerProps}
        className="cv-inline-model-trigger"
      >
        {renderIcon?.(current, 16) || <Sparkles size={16} />}
        <span>{current?.aliasName || current?.modelName || model || '选择模型'}</span>
        <ChevronDown size={14} />
      </button>
      {menu.open &&
        createPortal(
          <div
            ref={menu.popoverRef}
            {...menu.popoverProps}
            className={`cv-inline-model-menu ${menuClassName}`.trim()}
            style={menu.popoverStyle}
            role="listbox"
            aria-label="生成模型"
          >
            {entries.map(([key, item]) => (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={key === model}
                disabled={!!item.disabled}
                title={item.disabledReason}
                onClick={() => {
                  onChange(key);
                  menu.close();
                }}
              >
                <span className="cv-inline-model-icon">
                  {renderIcon?.(item, 18) || <Sparkles size={18} />}
                </span>
                <span>
                  <strong>{item.aliasName || item.modelName || key}</strong>
                  {item.description && <small>{item.description}</small>}
                </span>
                {key === model && <Check size={15} />}
              </button>
            ))}
          </div>,
          portalTarget?.() || document.body,
        )}
    </>
  );
}
