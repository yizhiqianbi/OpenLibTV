import { EditorDialog } from '../../../components/EditorDialog.jsx';

/** Source confirmations use the existing shared dialog stack and restore their opener. */
export function StoryboardGroupConfirmation({ controls }) {
  const request = controls.confirmation;
  if (!request) return null;
  const clear = request.command.type === 'clear';
  const busy = controls.busyGroupIds.includes(request.groupId);
  return (
    <EditorDialog title={clear ? '清空分镜' : '转为普通组'} onClose={controls.cancel}>
      <div className="cv-storyboard-group-confirm-content">
        <p>
          {clear
            ? request.scriptLinked
              ? '将删除分镜组内所有子节点。与脚本的对应关系仍保留，可通过「重新生成」恢复分镜图。是否继续？'
              : '将删除分镜组内所有子节点。是否继续？'
            : '将取消分镜宫格与分镜组专属选项；子图将按实际显示尺寸恢复，并按普通分组宫格重新排版。是否继续？'}
        </p>
        {busy && <p role="status">正在读取图片尺寸…</p>}
        {controls.error && <p role="alert">{controls.error}</p>}
        <div className="cv-batch-dialog-actions">
          <button type="button" onClick={controls.cancel}>
            取消
          </button>
          <button
            type="button"
            className="cv-batch-primary"
            disabled={busy}
            onClick={controls.confirm}
          >
            {clear ? '清空' : '确定'}
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}
