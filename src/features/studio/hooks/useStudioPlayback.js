import { useEffect } from 'react';
import { advanceStudioPlayback } from '../model.js';

export function useStudioPlayback({ playing, rate, duration, loop, setTime, setPlaying }) {
  useEffect(() => {
    if (!playing) return;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const elapsed = ((now - last) / 1000) * rate;
      last = now;
      setTime((time) => {
        const next = advanceStudioPlayback(time, elapsed, duration, loop);
        if (next.ended) setPlaying(false);
        return next.time;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, duration, loop, setTime, setPlaying]);
}
