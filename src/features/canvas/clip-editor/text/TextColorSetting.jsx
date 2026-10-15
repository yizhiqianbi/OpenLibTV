import { useLayoutEffect, useRef, useState } from 'react';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';
import { textColor, textColorWithOpacity } from '../domain/text-color-model.js';
/** Source un without alphaEditable: native swatch with read-only hex/opacity. */
export default function TextColorSetting({
  label,
  ariaLabel,
  value = '#000000',
  showOpacity = true,
  disabled,
  owner,
  onInteractionStart,
  onValueChange,
  onInteractionEnd,
  onInteractionCancel,
}) {
  const root = useRef(null),
    input = useRef(null),
    transaction = useRef(null),
    latest = useRef(null),
    dismiss = useRef(null);
  const stopWatching = useRef(null);
  const [display, setDisplay] = useState(() => textColor(value));
  latest.current = {
    value,
    disabled,
    owner,
    onInteractionStart,
    onValueChange,
    onInteractionEnd,
    onInteractionCancel,
  };
  const finish = () => {
    const active = transaction.current;
    transaction.current = null;
    dismiss.current?.();
    dismiss.current = null;
    stopWatching.current?.();
    stopWatching.current = null;
    if (active) active.end?.(active.token);
    setDisplay(textColor(latest.current.value));
  };
  const lifecycle = useRef(finish);
  lifecycle.current = finish;
  useLayoutEffect(() => {
    if (!transaction.current) setDisplay(textColor(value));
  }, [value]);
  useLayoutEffect(() => {
    const currentOwner = owner;
    setDisplay(textColor(latest.current.value));
    return () => {
      stopWatching.current?.();
      stopWatching.current = null;
      dismiss.current?.();
      dismiss.current = null;
      const active = transaction.current;
      transaction.current = null;
      if (active)
        (latest.current.owner !== currentOwner || latest.current.disabled
          ? active.cancel
          : active.end)?.(active.token);
    };
  }, [owner, disabled]);
  const update = (event) => {
    if (disabled) return;
    if (!transaction.current) {
      const token = onInteractionStart?.({ kind: 'color' });
      if (!token) return;
      transaction.current = {
        token,
        change: onValueChange,
        end: onInteractionEnd,
        cancel: onInteractionCancel,
      };
      const leave = () => lifecycle.current();
      window.addEventListener('pagehide', leave);
      stopWatching.current = () => window.removeEventListener('pagehide', leave);
      dismiss.current = registerDialogChildDismissal(root.current, () => {
        lifecycle.current();
        input.current?.blur();
      });
    }
    const next = { ...display, color: event.currentTarget.value };
    setDisplay(next);
    if (
      transaction.current.change?.(
        transaction.current.token,
        textColorWithOpacity(next.color, next.opacityPct),
      ) === false
    ) {
      transaction.current = null;
      stopWatching.current?.();
      stopWatching.current = null;
      dismiss.current?.();
      dismiss.current = null;
      setDisplay(textColor(latest.current.value));
    }
  };
  return (
    <label ref={root} className="cv-clip-text-color" data-disabled={disabled || undefined}>
      <span className="cv-clip-text-number-label">{label}</span>
      <span className="cv-clip-text-color-value">{display.color}</span>
      {showOpacity && <span>{display.opacityPct}%</span>}
      <span
        className="cv-clip-text-color-swatch"
        style={{ backgroundColor: textColorWithOpacity(display.color, display.opacityPct) }}
      >
        <input
          ref={input}
          type="color"
          aria-label={ariaLabel}
          data-timed-text-style-input="true"
          disabled={disabled}
          value={/^#[\da-f]{6}$/i.test(display.color) ? display.color : '#000000'}
          onChange={update}
          onBlur={finish}
        />
      </span>
    </label>
  );
}
