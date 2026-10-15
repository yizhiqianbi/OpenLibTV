import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGeneratorMediaMetadata } from './useGeneratorMediaMetadata.js';

const options = (url) => ({
  inputs: { videoList: [{ url }] },
  unresolved: [{ url, field: 'duration' }],
});
describe('generator media metadata lifecycle', () => {
  it('cancels a replaced reference and never applies its late result to the next URL', async () => {
    const pending = [];
    const probe = vi.fn(
      (url, config) => new Promise((resolve) => pending.push({ url, config, resolve })),
    );
    const asset = (url) => '/mapped' + url;
    const view = renderHook((props) => useGeneratorMediaMetadata({ ...props, probe, asset }), {
      initialProps: options('/first.mp4'),
    });
    expect(probe.mock.calls[0][0]).toBe('/mapped/first.mp4');
    view.rerender(options('/second.mp4'));
    expect(pending[0].config.signal.aborted).toBe(true);
    await act(async () => pending[0].resolve({ metadata: { durationSec: 99 }, errors: [] }));
    expect(view.result.current.metadata['/first.mp4']).toBeUndefined();
    await act(async () => pending[1].resolve({ metadata: { durationSec: 6 }, errors: [] }));
    expect(view.result.current.metadata['/second.mp4']).toEqual({ durationSec: 6 });
    expect(view.result.current.pending).toBe(false);
  });
  it('retries a failed read while preserving verified fields and cancels on unmount', async () => {
    let signal;
    const probe = vi.fn(async (_url, config) => {
      signal = config.signal;
      return probe.mock.calls.length === 1
        ? { metadata: { durationSec: 6 }, errors: ['素材大小尚未读取'] }
        : { metadata: { byteSize: 100 }, errors: [] };
    });
    const view = renderHook(() => useGeneratorMediaMetadata({ ...options('/video.mp4'), probe }));
    await waitFor(() => expect(view.result.current.errors).toEqual(['素材大小尚未读取']));
    act(() => view.result.current.retry());
    await waitFor(() =>
      expect(view.result.current.metadata['/video.mp4']).toEqual({ durationSec: 6, byteSize: 100 }),
    );
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
