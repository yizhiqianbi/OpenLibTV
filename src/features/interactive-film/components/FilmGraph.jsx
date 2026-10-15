import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  Hand,
  Maximize,
  MousePointer2,
  Plus,
  Minus,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useGraphPointer } from '../../editor/useGraphPointer.js';
import { useGraphTouch } from '../../editor/useGraphTouch.js';
import { useGraphWheel } from '../../editor/useGraphWheel.js';
import {
  fitGraphView,
  screenToCanvas,
  selectGraphNodes,
  zoomCanvasView,
} from '../../editor/graph-geometry.js';
import {
  filmNodePorts,
  connectFilmNodes,
  duplicateFilmNodes,
} from '../../../services/interactive-film/document.ts';
import FilmNodePreview, { FILM_NODE_ICONS } from './FilmNodePreview.jsx';
import {
  FILM_LABELS,
  FILM_NODE_WIDTH,
  FILM_NODE_HEIGHT,
  filmGraphNodes,
  filmGraphInputPoint,
  filmGraphOutputPoint,
  filmGraphPortOffset,
} from './film-graph-model.js';
export { FILM_LABELS } from './film-graph-model.js';
const profile = {
  isolatedSurface: '.nopan,.film-graph-tools,.film-graph-controls,.film-graph-zoom-menu',
  editableSurface: 'button,input,textarea,select,video,audio,[contenteditable]',
  nodeSelector: '.film-node',
  selectionSelector: '.film-selection',
  panningClass: 'film-panning',
};
const noop = () => {};

