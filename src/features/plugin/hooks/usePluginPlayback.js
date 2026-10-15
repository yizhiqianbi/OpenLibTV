import { useEffect, useState } from 'react';

function usePluginPlayback(showcase, agent, replay, completed) {
  const [state, setState] = useState({ stage: 'prompt', count: 0 });
  useEffect(() => {
    const key = `${agent}:${showcase}`;
    if (
      completed.current.has(key) ||
      window.matchMedia('(prefers-reduced-motion:reduce)').matches
    ) {
      setState({ stage: 'complete', count: 3 });
      completed.current.add(key);
      return;
    }
    setState({ stage: 'prompt', count: 0 });
    const timers = [];
    let at = 200;
    const step = (delay, stage, count = 0) => {
      at += delay;
      timers.push(
        setTimeout(() => {
          setState({ stage, count });
          if (stage === 'complete') completed.current.add(key);
        }, at),
      );
    };
    step(250, 'loading');
    step(750, 'loadingExit');
    step(250, 'reply');
    if (showcase === 0) {
      step(375, 'beforeTool', 1);
      step(375, 'beforeTool', 2);
    }
    step(250, 'tool', showcase === 0 ? 2 : 0);
    for (let i = showcase === 0 ? 3 : 1; i <= 3; i++) step(375, 'checklist', i);
    step(375, 'summary', 3);
    step(375, 'complete', 3);
    return () => timers.forEach(clearTimeout);
  }, [showcase, agent, replay, completed]);
  return state;
}

export default usePluginPlayback;
