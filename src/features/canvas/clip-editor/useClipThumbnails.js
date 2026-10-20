import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeThumbnailFrames } from './domain/thumbnail-model.js';
import { extractVideoThumbnailFrames } from './thumbnail-service.js';

function directFrames(source) {
  const frames = normalizeThumbnailFrames(
    source?.thumbnailFrames || source?.metadata?.thumbnailFrames,
  );
  return frames.length ? { status: 'ready', frames } : null;
}

function collectRecords(clips, mediaBySourceId) {
  return (clips || [])
    .filter((clip) => clip.type !== 'audio')
    .map((clip) => {
      const source = mediaBySourceId?.get?.(clip.sourceNodeId);
      return {
        clip,
        source,
        direct: directFrames(source),
        url: source?.url || '',
      };
    });
}

function signatureFor(clips, mediaBySourceId) {
  return collectRecords(clips, mediaBySourceId)
    .map(({ clip, source, direct, url }) =>
      [
        clip.id,
        url,
        clip.sourceOffset,
        clip.sourceDuration,
        clip.duration,
        clip.speed,
        direct?.frames.length || 0,
      ].join(':'),
    )
    .join('|');
}

function cacheKey(record) {
  const { clip, url } = record;
  return [url, clip.sourceOffset, clip.sourceDuration, clip.duration, clip.speed].join('|');
}

/** View-only real video frame strips with cancellation and poster fallback. */
export function useClipThumbnails(clips, mediaBySourceId) {
  const cache = useRef(new Map());
  const [thumbnails, setThumbnails] = useState(() => new Map());
  const signature = useMemo(
    () => signatureFor(clips || [], mediaBySourceId),
    [clips, mediaBySourceId],
  );
  const records = useMemo(
    () => collectRecords(clips || [], mediaBySourceId),
    [clips, mediaBySourceId],
  );
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const next = new Map();
    const jobs = [];
    for (const record of recordsRef.current) {
      const { clip, direct, url } = record;
      if (direct) {
        next.set(clip.id, direct);
        continue;
      }
      const key = cacheKey(record);
      const cached = url ? cache.current.get(key) : null;
      if (cached) {
        next.set(clip.id, cached);
        continue;
      }
      if (url) {
        next.set(clip.id, { status: 'loading', frames: [] });
        jobs.push({ clip, key, url });
      }
    }
    setThumbnails(next);
    for (const { clip, key, url } of jobs) {
      extractVideoThumbnailFrames(url, clip, { signal: controller.signal })
        .then((result) => {
          if (disposed) return;
          const value = result?.status === 'ready' ? result : { ...result, frames: [] };
          cache.current.set(key, value);
          setThumbnails((current) => {
            const updated = new Map(current);
            updated.set(clip.id, value);
            return updated;
          });
        })
        .catch((error) => {
          if (disposed || error?.name === 'AbortError') return;
          const value = {
            status: 'error',
            frames: [],
            message: error?.message || '视频帧读取失败',
          };
          cache.current.set(key, value);
          setThumbnails((current) => {
            const updated = new Map(current);
            updated.set(clip.id, value);
            return updated;
          });
        });
    }
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [signature]);

  return thumbnails;
}
