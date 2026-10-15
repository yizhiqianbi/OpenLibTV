import React, { useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import { Box, FileText } from 'lucide-react';
import { asset } from '../../../services/assets.ts';

export default function AssetMedia({ item, preview = false }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="asset-library-media-placeholder">
        <Icon name="assets-empty" size={52} />
        <span>素材加载失败</span>
        {preview && <button onClick={() => setFailed(false)}>重试</button>}
      </div>
    );
  if (item.type === 'image')
    return (
      <img
        src={asset(item.thumbnailUrl && !preview ? item.thumbnailUrl : item.url)}
        alt={item.name}
        onError={() => setFailed(true)}
      />
    );
  if (item.type === 'video')
    return (
      <video
        src={asset(item.url)}
        poster={item.thumbnailUrl ? asset(item.thumbnailUrl) : undefined}
        controls={preview}
        preload={preview ? 'metadata' : 'none'}
        playsInline
        onError={() => setFailed(true)}
      />
    );
  if (item.type === 'audio' && preview)
    return (
      <div className="asset-library-audio">
        <Icon name="audio-file" size={72} />
        <audio controls src={asset(item.url)} onError={() => setFailed(true)} />
      </div>
    );
  return (
    <div className="asset-library-media-placeholder">
      {item.type === 'audio' ? (
        <Icon name="audio-file" size={52} />
      ) : item.type === 'model' ? (
        <Box size={52} aria-hidden="true" />
      ) : (
        <FileText size={52} aria-hidden="true" />
      )}
    </div>
  );
}
