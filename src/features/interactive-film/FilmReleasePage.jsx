import React, { useEffect, useRef, useState } from 'react';
import { loadFilmRelease } from '../../services/interactive-film/publish.ts';
export default function FilmReleasePage({ path }) {
  const id = decodeURIComponent(path.split('/').at(-1));
  const [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [loading, setLoading] = useState(true);
  const root = useRef(null);
  useEffect(() => {
    const abort = new AbortController();
    let player;
    let script;
    setLoading(true);
    setError('');
    loadFilmRelease(id, { signal: abort.signal })
      .then((release) => {
        if (abort.signal.aborted) return;
        script = document.createElement('script');
        script.src = release.runtimeUrl;
        script.integrity = `sha256-${btoa(String.fromCharCode(...release.runtimeSha256.match(/../g).map((pair) => parseInt(pair, 16))))}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (!abort.signal.aborted) {
            try {
              player = window.PenFilmPlayer.mount(root.current, release.manifest);
              setLoading(false);
            } catch (reason) {
              setError(reason.message);
              setLoading(false);
            }
          }
        };
        script.onerror = () => {
          if (!abort.signal.aborted) {
            setError('该版本播放器加载失败，请重试');
            setLoading(false);
          }
        };
        document.head.append(script);
      })
      .catch((reason) => {
        if (!abort.signal.aborted) {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => {
      abort.abort();
      script?.remove();
      player?.destroy();
    };
  }, [id, attempt]);
  return (
    <main className="film-release">
      <div ref={root} className="film-release-player" />
      {loading && (
        <p className="film-release-status" role="status">
          正在加载作品…
        </p>
      )}
      {error && (
        <div className="film-release-status">
          <p role="alert">{error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>重试</button>
        </div>
      )}
    </main>
  );
}
