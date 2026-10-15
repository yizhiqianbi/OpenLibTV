import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const position = (value) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
const rate = (value) => (Number.isFinite(value) && value > 0 ? value : 1);

/** Source course renderer 768817: authorized heartbeat, final flush and completion hold.
 * Only a supplied operating adapter can write progress; public snapshots never unlock lessons.
 */
export function useCourseProgress({
  courseId,
  sectionId,
  enabled,
  intervalSec = 15,
  repository,
  alreadyDone = false,
  onWatchDone,
  onNewWatchDone,
}) {
  const connected = enabled && typeof repository.reportLessonProgress === 'function';
  const session = useMemo(
    () => ({
      key: `${courseId}:${sectionId}`,
      sectionId,
      enabled: connected,
      repository,
      position: 0,
      rate: 1,
      intervalSec: 15,
      observed: false,
      lastAt: 0,
      lastPosition: -1,
      finalKey: '',
      beaconKey: '',
      completed: false,
      active: false,
    }),
    [courseId, sectionId, connected, repository],
  );
  const current = useRef(session);
  const completed = useRef({ onWatchDone, onNewWatchDone });
  const entryCompletion = useRef(new Map());
  const holdTimer = useRef(null);
  const [state, setState] = useState({ owner: null, holding: false, error: '' });
  useLayoutEffect(() => {
    current.current = session;
    completed.current = { onWatchDone, onNewWatchDone };
    if (sectionId && !entryCompletion.current.has(session.key))
      entryCompletion.current.set(session.key, alreadyDone);
    session.intervalSec = intervalSec;
  }, [session, sectionId, onWatchDone, onNewWatchDone, alreadyDone, intervalSec]);

  const write = useCallback((owner, options = {}) => {
    if (!owner.enabled || !owner.sectionId || !owner.observed) return;
    const seconds = position(owner.position);
    const final = options.final === true;
    const finalKey = `${owner.sectionId}:${seconds}`;
    if (final ? finalKey === owner.finalKey : !options.force && seconds === owner.lastPosition)
      return;
    if (final) owner.finalKey = finalKey;
    owner.lastPosition = seconds;
    owner.lastAt = Date.now();
    const payload = {
      sectionId: owner.sectionId,
      positionSec: seconds,
      playbackRate: rate(owner.rate),
      final,
    };
    Promise.resolve()
      .then(() => owner.repository.reportLessonProgress(payload))
      .then((result) => {
        if (!result || typeof result !== 'object')
          throw new Error('Progress adapter returned no acknowledgement');
        return result;
      })
      .then(
        (result) => {
          if (!owner.active || current.current !== owner) return;
          setState((value) => ({ ...value, owner, error: '' }));
          if (result?.watchDone && !owner.completed) {
            owner.completed = true;
            if (!entryCompletion.current.get(owner.key)) {
              setState({ owner, holding: true, error: '' });
              clearTimeout(holdTimer.current);
              holdTimer.current = setTimeout(() => {
                if (owner.active && current.current === owner)
                  setState((value) => ({ ...value, holding: false }));
              }, 2000);
              completed.current.onNewWatchDone?.(owner.sectionId);
            }
            completed.current.onWatchDone?.(owner.sectionId);
          }
        },
        () => {
          if (final && owner.finalKey === finalKey) owner.finalKey = '';
          if (!owner.active || current.current !== owner) return;
          setState((value) => ({ ...value, owner, error: '学习进度同步失败，请稍后重试' }));
        },
      );
  }, []);
  const collect = useCallback((owner, payload) => {
    if (Number.isFinite(payload?.positionSec)) {
      owner.position = payload.positionSec;
      owner.observed = true;
    }
    if (Number.isFinite(payload?.playbackRate)) owner.rate = payload.playbackRate;
  }, []);
  const flush = useCallback(
    (payload = {}) => {
      const owner = current.current;
      collect(owner, payload);
      write(owner, payload);
    },
    [collect, write],
  );
  const tick = useCallback(
    (payload) => {
      const owner = current.current;
      collect(owner, payload);
      if (Date.now() - owner.lastAt >= 1000 * Math.max(1, owner.intervalSec)) write(owner);
    },
    [collect, write],
  );
  const updatePosition = useCallback((seconds) => {
    current.current.position = seconds;
    current.current.observed = true;
  }, []);
  const updateRate = useCallback((value) => {
    current.current.rate = value;
  }, []);
  useEffect(() => {
    session.active = true;
    const beacon = () => {
      if (!session.enabled || !session.sectionId || !session.observed) return;
      if (typeof session.repository.reportLessonProgressBeacon !== 'function') {
        write(session, { final: true });
        return;
      }
      const seconds = position(session.position);
      const key = `${session.sectionId}:${seconds}`;
      if (key === session.beaconKey) return;
      try {
        session.repository.reportLessonProgressBeacon({
          sectionId: session.sectionId,
          positionSec: seconds,
          playbackRate: rate(session.rate),
          final: true,
        });
        session.beaconKey = key;
      } catch {
        write(session, { final: true });
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') beacon();
      else write(session, { force: true });
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', beacon);
    return () => {
      session.active = false;
      clearTimeout(holdTimer.current);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', beacon);
      write(session, { final: true });
    };
  }, [session, write]);
  const ownState = state.owner === session ? state : { holding: false, error: '' };
  return {
    tick,
    flush,
    updatePosition,
    updateRate,
    followupGate: ownState.holding ? 'hold' : 'allow',
    error: ownState.error,
    retry: () => write(current.current, { force: true }),
  };
}
