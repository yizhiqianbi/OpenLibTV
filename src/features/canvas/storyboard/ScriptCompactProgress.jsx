import { projectScriptCompactProgress } from './script-card-model.js';
import './ScriptCompactProgress.css';

function DefaultScriptIcon() {
  return (
    <div className="cv-script-compact-default-icon" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function ReadyMark() {
  return (
    <svg aria-hidden="true" width={16} height={16} fill="none" viewBox="0 0 16 16">
      <path
        d="M3.5 8.1 6.7 11.3 12.6 4.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

const stopPointer = (event) => event.stopPropagation();

/** Source sg/sh/sf: static progress, with surface drag and double-click owned by its host. */
export default function ScriptCompactProgress({
  workflow,
  onOpen,
  isCanvasLight = false,
  icon,
  generatingLabel,
}) {
  const projection = projectScriptCompactProgress(workflow);
  if (!projection.valid) return null;
  return (
    <div
      className={`cv-script-compact${isCanvasLight ? ' cv-script-compact-light' : ''}`}
      data-testid="scriptv2-stage-progress-compact"
    >
      <div className="cv-script-compact-top">
        <div className="cv-script-compact-icon" data-testid="scriptv2-stage-progress-icon">
          {icon ?? <DefaultScriptIcon />}
        </div>
        <div className="cv-script-compact-track" data-testid="scriptv2-stage-progress-track">
          {projection.connectors.map((connector) => (
            <div
              key={connector.id}
              className="cv-script-compact-connector"
              data-complete={String(connector.complete)}
              data-testid={`scriptv2-stage-connector-${connector.id}`}
              style={{ left: connector.left, width: connector.width }}
            />
          ))}
          <div className="cv-script-compact-stages">
            {projection.stages.map((stage) => (
              <div className="cv-script-compact-stage" key={stage.id}>
                <div
                  className="cv-script-compact-pill"
                  data-testid={`scriptv2-stage-pill-${stage.id}`}
                  data-status={stage.status}
                  data-visual-state={stage.visualState}
                >
                  <div
                    className="cv-script-compact-circle"
                    data-testid={`scriptv2-stage-circle-${stage.id}`}
                  >
                    {stage.visualState === 'ready' ? <ReadyMark /> : stage.number}
                  </div>
                  <div className="cv-script-compact-label">{stage.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {generatingLabel && (
          <div
            className="cv-script-compact-generating"
            data-testid="scriptv2-stage-generating-label"
          >
            <span>{generatingLabel}</span>
          </div>
        )}
      </div>
      {typeof onOpen === 'function' && (
        <button
          type="button"
          className="cv-script-compact-open"
          onPointerDown={stopPointer}
          onMouseDown={stopPointer}
          onDoubleClick={stopPointer}
          onKeyDown={(event) => {
            if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(event);
          }}
        >
          打开脚本节点 →
        </button>
      )}
    </div>
  );
}
