import { useCallback, useEffect, useState } from 'react';
import { probeVideoMetadata } from '../../../services/media-metadata.ts';

/** Only unresolved video dimensions/duration/size are probed, keyed by the real source URL. */
export function useGeneratorMediaMetadata({
  inputs,
  unresolved = [],
  asset,
  probe = probeVideoMetadata,
}) {
  const [metadata, setMetadata] = useState({});
  const [status, setStatus] = useState({ pending: false, errors: [] });
  const [attempt, setAttempt] = useState(0);
  const jobs = (inputs.videoList || []).flatMap((ref) => {
    const fields = unresolved.filter((item) => item.url === ref.url).map((item) => item.field);
    return fields.some((field) => field !== 'formats')
      ? [{ url: ref.url, needSize: fields.includes('size') }]
      : [];
  });
  const signature = JSON.stringify(jobs);
  useEffect(() => {
    const requests = JSON.parse(signature);
    if (!requests.length) {
      setStatus((current) => ({ ...current, pending: false }));
      return;
    }
    const controller = new AbortController();
    setStatus({ pending: true, errors: [] });
    Promise.allSettled(
      requests.map(async (job) => ({
        url: job.url,
        result: await probe(asset?.(job.url) || job.url, {
          signal: controller.signal,
          needSize: job.needSize,
        }),
      })),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const next = {},
        errors = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          next[result.value.url] = result.value.result.metadata;
          errors.push(...result.value.result.errors);
        } else errors.push('参考素材读取失败');
      }
      // Keep known fields when a retry only tries to fill an unreadable HEAD size.
      setMetadata((current) => {
        const merged = { ...current };
        for (const [url, values] of Object.entries(next))
          merged[url] = { ...current[url], ...values };
        return merged;
      });
      setStatus({ pending: false, errors });
    });
    return () => controller.abort();
  }, [signature, asset, probe, attempt]);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { metadata, ...status, retry };
}
