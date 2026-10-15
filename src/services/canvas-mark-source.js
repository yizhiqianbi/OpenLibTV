const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export class CanvasMarkSourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = code === 'CANCELLED' ? 'AbortError' : 'CanvasMarkSourceError';
    this.code = code;
  }
}

/** The source token grammar excludes colon and closing brace, but accepts numeric API IDs. */
export function validCanvasMarkResponseId(id) {
  return (typeof id === 'string' && id.length > 0 && !/[:}]/.test(id)) || (finite(id) && id !== 0);
}

/** Strict shape/finite checks are local defensive guards; no labels or boxes are invented. */
export function normalizeCanvasMarkResponse(response) {
  if (
    !record(response) ||
    !validCanvasMarkResponseId(response.id) ||
    !Array.isArray(response.suggestions) ||
    response.suggestions.length === 0 ||
    !response.suggestions.every(
      (item) =>
        record(item) &&
        typeof item.label === 'string' &&
        record(item.bbox) &&
        ['x', 'y', 'width', 'height'].every((key) => finite(item.bbox[key])) &&
        item.bbox.width >= 0 &&
        item.bbox.height >= 0,
    )
  )
    return null;
  return {
    ...response,
    suggestions: response.suggestions.map((item) => ({ ...item, bbox: { ...item.bbox } })),
  };
}

const cancelled = () => new CanvasMarkSourceError('CANCELLED', '元素识别已取消');
const validRequest = (request) =>
  record(request) &&
  typeof request.id === 'string' &&
  request.id.length > 0 &&
  typeof request.image_base64 === 'string' &&
  request.image_base64.length > 0 &&
  !request.image_base64.startsWith('data:') &&
  Array.isArray(request.point) &&
  request.point.length === 2 &&
  request.point.every(finite) &&
  typeof request.lang === 'string' &&
  request.lang.length > 0;

/** A caller supplies recognition. This module has no HTTP, cookie, encoding or generation writer. */
export function createCanvasMarkSource(adapter = {}) {
  const read = adapter?.markClickSuggest;
  return Object.freeze({
    available: typeof read === 'function',
    async markClickSuggest(request, { signal } = {}) {
      if (signal?.aborted) throw cancelled();
      if (typeof read !== 'function')
        throw new CanvasMarkSourceError('UNAVAILABLE', '元素识别服务未连接');
      if (!validRequest(request))
        throw new CanvasMarkSourceError('INVALID_REQUEST', '元素识别请求无效');
      const payload = {
        id: request.id,
        image_base64: request.image_base64,
        point: [...request.point],
        lang: request.lang,
      };
      const response = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve(value);
        };
        const abort = () => finish(cancelled());
        signal?.addEventListener('abort', abort, { once: true });
        Promise.resolve()
          .then(() => {
            if (signal?.aborted) throw cancelled();
            return read.call(adapter, payload, { signal });
          })
          .then((value) => finish(null, value), finish);
      });
      if (signal?.aborted) throw cancelled();
      const normalized = normalizeCanvasMarkResponse(response);
      if (!normalized)
        throw new CanvasMarkSourceError('INVALID_RESPONSE', '未识别出任何内容，请重新尝试');
      return normalized;
    },
  });
}

export const canvasMarkSource = createCanvasMarkSource();
