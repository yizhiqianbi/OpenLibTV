import { useCallback, useEffect, useState } from 'react';
import { createFilmMediaUrls } from '../../../services/interactive-film/media.ts';

/** Each mounted preview owns a cancellable Blob URL lease, including late results. */
export function useFilmGraphMedia(media, documentId) {
  const [result, setResult] = useState(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!media) return;
    const controller = new AbortController();
    let dispose;
    createFilmMediaUrls([media], { signal: controller.signal })
      .then((lease) => {
        dispose = lease.dispose;
        if (controller.signal.aborted) dispose();
        else
          setResult({
            media,
            documentId,
            attempt,
            url: lease.urls[media.id],
            error: '',
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            media,
            documentId,
            attempt,
            url: '',
            error: error.message || '素材读取失败',
          });
      });
    return () => {
      controller.abort();
      dispose?.();
    };
  }, [media, documentId, attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current =
    result?.media === media && result?.documentId === documentId && result?.attempt === attempt
      ? result
      : null;
  return {
    url: current?.url || '',
    error: current?.error || '',
    loading: Boolean(media && !current),
    retry,
  };
}
