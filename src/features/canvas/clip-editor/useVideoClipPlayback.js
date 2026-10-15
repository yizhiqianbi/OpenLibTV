import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const idleVideos = [];
const leasedVideos = new Map();
let poolSize = 4;
let lastPoolShrink = 0;

function clearVideo(video) {
  try {
    video.pause();
  } catch {
    // A pause failure must not skip releasing the source/buffer below.
  }
  try {
    video.removeAttribute('src');
    video.load();
  } catch {
    // A detached/unavailable native media implementation still releases owner.
  }
  video.remove();
}

function acquireVideo(lease) {
  let video;
  while (idleVideos.length && !video) {
    const candidate = idleVideos.pop();
    if (candidate.ownerDocument === document) video = candidate;
    else clearVideo(candidate);
  }
  video ??= document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.className = 'cv-clip-node-output-video';
  leasedVideos.set(lease, video);
  return video;
}

function releaseVideo(lease, video) {
  if (leasedVideos.get(lease) !== video) return;
  leasedVideos.delete(lease);
  clearVideo(video);
  if (idleVideos.length < poolSize) idleVideos.push(video);
}

/** Source pool target policy; local leases never share an actively owned DOM. */
export function updateVideoClipPlaybackPoolSize(visibleNodeCount, nowMs = Date.now()) {
  const memory = typeof navigator === 'undefined' ? undefined : navigator.deviceMemory;
  const cap = typeof memory === 'number' && memory <= 4 ? 15 : 30;
  const next = Math.min(Math.max(Math.ceil(visibleNodeCount * 0.5), 4), cap);
  if (next >= poolSize) poolSize = next;
  else if (nowMs - lastPoolShrink > 30_000) {
    poolSize = next;
    lastPoolShrink = nowMs;
    while (idleVideos.length > poolSize) clearVideo(idleVideos.pop());
  }
}

/** Used by module disposal and media ownership tests, never by normal renders. */
export function clearVideoClipPlaybackPool() {
  for (const video of idleVideos.splice(0)) clearVideo(video);
}

function mediaHasAudio(video) {
  if (video.audioTracks && typeof video.audioTracks.length === 'number')
    return video.audioTracks.length > 0;
  if (typeof video.mozHasAudio === 'boolean') return video.mozHasAudio;
  if (typeof video.webkitAudioDecodedByteCount === 'number')
    return video.currentTime < 0.5 ? null : video.webkitAudioDecodedByteCount > 0;
  const capture = video.captureStream || video.mozCaptureStream;
  if (typeof capture === 'function') {
    try {
      const stream = capture.call(video);
      const result = stream.getAudioTracks().length > 0;
      stream.getTracks().forEach((track) => track.stop());
      return result;
    } catch {
      // Unsupported/refused capture leaves audio availability unknown.
    }
  }
  return null;
}

/**
 * dN/dw's 300ms hover playback and 200ms volume write. Document/URL ownership
 * additionally retires stale timers, listeners, native play promises and leases.
 * Readonly limits editing elsewhere; these playback controls remain usable.
 */
