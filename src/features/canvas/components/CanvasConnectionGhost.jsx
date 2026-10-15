import './canvas-connection-ghost.css';

/** A source-sized, non-interactive endpoint in the transformed canvas world. */
export function CanvasConnectionGhost({ ghost }) {
  if (!ghost?.node || !ghost.path) return null;
  return (
    <div
      className="cv-connection-ghost"
      aria-hidden="true"
      data-temporary-node-id={ghost.node.id}
      style={{ left: ghost.node.position.x, top: ghost.node.position.y }}
    >
      <span className="cv-connection-ghost-handle is-target" />
      <span className="cv-connection-ghost-handle is-source" />
    </div>
  );
}

/** The temporary edge belongs in the existing world SVG; it owns no gesture. */
export function CanvasConnectionGhostEdge({ ghost }) {
  if (!ghost?.edge || !ghost.path) return null;
  return (
    <path
      className="cv-connection-ghost-edge"
      aria-hidden="true"
      data-temporary-edge-id={ghost.edge.id}
      data-connection-source={ghost.edge.source}
      data-connection-target={ghost.edge.target}
      d={ghost.path}
      fill="none"
      stroke={ghost.edge.style.stroke}
      strokeWidth={ghost.edge.style.strokeWidth}
      strokeDasharray={ghost.edge.style.strokeDasharray}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default CanvasConnectionGhost;
