import { Box, Film, FileText, Image, Music, Sparkles, Scissors } from 'lucide-react';
import icons from './mention-icons.json';

const nodeIcons = {
  text: 'text-file',
  image: 'image-s',
  video: 'video-add-s',
  audio: 'audio-file',
  script: 'list-detail',
  storyboard: 'list-detail',
  'video-story': 'imageset',
  video_group: 'video-add-s',
};
const mediaIcons = {
  model: Box,
  video: Film,
  document: FileText,
  image: Image,
  audio: Music,
  skill: Sparkles,
};

/** Original public libtv SVGs, kept as a small subset rather than the full icon bundle. */
export default function AgentMentionIcon({ reference, name, className = '' }) {
  const iconName =
    name || (reference?.type === 'node' && (nodeIcons[reference.nodeType] || 'artboard-f'));
  const icon = icons[iconName];
  if (icon)
    return (
      <svg
        className={`agent-mention-icon ${className}`}
        width="16"
        height="16"
        viewBox={`0 0 ${icon.width} ${icon.height}`}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: icon.body }}
      />
    );
  const Glyph =
    reference?.nodeType === 'video-clip' ? Scissors : mediaIcons[reference?.type] || FileText;
  return <Glyph className={`agent-mention-icon ${className}`} size={16} aria-hidden="true" />;
}