export function useVideoClipPlayback({
  nodeId,
  documentKey,
  url,
  containerRef,
  draggingConnection = false,
  previewDisabled = false,
  initialPlaybackVolume,
  onPlaybackVolumeChange,
}) {
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [hasAudio, setHasAudio] = useState(undefined);
  const [muted, setMuted] = useState(
    () => initialPlaybackVolume === undefined || initialPlaybackVolume === 0,
  );
  const [volume, setVolume] = useState(() =>
    initialPlaybackVolume !== undefined && initialPlaybackVolume > 0 ? initialPlaybackVolume : 0.5,
  );
  const ownerRef = useRef(null);
  const nativeRef = useRef(null);
  const hoverTimer = useRef(null);
  const volumeTimer = useRef(null);
  const callbackRef = useRef(onPlaybackVolumeChange);
  const initialVolumeRef = useRef(initialPlaybackVolume);
  const mediaStateRef = useRef({ muted, volume });
  const active = hovered && !draggingConnection && !previewDisabled;
  const owner = useMemo(() => ({ nodeId, documentKey, url }), [nodeId, documentKey, url]);

  useLayoutEffect(() => {
    callbackRef.current = onPlaybackVolumeChange;
    initialVolumeRef.current = initialPlaybackVolume;
    mediaStateRef.current = { muted, volume };
  }, [onPlaybackVolumeChange, initialPlaybackVolume, muted, volume]);

  useLayoutEffect(() => {
    const initial = initialVolumeRef.current;
    setVolume(initial !== undefined && initial > 0 ? initial : 0.5);
    setMuted(initial === undefined || initial === 0);
  }, [nodeId, documentKey]);

  useLayoutEffect(() => {
    ownerRef.current = owner;
    setHovered(false);
    setCurrentTime(0);
    setDuration(0);
    setReady(false);
    setPlaying(false);
    setMediaError(false);
    setHasAudio(undefined);
    return () => {
      if (ownerRef.current === owner) ownerRef.current = null;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
      clearTimeout(volumeTimer.current);
      volumeTimer.current = null;
    };
  }, [owner]);

  useEffect(() => {
    if (!draggingConnection && !previewDisabled) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, [draggingConnection, previewDisabled]);

  useEffect(() => {
    if (!active || !url || !containerRef.current || !ownerRef.current) return;
    const owner = ownerRef.current;
    const lease = {};
    const video = acquireVideo(lease);
    const container = containerRef.current;
    let retired = false;
    let audioDetected = false;
    const current = () => !retired && ownerRef.current === owner && nativeRef.current === video;
    const play = () => {
      if (!current()) return;
      try {
        const promise = video.play();
        promise?.catch(() => {});
      } catch {
        // Native autoplay refusal leaves the explicit play button available.
      }
    };
    nativeRef.current = video;
    video.muted = mediaStateRef.current.muted;
    try {
      video.volume = mediaStateRef.current.volume;
    } catch {
      setMediaError(true);
    }
    video.src = url;
    container.appendChild(video);
    const metadata = () => {
      if (!current()) return;
      if (video.duration && Number.isFinite(video.duration)) setDuration(video.duration);
      setReady(true);
      setMediaError(false);
      play();
    };
    const time = () => {
      if (!current()) return;
      setCurrentTime(video.currentTime);
      if (audioDetected) return;
      const result = mediaHasAudio(video);
      if (result !== null) {
        audioDetected = true;
        setHasAudio(result);
      }
    };
    const started = () => current() && setPlaying(true);
    const paused = () => current() && setPlaying(false);
    const ended = () => {
      if (!current()) return;
      setPlaying(false);
      video.currentTime = 0;
      setCurrentTime(0);
    };
    const error = () => {
      if (!current()) return;
      setMediaError(true);
      setReady(false);
      setPlaying(false);
    };
    const listeners = {
      loadedmetadata: metadata,
      timeupdate: time,
      play: started,
      pause: paused,
      ended,
      error,
    };
    for (const [name, listener] of Object.entries(listeners))
      video.addEventListener(name, listener);
    play();
    return () => {
      retired = true;
      for (const [name, listener] of Object.entries(listeners))
        video.removeEventListener(name, listener);
      if (nativeRef.current === video) nativeRef.current = null;
      releaseVideo(lease, video);
    };
  }, [active, url, nodeId, documentKey, containerRef]);

  useEffect(() => {
    const video = nativeRef.current;
    if (!video || !active) return;
    video.muted = muted;
    try {
      video.volume = volume;
    } catch {
      setMediaError(true);
    }
  }, [active, muted, volume]);

  const onMouseEnter = () => {
    if (draggingConnection || previewDisabled || ownerRef.current !== owner) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      if (ownerRef.current === owner) setHovered(true);
    }, 300);
  };
  const onMouseLeave = () => {
    if (ownerRef.current !== owner) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setHovered(false);
  };
  const saveVolume = (value) => {
    if (ownerRef.current !== owner) return;
    clearTimeout(volumeTimer.current);
    const callback = callbackRef.current;
    if (!owner) return;
    volumeTimer.current = setTimeout(() => {
      volumeTimer.current = null;
      if (ownerRef.current === owner) callback?.(value);
    }, 200);
  };
  const changeVolume = (value) => {
    if (ownerRef.current !== owner) return;
    setVolume(value);
    setMuted(value === 0);
    saveVolume(value);
  };
  const toggleMute = () => {
    if (ownerRef.current !== owner) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      saveVolume(0.5);
    } else saveVolume(nextMuted ? 0 : volume);
  };
  const togglePlay = () => {
    const video = nativeRef.current;
    if (!video || !active || ownerRef.current !== owner) return;
    try {
      if (video.paused) video.play()?.catch(() => {});
      else video.pause();
    } catch {
      // Native refusal is not a successful playback state.
    }
  };
  const seek = (value) => {
    const video = nativeRef.current;
    if (video && active && ownerRef.current === owner) video.currentTime = value;
  };

  return {
    active,
    ready,
    mediaError,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    hasAudio: hasAudio !== false,
    onMouseEnter,
    onMouseLeave,
    togglePlay,
    seek,
    changeVolume,
    toggleMute,
  };
}
