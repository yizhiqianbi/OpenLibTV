import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bot,
  ChevronDown,
  Copy,
  Download,
  FolderPlus,
  Group,
  LayoutGrid,
  Square,
  Sparkles,
} from 'lucide-react';
import {
  agentToolbarPosition,
  useAgentToolbarPopover,
} from '../../../hooks/useAgentToolbarPopover.js';
import { CANVAS_BATCH_LAYOUTS, canvasSelectionIds } from './model.js';
import './batch.css';

const unchangedPlacement = (previous, next) =>
  previous && Object.keys(next).every((key) => previous[key] === next[key]);

/** Keep source screen-sized controls reachable when the selection leaves a narrow viewport. */
function useSelectionToolbarAnchor(anchorPoint, visible) {
  const ref = useRef(null);
  const latestPoint = useRef(anchorPoint);
  latestPoint.current = anchorPoint;
  const measureRef = useRef(null);
  const [placement, setPlacement] = useState(null);
  const anchored = Number.isFinite(anchorPoint?.x) && Number.isFinite(anchorPoint?.y);
  useLayoutEffect(() => {
    if (!anchored || !visible || !ref.current) return;
    const toolbar = ref.current;
    const board = toolbar.closest('.cv-board') || toolbar.parentElement;
    let frame;
    const measure = () => {
      const point = latestPoint.current;
      if (!toolbar.isConnected || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
      const size = toolbar.getBoundingClientRect();
      const available = board?.getBoundingClientRect();
      const boardWidth = available?.width || board?.clientWidth || 0;
      const boardHeight = available?.height || board?.clientHeight || 0;
      const width =
        boardWidth > 0 ? Math.min(size.width, Math.max(0, boardWidth - 16)) : size.width;
      const height = size.height;
      const left = 8 + width / 2;
      const right = boardWidth - 8 - width / 2;
      const top = height + 22;
      const bottom = boardHeight + 6;
      const next = {
        x: boardWidth > 0 ? Math.max(left, Math.min(point.x, Math.max(left, right))) : point.x,
        y: boardHeight > 0 ? Math.max(top, Math.min(point.y, Math.max(top, bottom))) : point.y,
        boardWidth,
        boardHeight,
        width,
        height,
      };
      setPlacement((previous) => (unchangedPlacement(previous, next) ? previous : next));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measureRef.current = measure;
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(toolbar);
    if (board) observer?.observe(board);
    window.addEventListener('resize', schedule);
    return () => {
      if (measureRef.current === measure) measureRef.current = null;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [anchored, visible]);
  useLayoutEffect(() => {
    measureRef.current?.();
  }, [anchorPoint?.x, anchorPoint?.y]);
  return {
    ref,
    placement,
    style: anchored
      ? {
          position: 'absolute',
          left: placement?.x ?? anchorPoint.x,
          top: placement?.y ?? anchorPoint.y,
          transform: 'translate(-50%, -100%) translateY(-14px)',
          zIndex: 30,
          ...(placement?.boardWidth > 0
            ? { maxWidth: Math.max(0, placement.boardWidth - 16) }
            : {}),
        }
      : null,
  };
}

/** Source n6: ordinary multi-selection has actions, not a shared generator schema. */
export default function CanvasSelectionToolbar({
  selectedIds,
  nodes,
  ready = true,
  readonly = false,
  className = '',
  style,
  anchorPoint,
  workspaceUI = true,
  isTeamProject = false,
  onLayoutChange,
  onCreateAsset,
  onDuplicate,
  onGroup,
  onGroupStoryboard,
  canGroup = true,
  canStoryboardGroup = false,
  storyboardGroupDisabledReason = '当前选择无法合并分镜组',
  onDownloadAll,
  onCancelDownload,
  isDownloading = false,
  canDownloadAll = true,
  onAddToChat,
  onCreateSkill,
}) {
  const ids = canvasSelectionIds(nodes, selectedIds);
  const disabled = readonly || !ready || ids.length < 2;
  const anchor = useSelectionToolbarAnchor(anchorPoint, !readonly && ids.length >= 2);
  const layout = useAgentToolbarPopover({ width: 150, maxHeight: 160, disabled });
  const group = useAgentToolbarPopover({
    width: 172,
    maxHeight: 130,
    disabled,
    trigger: 'hover',
    openDelay: 0,
    closeDelay: 120,
  });
  const [menuPositions, setMenuPositions] = useState({ layout: null, group: null });
  const hasAnchor = Boolean(anchor.style);
  useLayoutEffect(() => {
    const positionMenu = (open, triggerRef, popoverRef, width, maxHeight) => {
      if (!hasAnchor || !open) return null;
      const trigger = triggerRef.current?.getBoundingClientRect();
      const size = popoverRef.current?.getBoundingClientRect();
      return trigger && size
        ? agentToolbarPosition(
            trigger,
            size,
            { width: window.innerWidth, height: window.innerHeight },
            { width, maxHeight },
          )
        : null;
    };
    const next = {
      layout: positionMenu(layout.open, layout.triggerRef, layout.popoverRef, 150, 160),
      group: positionMenu(group.open, group.triggerRef, group.popoverRef, 172, 130),
    };
    setMenuPositions((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }, [
    hasAnchor,
    anchor.placement,
    anchorPoint?.x,
    anchorPoint?.y,
    layout.open,
    layout.triggerRef,
    layout.popoverRef,
    layout.popoverStyle,
    group.open,
    group.triggerRef,
    group.popoverRef,
    group.popoverStyle,
  ]);
  const invoke = (callback) => {
    if (!disabled) callback?.(ids);
  };
  if (readonly || ids.length < 2) return null;
  const saveLabel = workspaceUI ? '保存到资产' : '保存到资产库';
  return (
    <>
      <div
        ref={anchor.ref}
        className={`cv-selection-toolbar nodrag nopan nowheel ${className}`}
        style={{ ...style, ...anchor.style }}
        role="toolbar"
        aria-label="多选节点操作"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {onLayoutChange && (
          <>
            <button
              type="button"
              ref={layout.triggerRef}
              {...layout.triggerProps}
              disabled={disabled}
              title="整理布局"
              aria-label="整理布局"
            >
              <LayoutGrid size={14} />
            </button>
            <span className="cv-batch-divider" />
          </>
        )}
        {onCreateAsset && (
          <button type="button" disabled={disabled} onClick={() => invoke(onCreateAsset)}>
            <FolderPlus size={16} />
            <span>
              {isTeamProject ? (workspaceUI ? '保存到团队资产' : '保存到团队资产库') : saveLabel}
            </span>
          </button>
        )}
        {onDuplicate && (
          <button
            type="button"
            title="复制全部，包括连线"
            disabled={disabled}
            onClick={() => invoke(onDuplicate)}
          >
            <Copy size={14} />
            <span>创建副本</span>
          </button>
        )}
        {canGroup && onGroup && (
          <>
            <span className="cv-batch-divider" />
            <button
              type="button"
              ref={group.triggerRef}
              {...group.triggerProps}
              onFocus={undefined}
              aria-haspopup="menu"
              disabled={disabled}
              aria-label="分组菜单"
            >
              <Group size={16} />
              <span>打组</span>
              <ChevronDown size={12} />
            </button>
          </>
        )}
        {onDownloadAll && (
          <button
            type="button"
            disabled={
              disabled ||
              (!isDownloading && !canDownloadAll) ||
              (isDownloading && !onCancelDownload)
            }
            title={
              isDownloading
                ? '停止批量下载'
                : canDownloadAll
                  ? '批量下载'
                  : '所选节点没有可下载内容'
            }
            aria-label={isDownloading ? '停止批量下载' : '批量下载'}
            onClick={() => invoke(isDownloading ? onCancelDownload : onDownloadAll)}
          >
            {isDownloading ? <Square size={14} /> : <Download size={20} />}
          </button>
        )}
        {workspaceUI && (onAddToChat || onCreateSkill) && <span className="cv-batch-divider" />}
        {workspaceUI && onAddToChat && (
          <button type="button" disabled={disabled} onClick={() => invoke(onAddToChat)}>
            <Bot size={14} />
            <span>添加到Chat</span>
          </button>
        )}
        {workspaceUI && onCreateSkill && (
          <button type="button" disabled={disabled} onClick={() => invoke(onCreateSkill)}>
            <Sparkles size={14} />
            <span>创建为Skill</span>
          </button>
        )}
      </div>
      {layout.open &&
        createPortal(
          <div
            ref={layout.popoverRef}
            {...layout.popoverProps}
            style={menuPositions.layout || layout.popoverStyle}
            className="cv-batch-menu"
            role="menu"
            aria-label="整理布局"
          >
            {CANVAS_BATCH_LAYOUTS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (!disabled) onLayoutChange(item.value, ids);
                  layout.close({ restoreFocus: true });
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
      {group.open &&
        createPortal(
          <div
            ref={group.popoverRef}
            {...group.popoverProps}
            style={menuPositions.group || group.popoverStyle}
            className="cv-batch-menu"
            role="menu"
            aria-label="分组"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                invoke(onGroup);
                group.close({ restoreFocus: true });
              }}
            >
              打组
            </button>
            {onGroupStoryboard && (
              <button
                type="button"
                role="menuitem"
                disabled={!canStoryboardGroup}
                title={!canStoryboardGroup ? storyboardGroupDisabledReason : undefined}
                onClick={() => {
                  if (canStoryboardGroup) invoke(onGroupStoryboard);
                  group.close({ restoreFocus: true });
                }}
              >
                合并分镜组
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
