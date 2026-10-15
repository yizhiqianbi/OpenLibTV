import { useState } from 'react';
import { AudioLines, FileText, FolderClosed, ImageIcon, Play, Video } from 'lucide-react';
import { asset } from '../../services/assets.ts';
import { agentNodeVideoPoster } from '../../services/agent-node-presentation.ts';

/** Source 943317/t7: actual folder/media cover, 400px video poster and failed-cover icon. */
export default function AssetPickerCover({ item }) {
  const folder = item.kind === 'folder';
  const source = folder
    ? item.coverUrl && /^(https?:|data:|\/)/.test(item.coverUrl)
      ? item.coverUrl
      : null
    : item.mediaType === 'image'
      ? item.thumbnailUrl || item.url
      : item.mediaType === 'video'
        ? item.thumbnailUrl || agentNodeVideoPoster(item.url, 400)
        : null;
  const [failedSource, setFailedSource] = useState(null);
  if (source && source !== failedSource)
    return (
      <>
        <img src={asset(source)} alt="" loading="lazy" onError={() => setFailedSource(source)} />
        {item.mediaType === 'video' && <Play className="agent-asset-cover-play" size={28} />}
      </>
    );
  const CoverIcon = folder
    ? FolderClosed
    : item.mediaType === 'text'
      ? FileText
      : item.mediaType === 'video'
        ? Video
        : item.mediaType === 'audio'
          ? AudioLines
          : ImageIcon;
  return <CoverIcon size={56} />;
}
