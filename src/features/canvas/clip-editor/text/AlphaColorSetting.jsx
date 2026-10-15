import { useLayoutEffect, useRef, useState } from 'react';
import { AlphaSlider, ColorPicker, MantineProvider, Popover } from '@mantine/core';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';
import { textColor, textColorWithOpacity } from '../domain/text-color-model.js';
import '@mantine/core/styles/ColorPicker.css';
import '@mantine/core/styles/Popover.css';
const scheme = {
  get: () => 'dark',
  set: () => {},
  clear: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
};
const noRoot = () => null;
const displayColor = (value) => {
  const result = textColor(value);
  return { ...result, color: /^#[\da-f]{6}$/i.test(result.color) ? result.color : '#000000' };
};
/** Source un alphaEditable: Mantine picker plus separate integer-percent alpha. */
export default function AlphaColorSetting({
  label,
  ariaLabel,
  value = '#000000',
  disabled,
  owner,
  onInteractionStart,
  onValueChange,
  onInteractionEnd,
  onInteractionCancel,
}) {
  const root = useRef(null),
    trigger = useRef(null),
    active = useRef(null),
    latest = useRef(null),
    openRef = useRef(false),
    generation = useRef(0),
    settleFrame = useRef(null),
    pendingClose = useRef(false),
    keyboard = useRef(false);
  const epoch = generation.current;
  const [open, setOpen] = useState(false),
    [target, setTarget] = useState(null),
    [dropdown, setDropdown] = useState(null);
  const [display, setDisplay] = useState(() => displayColor(value)),
    draft = useRef(display);
  latest.current = {
    value,
    disabled,
    owner,
    onInteractionStart,
    onValueChange,
    onInteractionEnd,
    onInteractionCancel,
  };
  const update = (next) => {
    draft.current = next;
    setDisplay(next);
  };
  const finish = () => {
    const transaction = active.current;
    active.current = null;
    transaction?.end?.(transaction.token);
  };
  const closeNow = () => {
    cancelAnimationFrame(settleFrame.current);
    settleFrame.current = null;
    pendingClose.current = false;
    openRef.current = false;
    generation.current++;
    finish();
    setOpen(false);
  };
  // Mantine useMove publishes its final pointer position in RAF. Ending or
  // unmounting earlier can discard a quick click's value or split its history.
  const settlePointer = (close = false) => {
    pendingClose.current ||= close;
    cancelAnimationFrame(settleFrame.current);
    const expected = generation.current;
    settleFrame.current = requestAnimationFrame(() => {
      settleFrame.current = null;
      if (generation.current !== expected) return;
      if (pendingClose.current) closeNow();
      else finish();
    });
  };
  const lifecycle = useRef({});
  lifecycle.current = {
    finish,
    close: closeNow,
    dismiss: () => settlePointer(true),
  };
  useLayoutEffect(() => {
    setTarget(root.current?.closest('.cv-clip-editor') || root.current?.parentElement);
  }, []);
  useLayoutEffect(() => {
    if (!active.current) update(displayColor(value));
  }, [value]);
  useLayoutEffect(() => {
    const currentOwner = owner;
    openRef.current = false;
    generation.current++;
    setOpen(false);
    update(displayColor(latest.current.value));
    return () => {
      cancelAnimationFrame(settleFrame.current);
      settleFrame.current = null;
      pendingClose.current = false;
      const transaction = active.current;
      active.current = null;
      if (transaction)
        (latest.current.owner !== currentOwner || latest.current.disabled
          ? transaction.cancel
          : transaction.end)?.(transaction.token);
    };
  }, [owner, disabled]);
  useLayoutEffect(() => {
    if (!open || !dropdown) return undefined;
    const unregister = registerDialogChildDismissal(
      dropdown,
      () => {
        lifecycle.current.dismiss();
        trigger.current?.focus({ preventScroll: true });
      },
      trigger.current,
    );
    const leaving = () => lifecycle.current.close();
    window.addEventListener('pagehide', leaving);
    window.addEventListener('blur', leaving);
    return () => {
      unregister();
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('blur', leaving);
    };
  }, [open, dropdown]);
  const change = (fields) => {
    if (latest.current.disabled || !openRef.current || epoch !== generation.current) return;
    const next = { ...draft.current, ...fields };
    if (next.color === draft.current.color && next.opacityPct === draft.current.opacityPct) return;
    if (!active.current) {
      const token = latest.current.onInteractionStart?.({
        kind: 'color',
        readPending: () => textColorWithOpacity(draft.current.color, draft.current.opacityPct),
      });
      if (!token) return;
      active.current = {
        token,
        change: latest.current.onValueChange,
        end: latest.current.onInteractionEnd,
        cancel: latest.current.onInteractionCancel,
      };
    }
    update(next);
    if (
      active.current.change?.(
        active.current.token,
        textColorWithOpacity(next.color, next.opacityPct),
      ) === false
    ) {
      const transaction = active.current;
      active.current = null;
      transaction.cancel?.(transaction.token);
      update(displayColor(latest.current.value));
    }
  };
  const toggle = (next) => {
    if (!next) {
      settlePointer(true);
      return;
    }
    if (next !== openRef.current) generation.current++;
    openRef.current = next;
    setOpen(next);
  };
  return (
    <MantineProvider
      colorSchemeManager={scheme}
      forceColorScheme="dark"
      getRootElement={noRoot}
      withGlobalClasses={false}
      withStaticClasses={false}
      cssVariablesSelector=".cv-clip-alpha-theme"
    >
      <div
        ref={root}
        className="cv-clip-text-color cv-clip-alpha-theme"
        data-mantine-color-scheme="dark"
        data-disabled={disabled || undefined}
      >
        <span className="cv-clip-text-number-label">{label}</span>
        <span className="cv-clip-text-color-value">{display.color}</span>
        <span>{display.opacityPct}%</span>
        <Popover
          opened={open && !disabled && !!target}
          onChange={toggle}
          position="left-start"
          shadow="md"
          withinPortal
          portalProps={{ target }}
          zIndex={1100}
          closeOnEscape={false}
          returnFocus={false}
          trapFocus={false}
          floatingStrategy="fixed"
        >
          <Popover.Target>
            <button
              ref={trigger}
              type="button"
              className="cv-clip-alpha-swatch"
              aria-label={ariaLabel}
              aria-expanded={open}
              disabled={disabled}
              onClick={() => !disabled && toggle(!open)}
            >
              <span
                style={{ backgroundColor: textColorWithOpacity(display.color, display.opacityPct) }}
              />
            </button>
          </Popover.Target>
          <Popover.Dropdown
            ref={setDropdown}
            role="group"
            aria-label={`${ariaLabel}色盘`}
            className="cv-clip-alpha-dropdown cv-clip-alpha-theme"
            data-mantine-color-scheme="dark"
            onPointerDownCapture={() => {
              keyboard.current = false;
            }}
            onKeyDownCapture={(event) => {
              if (event.key.startsWith('Arrow')) keyboard.current = true;
            }}
          >
            <ColorPicker
              format="hex"
              value={display.color}
              saturationLabel={ariaLabel}
              hueLabel={ariaLabel}
              onChange={(color) => change({ color })}
              onChangeEnd={() =>
                epoch === generation.current && (keyboard.current ? finish() : settlePointer())
              }
            />
            <div className="cv-clip-alpha-slider">
              <span>A</span>
              <AlphaSlider
                color={display.color}
                value={display.opacityPct / 100}
                aria-label={`${ariaLabel} A`}
                onChange={(value) => change({ opacityPct: Math.round(value * 100) })}
                onChangeEnd={() =>
                  epoch === generation.current && (keyboard.current ? finish() : settlePointer())
                }
              />
              <span>{display.opacityPct}%</span>
            </div>
          </Popover.Dropdown>
        </Popover>
      </div>
    </MantineProvider>
  );
}
