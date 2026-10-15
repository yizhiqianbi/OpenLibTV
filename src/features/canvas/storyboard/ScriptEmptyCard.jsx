import './ScriptEmptyCard.css';

const actions = [
  {
    functionKey: 'scriptToStoryboard',
    label: '剧本生成分镜脚本',
    icon: 'script',
  },
  {
    functionKey: 'characterToStoryboard',
    label: '角色生成分镜脚本',
    icon: 'character',
  },
  {
    functionKey: 'writeStoryboard',
    label: '自己编写分镜脚本',
    icon: 'write',
  },
];

const isolate = (event) => event.stopPropagation();

/** Source 316925 hints; the host owns selection, dragging, graph mutations and async state. */
export default function ScriptEmptyCard({
  readonly = false,
  disabled = false,
  disabledActions,
  onAction,
  kind = 'empty_generate',
}) {
  if (kind !== 'empty_generate' && kind !== 'pending') return null;
  const showHints = kind === 'empty_generate' && !readonly;
  return (
    <div
      className={`cv-script-empty-card is-${kind}${showHints ? ' has-hints' : ''}`}
      data-testid="scriptv2-empty-card"
      data-kind={kind}
    >
      <div className="cv-script-empty-icon-slot">
        <span
          className="cv-script-empty-icon"
          data-testid="scriptv2-empty-card-icon"
          aria-hidden="true"
        />
      </div>
      {showHints && (
        <div className="cv-script-empty-hints" data-testid="scriptv2-empty-card-hints">
          <div className="cv-script-empty-try">尝试：</div>
          <div className="cv-script-empty-actions">
            {actions.map(({ functionKey, label, icon }) => {
              const actionDisabled =
                disabled ||
                typeof onAction !== 'function' ||
                disabledActions?.[functionKey] === true;
              return (
                <button
                  key={functionKey}
                  type="button"
                  className="cv-script-empty-action nodrag"
                  data-function-key={functionKey}
                  disabled={actionDisabled}
                  onPointerDown={isolate}
                  onMouseDown={isolate}
                  onDoubleClick={isolate}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!actionDisabled) onAction(functionKey);
                  }}
                  onKeyDown={(event) => {
                    if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
                  }}
                >
                  <span className={`cv-script-empty-action-icon is-${icon}`} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
