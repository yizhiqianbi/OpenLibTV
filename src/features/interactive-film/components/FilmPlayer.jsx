import { useEffect, useRef, useState } from 'react';
import { mountFilmPlayer } from '../../../services/interactive-film/player.ts';

export default function FilmPlayer({ manifest, className = '' }) {
  const root = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setError('');
    if (!manifest || !root.current) return;
    let player;
    try {
      player = mountFilmPlayer(root.current, manifest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '播放器加载失败');
    }
    return () => player?.destroy();
  }, [manifest]);
  return (
    <div className={className}>
      <div ref={root} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
