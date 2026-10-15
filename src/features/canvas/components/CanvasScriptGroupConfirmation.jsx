import { EditorDialog } from '../../../components/EditorDialog.jsx';

export function CanvasScriptGroupConfirmation({ controls }) {
  const request = controls.request;
  if (!request) return null;
  return (
    <EditorDialog title={request.title} onClose={() => controls.cancel(request)}>
      <div className="cv-batch-run-content">
        {request.message && <p>{request.message}</p>}
        {request.kind === 'power' && (
          <>
            <p>费用服务尚未连接，未提供积分估算。</p>
            <p className="cv-batch-muted">仅生成节点会被执行，特殊节点需手动执行。</p>
          </>
        )}
        <p role="status" className="cv-batch-service-note">
          分镜生成服务尚未连接，节点参数和现有内容已保留。
        </p>
        <div className="cv-batch-dialog-actions">
          <button type="button" onClick={() => controls.cancel(request)}>
            取消
          </button>
          <button type="button" className="cv-batch-primary" disabled>
            {request.confirmText}
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}
