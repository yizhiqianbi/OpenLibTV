import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  Film,
  Music,
  Pause,
  Play,
  Redo2,
  Type,
  Undo2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  getMainVideoTrackIndex,
  getVideoTrackIndex,
  resolveVideoTrackCount,
} from '../clip-disconnect/track-model.js';
import {
  clipTimelinePlaybackSpeed,
  describeClipTimelineTransitions,
  splitClipTimelineAtPlayhead,
  trimClipTimelineAtPlayhead,
} from './domain/timeline-edit-model.js';
import { clipAudioFaderPosition } from './domain/audio-gain-model.js';
import { VOCAL_SPLIT_CHOICES } from './domain/vocal-separation-model.js';
import ClipSubtitleTimelineRow from './ClipSubtitleTimelineRow.jsx';
import './clip-timeline.css';

const EMPTY = [];
const PADDING = 6;
const VIDEO_HEIGHT = 52;
const MAIN_HEIGHT = 68;
const AUDIO_HEIGHT = 40;
const INTERVALS = [
  [400, 1, 10],
  [200, 1, 10],
  [80, 1, 10],
  [40, 2, 10],
  [15, 5, 5],
  [5, 10, 5],
  [2, 30, 6],
  [0, 60, 6],
];

function SourceIcon({ name, size = 16 }) {
  return (
    <span
      aria-hidden="true"
      className="cv-clip-timeline-source-icon"
      style={{ width: size, height: size, maskImage: `url(/assets/icons/${name}.svg)` }}
    />
  );
}

function timeLabel(seconds) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
}

