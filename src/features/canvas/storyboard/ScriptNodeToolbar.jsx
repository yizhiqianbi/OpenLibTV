import { useRef } from 'react';
import { createPortal } from 'react-dom';
import ToolbarTooltip from '../agent-toolbar/ToolbarTooltip.jsx';
import { useToolbarPosition } from '../components/GroupToolbarUI.jsx';
import './ScriptNodeToolbar.css';

const actions = [
  ['regenerate', '重新生成', 'refresh', 'onRegenerate'],
  ['image', '批量生成分镜', 'imageset', 'onCreateImages'],
  ['video', '批量生视频', 'generate', 'onCreateVideos'],
  ['download', '下载', 'download', 'onDownload'],
];

function ActionIcon({ name }) {
  return (
    <span
      className="cv-script-node-toolbar-icon"
      aria-hidden="true"
      style={{
        maskImage: `url(/assets/icons/${name}.svg)`,
        WebkitMaskImage: `url(/assets/icons/${name}.svg)`,
      }}
    />
  );
}

function VisibleToolbar({ nodeId, anchor, portal, projection, ...callbacks }) {
  const toolbar = useRef(null);
  // The source wrapper uses (baseOffset 24 + gap 8) / zoom. The board portal is
  // already in screen coordinates; adapt the shared group's 28px gap to 32px.
  const style = useToolbarPosition({ x: anchor.x, y: anchor.y - 4 }, portal, toolbar);
  return createPortal(
    <div
      ref={toolbar}
      className="cv-script-node-toolbar cv-floating nodrag nopan nowheel"
      role="toolbar"
      aria-label="脚本操作"
      aria-busy={projection.pending === true}
      data-script-node-toolbar={nodeId}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
      }}
    >
      {actions.map(([key, label, icon, callback]) => {
        const action = projection.actions?.[key];
        const disabled = action?.enabled !== true || typeof callbacks[callback] !== 'function';
        const button = (
          <button
            type="button"
            className={key === 'download' ? 'cv-script-node-toolbar-download' : undefined}
            aria-label={key === 'download' ? label : undefined}
            title={key === 'download' ? label : undefined}
            disabled={disabled}
            onClick={(event) => callbacks[callback]?.(nodeId, event.currentTarget)}
          >
            <ActionIcon name={icon} />
            {key !== 'download' && <span>{label}</span>}
          </button>
        );
        return (
          <span className="cv-script-node-toolbar-action" key={key}>
            {key === 'download' && (
              <span className="cv-script-node-toolbar-divider" aria-hidden="true" />
            )}
            {(key === 'image' || key === 'video') && disabled && action?.disabledReason ? (
              <ToolbarTooltip
                label={
                  <span className="cv-script-node-toolbar-tooltip-content">
                    {action.disabledReason}
                  </span>
                }
                position="top"
                maxWidth={300}
                withArrow
              >
                {button}
              </ToolbarTooltip>
            ) : (
              button
            )}
          </span>
        );
      })}
    </div>,
    portal,
  );
}

export default function ScriptNodeToolbar(props) {
  const portal = props.portal?.current || props.portal;
  if (
    !props.nodeId ||
    !portal ||
    props.projection?.visible !== true ||
    !Number.isFinite(props.anchor?.x) ||
    !Number.isFinite(props.anchor?.y)
  )
    return null;
  return <VisibleToolbar {...props} portal={portal} />;
}
