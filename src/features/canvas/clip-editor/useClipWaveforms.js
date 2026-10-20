import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeWaveformPeaks } from './domain/waveform-model.js';
import { extractWaveformFromUrl } from './waveform-service.js';

const EMPTY = [];

function directWaveform(record) {
  const value = record?.waveform || record?.waveformPeaks || record?.metadata?.waveform;
  const peaks = normalizeWaveformPeaks(value);
  return peaks.length ? { status: 'ready', peaks, duration: Number(value?.duration) || 0 } : null;
}

function sourceSignature(clips, mediaBySourceId, selectedClipIds) {
  const selected = new Set(selectedClipIds || []);
  return clips
    .filter((clip) => {
      if (clip.type === 'audio') return true;
      const source = mediaBySourceId?.get?.(clip.sourceNodeId);
      return selected.has(clip.id) && source?.kind === 'video';
    })
    .map((clip) => {
      const source = mediaBySourceId?.get?.(clip.sourceNodeId);
      const direct = directWaveform(source);
      return [clip.type, clip.sourceNodeId, source?.url || '', direct?.peaks?.length || 0].join(
        ':',
      );
    })
    .join('|');
}

function collectSourceRecords(clips, mediaBySourceId, selectedClipIds) {
  const selected = new Set(selectedClipIds || []);
  const records = [];
  for (const clip of clips || []) {
    const source = mediaBySourceId?.get?.(clip.sourceNodeId);
    const isSelectedVideo =
      clip.type !== 'audio' && selected.has(clip.id) && source?.kind === 'video';
    if (
      (clip.type !== 'audio' && !isSelectedVideo) ||
      records.some((item) => item.sourceNodeId === clip.sourceNodeId)
    )
      continue;
    const sourceNodeId = clip.sourceNodeId;
    records.push({
      sourceNodeId,
      source,
      kind: clip.type,
      direct: directWaveform(source),
      url: source?.url || '',
    });
  }
  return records;
}

/**
 * Loads real audio peaks for the visible audio tracks. Waveforms are view
 * state: they never enter the document or history, and an unsupported/CORS
 * source leaves the clip editable without fabricating a sample strip.
 */
export function useClipWaveforms(clips, mediaBySourceId, selectedClipIds = EMPTY) {
  const cache = useRef(new Map());
  const [waveforms, setWaveforms] = useState(() => new Map());
  const signature = useMemo(
    () => sourceSignature(clips || [], mediaBySourceId, selectedClipIds),
    [clips, mediaBySourceId, selectedClipIds],
  );
  const records = useMemo(
    () => collectSourceRecords(clips || [], mediaBySourceId, selectedClipIds),
    [clips, mediaBySourceId, selectedClipIds],
  );
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const next = new Map();
    const jobs = [];
    for (const record of recordsRef.current) {
      const { sourceNodeId, direct, url } = record;
      if (direct) {
        next.set(sourceNodeId, direct);
        continue;
      }
      const cached = url ? cache.current.get(url) : null;
      if (cached) {
        next.set(sourceNodeId, cached);
        continue;
      }
      if (url) {
        next.set(sourceNodeId, { status: 'loading', peaks: [] });
        jobs.push({ sourceNodeId, url });
      }
    }
    setWaveforms(next);
    for (const { sourceNodeId, url } of jobs) {
      extractWaveformFromUrl(url, { signal: controller.signal })
        .then((result) => {
          if (disposed) return;
          const value = result?.status === 'ready' ? result : { ...result, peaks: [] };
          cache.current.set(url, value);
          setWaveforms((current) => {
            if (current.get(sourceNodeId)?.url === url) return current;
            const updated = new Map(current);
            updated.set(sourceNodeId, { ...value, url });
            return updated;
          });
        })
        .catch((error) => {
          if (disposed || error?.name === 'AbortError') return;
          const value = { status: 'error', peaks: [], message: error?.message || '波形读取失败' };
          cache.current.set(url, value);
          setWaveforms((current) => {
            if (current.get(sourceNodeId)?.url === url) return current;
            const updated = new Map(current);
            updated.set(sourceNodeId, { ...value, url });
            return updated;
          });
        });
    }
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [signature]);

  return waveforms;
}
