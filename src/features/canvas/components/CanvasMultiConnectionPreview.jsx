import { createPortal } from 'react-dom';
import { canvasToScreen } from '../geometry.js';
import { canvasNodeSize, canvasWorldNodes } from '../domain/groups.js';
import { canvasMultiConnectionPreviewPath } from '../domain/multi-connection-gesture-model.js';
import { CanvasConnectionFlow } from './CanvasConnectionPreview.jsx';
import { CanvasSelectionAddIndicator } from './CanvasSelectionOverlay.jsx';
import './canvas-multi-connection-preview.css';

/** nK is a viewport portal: all sources retain blue previews, including invalid targets. */
export default function CanvasMultiConnectionPreview({ sources, nodes, endpoint, board, view }) {
  const element = board.current;
  const bounds = element?.getBoundingClientRect();
  if (!element || !bounds || !endpoint) return null;
  const ids = new Set(sources.map((node) => node.id));
  const sourceNodes = canvasWorldNodes(nodes).filter((node) => ids.has(node.id));
  return createPortal(
    <div
      className={`cv-multi-connection-portal${element.closest('.canvas-light') ? ' canvas-light' : ''}`}
      aria-hidden="true"
    >
      <CanvasSelectionAddIndicator point={endpoint} interactive={false} placement="center" />
      <svg className="cv-multi-connection-preview" width="100%" height="100%">
        {sourceNodes.map((node) => {
          const size = canvasNodeSize(node);
          const start = canvasToScreen(
            { x: node.position.x + size.width, y: node.position.y + size.height / 2 },
            bounds,
            view,
          );
          const path = canvasMultiConnectionPreviewPath(start, endpoint);
          return path ? (
            <g key={node.id} data-multi-source-id={node.id}>
              <path
                d={path}
                fill="none"
                stroke="var(--canvas-edge-hover, #c0c8d0)"
                strokeWidth={2 * view.z}
                strokeLinecap="round"
              />
              <CanvasConnectionFlow path={path} scale={view.z} />
            </g>
          ) : null;
        })}
      </svg>
    </div>,
    element.closest('[role="dialog"]') || element.ownerDocument.body,
  );
}
