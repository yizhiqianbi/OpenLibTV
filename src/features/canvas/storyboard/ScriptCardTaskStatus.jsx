import { useLayoutEffect, useRef } from 'react';
import { useMessageCopy } from '../message-actions/useMessageCopy.js';
import { projectScriptTaskBadge } from './script-card-model.js';
import './ScriptCardTaskStatus.css';

function FailureIcon() {
  return (
    <svg
      className="cv-script-card-task-warning"
      aria-hidden="true"
      width={36}
      height={36}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1={12} y1={9} x2={12} y2={13} />
      <line x1={12} y1={17} x2={12.01} y2={17} />
    </svg>
  );
}

const stopPointer = (event) => event.stopPropagation();

/** Source task display plus local TaskID copy; no task service or membership actions. */
export default function ScriptCardTaskStatus({
  kind,
  taskInfo,
  documentKey,
  nodeId,
  isCanvasLight = false,
}) {
  const taskId = typeof taskInfo?.taskId === 'string' ? taskInfo.taskId : '';
  const failureReason =
    typeof taskInfo?.failedReason === 'string' ? taskInfo.failedReason : undefined;
  const projection = projectScriptTaskBadge(taskInfo);
  const identity = JSON.stringify([documentKey, nodeId, kind, taskId]);
  const inFlight = useRef(null);
  const copy = useMessageCopy({
    identity,
    getText: () => (kind === 'failed' ? taskId : ''),
  });
  useLayoutEffect(() => {
    inFlight.current = null;
    return () => {
      inFlight.current = null;
    };
  }, [identity]);
  const copyTaskId = () => {
    if (inFlight.current) return;
    const request = {};
    inFlight.current = request;
    void copy.copy().finally(() => {
      if (inFlight.current === request) inFlight.current = null;
    });
  };
  const theme = isCanvasLight ? ' cv-script-card-task-light' : '';
  if (kind === 'generating')
    return (
      <div
        className={`cv-script-card-task cv-script-card-task-badge${theme}`}
        data-testid="scriptv2-card-task-badge"
        role="status"
      >
        <span>{projection.label}</span>
      </div>
    );
  if (kind !== 'failed') return null;
  return (
    <div
      className={`cv-script-card-task cv-script-card-task-failure${theme}`}
      data-testid="scriptv2-card-task-failure"
    >
      <FailureIcon />
      <span className="cv-script-card-task-failure-label">{projection.failureLabel}</span>
      {failureReason && <span className="cv-script-card-task-reason">{failureReason}</span>}
      {taskId && (
        <span className="cv-script-card-task-id">
          <span className="cv-script-card-task-id-text" title={taskId}>
            TaskID: {taskId}
          </span>
          <button
            type="button"
            className="cv-script-card-task-copy nodrag"
            aria-label="复制任务编号"
            aria-busy={copy.pending}
            onPointerDown={stopPointer}
            onMouseDown={stopPointer}
            onDoubleClick={stopPointer}
            onClick={(event) => {
              event.stopPropagation();
              copyTaskId();
            }}
            onKeyDown={(event) => {
              if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
            }}
          >
            <span className="cv-script-card-task-copy-icon" aria-hidden="true" />
          </button>
        </span>
      )}
      {copy.status && (
        <span
          className="cv-script-card-task-copy-feedback"
          role={copy.status === '复制失败' ? 'alert' : 'status'}
        >
          {copy.status === '复制失败' ? '任务编号复制失败，请重试' : 'TaskID 已复制'}
        </span>
      )}
    </div>
  );
}
