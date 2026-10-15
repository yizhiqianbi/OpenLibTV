import { useMemo, useRef } from 'react';
import { Scissors } from 'lucide-react';
import { canvasEdgeGeometry, canvasEdgePresentation } from '../domain/edge-interaction-model.js';
import { useCanvasEdgeHover } from '../hooks/useCanvasEdgeHover.js';

const EMPTY_NODES = new Map();
const FLOW_SEGMENTS = Array.from({ length: 6 }, (_, index) => ({
  dash: index === 0 ? '36 64' : `0 ${6 * index} ${36 - 6 * index} 64`,
  opacity: 0.15 / (1 - 0.15 * index),
}));

function EdgeFlow({ edge, path }) {
  const strokes = [
    { dash: '36 64', width: 12, opacity: 0.06, linecap: 'round' },
    { dash: '36 64', width: 7, opacity: 0.12, linecap: 'round' },
    ...FLOW_SEGMENTS.map((segment) => ({ ...segment, width: 4, linecap: 'butt' })),
  ];
  return (
    <g
      className="cv-real-edge-flow"
      data-edge-flow={edge.id}
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {strokes.map((segment, index) => (
        <path
          key={index}
          d={path}
          pathLength={300}
          strokeDasharray={segment.dash}
          strokeOpacity={segment.opacity}
          strokeLinecap={segment.linecap}
          style={{
            fill: 'none',
            stroke: 'rgb(100, 180, 255)',
            strokeWidth: segment.width,
            strokeDasharray: segment.dash,
            pointerEvents: 'none',
          }}
        />
      ))}
    </g>
  );
}

