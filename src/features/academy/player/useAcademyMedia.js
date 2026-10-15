import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { playbackPosition, resumePosition } from './player-model.js';
import { useVideoFrameTransition } from './useVideoFrameTransition.js';

export function useAcademyMedia({
  playbackKey,
  source,
  poster,
  qualities,
  rate,
  resumeSec = 0,
  durationSec = 0,
  setQualityHeight,
  callbacks,
}) {
  const video = useRef(null);
  const frame = useVideoFrameTransition(video, playbackKey, poster);
  const [state, setState] = useState({
    playing: false,
    started: false,
    elapsed: 0,
    duration: durationSec,
    volume: 1,
    muted: false,
    buffering: false,
    failed: false,
    offline: false,
    downgraded: false,
    buffered: 0,
  });
  const [retry, setRetry] = useState(0);
  const waiting = useRef(null);
  const restore = useRef(null);
  const errors = useRef(0);
  const didDowngrade = useRef(false);
  const latest = useRef({ rate, resumeSec, durationSec, qualities, callbacks, setQualityHeight });
  useLayoutEffect(() => {
    latest.current = { rate, resumeSec, durationSec, qualities, callbacks, setQualityHeight };
  }, [rate, resumeSec, durationSec, qualities, callbacks, setQualityHeight]);
  const patch = useCallback((change) => setState((value) => ({ ...value, ...change })), []);
  useEffect(() => {
    restore.current = null;
    errors.current = 0;
    didDowngrade.current = false;
    patch({
      playing: false,
      started: false,
      elapsed: 0,
      duration: latest.current.durationSec,
      failed: false,
      buffering: false,
      downgraded: false,
      buffered: 0,
    });
  }, [playbackKey, patch]);
  useEffect(() => {
    if (video.current) video.current.playbackRate = rate;
    latest.current.callbacks.onPlaybackRateChange?.(rate);
  }, [rate, playbackKey]);
  useEffect(() => {
    const offline = () => {
      video.current?.pause();
      patch({ offline: true });
    };
    const online = () => patch({ offline: false });
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [patch]);
  useEffect(() => {
    const element = video.current;
    return () => {
      clearTimeout(waiting.current);
      element?.pause();
      element?.removeAttribute('src');
      element?.load();
    };
  }, [playbackKey, retry]);
  const { capture, restored, settle } = frame;
  const savePosition = useCallback(
    (freeze = true) => {
      const element = video.current;
      if (element) {
        restore.current = { time: element.currentTime, playing: !element.paused };
        if (freeze) capture();
        else settle();
      }
    },
    [capture, settle],
  );
  function flush(final = false) {
    const element = video.current;
    latest.current.callbacks.onProgressFlush?.({
      final,
      positionSec: element?.currentTime || 0,
      playbackRate: element?.playbackRate || latest.current.rate,
    });
  }
  function play() {
    const element = video.current;
    if (!element || latest.current.callbacks.canStartPlayback?.() === false) return;
    element.play().catch(() => {});
  }
  const toggle = () => {
    if (video.current?.paused) play();
    else video.current?.pause();
  };
  function seek(value) {
    const element = video.current;
    if (!element) return;
    const duration =
      Number.isFinite(element.duration) && element.duration > 0
        ? element.duration
        : latest.current.durationSec;
    element.currentTime = playbackPosition(value, duration);
    patch({ elapsed: element.currentTime });
    latest.current.callbacks.onPositionChange?.(element.currentTime);
    latest.current.callbacks.onSeeking?.();
  }
  function changeVolume(value) {
    const element = video.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, value));
    element.muted = element.volume === 0;
    patch({ volume: element.volume, muted: element.muted });
  }
  function retryVideo(downgrade = true) {
    savePosition(false);
    errors.current = 0;
    const lowest = [...latest.current.qualities].sort((a, b) => a.height - b.height)[0];
    if (downgrade && latest.current.qualities.length > 1 && lowest && lowest.url !== source) {
      latest.current.setQualityHeight(lowest.height);
      didDowngrade.current = true;
    }
    patch({ failed: false, buffering: false, downgraded: didDowngrade.current });
    setRetry((value) => value + 1);
  }
  const handlers = {
    onLoadedMetadata(event) {
      const element = event.currentTarget;
      const duration =
        Number.isFinite(element.duration) && element.duration > 0
          ? element.duration
          : latest.current.durationSec;
      const saved = restore.current;
      restore.current = null;
      const time = saved
        ? playbackPosition(saved.time, duration)
        : resumePosition(latest.current.resumeSec, duration);
      if (time > 0) element.currentTime = time;
      element.playbackRate = latest.current.rate;
      patch({
        duration,
        elapsed: time,
        failed: false,
        volume: element.volume,
        muted: element.muted,
      });
      latest.current.callbacks.onPositionChange?.(time);
      if (saved?.playing) play();
      if (saved) restored();
    },
    onPlay() {
      patch({ playing: true, started: true });
      latest.current.callbacks.onPlay?.();
    },
    onPlaying() {
      clearTimeout(waiting.current);
      patch({ buffering: false });
    },
    onPause() {
      patch({ playing: false });
      flush();
    },
    onWaiting() {
      clearTimeout(waiting.current);
      waiting.current = setTimeout(() => patch({ buffering: true }), 300);
    },
    onSeeking() {
      flush();
      latest.current.callbacks.onSeeking?.();
    },
    onTimeUpdate(event) {
      const element = event.currentTarget;
      let buffered = 0;
      try {
        for (let index = 0; index < element.buffered.length; index++)
          if (
            element.buffered.start(index) <= element.currentTime &&
            element.currentTime <= element.buffered.end(index)
          )
            buffered = element.buffered.end(index);
      } catch {
        /* Browser can replace buffered ranges during a source swap. */
      }
      patch({ elapsed: element.currentTime, buffered });
      latest.current.callbacks.onFrame?.(element.currentTime);
      latest.current.callbacks.onProgressTick?.({
        positionSec: element.currentTime,
        playbackRate: element.playbackRate,
      });
      latest.current.callbacks.onPositionChange?.(element.currentTime);
    },
    onVolumeChange(event) {
      patch({ volume: event.currentTarget.volume, muted: event.currentTarget.muted });
    },
    onEnded() {
      patch({ playing: false });
      flush(true);
      latest.current.callbacks.onEnded?.();
    },
    onError() {
      clearTimeout(waiting.current);
      errors.current += 1;
      if (errors.current <= 2) {
        savePosition(false);
        setRetry((value) => value + 1);
        return;
      }
      const lowest = [...latest.current.qualities].sort((a, b) => a.height - b.height)[0];
      if (
        !didDowngrade.current &&
        latest.current.qualities.length > 1 &&
        lowest &&
        lowest.url !== source
      ) {
        retryVideo(true);
        return;
      }
      patch({ failed: true, buffering: false });
      settle();
    },
  };
  return {
    video,
    frame,
    ...state,
    key: `${playbackKey}:${retry}`,
    handlers,
    toggle,
    play,
    pause: () => video.current?.pause(),
    seek,
    changeVolume,
    savePosition,
    retryVideo,
    toggleMute: () => {
      if (video.current) {
        video.current.muted = !video.current.muted;
        patch({ muted: video.current.muted });
      }
    },
  };
}
