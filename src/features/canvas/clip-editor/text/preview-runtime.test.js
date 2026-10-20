import { describe, expect, it, vi } from 'vitest';
import { createTextOverlayHtml } from './html-document.js';
import { applyTextOverlayPatches } from './html-patches.js';
import { prepareSubtitlePreviewHtml, seekSubtitlePreview } from './subtitle-preview-document.js';
import {
  prepareTextPreviewHtml,
  seekTextPreview,
  TextOverlayPreviewRuntime,
} from './preview-runtime.js';
const html = (text = '文字', extra = []) =>
  createTextOverlayHtml({
    compositionId: 'ordinary-text',
    width: 1920,
    height: 1080,
    duration: 10,
    cues: [{ cueId: 'one', start: 1, duration: 3, text, trackIndex: 0 }, ...extra],
  });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const host = () => {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ width: 480, height: 270 });
  document.body.appendChild(node);
  return node;
};
const read = (value) => new DOMParser().parseFromString(value, 'text/html');
describe('ordinary HTML preview ownership and real seek', () => {
  it.each([true, false])(
    'requires positive duration only when the caller protocol requests it (%s)',
    async (requireDuration) => {
      const source =
        '<html><body data-width="320" data-height="180"><p data-libtv-cue-id="old" data-start="0" data-duration="2"><span data-libtv-text>旧字幕</span></p></body></html>';
      const status = vi.fn(),
        node = host();
      const load = vi.fn(async (frame, value) => {
        const doc = read(value);
        Object.defineProperty(frame, 'contentDocument', { configurable: true, value: doc });
        return doc;
      });
      const runtime = new TextOverlayPreviewRuntime(node, status, {
        prepare: prepareSubtitlePreviewHtml,
        seek: seekSubtitlePreview,
        requireDuration,
        load,
        delay: async () => {},
      });
      runtime.render({ overlayHtmlInline: source }, 0.5);
      await vi.waitFor(() =>
        expect(status).toHaveBeenLastCalledWith(
          requireDuration
            ? expect.objectContaining({ ready: false, error: '文字composition总时长无效' })
            : expect.objectContaining({ ready: true }),
        ),
      );
      if (!requireDuration)
        expect(
          runtime.frames[runtime.active].contentDocument.querySelector('[data-libtv-cue-id]').style
            .visibility,
        ).toBe('visible');
      runtime.dispose();
      node.remove();
    },
  );
  it('keeps source scripts inert, removes active entry points and installs closed CSP only in the preview clone', () => {
    const original = html().replace(
      '</body>',
      '<script>window.bad=1</script><img onerror="window.bad=2" src="https://example.test/x"><iframe src="https://example.test"></iframe></body>',
    );
    const prepared = prepareTextPreviewHtml(original),
      document = read(prepared.html);
    expect(prepared.scriptUnsupported).toBe(true);
    expect(document.querySelector('script,iframe,[onerror]')).toBeNull();
    expect(document.querySelector('meta[http-equiv]').content).toContain("script-src 'none'");
    expect(original).toContain('window.bad=1');
    expect(window.bad).toBeUndefined();
  });
  it('seeks actual cue visibility at source epsilon boundaries and honors track/individual hidden state', () => {
    const document = read(html()),
      cue = document.querySelector('[data-libtv-cue-id]');
    seekTextPreview(document, 0.998);
    expect(cue.style.visibility).toBe('hidden');
    seekTextPreview(document, 1);
    expect(cue.style.visibility).toBe('visible');
    seekTextPreview(document, 4);
    expect(cue.style.visibility).toBe('hidden');
    cue.setAttribute('data-libtv-track-hidden', 'true');
    seekTextPreview(document, 2);
    expect(cue.style.opacity).toBe('0');
    cue.removeAttribute('data-libtv-track-hidden');
    cue.setAttribute('data-libtv-hidden', 'true');
    seekTextPreview(document, 2);
    expect(cue.style.opacity).toBe('0');
  });
  it('waits for the other frame, seeks latest time, updates text/styles without reloading and rejects late buffers', async () => {
    const loads = [],
      load = vi.fn((frame, value, signal) => {
        const pending = deferred();
        loads.push({ frame, value, signal, ...pending });
        return pending.promise;
      });
    const status = vi.fn(),
      node = host(),
      runtime = new TextOverlayPreviewRuntime(node, status, { load });
    runtime.render({ overlayHtmlInline: html() }, 0);
    runtime.render({ overlayHtmlInline: html() }, 2);
    const first = loads[0],
      document = read(first.value);
    Object.defineProperty(first.frame, 'contentDocument', { configurable: true, value: document });
    first.resolve(document);
    await tick();
    expect(first.frame.style.visibility).toBe('visible');
    expect(document.querySelector('[data-libtv-cue-id]').style.visibility).toBe('visible');
    expect(first.frame.style.transform).toBe('scale(0.25)');
    const edited = applyTextOverlayPatches(html(), [
      { kind: 'text', cueId: 'one', text: '最后输入' },
      {
        kind: 'styleVar',
        scope: { type: 'cue', cueId: 'one' },
        vars: { '--libtvSubtitleFontSize': '45.125px' },
      },
    ]).html;
    runtime.render({ overlayHtmlInline: edited }, 2);
    expect(load).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-libtv-text]').textContent).toBe('最后输入');
    expect(
      document
        .querySelector('[data-libtv-cue-id]')
        .style.getPropertyValue('--libtvSubtitleFontSize'),
    ).toBe('45.125px');
    const two = html('new', [
      { cueId: 'two', text: 'second', start: 5, duration: 2, trackIndex: 0 },
    ]);
    runtime.render({ overlayHtmlInline: two }, 5.5);
    expect(first.frame.style.visibility).toBe('visible');
    runtime.render(
      {
        overlayHtmlInline: html('newest', [
          { cueId: 'three', text: 'third', start: 6, duration: 1, trackIndex: 0 },
        ]),
      },
      6.5,
    );
    expect(loads[1].signal.aborted).toBe(true);
    loads[1].resolve(read(loads[1].value));
    await tick();
    expect(runtime.active).toBe(0);
    const newest = loads[2];
    newest.resolve(read(newest.value));
    await tick();
    expect(runtime.active).toBe(1);
    expect(first.frame.style.visibility).toBe('hidden');
    runtime.dispose();
    expect(node.querySelectorAll('iframe')).toHaveLength(0);
    node.remove();
  });
  it('reports exhausted preparation and retries explicitly; disposal cancels a waiting build', async () => {
    const status = vi.fn(),
      node = host(),
      load = vi.fn().mockRejectedValue(new Error('image unavailable'));
    const runtime = new TextOverlayPreviewRuntime(node, status, { load, delay: async () => {} });
    runtime.render({ overlayHtmlInline: html() }, 2);
    await tick();
    await tick();
    expect(load).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenLastCalledWith({ ready: false, error: 'image unavailable' });
    const pending = deferred();
    load.mockImplementation((_frame, _html, signal) => {
      expect(signal.aborted).toBe(false);
      return pending.promise;
    });
    runtime.retry();
    const signal = runtime.abort.signal;
    runtime.dispose();
    expect(signal.aborted).toBe(true);
    const count = status.mock.calls.length;
    pending.resolve(read(html()));
    await tick();
    expect(status).toHaveBeenCalledTimes(count);
    node.remove();
  });
});
