import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';

const HEX = /^#[0-9a-f]{6}$/i;

function parseHex(value) {
  const normalized = HEX.test(value) ? value.slice(1) : 'bfc2c9';
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function hexFromRgb({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function RgbField({ label, value, onChange }) {
  const [draft, setDraft] = useState(null);
  const invalid =
    draft !== null &&
    (draft.trim() === '' || !/^\d+$/.test(draft) || Number(draft) < 0 || Number(draft) > 255);
  return (
    <label className={`cv-studio-color-rgb-field${invalid ? ' is-invalid' : ''}`}>
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min="0"
        max="255"
        step="1"
        value={draft ?? value}
        aria-invalid={invalid || undefined}
        onFocus={() => setDraft(String(value))}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          const next = event.target.valueAsNumber;
          if (Number.isInteger(next) && next >= 0 && next <= 255) onChange(next);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </label>
  );
}

/** Source-shaped non-modal color popover with HEX/RGB input and screen picker. */
export function StudioColorPicker({ label = '颜色', value = '#bfc2c9', onChange, onCommit }) {
  const color = HEX.test(value) ? value.toLowerCase() : '#bfc2c9';
  const [format, setFormat] = useState('hex');
  const [picking, setPicking] = useState(false);
  const [screenError, setScreenError] = useState('');
  const picker = useAgentToolbarPopover({
    width: 252,
    maxHeight: 430,
    closeOnOutsideScroll: false,
    onClose: onCommit,
  });
  const abort = useRef(null);
  useEffect(() => () => abort.current?.abort(), []);
  const rgb = useMemo(() => parseHex(color), [color]);
  const EyeDropper = typeof window !== 'undefined' ? window.EyeDropper : undefined;
  const commitColor = (next) => {
    if (typeof next !== 'string') return;
    const normalized = next.startsWith('#') ? next : `#${next}`;
    if (HEX.test(normalized)) onChange?.(normalized.toLowerCase());
  };
  const pickScreen = async () => {
    if (!EyeDropper || picking) return;
    const controller = new AbortController();
    abort.current = controller;
    setPicking(true);
    setScreenError('');
    try {
      const result = await new EyeDropper().open({ signal: controller.signal });
      if (!controller.signal.aborted) commitColor(result.sRGBHex);
    } catch (error) {
      if (!controller.signal.aborted && error?.name !== 'AbortError')
        setScreenError('无法读取屏幕颜色，请重试。');
    } finally {
      abort.current = null;
      if (!controller.signal.aborted) setPicking(false);
    }
  };
  const popover = picker.open
    ? createPortal(
        <div
          ref={picker.popoverRef}
          {...picker.popoverProps}
          style={picker.popoverStyle}
          className="cv-studio-color-popover"
          role="dialog"
          aria-label={`${label}选择器`}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <HexColorPicker color={color} onChange={commitColor} />
          <div className="cv-studio-color-tools">
            <button
              type="button"
              aria-label="从屏幕取色"
              title={EyeDropper ? '从屏幕取色' : '当前浏览器不支持屏幕取色'}
              disabled={!EyeDropper || picking}
              aria-busy={picking || undefined}
              onClick={() => void pickScreen()}
            >
              取色
            </button>
            <div className="cv-studio-color-tabs" role="tablist" aria-label="颜色格式">
              {['hex', 'rgb'].map((tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={format === tab}
                  key={tab}
                  onClick={() => setFormat(tab)}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {format === 'hex' ? (
            <label className="cv-studio-color-hex">
              <span aria-hidden="#">#</span>
              <HexColorInput
                aria-label={`${label} HEX`}
                color={color}
                prefixed={false}
                onChange={commitColor}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
          ) : (
            <div className="cv-studio-color-rgb">
              {Object.entries(rgb).map(([channel, channelValue]) => (
                <RgbField
                  key={channel}
                  label={channel.toUpperCase()}
                  value={channelValue}
                  onChange={(next) => commitColor(hexFromRgb({ ...rgb, [channel]: next }))}
                />
              ))}
            </div>
          )}
          {screenError && <p role="alert">{screenError}</p>}
        </div>,
        document.body,
      )
    : null;
  return (
    <div className="cv-studio-color-picker" data-color-row>
      <span>{label}</span>
      <div className="cv-studio-color-control">
        <input
          type="color"
          aria-label={label}
          value={color}
          onChange={(event) => onChange?.(event.target.value.toLowerCase())}
          onBlur={onCommit}
        />
        <button
          type="button"
          ref={picker.triggerRef}
          {...picker.triggerProps}
          className="cv-studio-color-trigger"
          aria-label={`${label}：${color}。打开颜色选择器`}
        >
          <span aria-hidden style={{ backgroundColor: color }} />
          <strong>{color.toUpperCase()}</strong>
        </button>
      </div>
      {popover}
    </div>
  );
}
