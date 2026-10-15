import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Music2,
} from 'lucide-react';
import Modal from '../../../../components/Modal.jsx';
import Markdown from '../../../shared/secondary/Markdown.jsx';
import { timeLabel } from '../../../shared/secondary/media.js';
import { localHref } from '../../../../data.js';
import { skillCaseLink } from '../skill-share-model.js';

function SkillShareMedia({ items, cover, asset, templateUuid }) {
  const [index, setIndex] = useState(0),
    [ratio, setRatio] = useState(1),
    [zoom, setZoom] = useState(false),
    [playing, setPlaying] = useState(false),
    [duration, setDuration] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [muted, setMuted] = useState(false),
    [text, setText] = useState(null),
    video = useRef(null),
    stage = useRef(null),
    item = items[index],
    url = item?.productionCaseUrl || '',
    type = /\.(mp4|webm|m4v|mov|avi|mkv)(?:\?|$)/i.test(url)
      ? 'video'
      : /\.(mp3|wav|ogg|aac|m4a|flac)(?:\?|$)/i.test(url)
        ? 'audio'
        : /\.(md|txt|pdf|docx?|pptx?)(?:\?|$)/i.test(url)
          ? 'document'
          : 'image';
  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
    setDuration(0);
    setText(null);
    if (type === 'document') {
      let live = true;
      fetch(asset(url))
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => live && setText(t))
        .catch(() => live && setText('内容加载失败'));
      return () => {
        live = false;
      };
    }
  }, [url, type, asset]);
  if (!item) return null;
  function full() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.current.requestFullscreen?.();
  }
  function toggle() {
    const v = video.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  }
  const controls = (
    <div className="secondary-skill-media-controls">
      <button onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <span>{timeLabel(elapsed)}</span>
      <input
        aria-label="播放进度"
        type="range"
        min="0"
        max={Number.isFinite(duration) ? duration : 0}
        step=".1"
        value={elapsed}
        onChange={(e) => {
          video.current.currentTime = +e.target.value;
          setElapsed(+e.target.value);
        }}
      />
      <span>{timeLabel(duration)}</span>
      <button onClick={() => setMuted((v) => !v)} aria-label={muted ? '取消静音' : '静音'}>
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <button onClick={full} aria-label="全屏">
        <Maximize size={13} />
      </button>
    </div>
  );
  return (
    <div className="secondary-skill-share-media">
      <div
        ref={stage}
        className={`secondary-skill-media-stage ${type}`}
        style={
          type === 'image' || type === 'video'
            ? { aspectRatio: ratio, width: `min(100%,${(type === 'video' ? 479 : 480) * ratio}px)` }
            : undefined
        }
      >
        {type === 'image' ? (
          <button
            className="secondary-skill-media-image"
            onClick={() => setZoom(true)}
            aria-label="查看原图"
          >
            <img
              src={asset(url)}
              alt="Skill 案例"
              onLoad={(e) =>
                setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)
              }
            />
          </button>
        ) : type === 'document' ? (
          <div className="secondary-skill-document">
            {text === null ? '加载中...' : <Markdown content={text} asset={asset} />}
          </div>
        ) : (
          <>
            <div className="secondary-skill-share-video">
              {type === 'audio' && (
                <div className="secondary-skill-audio-background">
                  <Music2 size={52} />
                  <span>音频作品 {index + 1}</span>
                </div>
              )}
              {type === 'video' ? (
                <video
                  key={url}
                  ref={video}
                  src={asset(url)}
                  poster={asset(cover)}
                  muted={muted}
                  playsInline
                  preload="metadata"
                  onClick={toggle}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => {
                    setRatio(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9);
                    setDuration(e.currentTarget.duration);
                  }}
                />
              ) : (
                <audio
                  key={url}
                  ref={video}
                  src={asset(url)}
                  muted={muted}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                />
              )}
            </div>
            {controls}
          </>
        )}
        {items.length > 1 && (
          <div className="secondary-skill-case-pager">
            <button
              disabled={index === 0}
              aria-label="上一个案例"
              onClick={() => setIndex((i) => i - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {index + 1}/{items.length}
            </span>
            <button
              disabled={index === items.length - 1}
              aria-label="下一个案例"
              onClick={() => setIndex((i) => i + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        {(!!item.canvasCasePower || !!item.canvasCaseUrl) && (
          <div className="secondary-skill-case-link">
            {item.canvasCasePower > 0 && <span>ϟ {item.canvasCasePower}积分</span>}
            {item.canvasCaseUrl && (
              <a
                href={localHref(skillCaseLink(item.canvasCaseUrl, templateUuid))}
                target="_blank"
                rel="noreferrer"
              >
                创作详情
                <ArrowUpRight size={10} />
              </a>
            )}
          </div>
        )}
      </div>
      {zoom && (
        <Modal className="secondary-skill-zoom" title="查看原图" onClose={() => setZoom(false)}>
          <img src={asset(url)} alt="Skill 案例" />
          {index > 0 && (
            <button className="prev" onClick={() => setIndex((i) => i - 1)} aria-label="上一张">
              <ChevronLeft />
            </button>
          )}
          {index < items.length - 1 && (
            <button className="next" onClick={() => setIndex((i) => i + 1)} aria-label="下一张">
              <ChevronRight />
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}

export default SkillShareMedia;
