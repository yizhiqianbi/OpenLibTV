import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../../../components/Icon.jsx';
import { REFERENCE_LABELS } from './candidate-model.js';
import { useCanvasReferenceSource } from './useCanvasReferenceSource.js';
import { useCanvasReferenceMenu } from './useCanvasReferenceMenu.js';
import { CanvasReferenceEntries, CanvasReferenceOption } from './CanvasReferenceEntries.jsx';
import './canvas-reference-menu.css';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';

const EMPTY = [];
export default function CanvasReferenceMenu({
  id,
  position,
  source,
  sessionKey,
  refreshKey,
  hiddenKinds = EMPTY,
  onSelect,
  onClose,
  onOpenAssetPicker,
  asset,
  portalTarget,
}) {
  const rootRef = useRef(null);
  useLayoutEffect(
    () => (rootRef.current ? registerDialogChildDismissal(rootRef.current, onClose) : undefined),
    [onClose],
  );
  const searchRef = useRef(null);
  const mainRef = useRef(null);
  const subRef = useRef(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [subPosition, setSubPosition] = useState({ top: 0 });
  const data = useCanvasReferenceSource({ source, sessionKey, refreshKey });
  const menu = useCanvasReferenceMenu({
    candidates: data.candidates,
    hiddenKinds,
    onSelect,
    onClose,
    rootRef,
  });
  const openSub = !!menu.kind && !menu.query && data.status === 'ready';
  const panelWidth = openSub
    ? Math.min(200, Math.max(120, (viewport.width - 12) / 2))
    : Math.min(200, viewport.width - 8);
  const baseLeft = Math.max(4, Math.min(position.left, viewport.width - panelWidth - 4));
  const reverse =
    openSub && baseLeft + panelWidth * 2 + 4 > viewport.width && baseLeft >= panelWidth + 4;
  const left = openSub
    ? Math.max(
        4,
        Math.min(
          reverse ? baseLeft - panelWidth - 4 : baseLeft,
          viewport.width - panelWidth * 2 - 8,
        ),
      )
    : baseLeft;
  const available = Math.max(
    96,
    Math.min(400, viewport.height - (position.top ?? position.bottom ?? 0) - 4),
  );
  const mainHeight = Math.max(48, available - 49);
  const subHeight = Math.max(48, available - 12);
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useLayoutEffect(() => {
    if (!openSub)
      return void setSubPosition((previous) =>
        previous.top === 0 && previous.bottom === undefined ? previous : { top: 0 },
      );
    const main = mainRef.current;
    const sub = subRef.current;
    const row = main?.querySelector(`[data-reference-kind="${menu.kind}"]`);
    if (!main || !sub || !row) return;
    const update = () => {
      const mainRect = main.getBoundingClientRect();
      const top = Math.max(0, row.getBoundingClientRect().top - mainRect.top);
      const next =
        top + sub.getBoundingClientRect().height > mainRect.height ? { bottom: 0 } : { top };
      setSubPosition((previous) =>
        previous.top === next.top && previous.bottom === next.bottom ? previous : next,
      );
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(main);
    observer.observe(sub);
    observer.observe(row);
    return () => observer.disconnect();
  }, [openSub, menu.kind, panelWidth, mainHeight, subHeight, menu.entries]);
  const listProps = {
    activeNodeId: menu.activeNodeId,
    keyboardOptions: menu.keyboardOptions,
    onSelect,
    asset,
    portalTarget,
  };
  return (
    <div
      ref={rootRef}
      id={id}
      role="listbox"
      aria-label="画布引用素材"
      className={`node-reference-menu ${reverse ? 'is-reversed' : ''}`}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      data-popover-safe="true"
      data-script-mention-dropdown="true"
      style={{
        left,
        top: position.top,
        bottom: position.bottom,
        '--reference-panel-width': `${panelWidth}px`,
        ...(openSub ? { width: panelWidth * 2 + 4 } : {}),
      }}
    >
      <div ref={mainRef} className="node-reference-panel" data-reference-main-panel="true">
        <label className="node-reference-search" onMouseEnter={menu.closeKind}>
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            aria-label="搜索引用素材"
            placeholder="搜索"
            value={menu.search}
            onChange={(event) => menu.setSearch(event.target.value)}
          />
        </label>
        {data.status === 'loading' ? (
          <div className="node-reference-empty" role="status">
            加载中…
          </div>
        ) : data.status === 'error' ? (
          <div className="node-reference-empty" role="alert">
            引用素材加载失败
            <button type="button" className="node-reference-retry" onClick={data.retry}>
              重试
            </button>
          </div>
        ) : menu.query ? (
          <CanvasReferenceEntries entries={menu.entries} maxHeight={mainHeight} {...listProps} />
        ) : (
          <div
            className="node-reference-main-scroll"
            style={{ maxHeight: mainHeight }}
            data-reference-main-scroll="true"
          >
            {menu.connected.length > 0 && (
              <div data-reference-connected-group="true" onMouseEnter={menu.closeKind}>
                <div className="node-reference-heading">已引用</div>
                {menu.visibleConnected.map((option, index) => (
                  <CanvasReferenceOption
                    key={`${option.nodeId}-${index}`}
                    option={option}
                    {...listProps}
                  />
                ))}
                {menu.visibleConnected.length < menu.connected.length && (
                  <button
                    type="button"
                    className="node-reference-option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={menu.showAll}
                  >
                    <span className="node-reference-kind-icon">
                      <Icon name="more" size={14} />
                    </span>
                    <span>更多</span>
                  </button>
                )}
              </div>
            )}
            <div className="node-reference-heading">素材引用</div>
            {menu.kinds.map((kind) => (
              <button
                key={kind}
                type="button"
                data-reference-kind={kind}
                className={`node-reference-option ${menu.kind === kind ? 'is-active' : ''}`}
                onMouseEnter={() => menu.openKind(kind)}
                onFocus={() => menu.openKind(kind)}
              >
                <span className="node-reference-kind-icon">
                  <img src={`/assets/icons/mention-reference-${kind}.svg`} alt="" />
                </span>
                <span>{REFERENCE_LABELS[kind]}</span>
                <Icon name="right-s" size={14} />
              </button>
            ))}
            {onOpenAssetPicker && (
              <button
                type="button"
                data-reference-asset-entry="true"
                className="node-reference-option"
                onMouseEnter={menu.closeKind}
                onMouseDown={(event) => event.preventDefault()}
                onClick={onOpenAssetPicker}
              >
                <span className="node-reference-kind-icon">
                  <img src="/assets/icons/mention-reference-asset.svg" alt="" />
                </span>
                <span>资产</span>
              </button>
            )}
          </div>
        )}
      </div>
      {openSub && (
        <div
          ref={subRef}
          className="node-reference-panel node-reference-submenu"
          data-reference-submenu-panel="true"
          style={subPosition}
          onMouseEnter={menu.cancelKindClose}
        >
          <CanvasReferenceEntries entries={menu.entries} maxHeight={subHeight} {...listProps} />
        </div>
      )}
    </div>
  );
}
