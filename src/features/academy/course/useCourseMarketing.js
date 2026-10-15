import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { courseMarketingFrequency } from './marketing-frequency.js';
import {
  COURSE_MEMBER_REFRESH_EVENT,
  completionMarketingCandidates,
  marketingScenes,
  resolveClipMinuteSec,
  resolveDailyPopupLimit,
} from './marketing-model.js';

const ownedState = (value, owner) =>
  value.owner === owner ? value : { owner, popup: null, minuteSection: '', error: '' };

/** Renderer 768817's marketing gate. Only adapter-confirmed nonmembers see sales prompts. */
export function useCourseMarketing({
  courseId,
  sectionId,
  detail,
  user,
  config,
  repository,
  onPaywall,
  frequency = courseMarketingFrequency,
  debug = false,
}) {
  const uid = user?.uuid;
  const owner = useMemo(() => ({ courseId, uid, repository }), [courseId, uid, repository]);
  const current = useRef(owner);
  const pending = useRef(null);
  const power = useRef(null);
  const minuteReached = useRef(null);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ owner: null, popup: null, minuteSection: '', error: '' });
  const [takeover, setTakeover] = useState(null);
  useLayoutEffect(() => {
    current.current = owner;
  }, [owner]);
  useLayoutEffect(() => {
    // Renderer 768817 resets both takeover and the minute bar on every chapter change.
    setTakeover(null);
    minuteReached.current = null;
    setState((value) => (value.minuteSection ? { ...value, minuteSection: '' } : value));
  }, [owner, sectionId]);
  const nonmember = useCallback(async () => {
    if (debug) return true;
    if (power.current?.owner !== owner) {
      power.current = {
        owner,
        promise: Promise.resolve()
          .then(() => repository.courseMemberPower(courseId))
          .then((value) => {
            if (value?.code !== 0) throw new Error('Member power was not confirmed');
            return !value.data?.member?.displayName;
          }),
      };
    }
    return power.current.promise;
  }, [owner, repository, courseId, debug]);
  useEffect(() => {
    const refresh = () => {
      power.current = null;
      setRevision((value) => value + 1);
    };
    window.addEventListener(COURSE_MEMBER_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(COURSE_MEMBER_REFRESH_EVENT, refresh);
  }, []);
  const own = state.owner === owner ? state : { popup: null, minuteSection: '', error: '' };
  useEffect(() => {
    if (!user || !uid || !config || detail?.courseId !== courseId) return;
    const completed = pending.current;
    if (!completed || completed.owner !== owner || own.popup) return;
    pending.current = null;
    const candidates = completionMarketingCandidates(config, detail, completed.sectionId);
    if (!candidates.length) return;
    let active = true,
      finished = false;
    (async () => {
      try {
        const eligible = await nonmember();
        if (!active || current.current !== owner) return;
        setState((value) => ({ ...ownedState(value, owner), error: '' }));
        if (!eligible) return;
        for (const candidate of candidates) {
          const options = {
            touch: candidate.touch,
            uid,
            courseUuid: courseId,
            dailyLimit: resolveDailyPopupLimit(config),
          };
          const allowed = debug || (await frequency.canShow(options));
          if (!active || current.current !== owner) return;
          if (!allowed) continue;
          let error = '';
          if (!debug)
            try {
              frequency.markShown(options, {
                suppress:
                  candidate.touch === 'progressHalf' &&
                  candidates.some((entry) => entry.touch === 'firstClipDone')
                    ? ['firstClipDone']
                    : [],
              });
            } catch {
              error = '提醒记录未能保存，本次会话仍会限制重复提醒';
            }
          setTakeover({ owner, sectionId });
          setState((value) => ({ ...ownedState(value, owner), popup: candidate, error }));
          return;
        }
      } catch {
        if (active && current.current === owner) {
          pending.current = completed;
          setState((value) => ({ ...ownedState(value, owner), error: '会员权益验证失败，请重试' }));
        }
      } finally {
        finished = true;
      }
    })();
    return () => {
      active = false;
      if (!finished && current.current === owner && !pending.current) pending.current = completed;
    };
  }, [
    courseId,
    sectionId,
    detail,
    user,
    uid,
    config,
    own.popup,
    owner,
    nonmember,
    frequency,
    debug,
    revision,
  ]);
  useEffect(() => {
    if (minuteReached.current !== `${courseId}:${sectionId}` || !user) return;
    let active = true;
    nonmember().then(
      (allowed) => {
        if (active && current.current === owner)
          setState((value) => ({
            ...ownedState(value, owner),
            minuteSection: allowed ? sectionId : '',
            error: '',
          }));
      },
      () => {
        if (active && current.current === owner)
          setState((value) => ({ ...ownedState(value, owner), error: '会员权益验证失败，请重试' }));
      },
    );
    return () => {
      active = false;
    };
  }, [courseId, sectionId, user, uid, owner, nonmember, revision]);
  return {
    popup: own.popup,
    marketingTookOver:
      !!own.popup || (takeover?.owner === owner && takeover.sectionId === sectionId),
    minuteThresholdSec: user
      ? resolveClipMinuteSec(config?.clipMinute, courseId, sectionId)
      : undefined,
    minuteBarVisible: own.minuteSection === sectionId,
    minuteBarText: config?.clipMinute?.text || '',
    error: own.error,
    recordCompletion: (id) => {
      pending.current = { owner, sectionId: id };
    },
    onMinuteThresholdReached: () => {
      minuteReached.current = `${courseId}:${sectionId}`;
      setRevision((value) => value + 1);
    },
    closePopup: () => setState((value) => ({ ...value, popup: null })),
    openPaywallFromPopup: () => {
      const scene = marketingScenes[own.popup?.touch];
      setState((value) => ({ ...value, popup: null }));
      onPaywall({ courseId, ...(scene ? { touchpointScene: scene } : {}) });
    },
    openPaywallFromBar: () => onPaywall({ courseId, touchpointScene: 'lesson_watch_n_minutes' }),
    retry: () => {
      power.current = null;
      setRevision((value) => value + 1);
    },
  };
}
