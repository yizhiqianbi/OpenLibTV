import { useEffect, useState } from 'react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { canvasBatchConfirmation, CANVAS_BATCH_SERVICE_UNAVAILABLE } from './model.js';
import { useCanvasBatch } from './useCanvasBatch.js';
import './batch.css';

const statusLabels = {
  pending: '等待执行',
  running: '执行中',
  success: '已完成',
  failed: '执行失败',
  skipped: '已跳过',
  blocked: '尚未提交',
};

/** Controlled dialog, only for an actual group; opening it never submits a task. */
export default function BatchRunDialog({ onClose, ...props }) {
  const batch = useCanvasBatch(props);
  const { plan, quote, state } = batch;
  const [stopConfirmation, setStopConfirmation] = useState(false);
  useEffect(
    () => setStopConfirmation(false),
    [props.documentKey, props.groupId, props.ready, props.readonly],
  );
  const disabled = props.readonly || props.ready === false;
  const close = () => {
    if (state?.running) setStopConfirmation(true);
    else onClose?.();
  };
  const stop = () => {
    batch.cancel();
    setStopConfirmation(false);
  };
  return (
    <>
      <EditorDialog title="整组执行" onClose={close}>
        <div className="cv-batch-run-content">
          {quote.status === 'loading' ? (
            <p role="status">正在计算算力消耗…</p>
          ) : (
            <p>{canvasBatchConfirmation(plan, quote.value)}</p>
          )}
          <p className="cv-batch-muted">仅生成节点会被执行，特殊节点需手动执行。</p>
          {quote.status === 'unavailable' && (
            <p className="cv-batch-muted">费用服务尚未连接，未提供积分估算。</p>
          )}
          {quote.status === 'error' && (
            <div className="cv-batch-quote-error">
              {quote.error && <p role="alert">{quote.error}</p>}
              <button
                type="button"
                disabled={disabled || state?.running}
                onClick={batch.retryEstimate}
              >
                重新计算
              </button>
            </div>
          )}
          {!props.executeNode && (
            <p className="cv-batch-service-note">{CANVAS_BATCH_SERVICE_UNAVAILABLE}</p>
          )}
          {!plan.nodeIds.length && <p role="status">组内没有可执行的生成节点</p>}
          <ol className="cv-batch-node-list" aria-label="组内生成节点">
            {plan.nodes.map((node) => (
              <li key={node.id}>
                <div>
                  <strong>{node.name}</strong>
                  <span>{node.generator.model || '模型未配置'}</span>
                </div>
                {state?.nodeStatuses[node.id] && (
                  <span className="cv-batch-node-status">
                    {statusLabels[state.nodeStatuses[node.id]]}
                  </span>
                )}
                {state?.errors[node.id] && <p role="alert">{state.errors[node.id]}</p>}
              </li>
            ))}
          </ol>
          {state?.running && (
            <p role="status">
              已处理 {state.finishedCount} / {plan.nodeIds.length} 个节点
            </p>
          )}
          {state?.cancelled && <p role="status">已停止继续执行，节点参数和已有内容保留。</p>}
          {state?.error && <p role="alert">{state.error}</p>}
          {!state?.running && state?.failed.length > 0 && (
            <p role="alert">{state.failed.length} 个节点执行失败；依赖这些节点的下游已跳过。</p>
          )}
          <div className="cv-batch-dialog-actions">
            <button type="button" onClick={close}>
              取消
            </button>
            {state?.running ? (
              <button
                type="button"
                className="cv-batch-primary"
                onClick={() => setStopConfirmation(true)}
              >
                停止
              </button>
            ) : (
              <button
                type="button"
                className="cv-batch-primary"
                disabled={disabled || quote.status === 'loading' || !plan.nodeIds.length}
                onClick={batch.start}
              >
                开始执行
              </button>
            )}
          </div>
        </div>
      </EditorDialog>
      {stopConfirmation && state?.running && (
        <EditorDialog title="停止批量任务？" onClose={() => setStopConfirmation(false)}>
          <div className="cv-batch-run-content">
            <p>将停止 {Math.max(0, plan.nodeIds.length - state.finishedCount)} 个进行中的任务。</p>
            <p>停止后已消耗的积分不会退还。</p>
            <div className="cv-batch-dialog-actions">
              <button type="button" onClick={() => setStopConfirmation(false)}>
                取消
              </button>
              <button type="button" className="cv-batch-primary" onClick={stop}>
                停止
              </button>
            </div>
          </div>
        </EditorDialog>
      )}
    </>
  );
}
