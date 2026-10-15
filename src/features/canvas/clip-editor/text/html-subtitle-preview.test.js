import { describe, expect, it, vi } from 'vitest';
import { HtmlSubtitlePreviewRuntime } from './html-subtitle-preview.js';
import { TextOverlayPreviewRuntime } from './preview-runtime.js';
import { createSubtitleHtml } from './html-document.js';
import { describeClipTimelinePlayback } from '../domain/playback-model.js';
const clip = (id, startTime = 0) => ({
  id,
  sourceNodeId: 'video',
  type: 'video',
  zIndex: 0,
  startTime,
  sourceOffset: 10,
  duration: 2,
  sourceDuration: 20,
  speed: 2,
  width: 1920,
  height: 1080,
});
const html = (extra = []) =>
  createSubtitleHtml({
    compositionId: 'source',
    width: 1920,
    height: 1080,
    duration: 20,
    cues: [
      { cueId: 'one', clipId: 'a', text: '源时间字幕', start: 11, duration: 1, trackIndex: 0 },
      ...extra,
    ],
  });
const output = { width: 1920, height: 1080 };
const read = (text) => new DOMParser().parseFromString(text, 'text/html');
function setup(load) {
  const host = document.createElement('div');
  document.body.append(host);
  const status = vi.fn();
  const runtime = new HtmlSubtitlePreviewRuntime(host, status, {
    createRuntime: (node, onStatus, options) => {
      node.getBoundingClientRect = () => ({ width: 480, height: 270 });
      return new TextOverlayPreviewRuntime(node, onStatus, {
        ...options,
        load:
          load ||
          (async (frame, value) => {
            const document = read(value);
            Object.defineProperty(frame, 'contentDocument', {
              configurable: true,
              value: document,
            });
            return document;
          }),
      });
    },
  });
  return {
    host,
    runtime,
    status,
    close: () => {
      runtime.dispose();
      host.remove();
    },
  };
}
describe('HTML subtitle source-clock preview buffers', () => {
  it('drives real shared seek at source time and waits for decoded/loaded buffers before ready', async () => {
    const { host, runtime, close } = setup();
    const timeline = { clips: [clip('a')], totalDuration: 2, videoTrackCount: 1 };
    runtime.render(
      [{ key: 'layer', nodeId: 'video', html: html() }],
      timeline,
      0.75,
      describeClipTimelinePlayback(timeline, 0.75),
      output,
    );
    await runtime.ready();
    const frame = host.querySelector('iframe');
    expect(frame.title).toBe('字幕HTML预览');
    expect(frame.contentDocument.querySelector('[data-libtv-cue-id="one"]').style.visibility).toBe(
      'visible',
    );
    runtime.render(
      [{ key: 'layer', nodeId: 'video', html: html() }],
      timeline,
      1.1,
      describeClipTimelinePlayback(timeline, 1.1),
      output,
    );
    expect(frame.contentDocument.querySelector('[data-libtv-cue-id="one"]').style.visibility).toBe(
      'hidden',
    );
    close();
  });
  it('splits caption tracks around the overlay group and avoids creating buffers for the full future timeline', async () => {
    const { host, runtime, close } = setup();
    const timeline = {
      clips: Array.from({ length: 100 }, (_, index) =>
        clip(index ? `future-${index}` : 'a', index * 4),
      ),
      totalDuration: 400,
      videoTrackCount: 1,
    };
    const value = html([
      { cueId: 'two', clipId: 'a', text: '第二轨', start: 11, duration: 1, trackIndex: 1 },
    ]);
    runtime.render(
      [{ key: 'layer', nodeId: 'video', html: value }],
      timeline,
      0.75,
      describeClipTimelinePlayback(timeline, 0.75),
      output,
      { groupAnchor: 1, trackIndexes: [0, 1] },
    );
    await runtime.ready();
    expect(host.querySelectorAll('iframe')).toHaveLength(2);
    const wrappers = [...host.children];
    expect(wrappers.map((node) => node.style.zIndex)).toEqual(['110', '107']);
    expect(
      wrappers[0].querySelector('iframe').contentDocument.querySelector('[data-libtv-cue-id="two"]')
        .style.visibility,
    ).toBe('hidden');
    expect(
      wrappers[1].querySelector('iframe').contentDocument.querySelector('[data-libtv-cue-id="one"]')
        .style.visibility,
    ).toBe('hidden');
    close();
  });
  it('cancels readiness and ignores late frame completion after disposal', async () => {
    let finish;
    const { host, runtime, status, close } = setup(
      (_frame, value) =>
        new Promise((resolve) => {
          finish = () => resolve(read(value));
        }),
    );
    const timeline = { clips: [clip('a')], totalDuration: 2, videoTrackCount: 1 };
    runtime.render(
      [{ key: 'layer', nodeId: 'video', html: html() }],
      timeline,
      0.75,
      describeClipTimelinePlayback(timeline, 0.75),
      output,
    );
    const abort = new AbortController(),
      waiting = runtime.ready(abort.signal);
    abort.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    close();
    const calls = status.mock.calls.length;
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(host.children).toHaveLength(0);
    expect(status).toHaveBeenCalledTimes(calls);
  });
});
