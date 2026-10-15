import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid } from 'lucide-react';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import './script-media-history.css';

const menuItems = '[role="menuitem"]:not(:disabled)';
// Source Popover defaults: offset 8 + withArrow size 7 / 2, side arrow offset 5.
const menuOffset = 11.5;
const arrowOffset = 5;
const arrowHalfSize = 3.5;
const trapMenuTab = (menu, event) => {
  if (event.key !== 'Tab') return false;
  const fields = [...menu.querySelectorAll(menuItems)];
  const current = fields.indexOf(menu.ownerDocument.activeElement);
  const next =
    current < 0
      ? event.shiftKey
        ? fields.length - 1
        : 0
      : event.shiftKey
        ? current - 1 + fields.length
        : current + 1;
  event.preventDefault();
  event.stopPropagation();
  fields[next % fields.length]?.focus();
  return true;
};
const formatCreatedAt = (value) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

/** oS/oW: ordered version metadata menu, with sibling buttons instead of nested buttons. */
export function ScriptMediaHistoryMenu({
  kind = 'image',
  versions = [],
  readonly = false,
  disabled = false,
  onJumpToNode,
  onSetActive,
}) {
  const id = useId();
  const trigger = useRef(null);
  const dropdown = useRef(null);
  const mounted = useRef(true);
  const request = useRef(0);
  const pending = useRef(false);
  const initialFocus = useRef(null);
  const [opened, setOpened] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(null);
  const video = kind === 'video';
  const label = video ? '视频' : '图片';
  const prefix = video ? 'vV' : 'v';
  const active = versions.find((version) => version.isActive);
  const activeIndex = active
    ? versions.findIndex((version) => version.versionId === active.versionId)
    : -1;
  const currentLabel = `${prefix}${activeIndex >= 0 ? activeIndex + 1 : '?'}/${versions.length}`;
  const close = useCallback(({ restoreFocus = false } = {}) => {
    setOpened(false);
    if (restoreFocus && trigger.current?.isConnected)
      trigger.current.focus({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);
  useLayoutEffect(() => {
    if (!opened || !dropdown.current) return;
    const menu = dropdown.current;
    const opener = trigger.current;
    const document = menu.ownerDocument;
    const window = document.defaultView;
    let frame;
    const place = () => {
      if (!opener?.isConnected || !menu.isConnected) return;
      const anchor = opener.getBoundingClientRect();
      const size = menu.getBoundingClientRect();
      const width = Math.min(size.width || 270, Math.max(0, window.innerWidth - 16));
      const below = window.innerHeight - anchor.bottom - menuOffset - 8;
      const above = anchor.top - menuOffset - 8;
      const useAbove = below < Math.min(size.height || 180, 320) && above > below;
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      setPosition({
        left,
        ...(useAbove
          ? { bottom: window.innerHeight - anchor.top + menuOffset }
          : { top: anchor.bottom + menuOffset }),
        maxHeight: Math.max(40, Math.min(400, useAbove ? above : below)),
        '--script-history-arrow-x': `${left + arrowOffset}px`,
        '--script-history-arrow-y': `${(useAbove ? anchor.top - menuOffset : anchor.bottom + menuOffset) - arrowHalfSize}px`,
      });
    };
    const schedulePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const outside = (event) => {
      if (!menu.contains(event.target) && !opener?.contains(event.target)) close();
    };
    const escape = (event) => {
      if (
        event.key === 'Escape' &&
        (menu.contains(event.target) || opener?.contains(event.target) || event.target === document)
      ) {
        event.preventDefault();
        event.stopPropagation();
        close({ restoreFocus: true });
      }
    };
    const dismiss = registerDialogChildDismissal(
      menu,
      () => close({ restoreFocus: true }),
      opener,
      (event) => trapMenuTab(menu, event),
    );
    place();
    const fields = menu.querySelectorAll(menuItems);
    if (initialFocus.current === 'last') fields[fields.length - 1]?.focus();
    else if (initialFocus.current === 'first') fields[0]?.focus();
    else menu.focus({ preventScroll: true });
    initialFocus.current = null;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePosition) : null;
    observer?.observe(menu);
    if (opener) observer?.observe(opener);
    return () => {
      dismiss();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
    };
  }, [opened, close]);
  const keyboard = (event) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab' && dropdown.current) {
      trapMenuTab(dropdown.current, event);
      return;
    }
    const fields = [...(dropdown.current?.querySelectorAll(menuItems) ?? [])];
    const current = fields.indexOf(event.target);
    let target;
    if (event.key === 'Home') target = fields[0];
    else if (event.key === 'End') target = fields.at(-1);
    else if (event.key === 'ArrowDown') target = fields[(current + 1) % fields.length];
    else if (event.key === 'ArrowUp')
      target =
        fields[(current < 0 ? fields.length - 1 : current - 1 + fields.length) % fields.length];
    else if ((event.key === 'Enter' || event.key === ' ') && current >= 0) {
      event.preventDefault();
      event.stopPropagation();
      fields[current].click();
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    target?.focus();
  };
  const setActive = async (event, version) => {
    event.stopPropagation();
    if (readonly || disabled || pending.current || !onSetActive) return;
    pending.current = true;
    const currentRequest = ++request.current;
    setSaving(true);
    setError('');
    try {
      const saved = await onSetActive(version.versionId);
      if (mounted.current && currentRequest === request.current && saved === false)
        setError('版本切换未保存，请重试');
    } catch {
      if (mounted.current && currentRequest === request.current) setError('版本切换未保存，请重试');
    } finally {
      pending.current = false;
      if (mounted.current && currentRequest === request.current) setSaving(false);
    }
  };
  if (!versions.length) return null;
  const portal = trigger.current?.closest('[role="dialog"]') || document.body;
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`cv-script-history-trigger cv-script-history-${kind}`}
        aria-label={`${label}版本 ${currentLabel}`}
        title={`${label}版本 ${currentLabel}（点击查看历史）`}
        aria-haspopup="menu"
        aria-expanded={opened}
        aria-controls={opened ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setError('');
          setOpened((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          event.stopPropagation();
          initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
          if (opened) {
            const fields = dropdown.current?.querySelectorAll(menuItems);
            fields?.[initialFocus.current === 'last' ? fields.length - 1 : 0]?.focus();
          } else setOpened(true);
        }}
      >
        <LayoutGrid size={12} />
        <span>{currentLabel}</span>
      </button>
      {opened &&
        createPortal(
          <div
            ref={dropdown}
            id={id}
            role="menu"
            tabIndex={-1}
            aria-label={`${label}版本历史`}
            className={`cv-script-history-menu cv-script-history-${kind}${position?.bottom !== undefined ? ' is-above' : ''}`}
            style={position || { visibility: 'hidden' }}
            onKeyDown={keyboard}
          >
            <div className="cv-script-history-label">
              {label}版本（{versions.length}）
            </div>
            {versions.map((version, index) => {
              const sourceId =
                video && version.sourceImageVersionId ? version.sourceImageVersionId : '';
              const sourceLabel = sourceId.length > 6 ? sourceId.slice(0, 6) : sourceId;
              return (
                <div
                  key={version.versionId}
                  role="none"
                  className={`cv-script-history-row${version.isActive ? ' is-active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onJumpToNode?.(version.nodeId);
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="cv-script-history-jump"
                    aria-label={`跳转到${label}版本 ${prefix}${index + 1}${version.isActive ? '，当前版本' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onJumpToNode?.(version.nodeId);
                    }}
                  >
                    <span className="cv-script-history-number">
                      {prefix}
                      {index + 1}
                      {version.isActive ? ' ✓' : ''}
                    </span>
                    <span className="cv-script-history-time">
                      {formatCreatedAt(version.createdAt)}
                    </span>
                    {sourceLabel && (
                      <span className="cv-script-history-source" title={`图源 ${sourceId}`}>
                        ←{sourceLabel}
                      </span>
                    )}
                  </button>
                  {!version.isActive && !readonly && onSetActive && (
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={`将${label}版本 ${prefix}${index + 1} 设为当前`}
                      className="cv-script-history-set-active"
                      disabled={disabled || saving}
                      onClick={(event) => void setActive(event, version)}
                    >
                      设为当前
                    </button>
                  )}
                </div>
              );
            })}
            {error && (
              <p className="cv-script-history-error" role="alert">
                {error}
              </p>
            )}
            <div className="cv-script-history-divider" role="separator" />
            <div className="cv-script-history-help">
              {video
                ? '点击行 = 跳转到画布节点；←标记表示绑定的图源版本'
                : '点击行 = 跳转到画布节点'}
            </div>
          </div>,
          portal,
        )}
    </>
  );
}