function clipDurationLabel(duration) {
  const frames = Math.round(duration * 24);
  return [
    Math.floor(frames / (3600 * 24)),
    Math.floor((frames % (3600 * 24)) / (60 * 24)),
    Math.floor((frames % (60 * 24)) / 24),
    frames % 24,
  ]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

function speedLabel(clip) {
  return `${(Math.round(100 * clipTimelinePlaybackSpeed(clip)) / 100).toFixed(2).replace(/\.?0+$/, '')}X`;
}

function audioIndex(clip, count) {
  if (typeof clip.zIndex === 'number' && Number.isFinite(clip.zIndex) && clip.zIndex >= 0)
    return Math.max(0, Math.floor(clip.zIndex) - count);
  return typeof clip.audioTrack === 'number' &&
    Number.isFinite(clip.audioTrack) &&
    clip.audioTrack >= 0
    ? Math.floor(clip.audioTrack)
    : 0;
}

function mutedTrack(timeline, kind, index) {
  const array =
    kind === 'video' ? timeline.videoAudioMutedPerTrack : timeline.audioTrackMutedPerTrack;
  return array?.length > 0
    ? (array[index] ?? false)
    : (kind === 'video' ? timeline.videoAudioMuted : timeline.audioTrackMuted) === true;
}

function clampDragStart(start, duration, clips) {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  const gaps = [];
  let cursor = 0;
  for (const clip of sorted) {
    const end = clip.startTime - duration;
    if (end > cursor) gaps.push([cursor, end]);
    cursor = clip.startTime + clip.duration;
  }
  gaps.push([cursor, Infinity]);
  for (let index = 0; index < gaps.length; index++) {
    const [minimum, maximum] = gaps[index];
    if (start >= minimum && start <= maximum) return start;
    if (start < minimum) {
      const previous = index > 0 ? gaps[index - 1][1] : null;
      return previous !== null && start - previous < minimum - start
        ? Math.max(0, previous)
        : Math.max(0, minimum);
    }
  }
  return Math.max(0, gaps.at(-1)[0]);
}

function snapStart(start, duration, clips, playhead, scale) {
  const targets = [
    playhead,
    ...clips.flatMap((clip) => [clip.startTime, clip.startTime + clip.duration]),
  ];
  let closest = Math.max(0.06, 8 / Math.max(scale, 1e-6)),
    next = start,
    guide = null;
  for (const target of targets) {
    const leftDistance = Math.abs(start - target);
    if (leftDistance < closest) {
      closest = leftDistance;
      next = target;
      guide = target;
    }
    const rightDistance = Math.abs(start + duration - target);
    if (rightDistance < closest) {
      closest = rightDistance;
      next = target - duration;
      guide = target;
    }
  }
  return { start: next, guide };
}

function ClipPoster({ poster }) {
  const [failed, setFailed] = useState(false);
  return poster && !failed ? (
    <img
      className="cv-clip-timeline-poster"
      src={poster}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  ) : (
    <Film className="cv-clip-timeline-no-poster" size={18} aria-hidden="true" />
  );
}

function ToolbarAction({ label, children, onClick, disabled, pressed, className = '', testId }) {
  return (
    <button
      type="button"
      className={`cv-clip-timeline-action ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export default function VideoClipTimeline({
  timeline,
  selectedClipIds = EMPTY,
  mediaBySourceId,
  ready,
  error,
  playing,
  history,
  onPlayToggle,
  onSeek,
  onSelectClip,
  onDelete,
  onCopyClip,
  onPasteClip,
  canPasteClip = false,
  onUndo,
  onRedo,
  onSplit,
  onTrim,
  onSetTrackControl,
  onSetView,
  onBeginEdit,
  onEditPreview,
  onEndEdit,
  onCancelEdit,
  onCompose,
  onClose,
  onTogglePreview,
  previewExpanded,
  height,
  onResizeHeight,
  timelineSnapEnabled = false,
  onToggleSnap,
  onAddText,
  textPanelOpen,
  textPending,
  selectedTextCueId,
  onCloseTextPanel,
  textTrackRows,
  subtitleTrackRows,
  textBeforeSubtitles = true,
  playbackBlocked = false,
  onAddSubtitle,
  subtitlePanelOpen,
  subtitleStatus,
  selectedSubtitleId,
  draftSession,
  onCloseSubtitlePanel,
  onSelectSubtitle,
  onEditSubtitle,
  onAddTransition,
  onToggleTransitionPanel,
  onCloseTransitionPanel,
  onSelectTransition,
  selectedTransitionRightClipId,
  transitionPanelOpen = false,
  onToggleFullscreen,
  onDropFiles,
  onCanDetachAudio,
  onDetachAudio,
  onCanVocalSplit,
  onVocalSplit,
}) {
  const root = useRef(null);
  const scrollArea = useRef(null);
  const ruler = useRef(null);
  const latest = useRef(null);
  const gesture = useRef(null);
  const autoScroll = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [dragHint, setDragHint] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [vocalMenuOpen, setVocalMenuOpen] = useState(false);
  const contextElement = useRef(null);
  const contextOpener = useRef(null);
  const blocked = !ready || Boolean(error);
  const videoCount = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  const main = getMainVideoTrackIndex(videoCount);
  const audioCount = timeline.clips.reduce(
    (count, clip) =>
      clip.type === 'audio' ? Math.max(count, audioIndex(clip, videoCount) + 1) : count,
    0,
  );
  const rows = useMemo(
    () => [
      ...Array.from({ length: videoCount }, (_, index) => ({
        kind: 'video',
        index,
        height: index === main ? MAIN_HEIGHT : VIDEO_HEIGHT,
      })),
      ...Array.from({ length: audioCount }, (_, index) => ({
        kind: 'audio',
        index,
        height: AUDIO_HEIGHT,
      })),
    ],
    [videoCount, main, audioCount],
  );
  const audioSelection =
    selectedClipIds.length === 1 && timeline.clips.find((clip) => clip.id === selectedClipIds[0]);
  const selectedAudio =
    audioSelection?.type === 'audio' &&
    timeline.currentTime > audioSelection.startTime + 0.001 &&
    timeline.currentTime < audioSelection.startTime + audioSelection.duration - 0.001;
  const toolbarKind = selectedAudio ? 'audio' : 'video';
  const toolbarHasClip =
    selectedAudio ||
    timeline.clips.some(
      (clip) =>
        clip.type !== 'audio' &&
        timeline.currentTime >= clip.startTime &&
        timeline.currentTime <= clip.startTime + clip.duration &&
        (getVideoTrackIndex(clip) === main || selectedClipIds.includes(clip.id)),
    );
  const splitAllowed =
    !blocked &&
    toolbarHasClip &&
    splitClipTimelineAtPlayhead(timeline, {
      kind: toolbarKind,
      selectedClipIds,
      leftId: Symbol('left-preview'),
      rightId: Symbol('right-preview'),
    }).status === 'edited';
  const leftAllowed =
    !blocked &&
    toolbarHasClip &&
    trimClipTimelineAtPlayhead(timeline, { kind: toolbarKind, side: 'left', selectedClipIds })
      .status === 'edited';
  const rightAllowed =
    !blocked &&
    toolbarHasClip &&
    trimClipTimelineAtPlayhead(timeline, { kind: toolbarKind, side: 'right', selectedClipIds })
      .status === 'edited';
  const primary = timeline.clips.filter(
    (clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) === main,
  );
  const transitionMarkers = useMemo(() => describeClipTimelineTransitions(timeline), [timeline]);
  const deletionProtected =
    primary.length > 0 && primary.every((clip) => selectedClipIds.includes(clip.id));
  const detachAudioState = contextMenu ? onCanDetachAudio?.(contextMenu.id) : null;
  const vocalSplitState = contextMenu ? onCanVocalSplit?.(contextMenu.id) : null;
  const [, interval, subdivisions] =
    INTERVALS.find(([minimum]) => timeline.scale >= minimum) ?? INTERVALS.at(-1);
  const rulerStep = interval / subdivisions;
  const firstTick = Math.floor(
    Math.max(0, timeline.scrollX - PADDING) / timeline.scale / rulerStep,
  );
  const ticks = Array.from(
    { length: Math.max(1, Math.ceil(viewportWidth / timeline.scale / rulerStep) + 2) },
    (_, index) => {
      const ordinal = firstTick + index;
      return { time: ordinal * rulerStep, major: ordinal % subdivisions === 0 };
    },
  );
  latest.current = {
    timeline,
    blocked,
    selectedClipIds,
    rows,
    videoCount,
    main,
    viewportWidth,
    timelineSnapEnabled,
    onBeginEdit,
    onEditPreview,
    onEndEdit,
    onCancelEdit,
    onSeek,
    onSetView,
    onResizeHeight,
    onSelectClip,
  };

  useLayoutEffect(() => {
    const element = ruler.current;
    if (!element) return;
    const measure = () =>
      setViewportWidth(element.clientWidth || element.getBoundingClientRect().width);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  }, []);

  const cancelGesture = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    stopAutoScroll();
    setDragHint(null);
    if (active?.begun) latest.current.onCancelEdit?.();
  }, [stopAutoScroll]);

  useEffect(() => {
    function update(event, final = false) {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const props = latest.current;
      if (props.blocked) {
        cancelGesture();
        return;
      }
      active.clientX = event.clientX;
      active.clientY = event.clientY;
      if (active.type === 'height') {
        props.onResizeHeight?.(active.height + active.startY - event.clientY);
        return;
      }
      const rect = ruler.current?.getBoundingClientRect();
      if (!rect) return;
      const time =
        (event.clientX - rect.left + props.timeline.scrollX - PADDING) / props.timeline.scale;
      if (active.type === 'seek') {
        props.onSeek?.(Math.max(0, Math.min(time, props.timeline.totalDuration)));
        return;
      }
      if (active.type === 'audio-gain') {
        const rect = active.volumeRect;
        if (!rect || rect.height <= 0) return;
        const position = Math.max(
          0,
          Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height)),
        );
        props.onEditPreview?.('audio-gain', { clipId: active.clip.id, position });
        active.finalOperation = null;
        return;
      }
      if (!active.begun) {
        if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) < 4) return;
        if (props.onBeginEdit?.() !== true) {
          cancelGesture();
          return;
        }
        active.begun = true;
      }
      const base = active.base;
      const clip = active.clip;
      const kind = clip.type === 'audio' ? 'audio' : 'video';
      if (active.type === 'crop-left' || active.type === 'crop-right') {
        const speed = clipTimelinePlaybackSpeed(clip);
        const start = clip.startTime,
          end = clip.startTime + clip.duration;
        const minimum = Math.max(
          clip.startTime - clip.sourceOffset / speed,
          end - clip.sourceDuration,
        );
        const maximum = Math.min(
          start + (clip.sourceDuration - clip.sourceOffset) / speed,
          start + clip.sourceDuration,
        );
        let position =
          active.type === 'crop-left'
            ? Math.max(minimum, Math.min(time, end - 0.5))
            : Math.max(start + 0.5, Math.min(time, maximum));
        if (
          props.timelineSnapEnabled &&
          Math.abs(position - props.timeline.currentTime) <=
            Math.max(0.06, 8 / props.timeline.scale)
        )
          position =
            active.type === 'crop-left'
              ? Math.max(minimum, Math.min(props.timeline.currentTime, end - 0.5))
              : Math.max(start + 0.5, Math.min(props.timeline.currentTime, maximum));
        props.onEditPreview?.('trim', {
          edge: active.type,
          time: position,
          selectedClipIds: [clip.id],
          viewportWidth: props.viewportWidth,
        });
        active.finalOperation = null;
      } else {
        let target = active.row;
        let insertion = null;
        for (const row of props.rows.filter((row) => row.kind === kind)) {
          const element = scrollArea.current?.querySelector(
            `[data-clip-track="${kind}:${row.index}"]`,
          );
          const box = element?.getBoundingClientRect();
          if (!box) continue;
          if (event.clientY >= box.top && event.clientY < box.bottom) target = row.index;
          const direction = event.clientY - active.startY;
          if (
            Math.abs(event.clientY - box.top) <= 6 &&
            (row.index > active.row ? direction > 2 : direction < -2)
          )
            insertion = row.index;
          if (
            kind === 'audio' &&
            row.index === props.rows.filter((item) => item.kind === 'audio').length - 1 &&
            event.clientY >= box.bottom &&
            direction > 2
          )
            insertion = row.index + 1;
        }
        if (kind === 'video' && active.row === props.main) {
          const mainBox = scrollArea.current
            ?.querySelector(`[data-clip-track="video:${props.main}"]`)
            ?.getBoundingClientRect();
          if (mainBox && event.clientY >= mainBox.bottom && event.clientY > active.startY + 2) {
            insertion = props.main;
            target = props.main;
          }
        }
        const desired = Math.max(0, time - active.grabOffset);
        let nextTime = desired;
        const peers = base.clips.filter(
          (item) =>
            item.id !== clip.id &&
            (kind === 'audio'
              ? item.type === 'audio' && audioIndex(item, props.videoCount) === target
              : item.type !== 'audio' && getVideoTrackIndex(item) === target),
        );
        if (insertion === null && !(kind === 'video' && target === props.main))
          nextTime = clampDragStart(nextTime, clip.duration, peers);
        let guide = null;
        if (props.timelineSnapEnabled) {
          const snapped = snapStart(
            nextTime,
            clip.duration,
            base.clips.filter((item) => item.id !== clip.id),
            props.timeline.currentTime,
            props.timeline.scale,
          );
          nextTime =
            insertion === null && !(kind === 'video' && target === props.main)
              ? clampDragStart(snapped.start, clip.duration, peers)
              : Math.max(0, snapped.start);
          guide = snapped.guide;
        }
        if (kind === 'video' && insertion === null && target === props.main) {
          const ordered = peers.sort(
            (a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id),
          );
          const center = desired + clip.duration / 2;
          let index = 0;
          for (const peer of ordered) {
            if (center < peer.startTime + peer.duration / 2) break;
            index++;
          }
          const options = {
            clipId: clip.id,
            index,
            selectedClipIds: [clip.id],
            viewportWidth: props.viewportWidth,
          };
          if (final) props.onEditPreview?.('reorder', options);
          active.finalOperation = null;
          nextTime = ordered.slice(0, index).reduce((time, clip) => time + clip.duration, 0);
        } else {
          if (kind === 'audio' || final)
            props.onEditPreview?.('move', {
              kind,
              time: nextTime,
              trackIndex: target,
              selectedClipIds: [clip.id],
              videoDragBaseTrackCount: resolveVideoTrackCount(base.clips, base.videoTrackCount),
            });
          active.finalOperation = {
            kind,
            insertTrackIndex: insertion,
            selectedClipIds: [clip.id],
            videoDragBaseTrackCount: resolveVideoTrackCount(base.clips, base.videoTrackCount),
            viewportWidth: props.viewportWidth,
          };
        }
        setDragHint({ kind, index: insertion, guide, clipId: clip.id, time: nextTime, target });
        if (final && active.finalOperation)
          props.onEditPreview?.('insert-track', active.finalOperation);
      }
      if (
        !final &&
        autoScroll.current === null &&
        (event.clientX - rect.left < 40 || event.clientX - rect.left > rect.width - 40)
      ) {
        const step = () => {
          const current = gesture.current;
          if (!current || latest.current.blocked) {
            autoScroll.current = null;
            return;
          }
          const live = latest.current;
          const rect = ruler.current?.getBoundingClientRect();
          if (!rect) {
            autoScroll.current = null;
            return;
          }
          const x = current.clientX - rect.left;
          if (x >= 40 && x <= rect.width - 40) {
            autoScroll.current = null;
            return;
          }
          const maximum = Math.max(
            0,
            live.timeline.totalDuration * live.timeline.scale - rect.width + 12,
          );
          const scrollX =
            x < 40
              ? Math.max(0, live.timeline.scrollX - 12)
              : Math.min(maximum, live.timeline.scrollX + 12);
          if (scrollX !== live.timeline.scrollX) live.onSetView?.({ scrollX });
          autoScroll.current = requestAnimationFrame(step);
        };
        autoScroll.current = requestAnimationFrame(step);
      }
    }
    const move = (event) => update(event);
    const up = (event) => {
      const active = gesture.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (active.type === 'move' && active.begun) update(event, true);
      else if (active.type === 'audio-gain' && active.begun) update(event, true);
      else if (active.type === 'crop-left' && active.begun && active.clip?.type !== 'audio')
        latest.current.onEditPreview?.('insert-track', {
          kind: 'video',
          selectedClipIds: [active.clip.id],
          viewportWidth: latest.current.viewportWidth,
        });
      if (gesture.current !== active) return;
      gesture.current = null;
      stopAutoScroll();
      setDragHint(null);
      if (active.begun) latest.current.onEndEdit?.();
    };
    const cancel = (event) => {
      if (gesture.current?.pointerId === event.pointerId) cancelGesture();
    };
    const blur = () => cancelGesture();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', blur);
      const active = gesture.current;
      gesture.current = null;
      stopAutoScroll();
      if (active?.begun) latest.current.onCancelEdit?.();
    };
  }, [cancelGesture, stopAutoScroll]);

  useEffect(() => {
    if (blocked) cancelGesture();
  }, [blocked, cancelGesture]);
  useEffect(() => {
    if (!contextMenu) return;
    const outside = (event) => {
      if (!contextElement.current?.contains(event.target)) setContextMenu(null);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
    };
  }, [contextMenu]);
  useEffect(() => {
    setVocalMenuOpen(false);
  }, [contextMenu?.id]);
  useLayoutEffect(() => {
    if (contextMenu)
      (
        contextElement.current?.querySelector('button:not(:disabled)') || contextElement.current
      )?.focus({ preventScroll: true });
  }, [contextMenu]);
  useEffect(() => {
    const element = scrollArea.current;
    if (!element) return;
    const wheel = (event) => {
      const props = latest.current;
      if (props.blocked) return;
      const { scale, scrollX, currentTime, totalDuration } = props.timeline;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const next = Math.max(2, Math.min(500, scale * (event.deltaY > 0 ? 1 / 1.04 : 1.04)));
        const maximum = Math.max(0, totalDuration * next - props.viewportWidth + 12);
        props.onSetView?.({
          scale: next,
          scrollX: Math.max(0, Math.min(currentTime * (next - scale) + scrollX, maximum)),
        });
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && Math.abs(event.deltaX) > 0) {
        event.preventDefault();
        props.onSetView?.({ scrollX: Math.max(0, scrollX + event.deltaX) });
      } else if (Math.abs(event.deltaY) > 0 && element.scrollHeight - element.clientHeight <= 1) {
        event.preventDefault();
        props.onSetView?.({ scrollX: Math.max(0, scrollX + event.deltaY) });
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  const setScale = (scale) => {
    const next = Math.max(2, Math.min(500, scale));
    const maximum = Math.max(0, timeline.totalDuration * next - viewportWidth + 12);
    onSetView?.({
      scale: next,
      scrollX: Math.max(
        0,
        Math.min(timeline.currentTime * (next - timeline.scale) + timeline.scrollX, maximum),
      ),
    });
  };
  const startPointer = (event, type, clip, row) => {
    if (blocked || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (clip && !selectedClipIds.includes(clip.id)) {
      onSelectClip?.(clip.id);
      if (type === 'move' || type === 'audio-gain') return;
    }
    const rect = ruler.current?.getBoundingClientRect();
    if (!rect) return;
    const active = {
      pointerId: event.pointerId,
      type,
      clip,
      row,
      base: timeline,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      begun: false,
      grabOffset: clip
        ? (event.clientX - rect.left + timeline.scrollX - PADDING) / timeline.scale - clip.startTime
        : 0,
      volumeRect: type === 'audio-gain' ? event.currentTarget.getBoundingClientRect() : undefined,
    };
    if (type.startsWith('crop-') || type === 'audio-gain') {
      if (onBeginEdit?.() !== true) return;
      active.begun = true;
    }
    gesture.current = active;
    event.currentTarget.focus?.({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* Native capture can already have ended. */
    }
    if (type === 'seek')
      onSeek?.(
        Math.max(
          0,
          Math.min(
            (event.clientX - rect.left + timeline.scrollX - PADDING) / timeline.scale,
            timeline.totalDuration,
          ),
        ),
      );
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (contextMenu) {
        setContextMenu(null);
        contextOpener.current?.focus({ preventScroll: true });
      } else if (gesture.current) cancelGesture();
      else if (textPanelOpen) onCloseTextPanel?.();
      else if (transitionPanelOpen) onCloseTransitionPanel?.();
      else if (subtitlePanelOpen) onCloseSubtitlePanel?.();
      else onClose?.();
      return;
    }
    if (
      blocked ||
      event.repeat ||
      event.defaultPrevented ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
      event.target.isContentEditable
    )
      return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      event.stopPropagation();
      onCopyClip?.(selectedClipIds.length === 1 ? selectedClipIds[0] : undefined);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      event.stopPropagation();
      onPasteClip?.();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      event.shiftKey ? onRedo?.() : onUndo?.();
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onPlayToggle?.();
    } else if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      event.preventDefault();
      event.stopPropagation();
      if (
        (textPanelOpen && selectedTextCueId) ||
        selectedSubtitleId ||
        selectedTransitionRightClipId ||
        (selectedClipIds.length && !deletionProtected)
      )
        onDelete?.();
    }
  };
  const nudgeTrim = (event, clip, edge) => {
    if (blocked || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    event.stopPropagation();
    const speed = clipTimelinePlaybackSpeed(clip);
    const direction = event.key === 'ArrowRight' ? 0.1 : -0.1;
    const end = clip.startTime + clip.duration;
    const minimum =
      edge === 'crop-left'
        ? Math.max(clip.startTime - clip.sourceOffset / speed, end - clip.sourceDuration)
        : clip.startTime + 0.5;
    const maximum =
      edge === 'crop-left'
        ? end - 0.5
        : Math.min(
            clip.startTime + (clip.sourceDuration - clip.sourceOffset) / speed,
            clip.startTime + clip.sourceDuration,
          );
    const previous = edge === 'crop-left' ? clip.startTime : end;
    const time = Math.max(minimum, Math.min(previous + direction, maximum));
    if (time === previous || onBeginEdit?.() !== true) return;
    onEditPreview?.('trim', { edge, time, selectedClipIds: [clip.id], viewportWidth });
    if (edge === 'crop-left' && clip.type !== 'audio')
      onEditPreview?.('insert-track', { kind: 'video', selectedClipIds: [clip.id], viewportWidth });
    onEndEdit?.();
  };
  const nudgeAudioGain = (event, clip) => {
    if (blocked || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!clip || onBeginEdit?.() !== true) return;
    const current = clipAudioFaderPosition(clip);
    const position = Math.max(0, Math.min(1, current + (event.key === 'ArrowUp' ? 0.05 : -0.05)));
    onEditPreview?.('audio-gain', { clipId: clip.id, position });
    onEndEdit?.();
  };
  const drop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    if (blocked || !onDropFiles) return;
    const files = Array.from(event.dataTransfer.files || []).filter(
      (file) => file.type.startsWith('video/') || file.type.startsWith('audio/'),
    );
    if (files.length) onDropFiles(files);
  };

  return (
    <section
      ref={root}
      className="cv-clip-timeline"
      aria-label="视频剪辑时间轴"
      data-clip-editor-scope="true"
      onKeyDown={onKeyDown}
    >
      <div
        className="cv-clip-timeline-resizer"
        role="separator"
        aria-label="拖拽调整高度"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || !onResizeHeight || gesture.current) return;
          event.preventDefault();
          event.stopPropagation();
          gesture.current = {
            pointerId: event.pointerId,
            type: 'height',
            height,
            startY: event.clientY,
            begun: false,
          };
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            onResizeHeight?.(height + (event.key === 'ArrowUp' ? 12 : -12));
          }
        }}
      />
      <div className="cv-clip-timeline-toolbar" role="toolbar" aria-label="视频剪辑工具">
        <div className="cv-clip-timeline-toolbar-edits">
          <ToolbarAction label="撤销" disabled={blocked || !history?.past?.length} onClick={onUndo}>
            <Undo2 size={16} />
          </ToolbarAction>
          <ToolbarAction
            label="重做"
            disabled={blocked || !history?.future?.length}
            onClick={onRedo}
          >
            <Redo2 size={16} />
          </ToolbarAction>
          <ToolbarAction
            label="分割"
            disabled={!splitAllowed}
            onClick={() => onSplit?.(toolbarKind)}
            testId="clip-toolbar-split"
          >
            <SourceIcon name="clip-timeline-split" />
          </ToolbarAction>
          <ToolbarAction
            label="向左裁剪"
            disabled={!leftAllowed}
            onClick={() => onTrim?.(toolbarKind, 'left')}
            testId="clip-toolbar-trim-left"
          >
            <SourceIcon name="clip-timeline-trim-left" />
          </ToolbarAction>
          <ToolbarAction
            label="向右裁剪"
            disabled={!rightAllowed}
            onClick={() => onTrim?.(toolbarKind, 'right')}
            testId="clip-toolbar-trim-right"
          >
            <SourceIcon name="clip-timeline-trim-right" />
          </ToolbarAction>
          <ToolbarAction
            label={onAddText ? '添加文字' : '添加文字（尚未接入）'}
            disabled={blocked || !onAddText || textPending}
            onClick={onAddText}
            pressed={textPanelOpen}
            testId="clip-toolbar-text"
          >
            <Type size={12} />
          </ToolbarAction>
          <ToolbarAction
            label={onAddSubtitle ? '添加字幕' : '添加字幕（尚未接入）'}
            disabled={blocked || !onAddSubtitle}
            onClick={onAddSubtitle}
            pressed={subtitlePanelOpen}
            testId="clip-toolbar-subtitle"
          >
            <SourceIcon name="lines-text" />
          </ToolbarAction>
          <ToolbarAction
            label={onToggleTransitionPanel || onAddTransition ? '添加转场' : '添加转场（尚未接入）'}
            disabled={blocked || !(onToggleTransitionPanel || onAddTransition)}
            pressed={transitionPanelOpen}
            onClick={onToggleTransitionPanel || onAddTransition}
            testId="clip-transition-trigger"
          >
            <SourceIcon name="clip-transition" />
          </ToolbarAction>
        </div>
        <div className="cv-clip-timeline-transport">
          <span>{timeLabel(timeline.currentTime)}</span>
          <ToolbarAction
            label={playing ? '暂停' : '播放'}
            className="cv-clip-timeline-play"
            disabled={blocked || (!playing && playbackBlocked) || !timeline.clips.length}
            onClick={onPlayToggle}
          >
            {playing ? <Pause size={10} /> : <Play size={14} />}
          </ToolbarAction>
          <span>{timeLabel(timeline.totalDuration)}</span>
        </div>
        <div className="cv-clip-timeline-toolbar-view">
          <ToolbarAction
            label={timelineSnapEnabled ? '关闭吸附' : '吸附'}
            disabled={blocked || !onToggleSnap}
            pressed={timelineSnapEnabled}
            onClick={onToggleSnap}
            testId="clip-toolbar-snap"
          >
            <SourceIcon name="clip-timeline-snap" size={14} />
          </ToolbarAction>
          <ToolbarAction
            label="缩小"
            disabled={blocked || timeline.scale <= 2}
            onClick={() => setScale(timeline.scale / 1.04)}
          >
            <ZoomOut size={14} />
          </ToolbarAction>
          <input
            className="cv-clip-timeline-scale"
            type="range"
            aria-label="时间轴缩放"
            min="0"
            max="100"
            step="any"
            value={((timeline.scale - 2) / 498) * 100}
            disabled={blocked}
            onChange={(event) => setScale(2 + (Number(event.target.value) / 100) * 498)}
            style={{ '--cv-clip-scale-fill': `${((timeline.scale - 2) / 498) * 100}%` }}
          />
          <ToolbarAction
            label="放大"
            disabled={blocked || timeline.scale >= 500}
            onClick={() => setScale(timeline.scale * 1.04)}
          >
            <ZoomIn size={14} />
          </ToolbarAction>
          <ToolbarAction
            label={previewExpanded ? '收起预览' : '展开预览（占满时间轴上方）'}
            onClick={onTogglePreview}
            disabled={!onTogglePreview}
          >
            <SourceIcon name={previewExpanded ? 'preview-collapse' : 'preview-expand'} size={14} />
          </ToolbarAction>
          {onToggleFullscreen && (
            <ToolbarAction label="全屏预览" onClick={onToggleFullscreen}>
              <SourceIcon name="preview-expand" size={14} />
            </ToolbarAction>
          )}
          {onCompose && (
            <button
              type="button"
              className="cv-clip-timeline-compose"
              onClick={onCompose}
              disabled={blocked || !timeline.clips.some((clip) => clip.type !== 'audio')}
            >
              导出
            </button>
          )}
          <ToolbarAction label="退出剪辑" onClick={onClose}>
            <X size={12} />
          </ToolbarAction>
        </div>
      </div>
      <div
        ref={scrollArea}
        className="cv-clip-timeline-scroll"
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.types).includes('Files')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = onDropFiles && !blocked ? 'copy' : 'none';
            setDropActive(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false);
        }}
        onDrop={drop}
      >
        <div className="cv-clip-timeline-ruler-line">
          <div className="cv-clip-timeline-ruler-controls" title="时间刻度（与右侧对齐）" />
          <div
            ref={ruler}
            className="cv-clip-timeline-ruler"
            aria-label="时间刻度"
            onPointerDown={(event) => startPointer(event, 'seek')}
          >
            {ticks.map((tick) => (
              <span
                key={tick.time}
                className={`cv-clip-timeline-tick ${tick.major ? 'is-major' : ''}`}
                style={{ left: PADDING + tick.time * timeline.scale - timeline.scrollX }}
              >
                {tick.major && <span>{timeLabel(tick.time)}</span>}
              </span>
            ))}
            <div
              className="cv-clip-timeline-playhead-head"
              role="slider"
              tabIndex={0}
              aria-label="播放位置"
              aria-valuemin={0}
              aria-valuemax={timeline.totalDuration}
              aria-valuenow={timeline.currentTime}
              style={{ left: PADDING + timeline.currentTime * timeline.scale - timeline.scrollX }}
              onKeyDown={(event) => {
                if (!blocked && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                  event.preventDefault();
                  onSeek?.(
                    Math.max(
                      0,
                      Math.min(
                        timeline.currentTime + (event.key === 'ArrowRight' ? 0.1 : -0.1),
                        timeline.totalDuration,
                      ),
                    ),
                  );
                }
              }}
            />
          </div>
        </div>
        <div className="cv-clip-timeline-track-list">
          {textBeforeSubtitles && textTrackRows}
          {subtitleTrackRows ?? (
            <ClipSubtitleTimelineRow
              {...{
                timeline,
                selectedSubtitleId,
                blocked: blocked || subtitleStatus !== 'ready',
                draftSession,
                onSelectSubtitle,
                onEditSubtitle,
                onBeginEdit,
                onEditPreview,
                onEndEdit,
                onCancelEdit,
              }}
            />
          )}
          {!textBeforeSubtitles && textTrackRows}
          {rows.map((row) => {
            const hidden =
              (row.kind === 'video'
                ? timeline.videoTrackHiddenPerTrack
                : timeline.audioTrackHiddenPerTrack)?.[row.index] === true;
            const muted = mutedTrack(timeline, row.kind, row.index);
            const rowName = `${row.kind === 'video' ? '视频' : '音频'}轨道 ${row.index + 1}`;
            const clips = timeline.clips.filter((clip) =>
              row.kind === 'audio'
                ? clip.type === 'audio' && audioIndex(clip, videoCount) === row.index
                : clip.type !== 'audio' && getVideoTrackIndex(clip) === row.index,
            );
            return (
              <div
                className={`cv-clip-timeline-track-row ${row.kind === 'audio' ? 'is-audio' : ''} ${hidden ? 'is-hidden' : ''}`}
                key={`${row.kind}:${row.index}`}
                data-clip-track={`${row.kind}:${row.index}`}
                style={{ height: row.height }}
              >
                <div className="cv-clip-timeline-track-controls" aria-label={rowName}>
                  <ToolbarAction
                    label={`${hidden ? '显示' : '隐藏'}${rowName}`}
                    disabled={blocked || !onSetTrackControl}
                    pressed={!hidden}
                    onClick={() =>
                      onSetTrackControl({
                        kind: row.kind,
                        control: 'hidden',
                        trackIndex: row.index,
                        value: !hidden,
                      })
                    }
                  >
                    {hidden ? <SourceIcon name="clip-track-hidden" /> : <Eye size={16} />}
                  </ToolbarAction>
                  <ToolbarAction
                    label={`${muted ? '取消静音' : '静音'}${rowName}`}
                    disabled={blocked || !onSetTrackControl}
                    pressed={!muted}
                    onClick={() =>
                      onSetTrackControl({
                        kind: row.kind,
                        control: 'muted',
                        trackIndex: row.index,
                        value: !muted,
                      })
                    }
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </ToolbarAction>
                </div>
                <div
                  className="cv-clip-timeline-track"
                  aria-label={rowName}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) startPointer(event, 'seek');
                  }}
                >
                  {clips.length === 0 && row.kind === 'video' && row.index === main && (
                    <span className="cv-clip-timeline-empty">暂无视频，去画布上连接视频</span>
                  )}
                  {clips.map((clip) => {
                    const media = mediaBySourceId?.get?.(clip.sourceNodeId);
                    const name =
                      clip.name?.trim() ||
                      media?.name?.trim() ||
                      `${row.kind === 'audio' ? '音频' : '视频'}`;
                    const selected = selectedClipIds.includes(clip.id);
                    const clipDisabled =
                      blocked || clip.loading === true || Boolean(clip.loadError);
                    return (
                      <div
                        key={clip.id}
                        className={`cv-clip-timeline-clip ${selected ? 'is-selected' : ''} ${row.kind === 'audio' ? 'is-audio' : ''} ${clip.loadError ? 'has-error' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${name} ${timeLabel(clip.startTime)}–${timeLabel(clip.startTime + clip.duration)}`}
                        aria-pressed={selected}
                        aria-disabled={clipDisabled}
                        data-clip-id={clip.id}
                        style={{
                          left: PADDING + clip.startTime * timeline.scale - timeline.scrollX,
                          width: Math.max(2, clip.duration * timeline.scale - 1),
                        }}
                        onPointerDown={(event) => {
                          if (!clipDisabled) startPointer(event, 'move', clip, row.index);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (row.kind === 'audio' || clipDisabled) return;
                          onSelectClip?.(clip.id);
                          contextOpener.current = event.currentTarget;
                          setContextMenu({
                            id: clip.id,
                            left: Math.max(8, Math.min(event.clientX, window.innerWidth - 228)),
                            top: Math.max(8, Math.min(event.clientY, window.innerHeight - 140)),
                          });
                        }}
                        onKeyDown={(event) => {
                          if ((event.key === 'Enter' || event.key === ' ') && !clipDisabled) {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectClip?.(clip.id);
                          }
                        }}
                      >
                        {row.kind === 'audio' ? (
                          <Music
                            size={16}
                            className="cv-clip-timeline-audio-symbol"
                            aria-hidden="true"
                          />
                        ) : (
                          <ClipPoster key={media?.poster || 'missing'} poster={media?.poster} />
                        )}
                        <span className="cv-clip-timeline-clip-name">
                          {row.kind !== 'audio' &&
                            Math.abs(clipTimelinePlaybackSpeed(clip) - 1) > 1e-6 && (
                              <span className="cv-clip-timeline-speed">
                                <SourceIcon name="clip-speed-gauge" size={11} />
                                变速 {speedLabel(clip)}
                              </span>
                            )}
                          {name}
                          {row.kind !== 'audio' ? ` ${clipDurationLabel(clip.duration)}` : ''}
                        </span>
                        {clip.loading && (
                          <span className="cv-clip-timeline-clip-status">视频加载中...</span>
                        )}
                        {clip.loadError && (
                          <span className="cv-clip-timeline-clip-status" role="alert">
                            素材加载失败
                          </span>
                        )}
                        {selected && (
                          <>
                            <button
                              type="button"
                              className="cv-clip-timeline-trim-handle is-left"
                              disabled={clipDisabled}
                              aria-label={`调整${name}起点`}
                              onPointerDown={(event) =>
                                startPointer(event, 'crop-left', clip, row.index)
                              }
                              onKeyDown={(event) => nudgeTrim(event, clip, 'crop-left')}
                            />
                            <button
                              type="button"
                              className="cv-clip-timeline-trim-handle is-right"
                              disabled={clipDisabled}
                              aria-label={`调整${name}终点`}
                              onPointerDown={(event) =>
                                startPointer(event, 'crop-right', clip, row.index)
                              }
                              onKeyDown={(event) => nudgeTrim(event, clip, 'crop-right')}
                            />
                          </>
                        )}
                        {!clipDisabled && (
                          <div
                            className="cv-clip-timeline-volume-line"
                            role="slider"
                            tabIndex={0}
                            aria-label={`${name}音量`}
                            aria-valuemin={0}
                            aria-valuemax={1}
                            aria-valuenow={clipAudioFaderPosition(clip)}
                            data-testid={`clip-volume-line-${clip.id}`}
                            style={{
                              bottom: row.kind === 'audio' ? undefined : '8px',
                              top:
                                row.kind === 'audio'
                                  ? `${(1 - clipAudioFaderPosition(clip)) * 100}%`
                                  : undefined,
                            }}
                            onPointerDown={(event) =>
                              startPointer(event, 'audio-gain', clip, row.index)
                            }
                            onKeyDown={(event) => nudgeAudioGain(event, clip)}
                          />
                        )}
                      </div>
                    );
                  })}
                  {row.kind === 'video' &&
                    row.index === main &&
                    transitionMarkers.map((transition) => {
                      const label = `转场 ${transition.type} ${transition.duration.toFixed(1)}秒`;
                      return (
                        <button
                          key={transition.id}
                          type="button"
                          className="cv-clip-timeline-transition-marker"
                          aria-label={label}
                          aria-pressed={
                            onSelectTransition
                              ? selectedTransitionRightClipId === transition.rightClipId
                              : selectedClipIds.includes(transition.rightClipId)
                          }
                          data-transition-id={transition.id}
                          title={label}
                          style={{
                            left:
                              PADDING + transition.startTime * timeline.scale - timeline.scrollX,
                            width: Math.max(28, transition.duration * timeline.scale),
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                            (onSelectTransition || onSelectClip)?.(transition.rightClipId);
                          }}
                        >
                          <SourceIcon name="clip-transition" size={14} />
                        </button>
                      );
                    })}
                  {dragHint?.kind === 'video' &&
                    dragHint.target === row.index &&
                    timeline.clips.find((clip) => clip.id === dragHint.clipId) && (
                      <div
                        className="cv-clip-timeline-drag-ghost"
                        aria-hidden="true"
                        style={{
                          left: PADDING + dragHint.time * timeline.scale - timeline.scrollX,
                          width: Math.max(
                            2,
                            timeline.clips.find((clip) => clip.id === dragHint.clipId).duration *
                              timeline.scale -
                              1,
                          ),
                        }}
                      />
                    )}
                  <div
                    className="cv-clip-timeline-playhead-line"
                    aria-hidden="true"
                    style={{
                      left: PADDING + timeline.currentTime * timeline.scale - timeline.scrollX,
                    }}
                  />
                  {dragHint?.guide != null && (
                    <div
                      className="cv-clip-timeline-snap-guide"
                      aria-hidden="true"
                      style={{ left: PADDING + dragHint.guide * timeline.scale - timeline.scrollX }}
                    />
                  )}
                </div>
                {dragHint?.kind === row.kind && dragHint.index === row.index && (
                  <div className="cv-clip-timeline-insert-guide" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
        {(!ready || error) && (
          <div className="cv-clip-timeline-state" role={error ? 'alert' : 'status'}>
            {error ? error.message || String(error) : '正在准备时间轴素材…'}
          </div>
        )}
        {dropActive && (
          <div className="cv-clip-timeline-drop">
            {onDropFiles && !blocked ? '释放以上传' : '素材上传尚未接入'}
          </div>
        )}
      </div>
      {contextMenu &&
        createPortal(
          <div
            ref={contextElement}
            className="cv-clip-timeline-context"
            role="menu"
            tabIndex={-1}
            aria-label="片段菜单"
            style={{ left: contextMenu.left, top: contextMenu.top }}
            onKeyDown={onKeyDown}
          >
            <button
              role="menuitem"
              type="button"
              aria-label="人声分离"
              disabled={blocked || !onVocalSplit || vocalSplitState?.allowed === false}
              aria-expanded={vocalMenuOpen}
              title={vocalSplitState?.reason || undefined}
              onClick={() => setVocalMenuOpen((open) => !open)}
            >
              人声分离<span>›</span>
            </button>
            {vocalMenuOpen && (
              <div className="cv-clip-timeline-vocal-menu" role="group" aria-label="人声分离方式">
                {VOCAL_SPLIT_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    disabled={blocked || vocalSplitState?.allowed === false}
                    onClick={() => {
                      void onVocalSplit?.(contextMenu.id, choice.value);
                      setContextMenu(null);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
            <button
              role="menuitem"
              type="button"
              disabled={blocked || !onDetachAudio || detachAudioState?.allowed === false}
              title={detachAudioState?.reason || undefined}
              onClick={() => {
                void onDetachAudio?.(contextMenu.id);
                setContextMenu(null);
              }}
            >
              音视频分离
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={blocked || !onCopyClip}
              onClick={() => {
                onCopyClip?.(contextMenu.id);
                setContextMenu(null);
              }}
            >
              复制
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={blocked || !canPasteClip || !onPasteClip}
              title={!canPasteClip ? '剪贴板为空' : undefined}
              onClick={() => {
                onPasteClip?.();
                setContextMenu(null);
              }}
            >
              粘贴
            </button>
            <button
              role="menuitem"
              type="button"
              className="is-delete"
              disabled={blocked || (primary.length === 1 && primary[0].id === contextMenu.id)}
              title={
                primary.length === 1 && primary[0].id === contextMenu.id
                  ? '主轨道不能清空'
                  : undefined
              }
              onClick={() => {
                setContextMenu(null);
                onDelete?.();
              }}
            >
              删除
            </button>
          </div>,
          document.body,
        )}
    </section>
  );
}
