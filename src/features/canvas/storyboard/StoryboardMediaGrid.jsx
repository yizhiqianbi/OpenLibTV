import { Play } from 'lucide-react';

/** This view has no document or persistence ownership. */
export function StoryboardMediaGrid({ shots, onPreview, src = (url) => url }) {
  return (
    <>
      <div className="cv-storyboard-title">
        故事板 <span>{shots.length} 个镜头</span>
      </div>
      <div className="cv-storyboard-grid">
        {shots.map(({ node, url, name, prompt }, index) => (
          <button key={node.id} type="button" onClick={() => onPreview?.(node)}>
            <div className="cv-shot-media">
              {node.type === 'image' ? (
                <img loading="lazy" src={src(url)} alt={name} />
              ) : (
                <video src={src(url)} preload="none" muted />
              )}
              <span>{String(index + 1).padStart(2, '0')}</span>
              {node.type === 'video' && <Play size={22} />}
            </div>
            <strong>{name}</strong>
            <p>{prompt}</p>
          </button>
        ))}
      </div>
    </>
  );
}
