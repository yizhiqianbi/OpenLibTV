import { useEffect, useRef } from 'react';

/** Source's 80px hit circle and 20px magnetic plus are separate geometries. */
export function CanvasConnectionHandle({ nodeId, handleType, connection, onLegacyClick }) {
  const visual = useRef(null);
  const timer = useRef(null);
  const rest = handleType === 'source' ? -25 : 25;
  useEffect(() => () => clearTimeout(timer.current), []);
  const leave = () => {
    clearTimeout(timer.current);
    if (!visual.current) return;
    visual.current.style.transition =
      'transform 400ms cubic-bezier(0.34,1.56,0.64,1), opacity 200ms ease';
    visual.current.style.transform = `translate(${rest}px,0px) scale(1)`;
    timer.current = setTimeout(() => {
      if (visual.current) visual.current.style.transition = '';
    }, 450);
  };
  return (
    <button
      type="button"
      className={'cv-handle cv-handle-' + (handleType === 'source' ? 'out' : 'in')}
      data-handle-type={handleType}
      disabled={connection?.disabled}
      title={handleType === 'source' ? '连接节点' : '连接到此节点'}
      onPointerDown={(event) =>
        connection ? connection.start(event, nodeId, handleType) : event.stopPropagation()
      }
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        const distance = Math.hypot(x, y);
        const factor = distance > 30 ? 30 / distance : 1;
        clearTimeout(timer.current);
        if (visual.current) {
          visual.current.style.transition = 'transform 80ms ease-out';
          visual.current.style.transform = `translate(${x * factor}px,${y * factor}px) scale(1.1)`;
        }
      }}
      onPointerLeave={leave}
      onClick={(event) => {
        event.stopPropagation();
        if (connection) connection.onClick(event, nodeId, handleType);
        else onLegacyClick?.();
      }}
    >
      <svg
        ref={visual}
        viewBox="0 0 20 20"
        width="20"
        height="20"
        aria-hidden="true"
        style={{ transform: `translate(${rest}px,0px) scale(1)` }}
      >
        <circle
          cx="10"
          cy="10"
          r="9.35"
          fill="var(--cv-handle-bg)"
          stroke="var(--cv-handle-icon)"
          strokeWidth="1.2"
        />
        <path
          d="M10 6.5v7M6.5 10h7"
          fill="none"
          stroke="var(--cv-handle-icon)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
