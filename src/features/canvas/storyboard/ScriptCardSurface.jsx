import { CircleAlert } from 'lucide-react';
import ScriptCardTaskStatus from './ScriptCardTaskStatus.jsx';
import ScriptEmptyCard from './ScriptEmptyCard.jsx';
import './ScriptCardSurface.css';

const isolate = (event) => event.stopPropagation();
const isolateButtonSpace = (event) => {
  if ((event.code === 'Space' || event.key === ' ') && event.target.closest('button'))
    event.stopPropagation();
};

function PromptTaskNotice({ notice, onOpen }) {
  if (!notice) return null;
  const text = notice.kind === 'cancelled' ? '最终提示词生成已取消' : '最终提示词生成失败';
  const taskText = notice.kind === 'failed' ? `TaskID: ${notice.taskId}` : '';
  const title = [text, taskText, notice.reason].filter(Boolean).join(' · ');
  const content = (
    <>
      <CircleAlert size={14} aria-hidden="true" />
      <span>{text}</span>
      {taskText && <small>{taskText}</small>}
    </>
  );
  const props = {
    className: `cv-script-card-task-notice is-${notice.kind}`,
    title,
    'data-testid': 'scriptv2-prompt-task-notice',
  };
  return onOpen ? (
    <button
      {...props}
      type="button"
      onPointerDown={isolate}
      onClick={(event) => {
        isolate(event);
        onOpen();
      }}
      onDoubleClick={isolate}
    >
      {content}
    </button>
  ) : (
    <div {...props}>{content}</div>
  );
}

/** sT/eB surface selection; source service-dependent task actions remain unavailable. */
export default function ScriptCardSurface({
  card,
  taskInfo,
  documentKey,
  nodeId,
  compact,
  onOpen,
  readonly,
  onEmptyAction,
  emptyDisabled,
  disabledEmptyActions,
  children,
}) {
  const kind = card.kind;
  return (
    <div
      className="cv-script-card-surface"
      onKeyDown={isolateButtonSpace}
      data-testid={
        kind === 'resource' ? 'scriptv2-resource-card-surface' : `scriptv2-${kind}-card-surface`
      }
    >
      {!card.valid ? (
        <p className="cv-script-card-local-feedback" role="alert">
          脚本数据无法读取，原内容已保留
        </p>
      ) : kind === 'resource' ? (
        <>
          {compact}
          <PromptTaskNotice notice={card.notice} onOpen={onOpen} />
        </>
      ) : kind === 'generating' ? (
        <div className="cv-script-card-generating">
          <div className="cv-script-card-skeleton" aria-hidden="true">
            {Array.from({ length: 7 }, (_, row) => (
              <div key={row}>
                {Array.from({ length: 3 }, (_, column) => (
                  <i key={column} />
                ))}
              </div>
            ))}
          </div>
          <div className="cv-script-card-task-status-slot">
            <ScriptCardTaskStatus {...{ taskInfo, documentKey, nodeId, kind }} />
          </div>
          <small>任务服务未连接，无法查询或取消此任务</small>
        </div>
      ) : kind === 'failed' ? (
        <ScriptCardTaskStatus {...{ taskInfo, documentKey, nodeId, kind }} />
      ) : (
        <ScriptEmptyCard
          kind={kind}
          readonly={readonly}
          disabled={emptyDisabled}
          disabledActions={disabledEmptyActions}
          onAction={onEmptyAction}
        />
      )}
      <div
        className="cv-script-card-local-feedback"
        onPointerDown={isolate}
        onClick={isolate}
        onDoubleClick={isolate}
      >
        {children}
      </div>
    </div>
  );
}
