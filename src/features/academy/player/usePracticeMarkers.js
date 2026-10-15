import { useCallback, useEffect, useRef, useState } from 'react';
import { crossedMarker } from './player-model.js';

export function usePracticeMarkers(markers, playbackKey, enabled) {
  const [popup, setPopup] = useState(null);
  const consumed = useRef(new Set());
  const previous = useRef(0);
  const seeking = useRef(false);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const clear = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => {
    clear();
    setPopup(null);
    consumed.current = new Set();
    previous.current = 0;
    seeking.current = false;
    return clear;
  }, [playbackKey, clear]);
  const close = useCallback(() => {
    clear();
    setPopup(null);
  }, [clear]);
  const open = useCallback(
    (index) => {
      clear();
      setPopup(index);
      closeTimer.current = setTimeout(() => setPopup(null), 5000);
    },
    [clear],
  );
  function frame(time) {
    if (enabled && !seeking.current) {
      const index = crossedMarker(markers, previous.current, time, consumed.current);
      if (index >= 0) {
        consumed.current.add(index);
        open(index);
      }
    }
    seeking.current = false;
    previous.current = time;
  }
  return {
    popup,
    frame,
    close,
    notifySeeking: () => {
      seeking.current = true;
      close();
    },
    tap: (index) => (popup === index ? close() : open(index)),
    hover: (index) => {
      clear();
      openTimer.current = setTimeout(() => open(index), 1000);
    },
    leave: () => {
      clear();
      closeTimer.current = setTimeout(() => setPopup(null), 160);
    },
    keep: clear,
  };
}
