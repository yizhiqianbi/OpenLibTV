import { FileText, Film, Image, Music, Box, Sparkles, X } from 'lucide-react';

const referenceIcons = {
  model: Box,
  skill: Sparkles,
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
};
export function CanvasAgentReferences({ parts = [], onRemove, onPreview }) {
  if (!parts.length) return null;
  return (
    <div className="cv-agent-references" aria-label="创作参考">
      {parts.map((part, index) => {
        const Icon = referenceIcons[part.type] || FileText;
        return (
          <div
            className={'cv-agent-reference cv-agent-reference-' + part.type}
            key={part.referenceKey || part.type + ':' + part.id + ':' + index}
          >
            {part.source?.value ? (
              <button
                className="cv-agent-reference-label"
                title={part.name}
                onClick={() => onPreview?.(part)}
              >
                {part.type === 'image' ? (
                  <img src={part.source.value} alt={part.name || '参考图片'} />
                ) : (
                  <Icon size={15} />
                )}
                <span>{part.name || part.id}</span>
              </button>
            ) : (
              <>
                <Icon size={15} />
                <span title={part.name}>{part.name || part.id}</span>
              </>
            )}
            {onRemove && (
              <button aria-label={'移除 ' + (part.name || part.id)} onClick={() => onRemove(part)}>
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
