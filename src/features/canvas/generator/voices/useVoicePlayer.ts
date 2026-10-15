import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceMeta } from './model.ts';

export function useVoicePlayer(createAudio: () => HTMLAudioElement = () => new Audio()) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const factory = useRef(createAudio);
  factory.current = createAudio;
  const generation = useRef(0);
  const mounted = useRef(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const current = useRef<string | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    audio.current?.pause();
    current.current = null;
    setPlayingId(null);
    setLoadingId(null);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
      audio.current?.pause();
      if (audio.current) {
        audio.current.onended = null;
        audio.current.onerror = null;
      }
      audio.current = null;
      current.current = null;
    };
  }, [invalidate]);
  const toggle = useCallback(
    async (voice: VoiceMeta) => {
      if (!voice.voiceUrl) return;
      if (current.current === voice.voiceId) {
        stop();
        return;
      }
      const token = ++generation.current;
      setError(null);
      audio.current?.pause();
      setPlayingId(null);
      setLoadingId(voice.voiceId);
      current.current = voice.voiceId;
      try {
        const player = audio.current || (audio.current = factory.current());
        const finish = () => {
          if (!mounted.current || generation.current !== token) return;
          generation.current++;
          current.current = null;
          setPlayingId(null);
          setLoadingId(null);
        };
        player.onended = finish;
        player.onerror = () => {
          if (!mounted.current || generation.current !== token) return;
          finish();
          setError(new Error('音色试听加载失败，请重新试听'));
        };
        player.src = voice.voiceUrl;
        player.currentTime = 0;
        await player.play();
        if (!mounted.current || generation.current !== token) return;
        setPlayingId(voice.voiceId);
        setLoadingId(null);
      } catch (cause) {
        if (!mounted.current || generation.current !== token) return;
        current.current = null;
        setPlayingId(null);
        setLoadingId(null);
        setError(cause instanceof Error ? cause : new Error('音色试听失败'));
      }
    },
    [stop],
  );
  return { playingId, loadingId, error, toggle, stop };
}
export type VoicePlayback = ReturnType<typeof useVoicePlayer>;
