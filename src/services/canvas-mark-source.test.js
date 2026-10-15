// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasMarkSourceError,
  canvasMarkSource,
  createCanvasMarkSource,
  normalizeCanvasMarkResponse,
} from './canvas-mark-source.js';

const request = { id: 'image-node', image_base64: 'iVBORw0KGgo=', point: [0.2, 0.8], lang: 'zh' };
const response = {
  id: 'recognition',
  suggestions: [{ label: '服务返回元素', bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } }],
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('canvas mark injectable recognition reader', () => {
  it('defaults to an explicit unavailable error without network or invented suggestions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(canvasMarkSource.available).toBe(false);
      expect(Object.isFrozen(canvasMarkSource)).toBe(true);
      await expect(canvasMarkSource.markClickSuggest(request)).rejects.toMatchObject({
        name: 'CanvasMarkSourceError',
        code: 'UNAVAILABLE',
        message: '元素识别服务未连接',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('passes the exact original payload and a separate AbortSignal to a legal caller adapter', async () => {
    const markClickSuggest = vi.fn().mockResolvedValue(response),
      controller = new AbortController(),
      source = createCanvasMarkSource({ markClickSuggest });
    expect(source.available).toBe(true);
    const result = await source.markClickSuggest(
      { ...request, point: [-0.1, 1.2], token: 'never-forward-this-field' },
      { signal: controller.signal },
    );
    expect(markClickSuggest).toHaveBeenCalledExactlyOnceWith(
      { ...request, point: [-0.1, 1.2] },
      { signal: controller.signal },
    );
    expect(result).toEqual(response);
    expect(result).not.toBe(response);
    expect(result.suggestions[0].bbox).not.toBe(response.suggestions[0].bbox);
  });

  it('keeps adapter method ownership and genuine returned metadata', async () => {
    const adapter = {
      marker: 'adapter-context',
      markClickSuggest() {
        return {
          ...response,
          source: this.marker,
          suggestions: [{ ...response.suggestions[0], score: 0.97 }],
        };
      },
    };
    expect(await createCanvasMarkSource(adapter).markClickSuggest(request)).toMatchObject({
      source: 'adapter-context',
      suggestions: [{ score: 0.97 }],
    });
  });

  it.each([
    { ...request, id: '' },
    { ...request, image_base64: '' },
    { ...request, image_base64: 'data:image/png;base64,iVBORw0KGgo=' },
    { ...request, point: [0, Infinity] },
    { ...request, point: [0] },
    { ...request, lang: '' },
  ])('rejects damaged request before calling the adapter: %j', async (damaged) => {
    const read = vi.fn();
    await expect(
      createCanvasMarkSource({ markClickSuggest: read }).markClickSuggest(damaged),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: '', suggestions: response.suggestions },
    { id: 0, suggestions: response.suggestions },
    { id: 'bad:id', suggestions: response.suggestions },
    { id: 'bad}id', suggestions: response.suggestions },
    { id: 'ok', suggestions: [] },
    { id: 'ok', suggestions: [{ label: 'label' }] },
    { id: 'ok', suggestions: [{ label: 7, bbox: response.suggestions[0].bbox }] },
    {
      id: 'ok',
      suggestions: [{ label: 'label', bbox: { x: NaN, y: 0, width: 1, height: 1 } }],
    },
    {
      id: 'ok',
      suggestions: [{ label: 'label', bbox: { x: 0, y: 0, width: -1, height: 1 } }],
    },
  ])('rejects a damaged recognition without fake fallback: %j', async (damaged) => {
    expect(normalizeCanvasMarkResponse(damaged)).toBeNull();
    await expect(
      createCanvasMarkSource({ markClickSuggest: async () => damaged }).markClickSuggest(request),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', message: '未识别出任何内容，请重新尝试' });
  });

  it('accepts finite nonzero numeric IDs and finite source boxes without adding a clamp', () => {
    const numeric = {
      id: 7,
      suggestions: [{ label: '', bbox: { x: -0.1, y: 1.2, width: 1.5, height: 0 } }],
    };
    expect(normalizeCanvasMarkResponse(numeric)).toEqual(numeric);
  });

  it('rejects an already aborted call before invoking the adapter', async () => {
    const controller = new AbortController(),
      read = vi.fn();
    controller.abort();
    await expect(
      createCanvasMarkSource({ markClickSuggest: read }).markClickSuggest(request, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError', code: 'CANCELLED' });
    expect(read).not.toHaveBeenCalled();
  });

  it('settles cancellation promptly even when an adapter ignores the signal, without leaking into a new call', async () => {
    const first = deferred(),
      second = deferred(),
      read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      source = createCanvasMarkSource({ markClickSuggest: read }),
      controller = new AbortController(),
      old = source.markClickSuggest(request, { signal: controller.signal });
    await Promise.resolve();
    const cancelledResult = expect(old).rejects.toMatchObject({ code: 'CANCELLED' });
    controller.abort();
    await cancelledResult;
    const current = source.markClickSuggest(request);
    first.resolve({ ...response, id: 'stale' });
    second.resolve({ ...response, id: 'current' });
    expect(await current).toMatchObject({ id: 'current' });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('removes the cancellation listener after success and preserves genuine adapter failures', async () => {
    const controller = new AbortController(),
      remove = vi.spyOn(controller.signal, 'removeEventListener'),
      source = createCanvasMarkSource({ markClickSuggest: async () => response });
    await source.markClickSuggest(request, { signal: controller.signal });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    const failure = new Error('运营识别读取失败');
    await expect(
      createCanvasMarkSource({ markClickSuggest: () => Promise.reject(failure) }).markClickSuggest(
        request,
      ),
    ).rejects.toBe(failure);
    expect(new CanvasMarkSourceError('CANCELLED', 'cancel')).toBeInstanceOf(Error);
  });
});
