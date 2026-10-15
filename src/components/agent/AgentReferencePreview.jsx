import { EditorDialog } from '../EditorDialog.jsx';
import './rich-agent-input.css';

export default function AgentReferencePreview({ reference, onClose }) {
  if (!reference?.source?.value) return null;
  return (
    <EditorDialog title={reference.name || '参考素材'} onClose={onClose} wide>
      <div className="agent-reference-preview">
        {reference.type === 'image' ? (
          <img src={reference.source.value} alt={reference.name || '参考图片'} />
        ) : reference.type === 'video' ? (
          <video
            controls
            tabIndex={0}
            src={reference.source.value}
            poster={reference.poster}
            playsInline
          />
        ) : reference.type === 'audio' ? (
          <audio controls tabIndex={0} src={reference.source.value} />
        ) : (
          <a className="soft-button" href={reference.source.value} download={reference.name}>
            下载 {reference.name || '参考文档'}
          </a>
        )}
      </div>
    </EditorDialog>
  );
}
