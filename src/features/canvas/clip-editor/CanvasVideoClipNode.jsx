import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Download,
  Grid3X3,
  Layers,
  Link2,
  LoaderCircle,
  Pause,
  Play,
  Scissors,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useVideoClipPlayback } from './useVideoClipPlayback.js';

const identityUrl = (url) => url;
const miniTicks = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const modeIcons = {
  talkingVideo: UserRound,
  productUrlAd: Link2,
  explainerVideo: AudioLines,
  batchAd: Layers,
  smartMixCut: Grid3X3,
};

function stopPointer(event) {
  event.stopPropagation();
}

function formatTime(value) {
  if (value > 0 && value < 1) value = 1;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
}

function ClipSlider({ value, maximum, vertical = false, label, onChange, documentKey }) {
  const ref = useRef(null);
  const live = useRef({ maximum, onChange });
  const ownerRef = useRef(null);
  const [pointerId, setPointerId] = useState(null);
  useLayoutEffect(() => {
    live.current = { maximum, onChange };
  }, [maximum, onChange]);
  useLayoutEffect(() => {
    const owner = {};
    ownerRef.current = owner;
    setPointerId(null);
    return () => {
      if (ownerRef.current === owner) ownerRef.current = null;
    };
  }, [documentKey]);
  const changeAt = useCallback(
    (event) => {
      const rect = ref.current?.getBoundingClientRect();
      const length = vertical ? rect?.height : rect?.width;
      if (!rect || !length || live.current.maximum <= 0) return;
      const coordinate = vertical ? rect.bottom - event.clientY : event.clientX - rect.left;
      live.current.onChange(
        (Math.max(0, Math.min(coordinate, length)) / length) * live.current.maximum,
      );
    },
    [vertical],
  );
  useEffect(() => {
    if (pointerId === null) return;
    const owner = ownerRef.current;
    const move = (event) => {
      if (ownerRef.current === owner && event.pointerId === pointerId) changeAt(event);
    };
    const stop = (event) => {
      if (event.pointerId === pointerId) setPointerId(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stopAll);
    function stopAll() {
      setPointerId(null);
    }
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stopAll);
    };
  }, [pointerId, changeAt, documentKey]);
  const percentage = maximum > 0 ? (value / maximum) * 100 : 0;
  return (
    <div
      ref={ref}
      className={`cv-clip-node-slider nodrag nopan nokey ${vertical ? 'cv-clip-node-slider-vertical' : 'cv-clip-node-slider-seek'}`}
      role="slider"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-disabled={maximum <= 0}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 0 || maximum <= 0) return;
        event.currentTarget.focus();
        setPointerId(event.pointerId);
        changeAt(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail !== 0) changeAt(event);
      }}
      onKeyDown={(event) => {
        const step = vertical ? 0.05 : 1;
        let next;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = maximum;
        else if (['ArrowRight', 'ArrowUp'].includes(event.key)) next = value + step;
        else if (['ArrowLeft', 'ArrowDown'].includes(event.key)) next = value - step;
        if (next === undefined || maximum <= 0) return;
        event.preventDefault();
        event.stopPropagation();
        onChange(Math.max(0, Math.min(maximum, next)));
      }}
    >
      <span className="cv-clip-node-slider-rail" />
      <span
        className="cv-clip-node-slider-fill"
        style={vertical ? { height: `${percentage}%` } : { width: `${percentage}%` }}
      />
      <span
        className="cv-clip-node-slider-thumb"
        style={vertical ? { bottom: `${percentage}%` } : { left: `${percentage}%` }}
      />
    </div>
  );
}

