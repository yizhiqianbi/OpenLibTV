import { useEffect } from 'react';

export function useChatReplay({
  chatShare,
  replayPlaying,
  setReplay,
  setReplayPlaying,
  sharedMessages,
}) {
  const messageCount = sharedMessages.length;
  useEffect(() => {
    if (!chatShare || !replayPlaying || messageCount < 2) return;
    const timer = setInterval(
      () =>
        setReplay((n) => {
          if (n >= messageCount - 1) {
            setReplayPlaying(false);
            return n;
          }
          return n + 1;
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [chatShare, replayPlaying, messageCount, setReplay, setReplayPlaying]);
}
