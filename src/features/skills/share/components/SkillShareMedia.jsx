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
    [documentError, setDocumentError] = useState(false),
    [documentAttempt, setDocumentAttempt] = useState(0),
    [switching, setSwitching] = useState(false),
    [mediaError, setMediaError] = useState(false),
    [mediaAttempt, setMediaAttempt] = useState(0),
    video = useRef(null),
    stage = useRef(null),
    switchTimer = useRef(null),
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
    setDocumentError(false);
    setMediaError(false);
    if (type === 'document') {
      let live = true;
      fetch(asset(url))
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((t) => live && setText(t))
        .catch(() => live && setDocumentError(true));
      return () => {
        live = false;
      };
    }
  }, [url, type, asset, documentAttempt, mediaAttempt]);
  useEffect(
    () => () => {
      clearTimeout(switchTimer.current);
    },
    [],
  );
  function changeCase(next) {
    if (next === index) return;
    clearTimeout(switchTimer.current);
    setSwitching(true);
    setIndex(next);
    switchTimer.current = setTimeout(() => setSwitching(false), 360);
  }
  function retryMedia() {
    setMediaError(false);
    setMediaAttempt((value) => value + 1);
  }
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
        className={`secondary-skill-media-stage ${type}${switching ? ' is-switching' : ''}`}
        style={
          type === 'image' || type === 'video'
            ? { aspectRatio: ratio, width: `min(100%,${(type === 'video' ? 479 : 480) * ratio}px)` }
            : undefined
        }
      >
        {type === 'image' ? (
          mediaError ? (
            <div className="secondary-skill-media-error" role="alert">
              媒体加载失败
              <button type="button" onClick={retryMedia}>
                重试
              </button>
            </div>
          ) : (
            <button
              className="secondary-skill-media-image"
              onClick={() => setZoom(true)}
              aria-label="查看原图"
            >
              <img
                key={`${url}:${mediaAttempt}`}
                src={asset(url)}
                alt="Skill 案例"
                onError={() => setMediaError(true)}
                onLoad={(e) =>
                  setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 1)
                }
              />
            </button>
          )
        ) : type === 'document' ? (
          <div className="secondary-skill-document">
            {documentError ? (
              <div role="alert">
                内容加载失败
                <button
                  type="button"
                  aria-label="重试读取案例"
                  onClick={() => {
                    setDocumentError(false);
                    setText(null);
                    setDocumentAttempt((value) => value + 1);
                  }}
                >
                  重试
                </button>
              </div>
            ) : text === null ? (
              <p role="status">加载中...</p>
            ) : (
              <Markdown content={text} asset={asset} />
            )}
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
                  key={`${url}:${mediaAttempt}`}
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
                  onError={() => setMediaError(true)}
                />
              ) : (
                <audio
                  key={`${url}:${mediaAttempt}`}
                  ref={video}
                  src={asset(url)}
                  muted={muted}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onError={() => setMediaError(true)}
                />
              )}
            </div>
            {mediaError ? (
              <div className="secondary-skill-media-error" role="alert">
                媒体加载失败
                <button type="button" onClick={retryMedia}>
                  重试
                </button>
              </div>
            ) : (
              controls
            )}
          </>
        )}
        {items.length > 1 && (
          <div className="secondary-skill-case-pager">
            <button
              disabled={index === 0}
              aria-label="上一个案例"
              onClick={() => changeCase(index - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span>
              {index + 1}/{items.length}
            </span>
            <button
              disabled={index === items.length - 1}
              aria-label="下一个案例"
              onClick={() => changeCase(index + 1)}
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
            <button className="prev" onClick={() => changeCase(index - 1)} aria-label="上一张">
              <ChevronLeft />
            </button>
          )}
          {index < items.length - 1 && (
            <button className="next" onClick={() => changeCase(index + 1)} aria-label="下一张">
              <ChevronRight />
            </button>
          )}
        </Modal>
      )}
    </div>
  );
}

export default SkillShareMedia;
