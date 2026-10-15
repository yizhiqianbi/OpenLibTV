import { EditorDialog } from '../../../components/EditorDialog.jsx';

/** Exact source wording, with the existing local editor chrome and dialog stack. */
export function CanvasDeleteConfirmation({ controls, sourceUnlinkChrome = false }) {
  const request = controls.request;
  if (!request) return null;
  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <EditorDialog
        title={request.title}
        onClose={() => controls.cancel(request)}
        closeOnBackdrop={request.closeOnBackdrop ?? true}
        showCloseButton={request.showCloseButton ?? true}
        className={sourceUnlinkChrome ? 'cv-storyboard-unlink-dialog' : ''}
        overlayClassName={sourceUnlinkChrome ? 'cv-storyboard-unlink-overlay' : ''}
      >
        <div className="cv-batch-run-content">
          <p
            onDoubleClick={
              sourceUnlinkChrome
                ? (event) => {
                    const selection = window.getSelection();
                    if (!selection) return;
                    const range = document.createRange();
                    range.selectNodeContents(event.currentTarget);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                : undefined
            }
          >
            {request.message}
          </p>
          <div className="cv-batch-dialog-actions">
            <button type="button" onClick={() => controls.cancel(request)}>
              {request.cancelText}
            </button>
            <button
              type="button"
              className="cv-batch-primary"
              onClick={() => controls.confirm(request)}
            >
              {request.confirmText}
            </button>
          </div>
        </div>
      </EditorDialog>
    </div>
  );
}
