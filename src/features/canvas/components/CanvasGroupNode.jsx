import { useEffect, useRef, useState } from 'react';
import { resolveStoryboardGridPresentation } from '../domain/storyboard-grid-presentation-model.js';
import { STORYBOARD_GRID_SHELL_BACKGROUND } from '../domain/storyboard-grid-create-model.js';
import { extractStoryboardRatioFromNodeParams } from '../domain/storyboard-grid-model.js';
import { canvasNodeSize } from '../domain/groups.js';
import { StoryboardGroupToolbar } from './StoryboardGroupToolbar.jsx';
import { GeneralGroupToolbar } from './GeneralGroupToolbar.jsx';
import { CanvasGroupResizer } from './CanvasGroupResizer.jsx';
import './canvas-groups.css';
import CanvasReferencePickMask from './CanvasReferencePickMask.jsx';
export function CanvasGroupNode({
  node,
  nodes = [],
  position,
  zIndex = 0,
  selected,
  drag,
  shouldSuppressClick,
  setSelected,
  readonly,
  ready,
  zoom,
  onUngroup,
  onRun,
  onCreateWorkflow,
  onBatchGenerateVideo,
  onDownload,
  onCancelDownload,
  canDownload = false,
  isDownloading = false,
  downloadProgress,
  batchVideoAvailability,
  groupServiceState,
  storyboardHoverCount,
  onStoryboardSlotClick,
  controlsVisible = false,
  controlsAnchor,
  controlsPortal,
  controlsDocumentKey,
  onGroupCommand,
  groupControlBusy = false,
  resizeVisible = false,
  onResizeStart,
  referencePick,
  focusMode,
  markMode,
}) {
  const active = selected.includes(node.id);
  const declaredStandaloneImage = Boolean(
    node.data?.standaloneStoryboardImageGrid && node.data?.storyboardGroupType === 'image',
  );
  const dimensions = canvasNodeSize(node);
  const storyboard = resolveStoryboardGridPresentation({
    node,
    nodes,
    hoverCount: storyboardHoverCount,
    zoom,
  });
  const slotInteractive =
    ready && !focusMode?.active && !markMode?.active && typeof onStoryboardSlotClick === 'function';
  const host = useRef(null),
    titleInput = useRef(null),
    titleOwner = useRef(null);
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(''),
    [renameCooldown, setRenameCooldown] = useState(false);
  const linked = Boolean(node.data?.sourceScriptNodeId);
  const label =
    node.data?.name ||
    node.data?.characterAsset?.roleName ||
    node.data?.label ||
    (declaredStandaloneImage || linked ? '分镜图' : '分组');
  const titleEditable = Boolean(
    ready &&
    !readonly &&
    !referencePick?.active &&
    !focusMode?.active &&
    !markMode?.active &&
    !groupControlBusy &&
    typeof onGroupCommand === 'function',
  );
  const latestTitle = useRef(null);
  latestTitle.current = {
    id: node.id,
    label,
    documentKey: controlsDocumentKey,
    editable: titleEditable,
    onGroupCommand,
  };
  useEffect(() => {
    if (editing) {
      titleInput.current?.focus();
      titleInput.current?.select();
      return;
    }
    const timer = window.setTimeout(() => setRenameCooldown(false), 200);
    return () => window.clearTimeout(timer);
  }, [editing]);
  useEffect(() => {
    const owner = titleOwner.current;
    if (
      !owner ||
      (titleEditable &&
        owner.id === node.id &&
        owner.label === label &&
        owner.documentKey === controlsDocumentKey)
    )
      return;
    titleOwner.current = null;
    setEditing(false);
  }, [titleEditable, node.id, label, controlsDocumentKey]);
  const beginRename = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!titleEditable) return;
    titleOwner.current = { id: node.id, label, documentKey: controlsDocumentKey };
    setDraft(label);
    setRenameCooldown(true);
    setEditing(true);
  };
  const finishRename = (cancel = false, restoreFocus = false) => {
    const owner = titleOwner.current;
    titleOwner.current = null;
    setEditing(false);
    if (!owner) return;
    const current = latestTitle.current;
    if (
      !current.editable ||
      current.id !== owner.id ||
      current.label !== owner.label ||
      current.documentKey !== owner.documentKey
    )
      return;
    const value = draft.trim();
    if (!cancel && value && value !== owner.label)
      current.onGroupCommand(owner.id, { type: 'rename', value });
    if (restoreFocus)
      queueMicrotask(() => {
        if (
          latestTitle.current.id === owner.id &&
          latestTitle.current.documentKey === owner.documentKey
        )
          host.current?.focus();
      });
  };
  const colored = Boolean(node.data?.groupColor && !editing);
  const chipColors = {
    '#FF3B30': 'var(--nt-red-1000, #4e1714)',
    '#FF9500': 'var(--nt-orange-1000, #552806)',
    '#FFCC00': 'var(--nt-yellow-1000, #573b10)',
    '#34C759': 'var(--nt-green-1000, #0c4327)',
    '#30D5C8': 'var(--nt-cyan-1000, #014a5a)',
    '#007AFF': 'var(--nt-blue-1000, #10245f)',
    '#5856D6': 'var(--nt-purple-1000, #2e1b63)',
    '#FF2D95': 'var(--nt-pink-1000, #5f1037)',
    '#8E8E93': 'var(--nt-neutral-1000, #161616)',
  };
  const firstImage = nodes.find((child) => child.parentId === node.id && child.type === 'image');
  const children = nodes.filter((child) => child.parentId === node.id);
  const anyChildHasContent =
    linked &&
    node.data?.sourceScriptVersion === 'v2' &&
    children.some((child) => {
      const url = child.data?.url;
      return Array.isArray(url)
        ? url.some((value) => typeof value === 'string' && value.trim())
        : typeof url === 'string' && Boolean(url.trim());
    });
  const titleStyle = {
    ...(storyboard?.titleStyle ?? {
      position: 'absolute',
      left: 0,
      bottom: `calc(100% + ${8 / Math.max(zoom, 1)}px)`,
      transform: `scale(${1 / zoom})`,
      transformOrigin: 'bottom left',
    }),
    maxWidth: (node.measured?.width ?? node.width ?? 350) * zoom,
  };
  return (
    <article
      ref={host}
      data-node-id={node.id}
      className={`cv-node cv-group-node${active ? ' cv-selected' : ''}${storyboard ? ' cv-storyboard-grid-node' : ''}`}
      data-storyboard-group={storyboard ? 'true' : undefined}
      data-storyboard-group-type={storyboard ? 'image' : undefined}
      aria-label={label}
      tabIndex={0}
      style={{
        left: position.x,
        top: position.y,
        width: dimensions.width,
        height: dimensions.height,
        zIndex,
        background:
          node.style?.background ??
          (node.data?.groupColor
            ? `${node.data.groupColor}1A`
            : declaredStandaloneImage || (linked && node.data?.storyboardGroupType === 'video')
              ? STORYBOARD_GRID_SHELL_BACKGROUND
              : 'var(--canvas-group-bg, #ffffff1a)'),
        border:
          node.style?.border ??
          `1px solid ${node.data?.groupColor ? `${node.data.groupColor}33` : 'var(--canvas-group-border, #ffffff1a)'}`,
      }}
      onPointerDown={(event) => {
        if (referencePick?.active) referencePick.prepareNodeClick();
        else if (!focusMode?.active && !markMode?.active) drag(event, node);
      }}
      onClick={(event) => {
        if (focusMode?.active || markMode?.active) {
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        if (shouldSuppressClick?.(event)) return;
        if (referencePick?.active) {
          if (!referencePick.suppressNodeClick(event)) referencePick.pick(node.id);
          return;
        }
        if (!event.shiftKey && !active) setSelected([node.id]);
      }}
    >
      {referencePick?.active && (
        <CanvasReferencePickMask
          state={referencePick.description.groupPickableIds.has(node.id) ? 'pickable' : undefined}
          label={label}
          group
          zoom={zoom}
          onPointerDown={() => referencePick.prepareNodeClick()}
          onPick={(event) => {
            if (shouldSuppressClick?.(event) || referencePick.suppressNodeClick(event)) return;
            referencePick.pick(node.id);
          }}
        />
      )}
      <div
        className={`cv-group-title cv-group-external-title${storyboard ? ' cv-storyboard-grid-title' : ''}${titleEditable ? ' cv-storyboard-editable-title' : ''}`}
        style={{
          ...titleStyle,
          ...(editing ? { width: titleStyle.maxWidth } : {}),
          ...(colored
            ? {
                height: 24,
                padding: '0 6px',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: '18px',
                color: '#fff',
                backgroundColor:
                  chipColors[node.data.groupColor] ??
                  `color-mix(in srgb, ${node.data.groupColor} 30%, #000)`,
              }
            : {}),
        }}
      >
        {editing ? (
          <input
            ref={titleInput}
            className="cv-storyboard-title-input nodrag nopan nowheel"
            aria-label={storyboard ? '分镜组名称' : '分组名称'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => finishRename()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229))
                return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                finishRename(event.key === 'Escape', true);
              }
            }}
          />
        ) : (
          <span
            className={storyboard ? 'cv-storyboard-title-label' : 'cv-group-title-label'}
            role={titleEditable ? 'button' : undefined}
            tabIndex={titleEditable ? 0 : undefined}
            aria-label={titleEditable ? (storyboard ? '重命名分镜组' : '重命名分组') : undefined}
            title={label}
            onDoubleClick={titleEditable ? beginRename : undefined}
            onKeyDown={
              titleEditable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === 'F2') beginRename(event);
                  }
                : undefined
            }
          >
            {label}
          </span>
        )}
      </div>
      {storyboard && !readonly && storyboard.slots.length > 0 && (
        <div
          className="cv-storyboard-grid-placeholders"
          style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}
        >
          {storyboard.slots.map((slot) => (
            <button
              key={`storyboard-empty-slot-${slot.index}`}
              type="button"
              className="cv-storyboard-grid-slot nodrag nopan"
              data-storyboard-slot={slot.index}
              data-storyboard-hover={slot.highlighted ? 'true' : undefined}
              aria-label={`向分镜组第 ${slot.index + 1} 格添加图片`}
              disabled={!slotInteractive}
              style={{
                position: 'absolute',
                left: slot.position.x,
                top: slot.position.y,
                width: slot.size.width,
                height: slot.size.height,
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                padding: 0,
                fontSize: 32,
                lineHeight: 1,
                background: `var(--cv-storyboard-slot-current-bg, ${slot.background})`,
                color: `var(--cv-storyboard-slot-current-color, ${slot.color})`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (!slotInteractive || shouldSuppressClick?.(event)) return;
                setSelected([node.id]);
                onStoryboardSlotClick(node.id, slot.index, event.currentTarget);
              }}
            >
              +
            </button>
          ))}
        </div>
      )}
      {!readonly &&
        !declaredStandaloneImage &&
        !(linked && node.data?.storyboardGroupType === 'video') && (
          <CanvasGroupResizer
            groupId={node.id}
            selected={active}
            visible={resizeVisible}
            zoom={zoom}
            disabled={!ready || groupControlBusy}
            onResizeStart={onResizeStart}
          />
        )}
      {storyboard && controlsVisible && !readonly && !editing && !renameCooldown && (
        <StoryboardGroupToolbar
          key={`${controlsDocumentKey ?? ''}:${node.id}`}
          groupId={node.id}
          aspect={extractStoryboardRatioFromNodeParams(firstImage?.data?.params) ?? '16:9'}
          cols={storyboard.cols}
          rows={storyboard.rows}
          manualCols={node.data?.storyboardManualGridCols}
          manualRows={node.data?.storyboardManualGridRows}
          showShotNumbers={node.data?.showStoryboardShotNumbers}
          aspectLocked={linked}
          isScriptLinked={linked}
          isGroupRunning={groupServiceState?.running ?? false}
          pipelineProgress={groupServiceState?.pipelineProgress}
          onRunGroup={onRun}
          anchor={controlsAnchor}
          portal={controlsPortal}
          disabled={!ready}
          busy={groupControlBusy}
          onCommand={onGroupCommand}
          onUngroup={onUngroup}
        />
      )}
      {!declaredStandaloneImage && controlsVisible && !readonly && !editing && !renameCooldown && (
        <GeneralGroupToolbar
          key={`${controlsDocumentKey ?? ''}:${node.id}`}
          groupId={node.id}
          groupColor={node.data?.groupColor}
          linked={linked}
          sourceScriptVersion={node.data?.sourceScriptVersion}
          anyChildHasContent={anyChildHasContent}
          isGroupRunning={groupServiceState?.running ?? false}
          pipelineProgress={groupServiceState?.pipelineProgress}
          workflowUuid={node.data?.workflowUuid}
          allChildrenAreImageNodes={
            children.length > 0 && children.every((child) => child.type === 'image')
          }
          batchVideoAvailability={batchVideoAvailability}
          canDownload={canDownload}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          anchor={controlsAnchor}
          portal={controlsPortal}
          disabled={!ready}
          busy={groupControlBusy}
          onCommand={onGroupCommand}
          onRun={onRun}
          onUngroup={onUngroup}
          onCreateWorkflow={onCreateWorkflow}
          onBatchGenerateVideo={onBatchGenerateVideo}
          onDownload={onDownload}
          onCancelDownload={onCancelDownload}
        />
      )}
    </article>
  );
}
