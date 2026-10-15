import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { MediaController, MediaControlBar, MediaTimeRange } from 'media-chrome/react';
import Icon from './Icon.jsx';
import './video-player.css';

const SPEEDS = [1, 1.5, 2];
const clock = (value) => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const minutes = Math.floor(seconds / 60);
  return seconds >= 3600
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
const qualityName = (level) => {
  const height = Number(level.height || parseInt(level.quality || level.name || level.label));
  if (level.name?.toLowerCase() === 'original')
    return `原画 ${Math.min(level.width || height, height)}P`;
  return (
    { 480: '流畅 480P', 720: '高清 720P', 1080: '超清 1080P' }[height] ||
    level.label ||
    level.name ||
    `${height}P`
  );
};

function ExitFullscreen() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3" />
    </svg>
  );
}

/** Uses the original site's Media Chrome controller and inline control order. */
const VideoPlayer = forwardRef(function VideoPlayer(
  {
    src,
    poster,
    autoPlay = false,
    title = '',
    quality = [],
    className = '',
    loop = false,
    muted = false,
    preload = 'auto',
    initialTime = 0,
    crossOrigin = null,
    onEnded,
    onError,
    onTimeUpdate,
    style,
  },
  forwardedRef,
) {
  const container = useRef(null);
  const video = useRef(null);
  const controller = useRef(null);
  const qualityMenu = useRef(null);
  const hls = useRef(null);
  const restore = useRef(null);
  const onErrorRef = useRef(onError);
  useLayoutEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(muted ? 0 : 1);
  const [isMuted, setMuted] = useState(muted);
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [currentQuality, setQuality] = useState(-1);
  const [hlsLevels, setHlsLevels] = useState([]);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeSlider = useRef(null);
  useImperativeHandle(forwardedRef, () => video.current);
  const suppliedLevels = useMemo(() => {
    const levels = Array.isArray(quality) ? quality : quality?.levels || quality?.qualities || [];
    return levels.map((level, index) => ({
      ...level,
      index,
      url: level.url || level.src || level.videoUrl,
    }));
  }, [quality]);
  const levels = suppliedLevels.length ? suppliedLevels : hlsLevels;
  const mediaSrc =
    currentQuality >= 0 && suppliedLevels[currentQuality]?.url
      ? suppliedLevels[currentQuality].url
      : src;
  const isHls = /\.m3u8(?:\?|$)/i.test(mediaSrc || '');

  useEffect(() => {
    setQuality(-1);
    setQualityOpen(false);
    setHlsLevels([]);
    setTime(0);
  }, [src]);
  useEffect(() => {
    const element = video.current;
    if (!element || !mediaSrc) return;
    let disposed = false;
    const begin = () => {
      if (!autoPlay) return;
      element.play().catch(() => {
        if (!disposed) {
          element.muted = true;
          setMuted(true);
          element.play().catch(() => {});
        }
      });
    };
    if (isHls && !element.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (disposed || !Hls.isSupported()) return;
          const instance = new Hls({ enableWorker: true, startLevel: 0, testBandwidth: false });
          hls.current = instance;
          instance.attachMedia(element);
          instance.loadSource(mediaSrc);
          instance.on(Hls.Events.MANIFEST_PARSED, (_, manifest) => {
            if (disposed) return;
            setHlsLevels(manifest.levels.map((level, index) => ({ ...level, index })));
            begin();
          });
          instance.on(Hls.Events.ERROR, (_, error) => {
            if (error.fatal && !disposed) {
              setBuffering(false);
              onErrorRef.current?.(error);
            }
          });
        })
        .catch((error) => {
          if (!disposed) {
            setBuffering(false);
            onErrorRef.current?.(error);
          }
        });
    } else {
      if (isHls) element.src = mediaSrc;
      begin();
    }
    return () => {
      disposed = true;
      hls.current?.destroy();
      hls.current = null;
    };
  }, [mediaSrc, autoPlay, isHls]);
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    if (!qualityOpen) return;
    const close = (event) => {
      if (!qualityMenu.current?.contains(event.target)) setQualityOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [qualityOpen]);
  const togglePlay = useCallback(() => {
    const element = video.current;
    if (element) element.paused ? element.play().catch(() => {}) : element.pause();
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else if (container.current?.requestFullscreen)
      container.current.requestFullscreen().catch(() => {});
    else video.current?.webkitEnterFullscreen?.();
  }, []);
  const changeVolume = useCallback((value) => {
    const element = video.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, value));
    element.muted = value === 0;
    setVolume(element.volume);
    setMuted(element.muted);
  }, []);
  const toggleMute = useCallback(() => {
    const element = video.current;
    if (!element) return;
    element.muted = !element.muted;
    if (!element.muted && !element.volume) element.volume = 0.5;
    setMuted(element.muted);
    setVolume(element.volume);
  }, []);
  const selectQuality = (index) => {
    const element = video.current;
    if (suppliedLevels.length && element)
      restore.current = { time: element.currentTime, playing: !element.paused };
    if (!suppliedLevels.length && hls.current) hls.current.currentLevel = index;
    setQuality(index);
    setQualityOpen(false);
    quality?.onChange?.(index);
  };
  const dragVolume = (event) => {
    event.preventDefault();
    const element = volumeSlider.current;
    element.setPointerCapture(event.pointerId);
    const set = (y) => {
      const rect = element.getBoundingClientRect();
      changeVolume((rect.bottom - y) / rect.height);
    };
    set(event.clientY);
    element.onpointermove = (move) => set(move.clientY);
    element.onpointerup = () => {
      element.onpointermove = null;
      element.onpointerup = null;
    };
  };
  const loaded = () => {
    const element = video.current;
    setDuration(element.duration);
    element.playbackRate = speed;
    if (restore.current) {
      element.currentTime = Math.min(restore.current.time, Math.max(0, element.duration - 0.05));
      if (restore.current.playing) element.play().catch(() => {});
      restore.current = null;
    } else if (initialTime > 0) element.currentTime = initialTime;
  };
  const keyboard = (event) => {
    if (event.target.closest('button,input,[role="menu"]')) return;
    const element = video.current;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlay();
    }
    if (event.key.toLowerCase() === 'f') toggleFullscreen();
    if (event.key.toLowerCase() === 'm') toggleMute();
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      element.currentTime = Math.max(
        0,
        Math.min(
          element.duration || 0,
          element.currentTime + (event.key === 'ArrowRight' ? 5 : -5),
        ),
      );
    }
  };
  return (
    <div
      ref={container}
      className={`libtv-video-player ${className}`}
      style={style}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={keyboard}
      aria-label={title || '视频播放器'}
    >
      <MediaController ref={controller} autohide="3" nohotkeys className="libtv-media-controller">
        <video
          ref={video}
          slot="media"
          src={isHls ? undefined : mediaSrc}
          poster={poster}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline
          preload={preload}
          crossOrigin={crossOrigin ?? undefined}
          tabIndex={0}
          aria-label={title}
          onLoadedMetadata={loaded}
          onDurationChange={() => setDuration(video.current?.duration || 0)}
          onTimeUpdate={(event) => {
            setTime(event.currentTarget.currentTime);
            onTimeUpdate?.(event.currentTarget.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(event) => {
            setPlaying(false);
            onEnded?.(event);
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onError={onError}
          onVolumeChange={(event) => {
            setMuted(event.currentTarget.muted || !event.currentTarget.volume);
            setVolume(event.currentTarget.volume);
          }}
        />
        <div slot="centered-chrome" style={{ display: 'none' }} />
        <MediaControlBar className="libtv-control-bar">
          <div className="libtv-controls">
            <div className="libtv-control-group">
              <button
                className="libtv-play-control"
                type="button"
                aria-label={playing ? '暂停' : '播放'}
                onClick={togglePlay}
              >
                <Icon name={playing ? 'icon-pause-filled' : 'icon-play-filled'} size={22.86} />
              </button>
              <div
                className="libtv-volume-control"
                onMouseEnter={() => setVolumeOpen(true)}
                onMouseLeave={() => setVolumeOpen(false)}
              >
                <button
                  type="button"
                  aria-label={isMuted ? '取消静音' : '静音'}
                  onClick={toggleMute}
                >
                  <Icon name={isMuted ? 'icon-volume-off' : 'icon-volume-filled'} size={22.86} />
                </button>
                <div className={`libtv-volume-popup ${volumeOpen ? 'is-open' : ''}`}>
                  <span>{Math.round((isMuted ? 0 : volume) * 100)}</span>
                  <div
                    ref={volumeSlider}
                    className="libtv-volume-track"
                    onPointerDown={dragVolume}
                    role="slider"
                    tabIndex={0}
                    aria-label="音量"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(volume * 100)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        changeVolume(volume + (event.key === 'ArrowUp' ? 0.05 : -0.05));
                      }
                    }}
                  >
                    <i />
                    <b style={{ height: `${(isMuted ? 0 : volume) * 100}%` }} />
                    <em style={{ bottom: `${(isMuted ? 0 : volume) * 100}%` }} />
                  </div>
                </div>
              </div>
              <span className="libtv-player-time">{clock(time)}</span>
            </div>
            <MediaTimeRange className="libtv-progress" />
            <div className="libtv-control-group">
              <span className="libtv-player-time">{clock(duration)}</span>
              <button
                className="libtv-speed-control"
                type="button"
                aria-label={`播放速度 ${speed} 倍`}
                onClick={() => {
                  const value = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                  video.current.playbackRate = value;
                  setSpeed(value);
                }}
              >
                {speed === 1 ? '倍速' : `${speed}x`}
              </button>
              {levels.length > 0 && (
                <div ref={qualityMenu} className="libtv-quality-control">
                  <button
                    type="button"
                    aria-label="清晰度"
                    aria-expanded={qualityOpen}
                    onClick={() => setQualityOpen((value) => !value)}
                  >
                    {currentQuality < 0 ? '自动' : qualityName(levels[currentQuality])}
                  </button>
                  {qualityOpen && (
                    <div className="libtv-quality-menu" role="menu">
                      {[
                        { index: -1, label: '自动' },
                        ...levels.map((level) => ({
                          index: level.index,
                          label: qualityName(level),
                        })),
                      ].map((level) => (
                        <button
                          key={level.index}
                          type="button"
                          role="menuitemradio"
                          aria-checked={currentQuality === level.index}
                          onClick={() => selectQuality(level.index)}
                        >
                          <span>{level.label}</span>
                          {currentQuality === level.index && <Icon name="check" size={14} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                className="libtv-fullscreen-control"
                type="button"
                aria-label={fullscreen ? '退出全屏' : '全屏'}
                onClick={toggleFullscreen}
              >
                {fullscreen ? <ExitFullscreen /> : <Icon name="icon-arrow-expand" size={18} />}
              </button>
            </div>
          </div>
        </MediaControlBar>
      </MediaController>
      {buffering && (
        <div className="libtv-buffering" aria-label="正在缓冲">
          <span />
        </div>
      )}
    </div>
  );
});

export default VideoPlayer;