function PlaybackBar({ playback, documentKey }) {
  const [volumeHovered, setVolumeHovered] = useState(false);
  const [volumeFocused, setVolumeFocused] = useState(false);
  return (
    <div className="cv-clip-node-playback-bar nodrag nopan" onPointerDown={stopPointer}>
      <div className="cv-clip-node-playback-row">
        <button
          type="button"
          className="cv-clip-node-play-pause"
          aria-label={playback.playing ? '暂停' : '播放'}
          onClick={(event) => {
            event.stopPropagation();
            playback.togglePlay();
          }}
        >
          {playback.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="cv-clip-node-playback-time">{formatTime(playback.currentTime)}</span>
        <ClipSlider
          value={playback.currentTime}
          maximum={playback.duration}
          label="播放进度"
          onChange={playback.seek}
          documentKey={documentKey}
        />
        <span className="cv-clip-node-playback-time">
          {playback.duration > 0 ? formatTime(playback.duration) : '--:--'}
        </span>
        {playback.hasAudio && (
          <div
            className="cv-clip-node-volume"
            onMouseEnter={() => setVolumeHovered(true)}
            onMouseLeave={() => setVolumeHovered(false)}
            onFocusCapture={() => setVolumeFocused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setVolumeFocused(false);
            }}
          >
            <div
              className="cv-clip-node-volume-popover"
              data-visible={volumeHovered || volumeFocused}
            >
              <div className="cv-clip-node-volume-panel">
                <span>{Math.round((playback.muted ? 0 : playback.volume) * 100)}</span>
                <ClipSlider
                  vertical
                  value={playback.muted ? 0 : playback.volume}
                  maximum={1}
                  label="音量"
                  onChange={playback.changeVolume}
                  documentKey={documentKey}
                />
              </div>
            </div>
            <button
              type="button"
              className="cv-clip-node-mute"
              aria-label={playback.muted || playback.volume === 0 ? '取消静音' : '静音'}
              onClick={(event) => {
                event.stopPropagation();
                playback.toggleMute();
              }}
            >
              {playback.muted || playback.volume === 0 ? (
                <VolumeX size={14} />
              ) : (
                <Volume2 size={14} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PassiveVideo({ url, documentKey }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    video.src = url;
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [url, documentKey]);
  return (
    <video
      ref={ref}
      className="cv-clip-node-incoming-video"
      muted
      playsInline
      preload="metadata"
      draggable={false}
      aria-hidden="true"
    />
  );
}

function IncomingPreview({ nodeId, url, poster, snapshot, documentKey, presentation, onOpen }) {
  const [failedImages, setFailedImages] = useState(() => new Set());
  useEffect(() => setFailedImages(new Set()), [poster, snapshot, documentKey, nodeId]);
  const image =
    (poster && !failedImages.has(poster) ? poster : null) ??
    (snapshot && !failedImages.has(snapshot) ? snapshot : null);
  return (
    <div className="cv-clip-node-incoming">
      <div className="cv-clip-node-incoming-preview">
        {image ? (
          <img
            src={image}
            alt=""
            draggable={false}
            onError={() => setFailedImages((previous) => new Set(previous).add(image))}
          />
        ) : (
          <PassiveVideo url={url} documentKey={documentKey} />
        )}
        <div className="cv-clip-node-incoming-shade" />
        <div className="cv-clip-node-incoming-action">
          {presentation.composeGenerating ? (
            <LoaderCircle size={40} className="cv-clip-node-spinner" />
          ) : (
            <Scissors size={40} />
          )}
          <button
            type="button"
            className="cv-clip-node-open cv-clip-node-open-primary nodrag nopan"
            disabled={presentation.openDisabled}
            onPointerDown={stopPointer}
            onClick={(event) => {
              event.stopPropagation();
              if (presentation.canOpenEditor) onOpen?.();
            }}
          >
            {presentation.composeGenerating ? '生成中' : '打开智能剪辑'}
          </button>
        </div>
      </div>
      <div className="cv-clip-node-mini-timeline" aria-hidden="true">
        <div className="cv-clip-node-mini-ticks">
          {miniTicks.map((tick) => (
            <div key={tick}>
              <span>{tick === 0 ? '0' : `0:${String(tick).padStart(2, '0')}`}</span>
              <i />
            </div>
          ))}
        </div>
        <div className="cv-clip-node-mini-track cv-clip-node-mini-track-first">
          <i />
        </div>
        <div className="cv-clip-node-mini-track">
          <i />
        </div>
      </div>
    </div>
  );
}

function OutputPreview({
  node,
  presentation,
  documentKey,
  mapUrl,
  snapshot,
  onOpen,
  onPlaybackVolumeChange,
  draggingConnection,
}) {
  const containerRef = useRef(null);
  const playback = useVideoClipPlayback({
    nodeId: node.id,
    documentKey,
    url: mapUrl(presentation.outputUrl),
    containerRef,
    draggingConnection,
    previewDisabled: presentation.isEditing,
    initialPlaybackVolume: node.data?.playbackVolume,
    onPlaybackVolumeChange,
  });
  const poster = snapshot || mapUrl(node.data?.poster);
  return (
    <div
      className="cv-clip-node-output"
      onMouseEnter={playback.onMouseEnter}
      onMouseLeave={playback.onMouseLeave}
      data-playback-active={playback.active}
      data-media-error={playback.mediaError}
    >
      {!playback.active && poster && <img src={poster} alt="" draggable={false} />}
      {playback.active && (
        <div
          ref={containerRef}
          className="cv-clip-node-output-container"
          style={{ opacity: playback.ready ? 1 : 0 }}
        />
      )}
      {playback.active && <PlaybackBar playback={playback} documentKey={documentKey} />}
      <div className="cv-clip-node-output-action">
        <button
          type="button"
          className="cv-clip-node-open nodrag nopan"
          disabled={presentation.openDisabled}
          onPointerDown={stopPointer}
          onClick={(event) => {
            event.stopPropagation();
            if (presentation.canOpenEditor) onOpen?.();
          }}
        >
          {presentation.composeGenerating ? (
            <LoaderCircle size={14} className="cv-clip-node-spinner" />
          ) : (
            <Scissors size={14} />
          )}
          {presentation.composeGenerating ? '生成中' : '打开智能剪辑'}
        </button>
      </div>
      {!playback.active && !poster && (
        <LoaderCircle size={24} className="cv-clip-node-output-loader cv-clip-node-spinner" />
      )}
    </div>
  );
}

export default function CanvasVideoClipNode({
  node,
  presentation,
  documentKey,
  mapUrl = identityUrl,
  sourcePoster,
  sourceSnapshot,
  outputSnapshot,
  modes = [],
  renderModeIcon,
  theme,
  onOpen,
  onTryMode,
  onWarmPresets,
  onPlaybackVolumeChange,
  onDownload,
  draggingConnection = false,
}) {
  useEffect(() => {
    if (!presentation.shouldWarmPresets || !onWarmPresets) return;
    let current = true;
    const warm = () => {
      if (current) onWarmPresets(modes);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const request = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => {
        current = false;
        window.cancelIdleCallback(request);
      };
    }
    const request = setTimeout(warm, 300);
    return () => {
      current = false;
      clearTimeout(request);
    };
  }, [presentation.shouldWarmPresets, onWarmPresets, modes, documentKey]);
  return (
    <div
      className="cv-clip-node-content"
      data-clip-state={presentation.state}
      data-clip-theme={theme}
      style={{
        width: presentation.width,
        height: presentation.height,
        borderRadius: presentation.borderRadius,
      }}
    >
      {presentation.state === 'editor-drop' && (
        <div id={presentation.previewPortalId} className="cv-clip-node-preview-drop nodrag nopan" />
      )}
      {presentation.state === 'incoming' && (
        <IncomingPreview
          key={JSON.stringify([
            documentKey,
            presentation.firstVideoSourceNodeId,
            presentation.firstVideoUrl,
            sourcePoster,
            sourceSnapshot,
          ])}
          nodeId={presentation.firstVideoSourceNodeId}
          url={mapUrl(presentation.firstVideoUrl ?? '')}
          poster={mapUrl(sourcePoster)}
          snapshot={mapUrl(sourceSnapshot)}
          documentKey={documentKey}
          presentation={presentation}
          onOpen={onOpen}
        />
      )}
      {presentation.state === 'output' && (
        <OutputPreview
          key={JSON.stringify([documentKey, node.id])}
          node={node}
          presentation={presentation}
          documentKey={documentKey}
          mapUrl={mapUrl}
          snapshot={mapUrl(outputSnapshot)}
          onOpen={onOpen}
          onPlaybackVolumeChange={onPlaybackVolumeChange}
          draggingConnection={draggingConnection}
        />
      )}
      {presentation.state === 'empty' && (
        <div className="cv-clip-node-empty">
          {presentation.composeGenerating ? (
            <LoaderCircle size={40} className="cv-clip-node-spinner" />
          ) : (
            <Scissors size={40} />
          )}
          <span>空空如也，请连接视频节点后操作</span>
          {presentation.showPresets && (
            <div className="cv-clip-node-presets">
              <span>尝试：</span>
              {modes.map((mode) => {
                const ModeIcon = modeIcons[mode.modeKey] || Scissors;
                return (
                  <button
                    key={mode.modeKey}
                    type="button"
                    className="nodrag nopan"
                    disabled={presentation.presetDisabled}
                    onPointerDown={stopPointer}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTryMode?.(mode.modeKey);
                    }}
                  >
                    {renderModeIcon ? renderModeIcon(mode) : <ModeIcon size={14} />}
                    {mode.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {presentation.showAgentOverlay && (
        <div className="cv-clip-node-agent-overlay">
          <div
            className={
              presentation.hasOutput
                ? 'cv-clip-node-agent-breathing-dark'
                : 'cv-clip-node-agent-breathing-grey'
            }
          />
          <span>剪辑中…</span>
        </div>
      )}
      {presentation.showDownload && (
        <button
          type="button"
          className="cv-clip-node-download nodrag nopan"
          title="下载视频"
          aria-label="下载视频"
          onPointerDown={stopPointer}
          onClick={(event) => {
            event.stopPropagation();
            onDownload?.();
          }}
        >
          <Download size={16} />
        </button>
      )}
    </div>
  );
}