/** Real edges only. The caller owns the SVG, selection, document and delete transaction. */
export function CanvasEdgeLayer({
  edges = [],
  worldById = EMPTY_NODES,
  selectedNodeIds = [],
  selectedEdgeIds = [],
  visibleNodeIds,
  onSelectEdge,
  onDeselectEdge,
  onDeleteEdge,
  interactionDisabled = false,
  markMode = false,
  readonly = false,
  ready = true,
  documentKey,
  board,
  view,
}) {
  const paths = useRef(new Map());
  const selectedEdgeSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]);
  const entries = useMemo(() => {
    return edges.flatMap((edge) => {
      const geometry = canvasEdgeGeometry(worldById, edge);
      if (!geometry) return [];
      const sourceNode = worldById.get(edge.source);
      const targetNode = worldById.get(edge.target);
      const presentation = canvasEdgePresentation({
        edge,
        sourceNode,
        targetNode,
        selectedEdge: selectedEdgeSet.has(edge.id),
        selectedNodes: selectedNodeIds,
        readonly,
        // This is the caller's mounted-node registry, never a viewport bounding box guess.
        interactive:
          visibleNodeIds === undefined ||
          visibleNodeIds.has(edge.source) ||
          visibleNodeIds.has(edge.target),
        disabled: interactionDisabled || !ready,
      });
      return [{ edge, geometry, presentation, sourceNode, targetNode }];
    });
  }, [
    edges,
    worldById,
    selectedEdgeSet,
    selectedNodeIds,
    visibleNodeIds,
    readonly,
    interactionDisabled,
    ready,
  ]);
  const controls = useCanvasEdgeHover({
    entries,
    documentKey,
    ready,
    readonly,
    interactionDisabled,
    board,
    view,
  });
  const latest = useRef(null);
  latest.current = {
    entries,
    ready,
    readonly,
    interactionDisabled,
    onSelectEdge,
    onDeselectEdge,
    onDeleteEdge,
    hover: controls.hover,
  };
  const currentEntry = (edge) => {
    const value = latest.current;
    if (!value.ready || value.interactionDisabled) return null;
    const entry = value.entries.find((item) => item.edge === edge);
    return entry?.presentation.interactive && entry.presentation.selectable ? entry : null;
  };
  const currentKeyboardEntry = (edge) => {
    const value = latest.current;
    if (!value.ready || value.interactionDisabled) return null;
    return value.entries.find((entry) => entry.edge === edge);
  };
  const isolate = (edge, event) => {
    if (currentEntry(edge)) event.stopPropagation();
  };
  const pathFor = (edge) => {
    const value = paths.current.get(edge.id);
    return value?.edge === edge ? value.path : null;
  };
  return entries.map(({ edge, geometry, presentation, sourceNode, targetNode }) => {
    const hover = controls.hover?.edge === edge ? controls.hover : null;
    const paint = canvasEdgePresentation({
      edge,
      sourceNode,
      targetNode,
      selectedEdge: selectedEdgeSet.has(edge.id),
      selectedNodes: selectedNodeIds,
      hovered: Boolean(hover?.hovered),
      readonly,
      interactive: presentation.interactive,
      disabled: interactionDisabled || !ready,
    });
    const selectable = ready && !interactionDisabled && paint.interactive && paint.selectable;
    const scissors =
      selectable && paint.deletable && !readonly && hover?.scissorsVisible && hover.position;
    return (
      <g
        key={edge.id}
        data-edge-id={edge.id}
        data-edge-interaction-disabled={!selectable ? 'true' : undefined}
        className={`cv-real-edge${selectable ? ' nopan' : ''}`}
        role={ready && !interactionDisabled && paint.focusable ? 'button' : 'img'}
        aria-label={paint.label}
        aria-pressed={selectable ? selectedEdgeSet.has(edge.id) : undefined}
        tabIndex={ready && !interactionDisabled && paint.focusable ? 0 : undefined}
        style={{ pointerEvents: selectable ? 'visibleStroke' : 'none' }}
        onPointerDown={(event) => isolate(edge, event)}
        onMouseDown={(event) => isolate(edge, event)}
        onClick={(event) => {
          if (!currentEntry(edge)) return;
          event.stopPropagation();
          const additive = event.ctrlKey || event.metaKey;
          latest.current.onSelectEdge?.(edge.id, { additive, toggle: additive });
        }}
        onDoubleClick={(event) => {
          if (!currentEntry(edge)) return;
          // A double click has no write action and must not open the pane's add menu.
          event.stopPropagation();
          event.preventDefault();
        }}
        onKeyDown={(event) => {
          const current = currentKeyboardEntry(edge);
          if (
            !current?.presentation.focusable ||
            !current.presentation.selectable ||
            event.target.closest?.('[data-edge-cut-container]')
          )
            return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            latest.current.onDeselectEdge?.(edge.id);
            event.currentTarget.blur?.();
            controls.clear();
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            latest.current.onSelectEdge?.(edge.id, {
              additive:
                !latest.current.readonly && (event.shiftKey || event.ctrlKey || event.metaKey),
              toggle: false,
              keyboard: true,
            });
          }
        }}
        onMouseEnter={(event) => controls.enter(edge, event, pathFor(edge))}
        onMouseMove={(event) => controls.move(edge, event, pathFor(edge))}
        onMouseLeave={() => controls.leave(edge)}
      >
        {paint.interactive && (
          <path
            ref={(path) => {
              if (path) paths.current.set(edge.id, { edge, path });
              else if (paths.current.get(edge.id)?.edge === edge) paths.current.delete(edge.id);
            }}
            className="cv-edge-hit cv-real-edge-hit"
            data-edge-hit={edge.id}
            d={geometry.path}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            style={{
              fill: 'none',
              stroke: 'transparent',
              strokeWidth: 20,
              pointerEvents: selectable ? 'stroke' : 'none',
              cursor: selectable ? 'pointer' : undefined,
            }}
          />
        )}
        <path
          className="cv-edge-visual cv-real-edge-visual"
          data-edge-visual={edge.id}
          d={geometry.path}
          fill="none"
          stroke={paint.stroke}
          strokeWidth={paint.strokeWidth}
          strokeDasharray={paint.reference ? '6 4' : undefined}
          style={{
            fill: 'none',
            stroke: paint.stroke,
            strokeWidth: paint.strokeWidth,
            pointerEvents: 'none',
            transition: hover?.hovered ? 'stroke 200ms ease, stroke-width 200ms ease' : undefined,
          }}
        />
        {paint.interactive && paint.highlighted && !markMode && (
          <EdgeFlow edge={edge} path={geometry.path} />
        )}
        {scissors && (
          <foreignObject
            x={hover.position.x - 24}
            y={hover.position.y - 24}
            width={48}
            height={48}
            className="cv-real-edge-cut-container"
            data-edge-cut-container={edge.id}
            style={{ overflow: 'visible', pointerEvents: 'auto' }}
          >
            <button
              type="button"
              className="cv-real-edge-cut nopan"
              aria-label="断开连线"
              title="断开连线"
              onKeyDown={(event) => {
                // Preserve native activation without triggering the Canvas Space pan shortcut.
                if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
              }}
              onPointerDown={(event) => isolate(edge, event)}
              onMouseDown={(event) => isolate(edge, event)}
              onClick={(event) => {
                const current = currentEntry(edge);
                const active = latest.current.hover;
                if (
                  !current?.presentation.deletable ||
                  latest.current.readonly ||
                  active?.edge !== edge ||
                  !active.scissorsVisible
                )
                  return;
                event.stopPropagation();
                controls.clear();
                latest.current.onDeleteEdge?.(edge.id);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <Scissors
                size={28}
                className="cv-real-edge-scissors-icon"
                aria-hidden="true"
                style={{ color: 'rgba(255, 255, 255, 0.7)', transform: 'rotate(-115deg)' }}
              />
            </button>
          </foreignObject>
        )}
      </g>
    );
  });
}
