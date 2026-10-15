import { useId } from 'react';
import { createPortal } from 'react-dom';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import ToolbarIcon from './ToolbarIcon.jsx';
import ToolbarTooltip from './ToolbarTooltip.jsx';
import './toolbar.css';

const choices = [
  { dryRun: true, icon: 'prompt-composer-hand', label: '手动生成', description: '每次生成前询问' },
  { dryRun: false, icon: 'prompt-composer-auto', label: '自动生成', description: '可直接消耗积分' },
];

/** Controlled session mode. Caller owns preference/session persistence and server adapters. */
export default function CanvasAgentModePicker({
  dryRun = true,
  onSelect,
  disabled = false,
  agentName = 'Agent',
  trigger = 'click',
  saving = false,
  scope = 'session',
}) {
  const titleId = useId();
  const current = dryRun !== false;
  const choice = choices.find((value) => value.dryRun === current);
  const popover = useAgentToolbarPopover({ width: 240, maxHeight: 124, trigger, disabled });
  return (
    <>
      <ToolbarTooltip label={choice.label} withArrow>
        <button
          type="button"
          ref={popover.triggerRef}
          className="cv-agent-toolbar-trigger"
          disabled={disabled}
          aria-label={choice.label}
          {...popover.triggerProps}
        >
          <ToolbarIcon name={choice.icon} />
        </button>
      </ToolbarTooltip>
      {popover.open &&
        createPortal(
          <div
            ref={popover.popoverRef}
            {...popover.popoverProps}
            role="dialog"
            aria-labelledby={titleId}
            className="cv-agent-toolbar-popover cv-agent-mode-picker"
            style={popover.popoverStyle}
          >
            <span id={titleId} className="cv-agent-toolbar-sr-only">
              生成模式
            </span>
            <div className="cv-agent-mode-choices">
              {choices.map((value) => (
                <button
                  type="button"
                  key={String(value.dryRun)}
                  className="cv-agent-mode-choice"
                  aria-pressed={value.dryRun === current}
                  disabled={scope === 'userDefault' && saving}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (scope === 'userDefault' && saving) return;
                    onSelect?.(value.dryRun);
                    popover.close({ restoreFocus: true });
                  }}
                >
                  <ToolbarIcon name={value.icon} />
                  <span className="cv-agent-mode-copy">
                    <span>{value.label}</span>
                    <small>
                      {agentName} {value.description}
                    </small>
                  </span>
                  <span className="cv-agent-mode-check">
                    {value.dryRun === current && <ToolbarIcon name="check" size={14} />}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
