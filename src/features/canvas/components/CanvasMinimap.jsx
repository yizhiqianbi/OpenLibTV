export function CanvasMinimap({ edges, fit, nodes, selected }) {
  return (
    <div className="cv-minimap cv-floating" onClick={() => fit()}>
      <svg viewBox="0 0 220 120">
        {(() => {
          if (!nodes.length) return null;
          const x = Math.min(...nodes.map((n) => n.position.x)),
            y = Math.min(...nodes.map((n) => n.position.y)),
            w = Math.max(...nodes.map((n) => n.position.x + (n.width || 350))) - x,
            h = Math.max(...nodes.map((n) => n.position.y + (n.height || 230))) - y,
            z = Math.min(210 / w, 110 / h);
          return [
            ...nodes.filter((node) => node.type === 'group'),
            ...nodes.filter((node) => node.type !== 'group'),
          ].map((n) => (
            <rect
              key={n.id}
              x={(n.position.x - x) * z + 5}
              y={(n.position.y - y) * z + 5}
              width={Math.max(3, (n.width || 350) * z)}
              height={Math.max(2, (n.height || 230) * z)}
              fill={selected.includes(n.id) ? '#13d5ff' : n.type === 'group' ? '#ffffff18' : '#555'}
              stroke={n.type === 'group' ? '#555' : undefined}
            />
          ));
        })()}
      </svg>
      <small>
        {nodes.length} 个节点 · {edges.length} 条连线
      </small>
    </div>
  );
}
