import { useCallback, useEffect, useState } from 'react';
import { MantineProvider, Slider } from '@mantine/core';
import { CircleHelp } from 'lucide-react';
import '@mantine/core/styles/Slider.css';

// A local provider keeps the original slider's interaction without installing
// another global theme, stylesheet reset, or browser preference store.
const colorSchemeManager = {
  get: () => 'dark',
  set: () => {},
  clear: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
};
const noRootElement = () => null;
const sliderStyles = {
  track: { '--slider-track-bg': '#a3a3a34d', backgroundColor: '#a3a3a34d' },
  thumb: {
    backgroundColor: 'white',
    borderWidth: '0.5px',
    borderColor: '#262626',
    boxShadow: 'none',
    transition: 'none',
  },
};
function formatted(value, step) {
  const digits = Number.isInteger(step) ? 0 : String(step).split('.')[1]?.length || 0;
  return digits ? value.toFixed(digits) : String(Math.round(value));
}

export default function GeneratorNumericSetting({
  label,
  title,
  property,
  value,
  advanced = false,
  disabled,
  onChange,
}) {
  const min = property.min ?? 0;
  const max = property.max ?? (advanced ? 1 : 100);
  const step = property.step ?? (advanced ? 0.1 : 1);
  const [draft, setDraft] = useState(advanced ? formatted(value, step) : String(value));
  const [range, setRange] = useState(value);
  useEffect(() => {
    setDraft(advanced ? formatted(value, step) : String(value));
    setRange(value);
  }, [value, step, advanced]);
  const commit = () => {
    if (disabled) return;
    const input = draft.trim();
    if (!input || !Number.isFinite(Number(input))) {
      setDraft(advanced ? formatted(range, step) : String(range));
      return;
    }
    const bounded = Math.min(max, Math.max(min, Number(input)));
    // The normal control rounds on blur; AdvancedSettings preserves decimals.
    const next = advanced ? bounded : Math.round(bounded / step) * step;
    setDraft(advanced ? formatted(next, step) : String(next));
    setRange(next);
    if (next !== value) onChange(next);
  };
  const previewSliderValue = useCallback(
    (next) => {
      setRange(next);
      if (!advanced) setDraft(String(next));
    },
    [advanced],
  );
  const labelView = (
    <div className="cv-generator-label">
      <span>{label}</span>
      {title && (
        <span title={title} aria-label={title} tabIndex={0}>
          <CircleHelp size={13} />
        </span>
      )}
    </div>
  );
  const slider = (
    <Slider
      value={range}
      min={min}
      max={max}
      step={step}
      size="xs"
      thumbSize={12}
      color="blue"
      label={null}
      thumbLabel={label}
      disabled={disabled}
      className="cv-generator-mantine-slider"
      styles={sliderStyles}
      onChange={previewSliderValue}
      onChangeEnd={(next) => {
        if (!disabled && next !== value) onChange(next);
      }}
    />
  );
  const input = (
    <input
      aria-label={label + '数值'}
      type={advanced ? 'text' : 'number'}
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      min={advanced ? undefined : min}
      max={advanced ? undefined : max}
      step={advanced ? undefined : step}
      onChange={(event) => {
        if (disabled) return;
        const next = event.target.value;
        setDraft(next);
        if (!advanced && next.trim() && Number.isFinite(Number(next)))
          setRange(Math.min(max, Math.max(min, Number(next))));
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
  const inline = advanced && property.layout === 'inline';
  return (
    <MantineProvider
      colorSchemeManager={colorSchemeManager}
      forceColorScheme="dark"
      getRootElement={noRootElement}
      withGlobalClasses={false}
      withStaticClasses={false}
      cssVariablesSelector=".cv-generator-numeric"
    >
      <div
        className={
          'cv-generator-numeric cv-generator-field' +
          (inline ? ' cv-generator-numeric-inline' : '') +
          (!advanced ? ' cv-generator-numeric-normal' : '')
        }
        data-mantine-color-scheme="dark"
      >
        {inline ? (
          <>
            {labelView}
            <div className="cv-generator-slider">
              {slider}
              {input}
            </div>
          </>
        ) : (
          <>
            <div className="cv-generator-numeric-heading">
              {labelView}
              {advanced && (
                <span>{Number.isInteger(step) ? Math.round(range) : range.toFixed(1)}</span>
              )}
            </div>
            <div className="cv-generator-slider">
              {slider}
              {!advanced && input}
              {!advanced && property.unit && <span>{property.unit}</span>}
            </div>
          </>
        )}
      </div>
    </MantineProvider>
  );
}
