import React, { Fragment, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import { PLAYBACK_RATES } from './player-model.js';
import './player-drawers.css';

export function PlayerDrawer({ title, onClose, children, sheet = false }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose });
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className={`academy-player-drawer-overlay ${sheet ? 'is-sheet' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="academy-player-drawer-panel">
        <header>
          <h3>{title}</h3>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={sheet ? 16 : 12} />
          </button>
        </header>
        <div className="academy-player-drawer-content">{children}</div>
      </section>
    </div>
  );
}

function SettingsRow({ label, options }) {
  return (
    <div className="academy-player-settings-row">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        {options.map((option, index) => (
          <Fragment key={option.key}>
            {index > 0 && <span className="academy-player-option-divider" aria-hidden="true" />}
            <button type="button" aria-pressed={option.active} onClick={option.onClick}>
              {option.label}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function PlayerSettings({
  rate,
  quality,
  qualities,
  onRateChange,
  onQualityChange,
  onClose,
  landscape = false,
}) {
  return (
    <PlayerDrawer title="视频设置" onClose={onClose} sheet={!landscape}>
      <SettingsRow
        label="倍速"
        options={PLAYBACK_RATES.map((value) => ({
          key: value,
          label: `${value}x`,
          active: rate === value,
          onClick: () => onRateChange(value),
        }))}
      />
      {qualities.length > 1 && (
        <SettingsRow
          label="清晰度"
          options={qualities.map((entry) => ({
            key: entry.index,
            label: entry.height ? `${entry.height}P` : entry.label,
            active: entry.index === quality.index,
            onClick: () => onQualityChange(entry.height),
          }))}
        />
      )}
    </PlayerDrawer>
  );
}
