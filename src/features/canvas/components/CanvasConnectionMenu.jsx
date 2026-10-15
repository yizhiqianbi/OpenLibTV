import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import './canvas-connection-menu.css';

const order = ['text', 'image', 'video', 'video-clip', 'audio', 'script-v2', 'script', 'reference'];
const scriptTypes = new Set(['script-v2', 'script']);
const sourceIcons = {
  text: 'lines-text',
  image: 'icon-image-gen',
  video: 'icon-video-gen',
  audio: 'nt-audio-gen',
  'script-v2': 'icon-script-ai',
  script: 'icon-script-ai',
};
const sourceLabels = { script: '脚本（旧版）', reference: '参考节点' };
const nodeInterface =
  'button,input,textarea,select,a,img,audio,video,[contenteditable],[role="button"],[role="menu"],[role="listbox"],[role="slider"],[role="combobox"],.cv-floating,.cv-inline-generator,.cv-storyboard,.cv-settings,.cv-handle,.react-flow__handle,.nopan,.nowheel';
const fieldsIn = (element) =>
  [...(element?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])].filter(
    (field) => field.closest('[role="menu"]') === element,
  );
const move = (panel, event) => {
  const fields = fieldsIn(panel);
  const current = fields.indexOf(panel?.ownerDocument.activeElement);
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = fields.length - 1;
  else if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))
    next = current + 1;
  else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))
    next = current < 0 ? fields.length - 1 : current - 1 + fields.length;
  else return false;
  event.preventDefault();
  event.stopPropagation();
  fields[(next + fields.length) % fields.length]?.focus({ preventScroll: true });
  return true;
};

function ConnectionIcon({ entry }) {
  const asset = entry.iconAsset || sourceIcons[entry.type];
  const Icon = entry.icon;
  return (
    <span className="cv-connection-icon" aria-hidden="true">
      {asset ? (
        <span
          className="cv-connection-source-icon"
          style={{ maskImage: `url("/assets/icons/${asset}.svg")` }}
        />
      ) : Icon ? (
        <Icon size={20} width={20} height={20} />
      ) : null}
    </span>
  );
}