export default function FilmGraph({
  controller,
  selected,
  setSelected,
  linking,
  setLinking,
  onFocusNode,
  onAddNode,
  onOpenLibrary,
  onUpload,
}) {
  const doc = controller.document;
  const board = useRef(null),
    viewRef = useRef(doc.view),
    space = useRef(false),
    cancelPointer = useRef(noop);
  viewRef.current = doc.view;
  const [tool, setTool] = useState('select'),
    [rectangle, setRectangle] = useState(null),
    [linkPoint, setLinkPoint] = useState(null),
    [zoomMenu, setZoomMenu] = useState(false);
  const linkOwner = useRef(null);
  linkOwner.current = linking;
  const setView = (value) =>
    controller.commit(
      (previous) => ({
        ...previous,
        view: typeof value === 'function' ? value(previous.view) : value,
      }),
      { history: false },
    );
  const point = (event) =>
    screenToCanvas(event, board.current.getBoundingClientRect(), viewRef.current);
  const zoom = (factor, x, y) => {
    const bounds = board.current.getBoundingClientRect();
    setView(zoomCanvasView(viewRef.current, factor, { x: x - bounds.left, y: y - bounds.top }));
  };
  const fit = () => {
    if (board.current)
      setView(
        fitGraphView(
          filmGraphNodes(controller.current.current.nodes),
          board.current.getBoundingClientRect(),
        ),
      );
  };
  const touch = useGraphTouch({
    board,
    storageKey: doc.id,
    readonly: false,
    documentReady: true,
    profile,
    tool,
    space,
    viewRef,
    setView,
    cancelPointer: () => cancelPointer.current(),
    onFit: fit,
  });
  const pointer = useGraphPointer({
    board,
    storageKey: doc.id,
    readonly: false,
    documentReady: true,
    touchMode: touch.touchMode,
    profile,
    nodes: doc.nodes,
    edges: doc.edges,
    selected,
    setSelected,
    space,
    tool,
    viewRef,
    setView,
    point,
    linking,
    setLinking,
    setLinkPoint,
    setSelectionRect: setRectangle,
    setMenu: noop,
    setContext: noop,
    record: controller.record,
    setNodes: (value) =>
      controller.commit(
        (previous) => ({
          ...previous,
          nodes: typeof value === 'function' ? value(previous.nodes) : value,
        }),
        { history: false },
      ),
    selectIntersectingNodes: (nodes, rect) => selectGraphNodes(filmGraphNodes(nodes), rect),
    cancelOtherGestures: () => touch.cancel(),
    createDragCopy: ({ sourceIds, expectedNodes, documentKey }) => {
      const previous = controller.current.current;
      if (previous.id !== documentKey || previous.nodes !== expectedNodes) return null;
      const next = duplicateFilmNodes(previous, sourceIds);
      const ids = next.nodes
        .filter((node) => !previous.nodes.some((old) => old.id === node.id))
        .map((node) => node.id);
      controller.commit(next);
      return {
        valid: true,
        newTopLevelIds: ids,
        newAllIds: ids,
        positions: new Map(next.nodes.map((node) => [node.id, node.position])),
      };
    },
  });
  cancelPointer.current = pointer.cancel;
  const cancelGesture = pointer.cancel;
  useGraphWheel({
    board,
    setView,
    zoom,
    isolatedSurface:
      '.film-graph-tools,.film-graph-controls,.film-graph-zoom-menu,.nopan,input,textarea,select,video,audio',
  });
  useEffect(() => {
    const down = (event) => {
      const nativeInput = event.target.closest?.(
        'input,textarea,select,button,video,audio,[contenteditable],[role=dialog]',
      );
      if (!nativeInput && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key.toLowerCase() === 'v') setTool('select');
        if (event.key.toLowerCase() === 'h') setTool('hand');
      }
      if (event.code === 'Space' && !nativeInput) {
        space.current = true;
        event.preventDefault();
      }
      if (event.key === 'Escape') {
        setZoomMenu(false);
        setLinking(null);
        cancelGesture();
      }
    };
    const up = (event) => {
      if (event.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      space.current = false;
    };
  }, [setLinking, cancelGesture]);
  useEffect(() => {
    if (!zoomMenu) return;
    const close = (event) => {
      if (!event.target.closest('.film-graph-controls,.film-graph-zoom-menu')) setZoomMenu(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('focusin', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('focusin', close);
    };
  }, [zoomMenu]);
  const zoomCenter = (factor) => {
    const bounds = board.current.getBoundingClientRect();
    zoom(factor, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  };
  const connect = (target) => {
    const source = linkOwner.current;
    if (!source || source.source === target) return;
    controller.commit((previous) => connectFilmNodes(previous, source.source, source.port, target));
    setLinking(null);
    setLinkPoint(null);
  };
  const release = (event) => {
    pointer.end(event);
    if (linkOwner.current && event.type === 'pointerup') {
      const target = board.current.ownerDocument
        .elementFromPoint?.(event.clientX, event.clientY)
        ?.closest('[data-film-input]');
      if (target) connect(target.dataset.filmInput);
    }
  };
  const byId = new Map(doc.nodes.map((node) => [node.id, node]));
  return (
    <section
      ref={board}
      className="film-graph"
      aria-label="剧情画布"
      tabIndex={0}
      onPointerDownCapture={pointer.begin}
      onPointerMove={pointer.move}
      onPointerUp={release}
      onPointerCancel={pointer.end}
      onLostPointerCapture={pointer.end}
      onClickCapture={(event) => {
        if (pointer.shouldSuppressClick(event) || touch.shouldSuppressTouchClick(event)) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      <div
        className="film-graph-grid"
        style={{
          backgroundPosition: `${doc.view.x}px ${doc.view.y}px`,
          backgroundSize: `${24 * doc.view.z}px ${24 * doc.view.z}px`,
        }}
      />
      <div
        className="film-world"
        style={{ transform: `translate(${doc.view.x}px,${doc.view.y}px) scale(${doc.view.z})` }}
      >
        <svg className="film-edges" aria-label="剧情跳转">
          {doc.edges.map((edge) => {
            const a = byId.get(edge.source),
              b = byId.get(edge.target);
            if (!a || !b) return null;
            const p = filmGraphOutputPoint(a, edge.sourcePort),
              q = filmGraphInputPoint(b);
            return (
              <g key={edge.id}>
                <path d={`M${p.x},${p.y} C${p.x + 90},${p.y} ${q.x - 90},${q.y} ${q.x},${q.y}`} />
                <path
                  className="film-edge-hit"
                  tabIndex={0}
                  role="button"
                  aria-label={`删除跳转 ${a.title} 到 ${b.title}`}
                  d={`M${p.x},${p.y} C${p.x + 90},${p.y} ${q.x - 90},${q.y} ${q.x},${q.y}`}
                  onClick={() =>
                    controller.commit((previous) => ({
                      ...previous,
                      edges: previous.edges.filter((item) => item.id !== edge.id),
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Delete' || event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      controller.commit((previous) => ({
                        ...previous,
                        edges: previous.edges.filter((item) => item.id !== edge.id),
                      }));
                    }
                  }}
                />
              </g>
            );
          })}
          {linking &&
            linkPoint &&
            byId.has(linking.source) &&
            (() => {
              const p = filmGraphOutputPoint(byId.get(linking.source), linking.port);
              return (
                <path
                  className="film-edge-preview"
                  d={`M${p.x},${p.y} C${p.x + 90},${p.y} ${linkPoint.x - 90},${linkPoint.y} ${linkPoint.x},${linkPoint.y}`}
                />
              );
            })()}
        </svg>
        {doc.nodes.map((node) => {
          const Icon = FILM_NODE_ICONS[node.kind] || Plus;
          return (
            <article
              key={`${doc.id}:${node.id}`}
              data-kind={node.kind}
              data-node-id={node.id}
              className={`film-node ${selected.includes(node.id) ? 'is-selected' : ''}`}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: FILM_NODE_WIDTH,
                height: FILM_NODE_HEIGHT,
              }}
              onPointerDown={(event) => pointer.drag(event, node)}
              onClick={(event) => {
                if (linking) connect(node.id);
                else {
                  if (!event.shiftKey) setSelected([node.id]);
                  onFocusNode?.();
                }
              }}
              tabIndex={0}
              aria-label={`${FILM_LABELS[node.kind]}节点 ${node.title}`}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.target === event.currentTarget) {
                  event.preventDefault();
                  if (linking) connect(node.id);
                  else {
                    setSelected([node.id]);
                    onFocusNode?.();
                  }
                }
              }}
            >
              {node.kind !== 'start' && (
                <button
                  className="film-input-port"
                  style={{ top: FILM_NODE_HEIGHT / 2 }}
                  data-film-input={node.id}
                  aria-label={`连接到 ${node.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    connect(node.id);
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                    connect(node.id);
                  }}
                >
                  <i className="film-node-port-dot" aria-hidden="true" />
                </button>
              )}
              <div className="film-node-title">
                <Icon size={15} />
                <strong>{node.title}</strong>
                <span className="film-node-type">{FILM_LABELS[node.kind]}</span>
              </div>
              <FilmNodePreview document={doc} node={node} selected={selected.includes(node.id)} />
              <div className="film-node-ports">
                {filmNodePorts(node).map((port) => (
                  <button
                    key={port.id}
                    className="film-node-port"
                    style={{ top: filmGraphPortOffset(node, port.id) }}
                    aria-label={`连接 ${node.title} ${port.label}`}
                    aria-pressed={linking?.source === node.id && linking?.port === port.id}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setLinking({ source: node.id, port: port.id });
                      setLinkPoint(point(event));
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setLinking({ source: node.id, port: port.id });
                    }}
                  >
                    <span className="film-node-port-label">{port.label}</span>
                    <i className="film-node-port-dot" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </article>
          );
        })}
        {rectangle && (
          <div
            className="film-selection"
            style={{
              left: rectangle.x,
              top: rectangle.y,
              width: rectangle.width,
              height: rectangle.height,
            }}
          />
        )}
      </div>
      {!doc.nodes.length && <div className="film-board-empty">从左侧添加第一个剧情节点</div>}
      <div className="film-graph-tools nopan" aria-label="画布工具">
        <button
          aria-label="选择工具"
          title="选择 V"
          aria-pressed={tool === 'select'}
          onClick={() => setTool('select')}
        >
          <MousePointer2 size={19} />
        </button>
        <button
          aria-label="手型工具"
          title="抓手 H"
          aria-pressed={tool === 'hand'}
          onClick={() => setTool('hand')}
        >
          <Hand size={18} />
        </button>
        <hr />
        {['play', 'choice', 'hotspot', 'qte'].map((kind) => {
          const Icon = FILM_NODE_ICONS[kind];
          return (
            <button
              key={kind}
              aria-label={`添加${FILM_LABELS[kind]}节点`}
              title={`${FILM_LABELS[kind]}节点`}
              disabled={!onAddNode}
              onClick={() => onAddNode?.(kind)}
            >
              <Icon size={19} />
            </button>
          );
        })}
        <button
          aria-label="添加节点"
          title="添加节点"
          data-film-library-trigger=""
          disabled={!onOpenLibrary}
          onClick={() => onOpenLibrary?.('nodes')}
        >
          <Plus size={19} />
        </button>
        <hr />
        <button
          aria-label="素材库"
          title="素材库"
          data-film-library-trigger=""
          disabled={!onOpenLibrary}
          onClick={() => onOpenLibrary?.('media')}
        >
          <FolderOpen size={19} />
        </button>
        <button
          aria-label="剧情变量"
          title="剧情变量"
          data-film-library-trigger=""
          disabled={!onOpenLibrary}
          onClick={() => onOpenLibrary?.('variables')}
        >
          <SlidersHorizontal size={19} />
        </button>
        <button aria-label="上传素材" title="上传素材" disabled={!onUpload} onClick={onUpload}>
          <Upload size={19} />
        </button>
      </div>
      <div className="film-graph-controls nopan">
        <button aria-label="缩小画布" title="缩小" onClick={() => zoomCenter(0.8)}>
          <Minus size={17} />
        </button>
        <button
          className="film-zoom-value"
          aria-label="缩放选项"
          title="缩放选项"
          aria-expanded={zoomMenu}
          onClick={() => setZoomMenu((value) => !value)}
        >
          {Math.round(doc.view.z * 100)}%<ChevronDown size={10} />
        </button>
        <button aria-label="放大画布" title="放大" onClick={() => zoomCenter(1.25)}>
          <Plus size={17} />
        </button>
        <i />
        <button aria-label="适应全部节点" title="适应画布 1" onClick={fit}>
          <Maximize size={17} />
        </button>
      </div>
      {zoomMenu && (
        <div className="film-graph-zoom-menu nopan" aria-label="画布缩放">
          {[25, 50, 75, 100, 125, 150, 200].map((percent) => (
            <button
              key={percent}
              onClick={() => {
                zoomCenter(percent / 100 / viewRef.current.z);
                setZoomMenu(false);
              }}
            >
              {percent}%
            </button>
          ))}
          <button
            onClick={() => {
              fit();
              setZoomMenu(false);
            }}
          >
            适应全部节点
          </button>
        </div>
      )}
      <p className="film-graph-hint">
        {linking
          ? '选择目标节点 · Escape 取消'
          : '拖动节点 · Shift 多选 · Space 平移 · 点击连线删除'}
      </p>
    </section>
  );
}
