import { parseTextNumeric } from '../domain/text-numeric-model.js';
import { useTextNumeric } from './useTextNumeric.js';
export default function TextNumericSetting({ label, ariaLabel, suffix, ...props }) {
  const control = useTextNumeric(props),
    value = parseTextNumeric(control.draft);
  const invalid =
    control.draft.trim() !== '' && (value == null || value < props.min || value > props.max);
  const ratio =
    value == null || !(props.max > props.min)
      ? 0
      : Math.max(0, Math.min(1, (value - props.min) / (props.max - props.min)));
  const { rootRef, inputRef, draft, editing, dragging, ...events } = control;
  return (
    <div
      ref={rootRef}
      className="cv-clip-text-number"
      data-slot="control-number"
      data-dragging={dragging || undefined}
      data-disabled={props.disabled || undefined}
      onPointerDown={events.onPointerDown}
      onPointerMove={events.onPointerMove}
      onPointerUp={events.onPointerUp}
      onPointerCancel={events.onPointerCancel}
      onLostPointerCapture={events.onLostPointerCapture}
    >
      <span
        className="cv-clip-text-number-fill"
        data-slot="control-number-fill"
        style={{ width: `${100 * ratio}%` }}
        aria-hidden="true"
      />
      <span className="cv-clip-text-number-label">{label}</span>
      <span className="cv-clip-text-number-readout">
        <input
          ref={inputRef}
          type="text"
          role="spinbutton"
          inputMode="decimal"
          readOnly={!editing}
          disabled={props.disabled}
          value={draft}
          min={props.min}
          max={props.max}
          step={props.step}
          aria-label={ariaLabel}
          aria-valuemin={props.min}
          aria-valuemax={props.max}
          aria-valuenow={value == null || invalid ? undefined : value}
          aria-valuetext={value == null || invalid ? undefined : `${value}${suffix || ''}`}
          aria-invalid={invalid || undefined}
          data-slot="control-number-input"
          data-timed-text-style-input="true"
          style={{ width: `${Math.min(Math.max(draft.length + Number(editing), 1), 12)}ch` }}
          onClick={events.onInputClick}
          onChange={events.onInputChange}
          onBlur={events.onInputBlur}
          onKeyDown={events.onInputKeyDown}
          onKeyUp={events.onInputKeyUp}
        />
        {suffix && <span data-slot="control-number-suffix">{suffix}</span>}
      </span>
    </div>
  );
}
