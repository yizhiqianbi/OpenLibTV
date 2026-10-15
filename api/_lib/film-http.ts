import type { IncomingMessage, ServerResponse } from 'node:http';
import { FilmPublishError, MAX_JSON_BYTES } from './film-publish.js';

export type FilmRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};
export async function readFilmBody(request: FilmRequest): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new FilmPublishError('INVALID_BODY', '需要 JSON 请求', 415);
  if (Number(request.headers['content-length']) > MAX_JSON_BYTES * 2)
    throw new FilmPublishError('INVALID_BODY', '请求内容过大', 413);
  let value = request.body;
  if (value === undefined) {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_JSON_BYTES * 2)
        throw new FilmPublishError('INVALID_BODY', '请求内容过大', 413);
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new FilmPublishError('INVALID_BODY', '请求数据无效');
    }
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > MAX_JSON_BYTES * 2
  )
    throw new FilmPublishError('INVALID_BODY', '请求数据无效');
  return value as Record<string, unknown>;
}
export function checkFilmMethod(request: FilmRequest, method: string) {
  if (request.method !== method)
    throw new FilmPublishError('METHOD_NOT_ALLOWED', '请求方法不可用', 405);
  if (method === 'POST' && request.headers.origin) {
    let origin: URL;
    try {
      origin = new URL(request.headers.origin);
    } catch {
      throw new FilmPublishError('INVALID_ORIGIN', '请求来源无效', 403);
    }
    if (origin.host !== request.headers.host)
      throw new FilmPublishError('INVALID_ORIGIN', '请求来源无效', 403);
  }
}
export async function filmHttp(
  response: ServerResponse,
  run: () => Promise<unknown>,
  cache = false,
) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  try {
    const value = await run();
    if (cache) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.statusCode = 200;
    response.end(JSON.stringify(value));
  } catch (error) {
    const known = error instanceof FilmPublishError;
    response.statusCode = known ? error.status : 503;
    response.end(
      JSON.stringify({
        code: known ? error.code : 'PUBLISH_UNAVAILABLE',
        message: known ? error.message : '发布服务暂时不可用，请稍后重试',
      }),
    );
  }
}
