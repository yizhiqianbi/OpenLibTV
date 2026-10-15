import { useMemo } from 'react';
import { storyboardMediaShots } from './media.js';
import { StoryboardMediaGrid } from './StoryboardMediaGrid.jsx';
import { StoryboardTable } from './StoryboardTable.jsx';

/** Compatibility surface. Existing callers remain a read-only media storyboard. */
export function StoryboardPanel({
  nodes = [],
  setDialog,
  src,
  scriptNode,
  documentKey = '',
  readonly = true,
  ready = true,
  onChange,
}) {
  const shots = useMemo(() => storyboardMediaShots(nodes), [nodes]);
  return (
    <section className="cv-storyboard">
      {scriptNode ? (
        <StoryboardTable
          key={JSON.stringify([documentKey, scriptNode.id])}
          node={scriptNode}
          {...{ documentKey, readonly, ready, onChange }}
        />
      ) : (
        <StoryboardMediaGrid
          shots={shots}
          src={src}
          onPreview={(node) => setDialog?.({ preview: node })}
        />
      )}
    </section>
  );
}
