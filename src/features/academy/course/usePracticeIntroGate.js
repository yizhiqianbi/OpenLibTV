import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { openPracticeWindow, practiceIntroMemory } from './practice-entry.js';

export function usePracticeIntroGate({
  courseId,
  user,
  open = openPracticeWindow,
  memory = practiceIntroMemory,
}) {
  const owner = `${courseId}:${user?.id ?? 'anon'}`;
  const current = useRef(owner);
  const alive = useRef(false);
  const transaction = useRef(0);
  const [state, setState] = useState({ owner, course: null, error: '' });
  useLayoutEffect(() => {
    current.current = owner;
  }, [owner]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      transaction.current += 1;
    };
  }, []);
  const own = state.owner === owner ? state : { course: null, error: '' };
  return {
    introCourse: own.course,
    error: own.error,
    async requestEnter(course) {
      const request = ++transaction.current;
      const result = await memory.claim(user?.id);
      if (!alive.current || current.current !== owner || request !== transaction.current) return;
      if (result.show) setState({ owner, course, error: result.error || '' });
      else open(course.courseId, course.practiceNodeUuid);
    },
    closeIntro: () => setState((value) => ({ ...value, course: null })),
    startPractice: () => {
      if (!own.course) return;
      setState((value) => ({ ...value, course: null }));
      open(own.course.courseId, own.course.practiceNodeUuid);
    },
  };
}
