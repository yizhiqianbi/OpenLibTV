import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MoreHorizontal, Play } from 'lucide-react';
import { asset as defaultAsset } from '../../../data.js';
import { usePlayerPreferences } from './usePlayerPreferences.js';
import { useAcademyMedia } from './useAcademyMedia.js';
import { usePlayerFullscreen } from './usePlayerFullscreen.js';
import { usePracticeMarkers } from './usePracticeMarkers.js';
import { usePlayerFollowup } from './usePlayerFollowup.js';
import {
  normalizeQualities,
  PLAYBACK_RATES,
  playerShortcutAllowed,
  selectQuality,
} from './player-model.js';
import PlayerFollowup from './PlayerFollowup.jsx';
import PlayerControls from './PlayerControls.jsx';
import PlayerSettings from './PlayerSettings.jsx';
import { usePlayerViewport } from './usePlayerViewport.js';
import './player.css';

const EMPTY_MARKERS = [];
const EMPTY_ITEM = {};
export default function CoursePlayer({
  item = EMPTY_ITEM,
  asset = defaultAsset,
  login,
  user,
  masterclass = false,
  playbackKey = item.tutorialUuid || item.clipUuid || item.videoUrl,
  resumeSec = item.resumeSec || 0,
  markers = item.markers || EMPTY_MARKERS,
  hasNext = false,
  showFollowup = true,
  followupGate = 'allow',
  onNext,
  onTrainingRoom,
  onGoPracticeMark,
  onBack,
  onOpenEpisodes,
  landscapeChrome,
  onProgressTick,
  onProgressFlush,
  onPlaybackRateChange,
  onPlay,
  onEnded,
  onPositionChange,
  canStartPlayback,
  onPauseReady,
  onPlayReady,
  positionThresholdSec,
  onPositionThresholdReached,
}) {
  const box = useRef(null);
  const { mobile, landscape } = usePlayerViewport();
  const preferences = usePlayerPreferences();
  const qualities = normalizeQualities(item.qualities);
  const quality = selectQuality(qualities, preferences.qualityHeight, item.videoUrl);
  const source = asset(quality.url || '');
  const marks = usePracticeMarkers(markers, playbackKey, !mobile && !!onGoPracticeMark);
  const followup = usePlayerFollowup({
    playbackKey,
    hasNext,
    training: !!onTrainingRoom,
    enabled: showFollowup,
    gate: followupGate,
    onNext,
  });
  const thresholdReached = useRef(false);
  useEffect(() => {
    thresholdReached.current = false;
  }, [playbackKey]);
  const media = useAcademyMedia({
    playbackKey,
    source,
    poster: asset(item.cover || ''),
    qualities,
    rate: preferences.rate,
    resumeSec,
    durationSec: item.durationSec || 0,
    setQualityHeight: preferences.setQualityHeight,
    callbacks: {
      onProgressTick,
      onProgressFlush,
      onPlaybackRateChange,
      onPlay,
      onPositionChange,
      canStartPlayback: () => {
        if (masterclass && !user) {
          login?.();
          return false;
        }
        return canStartPlayback?.() !== false;
      },
      onFrame: (time) => {
        marks.frame(time);
        if (
          Number.isFinite(positionThresholdSec) &&
          !thresholdReached.current &&
          time >= positionThresholdSec
        ) {
          thresholdReached.current = true;
          onPositionThresholdReached?.();
        }
      },
      onSeeking: marks.notifySeeking,
      onEnded: () => {
        onEnded?.();
        marks.close();
        followup.ended();
      },
    },
  });
  useEffect(() => {
    // The source checks position in its frame loop even after an async threshold read or paused seek.
    if (
      Number.isFinite(positionThresholdSec) &&
      !thresholdReached.current &&
      media.elapsed >= positionThresholdSec
    ) {
      thresholdReached.current = true;
      onPositionThresholdReached?.();
    }
  }, [playbackKey, media.elapsed, positionThresholdSec, onPositionThresholdReached]);
  const { fullscreen, toggleFullscreen } = usePlayerFullscreen(box, media.video, mobile, media.key);
  const [popup, setPopup] = useState(null);
  const [settings, setSettings] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const landscapeMode = mobile && fullscreen && landscape;
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef(null);
  const playingRef = useRef(media.playing);
  playingRef.current = media.playing;
  const showControls = useCallback(() => {
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playingRef.current && !box.current?.querySelector(':focus-visible')) setVisible(false);
    }, 3000);
  }, []);
  useEffect(() => {
    showControls();
    return () => clearTimeout(hideTimer.current);
  }, [media.playing, popup, showControls]);
  useEffect(() => {
    setPopup(null);
    setSettings(false);
    setDrawer(null);
  }, [playbackKey]);
  useEffect(() => {
    if (!fullscreen) {
      setSettings(false);
      setDrawer(null);
    }
  }, [fullscreen]);
  useEffect(() => {
    const click = (event) => {
      if (!event.target.closest('.academy-player-menu')) setPopup(null);
    };
    window.addEventListener('pointerdown', click);
    return () => window.removeEventListener('pointerdown', click);
  }, []);
  const commands = useRef(media);
  commands.current = media;
  useEffect(() => {
    onPauseReady?.(() => commands.current.pause());
    onPlayReady?.(() => commands.current.play());
  }, [onPauseReady, onPlayReady]);
  function changeQuality(height) {
    if (height === quality.height) {
      setPopup(null);
      return;
    }
    media.savePosition();
    preferences.setQualityHeight(height);
    setPopup(null);
  }
  function changeRate(rate) {
    preferences.setRate(rate);
    setPopup(null);
  }
  const rateOptions = PLAYBACK_RATES.map((rate) => ({ key: rate, label: `${rate}x` }));
  const qualityOptions = qualities.map((entry) => ({
    key: entry.height,
    label: entry.height ? `${entry.height}P` : entry.label,
  }));
  const controlsVisible =
    !drawer && !settings && (!media.playing || visible || popup || marks.popup !== null);
  return (
    <div
      className={`academy-player academy-advanced-player ${controlsVisible ? 'show-controls' : ''} ${mobile ? 'is-mobile' : ''}`}
      ref={box}
      tabIndex={0}
      onMouseMove={showControls}
      onFocus={showControls}
      onClick={mobile ? showControls : undefined}
      onKeyDown={(event) => {
        if (!playerShortcutAllowed(event.target) || mobile || settings || drawer || followup.open)
          return;
        if (event.key === 'Escape' && popup) {
          setPopup(null);
          return;
        }
        if (![' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'f'].includes(event.key))
          return;
        event.preventDefault();
        showControls();
        if (event.key === ' ') media.toggle();
        if (event.key === 'ArrowLeft') media.seek(media.elapsed - 10);
        if (event.key === 'ArrowRight') media.seek(media.elapsed + 10);
        if (event.key === 'ArrowUp') media.changeVolume(media.volume + 0.1);
        if (event.key === 'ArrowDown') media.changeVolume(media.volume - 0.1);
        if (event.key === 'f') void toggleFullscreen();
      }}
    >
      <video
        ref={media.video}
        key={media.key}
        src={source || undefined}
        poster={asset(item.cover || '') || undefined}
        playsInline
        preload="metadata"
        {...media.handlers}
        onClick={mobile ? showControls : media.toggle}
      />
      <canvas ref={media.frame.canvas} aria-hidden="true" className="academy-player-frozen-frame" />
      {!media.started && !media.frame.swapping && !media.failed && !media.offline && (
        <button className="academy-player-play" onClick={media.toggle} aria-label="播放">
          <Play fill="currentColor" size={28} />
        </button>
      )}
      {media.buffering && !media.failed && (
        <div className="academy-player-buffering" role="status" aria-label="视频缓冲中">
          <span className="spinner" />
        </div>
      )}
      {media.failed && (
        <div className="academy-player-error">
          <p>{media.downgraded ? '已切换较低清晰度，视频仍加载失败' : '视频加载失败'}</p>
          <button onClick={() => media.retryVideo(true)}>重试</button>
        </div>
      )}
      {media.offline && (
        <div className="academy-player-error">
          <p>网络连接已断开，请检查网络</p>
        </div>
      )}
      {landscapeChrome?.({
        isFullscreen: fullscreen,
        landscapeMode,
        onExitFullscreen: toggleFullscreen,
        drawer,
        closeDrawer: () => setDrawer(null),
        onOpenSettings: () => setSettings(true),
        seekTo: media.seek,
      })}
      {mobile && !fullscreen && (
        <div className="academy-player-mobile-top">
          {onBack ? (
            <button aria-label="返回" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span />
          )}
          <button aria-label="更多" onClick={() => setSettings(true)}>
            <MoreHorizontal size={18} />
          </button>
        </div>
      )}
      <PlayerControls
        {...{
          media,
          markers,
          marks,
          mobile,
          onGoPracticeMark,
          preferences,
          qualities,
          quality,
          popup,
          setPopup,
          rateOptions,
          qualityOptions,
          changeQuality,
          changeRate,
          fullscreen,
          toggleFullscreen,
          showControls,
        }}
        showEpisodes={(landscapeMode && !!landscapeChrome) || !!onOpenEpisodes}
        onOpenEpisodes={() => {
          if (landscapeMode && landscapeChrome) setDrawer('episodes');
          onOpenEpisodes?.();
        }}
      />
      {preferences.storageError && (
        <span className="sr-only" role="status">
          {preferences.storageError}
        </span>
      )}
      {followup.open && (
        <PlayerFollowup
          followup={followup}
          hasNext={hasNext}
          training={!!onTrainingRoom}
          onReplay={() => {
            followup.close();
            media.seek(0);
            media.play();
          }}
          onNext={() => {
            followup.close();
            onNext?.();
          }}
          onTraining={() => {
            followup.close();
            onTrainingRoom?.();
          }}
        />
      )}
      {settings && (
        <PlayerSettings
          rate={preferences.rate}
          quality={quality}
          qualities={qualities}
          onRateChange={changeRate}
          onQualityChange={changeQuality}
          onClose={() => setSettings(false)}
          landscape={landscapeMode}
        />
      )}
    </div>
  );
}
