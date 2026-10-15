import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CirclePlay,
  Film,
  Flag,
  GitBranch,
  Keyboard,
  List,
  Music2,
  Scan,
  SlidersHorizontal,
} from 'lucide-react';
import { useFilmGraphMedia } from '../hooks/useFilmGraphMedia.js';
import {
  filmGraphNodeSummary,
  filmGraphPreview,
  filmGraphRegionStyle,
} from './film-graph-model.js';

export const FILM_NODE_ICONS = {
  start: CirclePlay,
  play: Film,
  choice: List,
  set: SlidersHorizontal,
  condition: GitBranch,
  hotspot: Scan,
  qte: Keyboard,
  ending: Flag,
};
const retireMedia = (element) => {
  if (!element) return;
  if (element instanceof HTMLMediaElement) element.pause();
  element.removeAttribute('src');
  if (element instanceof HTMLMediaElement) element.load();
};

function FilmNodeMedia({ media, documentId, frameTime, inherited, selected }) {
  const { url, error, loading, retry } = useFilmGraphMedia(media, documentId);
  const native = useRef(null);
  const attachMedia = useCallback((element) => {
    if (native.current !== element) retireMedia(native.current);
    native.current = element;
  }, []);
  const [decodeError, setDecodeError] = useState(null);
  const failed = decodeError?.url === url ? decodeError.message : '';
  const seek = () => {
    const video = native.current;
    if (!video || media.type !== 'video' || video.readyState < 1) return;
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : Infinity;
    video.currentTime = Math.max(0, Math.min(frameTime ?? 0, end));
  };
  useEffect(() => {
    if (!url) return;
    const element = native.current;
    return () => {
      retireMedia(element);
    };
  }, [url]);
  useEffect(() => {
    const video = native.current;
    if (!url || media.type !== 'video' || !video || video.readyState < 1) return;
    const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : Infinity;
    video.currentTime = Math.max(0, Math.min(frameTime ?? 0, end));
  }, [url, frameTime, media.type]);
  const failure = (event) => {
    if (event.currentTarget === native.current)
      setDecodeError({ url, message: '素材无法解码，请重新导入浏览器支持的格式' });
  };
  return (
    <div
      className="film-node-preview"
      data-media-id={media.id}
      data-inherited={inherited || undefined}
    >
      {url &&
        !failed &&
        (media.type === 'image' ? (
          <img
            key={url}
            ref={attachMedia}
            className="film-node-image"
            src={url}
            alt={media.name}
            draggable={false}
            onError={failure}
          />
        ) : media.type === 'video' ? (
          <video
            key={url}
            ref={attachMedia}
            className="film-node-video"
            src={url}
            aria-label={`${media.name}缩略画面`}
            preload="metadata"
            playsInline
            muted
            controls={selected && !inherited}
            onLoadedMetadata={seek}
            onError={failure}
          />
        ) : (
          <div className="film-node-audio">
            <Music2 size={38} />
            <span>{media.name}</span>
            {selected && (
              <audio
                key={url}
                ref={attachMedia}
                src={url}
                controls
                preload="metadata"
                onError={failure}
              />
            )}
          </div>
        ))}
      {(loading || error || failed) && (
        <div
          className="film-node-empty film-node-media-state"
          role={error || failed ? 'status' : undefined}
        >
          <Film size={32} />
          <span>{loading ? '正在读取本机素材' : error || failed}</span>
          {(error || failed) && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                retry();
              }}
            >
              重新读取素材
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilmNodePreview({ document, node, selected }) {
  const preview = filmGraphPreview(document, node);
  const Icon = FILM_NODE_ICONS[node.kind] || Film;
  const interactive = ['choice', 'hotspot', 'qte'].includes(node.kind);
  const summary = filmGraphNodeSummary(document, node);
  return (
    <div className="film-node-content">
      {preview.media ? (
        <FilmNodeMedia
          media={preview.media}
          documentId={document.id}
          frameTime={preview.frameTime}
          inherited={preview.inherited}
          selected={selected}
        />
      ) : (
        <div className="film-node-empty">
          <Icon size={38} />
          <span>
            {preview.error ||
              (node.kind === 'play'
                ? '添加播放素材'
                : preview.inherited
                  ? '继承上一画面'
                  : summary)}
          </span>
          {preview.inherited && <small>画面由剧情路径决定</small>}
          {node.kind === 'play' && !preview.error && <small>视频、音频或图片</small>}
        </div>
      )}
      {interactive && (
        <div className={`film-node-interaction-overlay film-node-interaction-${node.kind}`}>
          {node.kind === 'hotspot' &&
            node.region &&
            preview.media &&
            preview.media.type !== 'audio' && (
              <div
                className="film-node-hotspot-preview"
                style={filmGraphRegionStyle(preview.media, node.region)}
              />
            )}
          {summary && <p className="film-node-prompt">{summary}</p>}
          {node.kind === 'choice' && (
            <div className="film-node-choice-preview" aria-label="选择叠层预览">
              {(node.choices || []).slice(0, 2).map((choice) => (
                <span key={choice.id}>{choice.text}</span>
              ))}
              {(node.choices?.length || 0) > 2 && (
                <small>另有 {node.choices.length - 2} 个选项</small>
              )}
            </div>
          )}
          {node.kind === 'qte' && (
            <span className="film-node-qte-preview">
              <Keyboard size={14} /> Space
            </span>
          )}
          <span className="film-node-window">
            {preview.inherited ? '继承画面' : '片段互动'}
            {node.windowEnd !== undefined
              ? ` · ${node.windowStart ?? 0}–${node.windowEnd}s`
              : ' · 等待选择'}
          </span>
        </div>
      )}
    </div>
  );
}
