import { CanvasNode } from '.././components/CanvasNode.jsx';
import { StoryboardPanel } from '.././components/StoryboardPanel.jsx';
import { CanvasMinimap } from '.././components/CanvasMinimap.jsx';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  MousePointer2,
  Hand,
  Sparkles,
  Upload,
  FolderOpen,
  Undo2,
  Redo2,
  Maximize,
  Search,
  Link2,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  Layers,
} from 'lucide-react';
import { TYPES, typeInfo } from '.././catalog.js';
import { mediaUrl } from '.././model.js';
import { canvasWorldNodes, isCanvasGroup, canvasNodeSize } from '../domain/groups.js';
import { CanvasGroupNode } from './CanvasGroupNode.jsx';
import { CanvasEdgeLayer } from './CanvasEdgeLayer.jsx';
import { canvasVisibleEdgeIds } from '../domain/edge-interaction-model.js';
import { CanvasConnectionMenu } from './CanvasConnectionMenu.jsx';
import {
  LazyCanvasNodeInlineGenerator as CanvasNodeInlineGenerator,
  LazyScriptV2NodeGenerator as ScriptV2NodeGenerator,
  LazyVideoClipComposer,
} from './CanvasGeneratorEntry.jsx';
import { projectScriptV2Card } from '../storyboard/script-card-model.js';
import CanvasSelectionToolbar from '../batch/CanvasSelectionToolbar.jsx';
import { CanvasConnectionPreview } from './CanvasConnectionPreview.jsx';
import { canvasToScreen } from '../geometry.js';
import { canvasConnectionGhost } from '../domain/connection-ghost-model.js';
import { CanvasConnectionGhost, CanvasConnectionGhostEdge } from './CanvasConnectionGhost.jsx';
import { useMemo } from 'react';
import CanvasSelectionOverlay, { CanvasSelectionAddIndicator } from './CanvasSelectionOverlay.jsx';
import CanvasMultiConnectionPreview from './CanvasMultiConnectionPreview.jsx';
import { canvasSelectionOverlayProjection } from '../domain/selection-overlay-model.js';
import { canvasMultiConnectionEntryProjection } from '../domain/multi-connection-entry-model.js';
import { canvasNodeStackingOrder } from '../domain/node-stacking-model.js';
import { canvasImageGroupChrome } from '../domain/image-group-chrome-model.js';
import { resolveCanvasStoryboardShotNumber } from '../domain/storyboard-shot-number-model.js';
import { canvasGroupVideoAvailability } from '../domain/script-group-controls-model.js';
import { canvasSelectionDownloadItems } from '../batch/selection-actions.js';
import CanvasReferencePickBar from './CanvasReferencePickBar.jsx';
import CanvasFocusModeBar from '../generator/focus/CanvasFocusModeBar.jsx';
import FocusConfirmEntry from '../generator/focus/FocusConfirmEntry.jsx';
const HIDDEN_GROUP_VIDEO_AVAILABILITY = { visible: false, enabled: false };
export function CanvasViewport({
  addNode,
  clip,
  agentOpen,
  begin,
  board,
  viewAnimation = 0,
  chatShare,
  connect,
  connection,
  context,
  drag,
  dragSelection,
  selectionOverlay,
  groupControls,
  groupResize,
  multiConnectionEntry,
  altCopy,
  nodeDragPreview,
  referencePick,
  focusMode,
  markMode,
  onStoryboardSlotClick,
  multiConnection,
  duplicate,
  edges,
  edgeInteraction,
  end,
  fileInput,
  fit,
  future,
  history,
  linkPoint,
  linking,
  loadError,
  loaded,
  menu,
  move,
  navigate,
  nodes,
  onClose,
  openLibrary,
  point,
  readonly,
  record,
  onDeleteEdge,
  redo,
  replay,
  selected,
  selectionRect,
  setAgentOpen,
  setContext,
  setDialog,
  setEdges,
  setLinkPoint,
  setLinking,
  setMenu,
  setPanel,
  setSelected,
  setShowEdges,
  setShowMap,
  setTool,
  setView,
  sharedMessages,
  showEdges,
  showMap,
  src,
  surface,
  spaceHeld = false,
  tool,
  undo,
  update,
  upload,
  view,
  zoom,
  generator,
  onGroup,
  onUngroup,
  onGroupRun,
  onGroupCreateWorkflow,
  onGroupBatchGenerateVideo,
  onLayout,
  selectionActions,
  shouldSuppressClick,
  onShotBreakdownUpload,
  onShotBreakdownPick,
  onShotBreakdownUpdate,
  notify,
}) {
  const worldNodes = useMemo(() => canvasWorldNodes(nodes), [nodes]);
  const nodeStacking = useMemo(() => canvasNodeStackingOrder(nodes, selected), [nodes, selected]);
  const worldById = useMemo(() => new Map(worldNodes.map((node) => [node.id, node])), [worldNodes]);
  const shotNumbers = useMemo(
    () =>
      new Map(
        nodes
          .filter((node) => node.type === 'image')
          .map((node) => [node.id, resolveCanvasStoryboardShotNumber(node, nodes)]),
      ),
    [nodes],
  );
  const singleSelected = selected.length === 1 ? worldById.get(selected[0]) : null;
  const referenceMode = Boolean(referencePick?.active);
  const focusActive = Boolean(focusMode?.active);
  const markActive = Boolean(markMode?.active);
  const interactionMode = referenceMode || markActive || focusActive;
  const visibleEdgeIds = useMemo(
    () => new Set(canvasVisibleEdgeIds(edges, showEdges, selected)),
    [edges, showEdges, selected],
  );
  const visibleNodeIds = useMemo(
    () =>
      new Set(
        nodes
          .filter(
            (node) =>
              !node.hidden &&
              (isCanvasGroup(node) ||
                !chatShare ||
                !node.data?.action?.includes('generate') ||
                replay >= sharedMessages.length - 2),
          )
          .map((node) => node.id),
      ),
    [nodes, chatShare, replay, sharedMessages.length],
  );
  const targetId = referenceMode
    ? referencePick.targetId
    : markActive
      ? markMode.targetId
      : focusActive
        ? focusMode.targetId
        : null;
  const scriptEligible = (nodeId) =>
    !generator?.draggingNode &&
    !generator?.panel &&
    ((interactionMode && targetId === nodeId) ||
      (!selectionRect && selected.length === 1 && selected[0] === nodeId));
  const generalControlGroupId =
    generator?.ready &&
    !readonly &&
    !selectionRect &&
    !generator?.draggingNode &&
    isCanvasGroup(singleSelected) &&
    !(
      singleSelected.data?.standaloneStoryboardImageGrid &&
      singleSelected.data.storyboardGroupType === 'image'
    )
      ? singleSelected.id
      : null;
  const generalGroupCapabilities = useMemo(() => {
    if (!generalControlGroupId) return null;
    const group = nodes.find((node) => node.id === generalControlGroupId);
    if (!group) return null;
    const memberIds =
      group.data?.childNodeIds ??
      nodes.filter((node) => node.parentId === group.id).map((node) => node.id);
    return {
      batchVideoAvailability: canvasGroupVideoAvailability(nodes, group.id),
      canDownload: canvasSelectionDownloadItems(nodes, memberIds).length > 0,
    };
  }, [nodes, generalControlGroupId]);
  const menuRequest = connection?.menu?.menu;
  const ghost = canvasConnectionGhost({
    menu: menuRequest,
    nodes,
    documentKey: generator?.documentKey,
    ready: generator?.ready && !connection?.disabled,
    readonly,
    getNodeSize: canvasNodeSize,
  });
  const menuScreenPosition = () => {
    const bounds = board.current?.getBoundingClientRect();
    return menuRequest?.anchorPoint && bounds
      ? canvasToScreen(menuRequest.anchorPoint, bounds, view)
      : undefined;
  };
  const selectionProjection = canvasSelectionOverlayProjection({
    bounds: selectionOverlay?.bounds,
    view,
  });
  const multiProjection = canvasMultiConnectionEntryProjection({
    entry: multiConnectionEntry,
    view,
  });
  const multiScreenPosition = () => {
    const bounds = board.current?.getBoundingClientRect();
    if (!bounds || !multiProjection) return undefined;
    const release = multiConnection?.menu?.point;
    return release
      ? {
          ...canvasToScreen(release, bounds, view),
          x: canvasToScreen(release, bounds, view).x + 12,
        }
      : {
          x: bounds.left + multiProjection.add.x + 20,
          y: bounds.top + multiProjection.add.y,
        };
  };
  const multiEndpoint =
    multiConnection?.preview?.screenPoint ||
    (multiConnection?.menu?.point && board.current
      ? canvasToScreen(multiConnection.menu.point, board.current.getBoundingClientRect(), view)
      : null);
  const inlineNode =
    !selectionRect && !generator?.draggingNode && selected.length === 1 && !generator?.panel
      ? nodes.find(
          (node) => node.id === selected[0] && ['image', 'video', 'audio'].includes(node.type),
        )
      : null;
  const inlineNodes = new Map(
    nodes
      .filter((node) => ['image', 'video', 'audio'].includes(node.type) && scriptEligible(node.id))
      .map((node) => [node.id, node]),
  );
  const scriptInlineCards = new Map(
    !readonly && generator?.ready
      ? nodes
          .filter((node) => node.type === 'script-v2' && scriptEligible(node.id))
          .map((node) => [node.id, projectScriptV2Card({ node, nodes, edges })])
      : [],
  );
  return (
    <main
      ref={board}
      className={
        'cv-board ' +
        (altCopy ? 'cv-alt-copy ' : '') +
        (referenceMode ? 'cv-reference-pick-active ' : '') +
        (focusActive ? 'cv-focus-mode-active ' : '') +
        (markActive ? 'cv-mark-mode-active ' : '') +
        (edgeInteraction?.interacting ? 'cv-edge-interacting ' : '') +
        (edgeInteraction?.panning ? 'cv-panning ' : '') +
        (tool === 'hand' || spaceHeld ? 'cv-hand' : '') +
        (surface === 'storyboard' ? ' cv-storyboard-active' : '')
      }
      onPointerDownCapture={(event) => {
        if (focusMode?.consumePointer(event)) return;
        if (!referencePick?.beginBox(event)) begin(event);
      }}
      onPointerDown={(event) => {
        if (!interactionMode) begin(event);
      }}
      onPointerMove={(event) => {
        if (!focusMode?.move(event) && !referencePick?.moveBox(event)) move(event);
      }}
      onPointerUp={(event) => {
        if (!focusMode?.end(event) && !referencePick?.endBox(event)) end(event);
      }}
      onPointerCancel={(event) => {
        if (!focusMode?.end(event, true) && !referencePick?.endBox(event, true)) end(event);
      }}
      onLostPointerCapture={(event) => {
        if (!focusMode?.end(event, true) && !referencePick?.endBox(event, true)) end(event);
      }}
      onClick={(event) => {
        if (
          (focusActive || markActive) &&
          !shouldSuppressClick?.(event) &&
          !event.target.closest(
            '.cv-node,.cv-floating,.nopan,button,input,textarea,[contenteditable]',
          )
        )
          (markActive ? markMode : focusMode).paneClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (interactionMode) return;
        const id = e.target.closest('[data-node-id]')?.dataset.nodeId;
        if (id) setSelected([id]);
        setContext({ x: e.clientX, y: e.clientY, nodeId: id, point: point(e) });
        setMenu(null);
      }}
      onDoubleClick={(e) => {
        if (shouldSuppressClick?.(e)) return;
        if (interactionMode || tool === 'hand' || spaceHeld) return;
        if (
          !readonly &&
          !e.target.closest('.cv-node,.cv-floating,.cv-selection-overlay,.cv-selection-add-hit')
        ) {
          setMenu('add');
          setContext({ x: e.clientX, y: e.clientY, point: point(e) });
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (interactionMode) return;
        upload(e.dataTransfer.files, point(e));
      }}
    >
      <div
        className="cv-grid"
        style={{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
        }}
      />
      <div
        className="cv-world"
        style={{
          transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`,
          transition: viewAnimation ? `transform ${viewAnimation}ms ease` : undefined,
        }}
      >
        <svg className="cv-edges" aria-label="画布连线">
          <CanvasEdgeLayer
            edges={edges.filter((edge) => visibleEdgeIds.has(edge.id))}
            worldById={worldById}
            visibleNodeIds={visibleNodeIds}
            selectedNodeIds={selected}
            selectedEdgeIds={edgeInteraction?.selected}
            onSelectEdge={edgeInteraction?.select}
            onDeselectEdge={edgeInteraction?.deselect}
            onDeleteEdge={onDeleteEdge}
            interactionDisabled={
              edgeInteraction?.disabled || interactionMode || tool === 'hand' || spaceHeld
            }
            markMode={markActive}
            readonly={readonly}
            ready={edgeInteraction?.ready ?? generator?.ready}
            documentKey={edgeInteraction?.documentKey ?? generator?.documentKey}
            board={board}
            view={view}
          />
          {connection?.preview && (
            <CanvasConnectionPreview
              preview={connection.preview}
              origin={worldById.get(connection.preview.nodeId)}
              zoom={view.z}
            />
          )}
          <CanvasConnectionGhostEdge ghost={ghost} />
          {!connection?.preview &&
            !ghost &&
            linking &&
            linkPoint &&
            (() => {
              const n = worldById.get(linking);
              if (!n) return null;
              const x = n.position.x + (n.width || 350),
                y = n.position.y + (n.height || 230) / 2;
              return (
                <path
                  className="cv-link-preview"
                  d={`M${x},${y} C${x + 100},${y} ${linkPoint.x - 100},${linkPoint.y} ${linkPoint.x},${linkPoint.y}`}
                />
              );
            })()}
        </svg>
        <CanvasConnectionGhost ghost={ghost} />
        {[...nodes.filter(isCanvasGroup), ...nodes.filter((node) => !isCanvasGroup(node))].map(
          (n) => {
            if (n.hidden) return null;
            const position = worldById.get(n.id).position;
            if (isCanvasGroup(n)) {
              const capabilities = n.id === generalControlGroupId ? generalGroupCapabilities : null;
              const downloadState = selectionActions?.downloadState;
              return (
                <CanvasGroupNode
                  key={n.id}
                  node={n}
                  nodes={nodes}
                  storyboardHoverCount={
                    nodeDragPreview?.targetGroupId === n.id ? nodeDragPreview.count : 0
                  }
                  onStoryboardSlotClick={onStoryboardSlotClick}
                  zIndex={nodeStacking.get(n.id)}
                  {...{ position, selected, drag, setSelected, readonly, shouldSuppressClick }}
                  ready={generator?.ready}
                  onGroupCommand={groupControls?.command}
                  groupControlBusy={groupControls?.busyGroupIds.includes(n.id)}
                  onResizeStart={groupResize?.begin}
                  referencePick={referenceMode ? referencePick : null}
                  focusMode={focusActive ? focusMode : null}
                  markMode={markActive ? markMode : null}
                  resizeVisible={
                    !interactionMode &&
                    generator?.ready &&
                    !readonly &&
                    !selectionRect &&
                    (!generator?.draggingNode || groupResize?.groupId === n.id) &&
                    selected.length === 1 &&
                    selected[0] === n.id
                  }
                  controlsDocumentKey={generator?.documentKey}
                  controlsPortal={board.current}
                  controlsAnchor={{
                    x: view.x + (position.x + canvasNodeSize(n).width / 2) * view.z,
                    y: view.y + position.y * view.z,
                  }}
                  controlsVisible={
                    !interactionMode &&
                    !selectionRect &&
                    !generator?.draggingNode &&
                    selected.length === 1 &&
                    (selected[0] === n.id ||
                      (n.data?.standaloneStoryboardImageGrid &&
                        n.data.storyboardGroupType === 'image' &&
                        singleSelected?.type === 'image' &&
                        singleSelected.parentId === n.id))
                  }
                  zoom={view.z}
                  onUngroup={onUngroup}
                  onRun={onGroupRun}
                  onLayout={(id, mode) => onLayout(mode, [], id)}
                  onCreateWorkflow={onGroupCreateWorkflow}
                  onBatchGenerateVideo={onGroupBatchGenerateVideo}
                  batchVideoAvailability={
                    capabilities?.batchVideoAvailability ?? HIDDEN_GROUP_VIDEO_AVAILABILITY
                  }
                  canDownload={capabilities?.canDownload ?? false}
                  isDownloading={Boolean(downloadState?.running && downloadState.groupId === n.id)}
                  downloadProgress={{
                    current: downloadState?.finished ?? 0,
                    total: downloadState?.total ?? 0,
                  }}
                  onDownload={(id) => {
                    const graph = generator?.getDocument?.();
                    if (
                      graph?.documentKey !== generator?.documentKey ||
                      !graph.ready ||
                      graph.readonly ||
                      id !== n.id
                    )
                      return;
                    const group = graph.nodes.find((node) => node.id === id);
                    if (!group) return;
                    const ids =
                      group.data?.childNodeIds ??
                      graph.nodes.filter((node) => node.parentId === id).map((node) => node.id);
                    selectionActions?.toolbarProps.onDownloadAll(ids, { groupId: id });
                  }}
                  onCancelDownload={selectionActions?.toolbarProps.onCancelDownload}
                />
              );
            }
            if (
              chatShare &&
              n.data?.action?.includes('generate') &&
              replay < sharedMessages.length - 2
            )
              return null;
            const info = typeInfo(n.type),
              Icon = info.icon,
              url = mediaUrl(n);
            return (
              <CanvasNode
                key={n.id}
                zIndex={nodeStacking.get(n.id)}
                storyboardShotNumber={shotNumbers.get(n.id)}
                {...canvasImageGroupChrome(n, worldById.get(n.parentId))}
                {...{
                  Icon,
                  connect,
                  connection,
                  connectionFeedback: {
                    documentKey: generator?.documentKey,
                    gestureId:
                      multiConnection?.preview?.gestureId ??
                      connection?.preview?.gestureId ??
                      menuRequest,
                    active: !!multiConnection?.preview || !!connection?.preview || !!linking,
                    originIds: multiConnection?.preview
                      ? multiConnection.preview.sourceIds
                      : connection?.preview
                        ? [connection.preview.nodeId]
                        : linking
                          ? [linking]
                          : [],
                    invalidTargetId:
                      multiConnection?.preview?.status === 'invalid'
                        ? multiConnection.preview.target?.targetId
                        : connection?.preview?.status === 'invalid'
                          ? connection.preview.target?.targetId
                          : null,
                    edges,
                    frozen: readonly || connection?.disabled || interactionMode,
                    ...(multiConnection?.preview
                      ? {
                          hoveredNodeId: multiConnection.preview.hoveredNodeId,
                          cursor: multiConnection.preview.screenPoint,
                        }
                      : connection?.preview
                        ? {
                            hoveredNodeId: connection.preview.hoveredNodeId,
                            cursor: connection.preview.screenPoint,
                          }
                        : {}),
                  },
                  clip:
                    n.type === 'video-clip'
                      ? {
                          ...clip?.entries?.get(n.id),
                          documentKey: generator?.documentKey,
                          modes: clip?.composer.config?.modes,
                          onOpen: () => clip?.onOpen(n.id),
                          onTryMode: (modeKey) => clip?.composer.applyMode(n.id, modeKey, true),
                          onWarmPresets: clip?.composer.warmPresets,
                          onPlaybackVolumeChange: (volume) =>
                            clip?.composer.changeVolume(n.id, volume),
                          onDownload: () => clip?.onDownload(n.id),
                          draggingConnection:
                            !!multiConnection?.preview || !!connection?.preview || !!linking,
                        }
                      : null,
                  afterContent:
                    n.type === 'video-clip' &&
                    clip?.entries?.get(n.id) &&
                    scriptEligible(n.id) &&
                    !clip.entries.get(n.id).presentation.isEditing &&
                    !clip.entries.get(n.id).presentation.agentBusy ? (
                      <LazyVideoClipComposer
                        key={`${generator.documentKey}:${n.id}`}
                        {...generator}
                        node={n}
                        {...clip.entries.get(n.id)}
                        composerController={clip.composer}
                        {...{ readonly, board, view, src, position }}
                        coordinateOrigin={position}
                        zoom={view.z}
                        onDeleteReference={(sourceId) => clip.onDeleteReference(n.id, sourceId)}
                        onPreview={(preview) => setDialog({ preview })}
                      />
                    ) : scriptInlineCards.get(n.id)?.valid &&
                      !scriptInlineCards.get(n.id).fullGenerationBusy ? (
                      <ScriptV2NodeGenerator
                        key={`${generator.documentKey}:${n.id}`}
                        {...generator}
                        node={n}
                        {...{ nodes, edges, readonly, board, view, position }}
                        modelContent={generator.modelContent}
                        supportContent={generator.scriptTextSupport}
                        commitGraph={generator.graphActions?.commitGraph}
                        coordinateOrigin={position}
                        zoom={view.z}
                        onPreview={(preview) => setDialog({ preview })}
                      />
                    ) : inlineNodes.has(n.id) && generator ? (
                      <CanvasNodeInlineGenerator
                        key={`${generator.documentKey}:${n.id}`}
                        {...generator}
                        focusMode={focusMode}
                        markMode={markMode}
                        node={n}
                        {...{ nodes, edges, readonly, update, board, view }}
                        position={position}
                        coordinateOrigin={position}
                        zoom={view.z}
                        onPreview={(preview) => setDialog({ preview })}
                      />
                    ) : null,
                  drag,
                  referencePick: referenceMode ? referencePick : null,
                  focusMode: focusActive ? focusMode : null,
                  markMode: markActive ? markMode : null,
                  referenceZoom: view.z,
                  duplicate,
                  info,
                  linking,
                  n,
                  readonly,
                  selected,
                  shouldSuppressClick,
                  setDialog,
                  setLinkPoint,
                  setLinking,
                  setPanel,
                  setSelected,
                  src,
                  update,
                  url,
                  position,
                  showActions:
                    !interactionMode && !inlineNode && selected.length === 1 && !selectionRect,
                  script: {
                    toolbar: {
                      selectionEligible: scriptEligible(n.id),
                      anchor: {
                        x: view.x + (position.x + canvasNodeSize(n).width / 2) * view.z,
                        y: view.y + position.y * view.z,
                      },
                      portal: board.current,
                    },
                    nodes,
                    edges,
                    models: generator?.models,
                    documentKey: generator?.documentKey,
                    readonly,
                    ready: generator?.ready,
                    onChange: generator?.graphActions?.patchScript,
                    onApplyGraphPlan: generator?.graphActions?.applyStoryboardPlan,
                    videoConfiguration: {
                      modelContent: generator?.modelContent,
                      supportContent: generator?.videoModelSupport,
                      source: generator?.storyboardVideoSource,
                      projectId: generator?.projectId,
                      selected: generator?.selected,
                      board: generator?.board,
                      commitGraph: generator?.graphActions?.commitGraph,
                      flushGraph: generator?.flushGraph,
                      setSelected: generator?.setSelected,
                      focusCreatedGroup: generator?.focusCreatedGroup,
                      cancelOtherGestures: generator?.cancelOtherGestures,
                      notify: generator?.notify,
                      suspended: generator?.suspended,
                    },
                    imageConfiguration: {
                      modelContent: generator?.modelContent,
                      supportContent: generator?.imageModelSupport,
                      commitGraph: generator?.graphActions?.commitGraph,
                      flushGraph: generator?.flushGraph,
                      cancelOtherGestures: generator?.cancelOtherGestures,
                      notify: generator?.notify,
                      suspended: generator?.suspended,
                    },
                    presetConfiguration: {
                      content: generator?.scriptPresets,
                      commitGraph: generator?.graphActions?.commitGraph,
                      flushGraph: generator?.flushGraph,
                      cancelOtherGestures: generator?.cancelOtherGestures,
                      notify: generator?.notify,
                      suspended: generator?.suspended,
                    },
                    onMutateAsset: generator?.graphActions?.mutateScriptAsset,
                    getDocument: generator?.getDocument,
                    registerDraft: generator?.registerDraft,
                    onJumpToNode: generator?.onFocusReference,
                  },
                  nodes,
                  edges,
                  onShotBreakdownUpload: (file) => onShotBreakdownUpload?.(n.id, file),
                  onShotBreakdownPick: () => onShotBreakdownPick?.(n.id),
                  onShotBreakdownUpdate: (id, data) => onShotBreakdownUpdate?.(id, data),
                  notify,
                }}
              />
            );
          },
        )}
        {selectionRect && (
          <div
            className="cv-selection-rect"
            style={{
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
          />
        )}
      </div>
      {referenceMode &&
        referencePick.boxRect &&
        referencePick.boxRect.width * view.z >= 5 &&
        referencePick.boxRect.height * view.z >= 5 && (
          <div
            className="cv-reference-pick-box"
            aria-hidden="true"
            style={{
              left: referencePick.boxRect.x * view.z + view.x,
              top: referencePick.boxRect.y * view.z + view.y,
              width: referencePick.boxRect.width * view.z,
              height: referencePick.boxRect.height * view.z,
            }}
          />
        )}
      <CanvasReferencePickBar
        active={referenceMode}
        onReturnToTarget={referencePick?.returnToTarget}
        onExit={referencePick?.exit}
      />
      <CanvasFocusModeBar
        active={focusActive}
        onReturnToTarget={focusMode?.returnToTarget}
        onExit={focusMode?.exit}
      />
      {markMode?.entry}
      <FocusConfirmEntry
        modeActive={focusActive}
        active={focusActive && !focusMode?.state.drawing}
        region={focusMode?.state.region}
        selectedRatio={focusMode?.state.ratio}
        surfaceElement={focusMode?.surfaceElement}
        ownerKey={focusMode?.ownerKey}
        disabled={!!focusMode?.state.committed}
        error={focusMode?.state.error}
        onRetrySave={focusMode?.retrySave}
        onRatioChange={focusMode?.chooseRatio}
        onCancel={focusMode?.cancelPending}
        onConfirm={focusMode?.confirm}
      />
      {!interactionMode && selectionOverlay && surface === 'workflow' && (
        <CanvasSelectionOverlay
          bounds={selectionOverlay.bounds}
          view={view}
          readonly={readonly}
          ready={generator?.ready}
          sourceNodes={multiConnection?.sources}
          dragging={generator?.draggingNode}
          altCopy={altCopy}
          onPointerDown={(event) => dragSelection?.(event, selected)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onLostPointerCapture={end}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onAddPointerDown={multiConnection?.start}
          onAddClick={multiConnection?.click}
          addEntryKey={multiConnectionEntry?.entryKey}
          addVisible={!multiConnection?.preview && !multiConnection?.menu?.point}
        />
      )}
      {!interactionMode &&
        multiConnectionEntry?.kind === 'group' &&
        multiProjection &&
        surface === 'workflow' &&
        generator?.ready &&
        !readonly &&
        tool !== 'hand' && (
          <CanvasSelectionAddIndicator
            point={multiProjection.add}
            entryKey={multiConnectionEntry.entryKey}
            visible={
              multiConnection?.sources?.length > 0 &&
              !groupResize?.active &&
              !multiConnection?.preview &&
              !multiConnection?.menu?.point
            }
            onPointerDown={multiConnection?.start}
            onClick={multiConnection?.click}
          />
        )}
      {!interactionMode && selectionProjection && surface === 'workflow' && (
        <CanvasSelectionToolbar
          selectedIds={selected}
          nodes={nodes}
          readonly={readonly}
          ready={generator?.ready}
          anchorPoint={selectionProjection.toolbar}
          onLayoutChange={onLayout}
          onDuplicate={duplicate}
          onGroup={onGroup}
          {...selectionActions?.toolbarProps}
        />
      )}
      {multiEndpoint && (
        <CanvasMultiConnectionPreview
          sources={multiConnection.sources}
          nodes={nodes}
          endpoint={multiEndpoint}
          board={board}
          view={view}
        />
      )}
      {multiConnection?.menu && (
        <CanvasConnectionMenu
          menu={multiConnection.menu}
          screenPosition={multiScreenPosition()}
          getScreenPosition={multiScreenPosition}
          entries={multiConnection.entries}
          onChoose={multiConnection.choose}
          onClose={multiConnection.close}
        />
      )}
      {connection?.menu?.menu && (
        <CanvasConnectionMenu
          menu={connection.menu.menu}
          screenPosition={menuScreenPosition()}
          getScreenPosition={menuScreenPosition}
          entries={connection.menu.entries}
          onChoose={connection.menu.choose}
          onClose={connection.menu.close}
        />
      )}
      {!loaded && <div className="cv-loading">项目加载中...</div>}
      {loadError && (
        <div className="cv-load-error">
          <p>{loadError}</p>
          <button onClick={() => (onClose ? onClose() : navigate?.('/show'))}>返回</button>
        </div>
      )}
      {surface === 'storyboard' && <StoryboardPanel {...{ nodes, setDialog, src }} />}
      {loaded && !loadError && !nodes.length && !readonly && (
        <div className="cv-empty">
          <div className="cv-empty-icon">
            <Sparkles size={30} />
          </div>
          <h2>让想法在画布上发生</h2>
          <p>双击画布创建节点，或拖入图片、视频和音频</p>
          <div>
            <button onClick={() => setMenu('add')}>
              <Plus size={15} />
              添加节点
            </button>
            <button onClick={() => fileInput.current?.click()}>
              <Upload size={15} />
              上传素材
            </button>
          </div>
        </div>
      )}
      {!readonly && (
        <div className="cv-left-tools cv-floating">
          <button
            className={tool === 'select' ? 'active' : ''}
            title="选择 V"
            onClick={() => setTool('select')}
          >
            <MousePointer2 size={19} />
          </button>
          <button
            className={tool === 'hand' ? 'active' : ''}
            title="抓手 H"
            onClick={() => setTool('hand')}
          >
            <Hand size={18} />
          </button>
          <hr />
          {TYPES.slice(0, 4).map(({ type, label, icon: Icon }) => (
            <button key={type} title={label + '节点'} onClick={() => addNode(type)}>
              <Icon size={19} />
            </button>
          ))}
          <button
            title="添加节点"
            className={menu === 'add' ? 'active' : ''}
            onClick={() => {
              setContext(null);
              setMenu(menu === 'add' ? null : 'add');
            }}
          >
            <Plus size={21} />
          </button>
          <hr />
          <button title="资产库" onClick={openLibrary}>
            <FolderOpen size={18} />
          </button>
          <button title="上传素材" onClick={() => fileInput.current?.click()}>
            <Upload size={18} />
          </button>
        </div>
      )}
      {menu === 'add' && (
        <div
          className="cv-add-menu cv-floating"
          style={
            context?.point
              ? {
                  left: Math.min(context.x, window.innerWidth - 300),
                  top: Math.min(context.y - 50, window.innerHeight - 400),
                }
              : {}
          }
        >
          <div className="cv-menu-caption">添加节点</div>
          {TYPES.map(({ type, label, description, icon: Icon }) => (
            <button key={type} onClick={() => addNode(type, context?.point)}>
              <Icon size={18} />
              <span>
                {label}
                <small>{description}</small>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      )}
      {readonly ? (
        <div className="cv-bottom-left cv-public-controls cv-floating">
          <button
            title="切换小地图"
            aria-label="切换小地图"
            className={showMap ? 'active' : ''}
            onClick={() => setShowMap(!showMap)}
          >
            <Layers size={16} />
          </button>
          <button
            title={showEdges ? '隐藏节点连线' : '显示节点连线'}
            aria-label={showEdges ? '隐藏节点连线' : '显示节点连线'}
            onClick={() => setShowEdges(!showEdges)}
          >
            <Link2 size={16} style={{ opacity: showEdges ? 1 : 0.35 }} />
          </button>
          <i />
          <button
            aria-label="缩放选项"
            className="cv-zoom-value"
            onClick={() => setMenu(menu === 'zoom' ? null : 'zoom')}
          >
            {Math.round(view.z * 100)}%<ChevronDown size={11} />
          </button>
        </div>
      ) : (
        <div className="cv-bottom-left cv-floating">
          <button title="撤销 ⌘Z" onClick={undo} disabled={!history.current.length}>
            <Undo2 size={17} />
          </button>
          <button title="重做 ⇧⌘Z" onClick={redo} disabled={!future.current.length}>
            <Redo2 size={17} />
          </button>
          <i />
          <button onClick={() => zoom(0.8)} title="缩小">
            <Minus size={17} />
          </button>
          <button
            className="cv-zoom-value"
            onClick={() => setMenu(menu === 'zoom' ? null : 'zoom')}
          >
            {Math.round(view.z * 100)}%<ChevronDown size={10} />
          </button>
          <button onClick={() => zoom(1.25)} title="放大">
            <Plus size={17} />
          </button>
          <i />
          <button title="适应画布 1" onClick={() => fit()}>
            <Maximize size={17} />
          </button>
          <button
            className={showMap ? 'active' : ''}
            title="小地图"
            onClick={() => setShowMap(!showMap)}
          >
            <Layers size={17} />
          </button>
        </div>
      )}
      {menu === 'zoom' && (
        <div className="cv-zoom-menu cv-floating">
          {[0.1, 0.25, 0.5, 0.75, 1, 1.5, 2].map((z) => (
            <button
              key={z}
              onClick={() => {
                setView((v) => ({ ...v, z }));
                setMenu(null);
              }}
            >
              {z * 100}%
            </button>
          ))}
          <hr />
          <button
            onClick={() => {
              fit();
              setMenu(null);
            }}
          >
            适应画布
          </button>
          <button
            onClick={() => {
              fit(nodes.filter((n) => selected.includes(n.id)));
              setMenu(null);
            }}
          >
            适应所选节点
          </button>
        </div>
      )}
      {!readonly && (
        <div className="cv-bottom-right cv-floating">
          <button title="搜索节点" onClick={() => setDialog('search')}>
            <Search size={17} />
          </button>
          <button title="快捷键" onClick={() => setDialog('shortcuts')}>
            <HelpCircle size={17} />
          </button>
          <button
            title={agentOpen ? '收起 Agent' : '展开 Agent'}
            onClick={() => setAgentOpen(!agentOpen)}
          >
            {agentOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </button>
        </div>
      )}
      {showMap && <CanvasMinimap {...{ edges, fit, selected }} nodes={worldNodes} />}
    </main>
  );
}