/** Controlled NodeTypeMenu view. Eligibility and graph transactions belong to the caller. */
export function CanvasConnectionMenu({
  menu,
  screenPosition,
  getScreenPosition,
  entries = [],
  onChoose,
  onClose,
}) {
  const id = useId();
  const multi = menu?.kind === 'multi';
  const root = useRef(null);
  const main = useRef(null);
  const submenu = useRef(null);
  const scriptTrigger = useRef(null);
  const callbacks = useRef({ onChoose, onClose });
  const anchor = useRef(screenPosition);
  const placeMenu = useRef(null);
  const readAnchor = useRef(getScreenPosition);
  anchor.current = screenPosition;
  readAnchor.current = getScreenPosition;
  const [submenuOwner, setSubmenuOwner] = useState(null);
  const [position, setPosition] = useState(null);
  const [subPosition, setSubPosition] = useState(null);
  const openSubmenu = !!menu && submenuOwner === menu;
  const visible = order.flatMap((type) => entries.filter((entry) => entry.type === type));
  const scripts = visible.filter((entry) => scriptTypes.has(entry.type));
  const groupScripts = !multi && menu?.handleType === 'source' && scripts.length > 0;
  const scriptDisabled = scripts.every((entry) => entry.disabled);
  const opener = menu?.opener;
  const document = opener?.ownerDocument || globalThis.document;
  const portal = opener?.closest('[role="dialog"]') || document.body;
  const theme = opener?.closest('.canvas-light') ? ' canvas-light' : '';

  useLayoutEffect(() => {
    callbacks.current = { onChoose, onClose };
  }, [onChoose, onClose]);

  useLayoutEffect(() => {
    if (!menu || !root.current || !main.current) return;
    const container = root.current;
    const panel = main.current;
    const document = container.ownerDocument;
    const window = document.defaultView;
    let frame;
    let closed = false;
    const close = (restoreFocus = false, context) => {
      if (closed) return;
      closed = true;
      if (context) callbacks.current.onClose?.(menu, context);
      else callbacks.current.onClose?.(menu);
      if (restoreFocus) {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        else menu.restoreFocus?.();
      }
    };
    const place = () => {
      if (!container.isConnected || closed) return;
      const rect = panel.getBoundingClientRect();
      const width = Math.min(
        rect.width || (multi ? 196 : 220),
        Math.max(0, window.innerWidth - 16),
      );
      const height = Math.min(
        rect.height || panel.scrollHeight,
        Math.max(0, window.innerHeight - 16),
      );
      const screen = readAnchor.current?.() || anchor.current;
      const left = Math.max(8, Math.min(screen?.x ?? menu.clientX, window.innerWidth - width - 8));
      const naturalTop = (screen?.y ?? menu.clientY) - (multi ? height / 2 : 0);
      const top = Math.max(8, Math.min(naturalTop, window.innerHeight - height - 8));
      setPosition((previous) =>
        previous?.owner === menu && previous.left === left && previous.top === top
          ? previous
          : { owner: menu, left, top },
      );
    };
    placeMenu.current = place;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(place);
    };
    const outside = (event) => {
      if (container.contains(event.target) || opener?.contains(event.target)) return;
      const body =
        !multi &&
        event.type === 'pointerdown' &&
        event.target?.closest?.('.cv-node') &&
        !event.target.closest(nodeInterface);
      close(false, body ? { preserveConnection: true } : undefined);
    };
    const escape = (event) => {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return;
      if (
        container.contains(event.target) ||
        opener?.contains(event.target) ||
        event.target === document
      ) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const dismiss = registerDialogChildDismissal(
      container,
      () => close(true),
      opener,
      (event) => {
        if (event.key !== 'Tab') return false;
        return move(submenu.current?.contains(event.target) ? submenu.current : panel, event);
      },
    );
    place();
    (fieldsIn(panel)[0] || panel).focus({ preventScroll: true });
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(panel);
    return () => {
      closed = true;
      if (placeMenu.current === place) placeMenu.current = null;
      dismiss();
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [menu, opener, portal, multi]);

  // Canvas anchored screen coordinates change independently of request ownership.
  // Reposition without reopening the menu, resetting its flyout or stealing focus.
  useLayoutEffect(() => {
    placeMenu.current?.();
  }, [screenPosition?.x, screenPosition?.y]);

  useLayoutEffect(() => {
    if (!openSubmenu || !submenu.current || !scriptTrigger.current) return;
    const panel = submenu.current;
    const trigger = scriptTrigger.current;
    const window = panel.ownerDocument.defaultView;
    let frame;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const rect = panel.getBoundingClientRect();
      const width = Math.min(rect.width || 220, Math.max(0, window.innerWidth - 16));
      const naturalHeight = Math.max(rect.height, panel.scrollHeight ? panel.scrollHeight + 2 : 0);
      const fitsRight = anchor.right + width + 8 <= window.innerWidth - 8;
      const fitsLeft = anchor.left - width - 8 >= 8;
      const below = Math.max(0, window.innerHeight - anchor.bottom - 16);
      const above = Math.max(0, anchor.top - 16);
      const placement = fitsRight
        ? 'right'
        : fitsLeft
          ? 'left'
          : below >= naturalHeight
            ? 'below'
            : 'above';
      const reverse = placement === 'left';
      const vertical = placement === 'below' || placement === 'above';
      const maxHeight = vertical
        ? placement === 'below'
          ? below
          : above
        : Math.max(0, window.innerHeight - 16);
      const height = Math.min(naturalHeight, maxHeight);
      const left = Math.max(
        8,
        Math.min(
          vertical ? anchor.left : reverse ? anchor.left - width - 8 : anchor.right + 8,
          window.innerWidth - width - 8,
        ),
      );
      const top = Math.max(
        8,
        Math.min(
          placement === 'below'
            ? anchor.bottom + 8
            : placement === 'above'
              ? anchor.top - height - 8
              : anchor.top,
          window.innerHeight - height - 8,
        ),
      );
      const bridge = vertical
        ? {
            left,
            top: placement === 'below' ? anchor.bottom : top + height,
            width,
            height: placement === 'below' ? top - anchor.bottom : anchor.top - top - height,
          }
        : { left: reverse ? left + width : left - 8, top, width: 8, height };
      setSubPosition((previous) =>
        previous?.owner === menu &&
        previous.left === left &&
        previous.top === top &&
        previous.width === width &&
        previous.height === height &&
        previous.maxHeight === maxHeight &&
        previous.placement === placement &&
        previous.bridge.left === bridge.left &&
        previous.bridge.top === bridge.top &&
        previous.bridge.width === bridge.width &&
        previous.bridge.height === bridge.height &&
        previous.reverse === reverse
          ? previous
          : { owner: menu, left, top, width, height, maxHeight, placement, bridge, reverse },
      );
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(panel);
    observer?.observe(trigger);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [openSubmenu, menu, position]);

  const keyboard = (event) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const panel = submenu.current?.contains(event.target) ? submenu.current : main.current;
    if (move(panel, event)) return;
    if (event.key === 'ArrowRight' && event.target === scriptTrigger.current && !scriptDisabled) {
      event.preventDefault();
      event.stopPropagation();
      setSubmenuOwner(menu);
      // Focus after the controlled submenu has mounted, without a delayed owner callback.
    } else if (event.key === 'ArrowLeft' && panel === submenu.current) {
      event.preventDefault();
      event.stopPropagation();
      setSubmenuOwner(null);
      scriptTrigger.current?.focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      const item = event.target.closest('[role="menuitem"]');
      if (!item || item.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      item.click();
    }
  };
  useLayoutEffect(() => {
    if (openSubmenu && scriptTrigger.current === document.activeElement)
      fieldsIn(submenu.current)[0]?.focus({ preventScroll: true });
  }, [openSubmenu, document]);

  if (!menu) return null;
  const choose = (entry) => {
    if (!entry.disabled) callbacks.current.onChoose?.(entry.type, menu);
  };
  const renderEntry = (entry, child = false) => (
    <button
      key={entry.type}
      type="button"
      role="menuitem"
      className="cv-connection-item"
      disabled={!!entry.disabled}
      title={entry.reason || entry.description || undefined}
      aria-label={sourceLabels[entry.type] || entry.label}
      data-feature-id={`node-type:${entry.type}`}
      onMouseEnter={child ? undefined : () => setSubmenuOwner(null)}
      onClick={() => choose(entry)}
    >
      {!child && <ConnectionIcon entry={entry} />}
      <span className="cv-connection-label">
        <span className="cv-connection-label-text">{sourceLabels[entry.type] || entry.label}</span>
        {!multi &&
          (entry.type === 'script-v2' ||
            entry.type === 'video-clip' ||
            entry.type === 'script') && (
            <span className={`cv-connection-badge${entry.type === 'script-v2' ? ' is-new' : ''}`}>
              {entry.type === 'script-v2' ? 'NEW' : 'Beta'}
            </span>
          )}
      </span>
    </button>
  );
  const title = multi ? menu.title : menu.handleType === 'target' ? '添加上下文' : '引用该节点生成';
  return createPortal(
    <div
      ref={root}
      className={`cv-connection-menu cv-floating${multi ? ' cv-multi-connection-menu' : ''}${theme}`}
      data-popover-safe="true"
      data-guide-lockable-portal="true"
      style={
        position?.owner === menu
          ? { left: position.left, top: position.top }
          : { left: screenPosition?.x ?? menu.clientX, top: screenPosition?.y ?? menu.clientY }
      }
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={keyboard}
    >
      <div
        ref={main}
        id={id}
        role="menu"
        aria-label={title}
        tabIndex={-1}
        className="cv-connection-panel"
      >
        <h4 className="cv-connection-heading">{title}</h4>
        {visible
          .filter((entry) => !groupScripts || !scriptTypes.has(entry.type))
          .map((entry) => {
            if (entry.type !== 'reference' || !groupScripts) return renderEntry(entry);
            return null;
          })}
        {groupScripts && (
          <div
            className="cv-connection-script-group"
            role="none"
            onMouseLeave={() => setSubmenuOwner(null)}
          >
            <button
              ref={scriptTrigger}
              type="button"
              role="menuitem"
              className={`cv-connection-item${openSubmenu ? ' is-open' : ''}`}
              aria-label="脚本"
              aria-haspopup="menu"
              aria-expanded={openSubmenu}
              aria-controls={openSubmenu ? `${id}-scripts` : undefined}
              disabled={scriptDisabled}
              onMouseEnter={() => !scriptDisabled && setSubmenuOwner(menu)}
              onClick={() => setSubmenuOwner(menu)}
            >
              <ConnectionIcon entry={scripts[0]} />
              <span className="cv-connection-label">脚本</span>
              <span
                className="cv-connection-source-icon cv-connection-chevron"
                aria-hidden="true"
                style={{ maskImage: 'url("/assets/icons/nt-chevron-right-small.svg")' }}
              />
            </button>
            {openSubmenu && (
              <>
                {subPosition?.owner === menu && (
                  <div
                    className="cv-connection-submenu-bridge"
                    role="none"
                    style={subPosition.bridge}
                  />
                )}
                <div
                  ref={submenu}
                  role="menu"
                  id={`${id}-scripts`}
                  aria-label="脚本类型"
                  data-placement={subPosition?.placement}
                  tabIndex={-1}
                  className={`cv-connection-panel cv-connection-submenu${subPosition?.reverse ? ' is-reversed' : ''}`}
                  style={
                    subPosition?.owner === menu
                      ? {
                          left: subPosition.left,
                          top: subPosition.top,
                          maxHeight: subPosition.maxHeight,
                        }
                      : { left: menu.clientX, top: menu.clientY }
                  }
                >
                  {scripts.map((entry) => renderEntry(entry, true))}
                </div>
              </>
            )}
          </div>
        )}
        {groupScripts &&
          visible.filter((entry) => entry.type === 'reference').map((entry) => renderEntry(entry))}
        {!visible.length && (
          <div className="cv-connection-empty" role="status">
            暂无可添加的节点
          </div>
        )}
      </div>
    </div>,
    portal,
  );
}

export default CanvasConnectionMenu;
