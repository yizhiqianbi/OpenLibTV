import type { IncomingMessage, ServerResponse } from 'node:http';

export type XumengRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export class XumengProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = 'XumengProxyError';
  }
}

const json = (value: unknown) => JSON.stringify(value);
function fail(response: ServerResponse, error: XumengProxyError) {
  response.statusCode = error.status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(json({ error: { code: error.code, message: error.message } }));
}

function backendOrigin() {
  const configured = process.env.XUMENG_BACKEND_URL?.trim();
  if (!configured) throw new XumengProxyError('XUMENG_NOT_CONFIGURED', '叙梦服务尚未配置', 503);
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new XumengProxyError('XUMENG_CONFIG_INVALID', '叙梦后端地址无效', 503);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new XumengProxyError('XUMENG_CONFIG_INVALID', '叙梦后端地址必须是 HTTPS 根地址', 503);
  const protocol = process.env.XUMENG_BACKEND_PROTOCOL?.trim() || 'generic';
  if (protocol !== 'generic' && protocol !== 'dzmm')
    throw new XumengProxyError('XUMENG_CONFIG_INVALID', '叙梦后端协议无效', 503);
  return url;
}

function segments(request: XumengRequest) {
  const raw = request.query?.path;
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('/') : [];
  if (
    !values.length ||
    values.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')
  )
    throw new XumengProxyError('INVALID_PATH', '叙梦接口路径无效', 400);
  return values;
}

function upstreamPath(parts: string[]) {
  const dzmm = process.env.XUMENG_BACKEND_PROTOCOL === 'dzmm';
  const [root, id, action] = parts;
  if (root === 'chat' && parts.length === 1) return dzmm ? '/api/dzmm/chat' : '/chat';
  if (root === 'memory' && parts.length === 1) return dzmm ? '/api/dzmm/memory' : '/memory';
  if (root === 'health' && parts.length === 1) return dzmm ? '/api/dzmm/chat' : '/health';
  if (root === 'characters' || root === 'sessions') {
    const collection = root === 'characters' ? 'characters' : dzmm ? 'conversations' : 'sessions';
    const base = dzmm ? `/api/backend/v1/${collection}` : `/${collection}`;
    if (parts.length === 1) return base;
    if (
      ID.test(id) &&
      (!action || action === 'restore' || (action === 'export' && root === 'characters'))
    ) {
      return `${base}/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
    }
  }
  throw new XumengProxyError('NOT_FOUND', '叙梦接口不存在', 404);
}

function adaptBody(body: Buffer | undefined): Buffer | undefined {
  if (!body || process.env.XUMENG_BACKEND_PROTOCOL !== 'dzmm') return body;
  try {
    const value = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    if (!value.character || !Array.isArray(value.messages)) return body;
    return Buffer.from(
      JSON.stringify({
        character: value.character,
        messages: value.messages,
        model: typeof value.model === 'string' ? value.model : 'balanced',
        maxTokens: Number.isInteger(value.maxTokens) ? value.maxTokens : 2048,
      }),
    );
  } catch {
    return body;
  }
}

async function readBody(request: XumengRequest): Promise<Buffer | undefined> {
  if (!MUTATING.has(request.method || '')) return undefined;
  if (request.body !== undefined) {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    const body = Buffer.from(raw || '');
    if (body.byteLength > MAX_BODY_BYTES)
      throw new XumengProxyError('BODY_TOO_LARGE', '请求内容不能超过 5 MB', 413);
    return body;
  }
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new XumengProxyError('BODY_TOO_LARGE', '请求内容不能超过 5 MB', 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const item = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += item.byteLength;
    if (size > MAX_BODY_BYTES)
      throw new XumengProxyError('BODY_TOO_LARGE', '请求内容不能超过 5 MB', 413);
    chunks.push(item);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function assertOrigin(request: XumengRequest) {
  if (!MUTATING.has(request.method || '')) return;
  const origin = request.headers.origin;
  const host = request.headers.host;
  const sameOrigin =
    origin === `https://${host}` ||
    (process.env.NODE_ENV !== 'production' && origin === `http://${host}`);
  if (!host || (origin && !sameOrigin) || request.headers['sec-fetch-site'] === 'cross-site')
    throw new XumengProxyError('INVALID_ORIGIN', '请求来源不被允许', 403);
}

function copyRequestHeaders(request: XumengRequest) {
  const headers = new Headers();
  for (const name of ['content-type', 'if-match', 'if-none-match', 'range']) {
    const value = request.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) => /^(?:dzmm|xumeng)_session=[a-f0-9]{32,128}$/.test(part));
  if (cookie?.length) headers.set('cookie', cookie.join('; '));
  return headers;
}

function copyResponseHeaders(upstream: Response, response: ServerResponse) {
  for (const name of [
    'content-type',
    'cache-control',
    'etag',
    'retry-after',
    'content-range',
    'accept-ranges',
    'content-length',
  ]) {
    const value = upstream.headers.get(name);
    if (value) response.setHeader(name, value);
  }
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!upstream.headers.has('cache-control')) response.setHeader('Cache-Control', 'no-store');
  const getSetCookie = (upstream.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  const cookies = getSetCookie?.call(upstream.headers);
  if (cookies?.length) response.setHeader('Set-Cookie', cookies);
}

async function pipeBody(upstream: Response, response: ServerResponse) {
  if (!upstream.body) return response.end();
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      response.write(Buffer.from(chunk.value));
    }
  } finally {
    reader.releaseLock();
    response.end();
  }
}

export async function handleXumengProxy(request: XumengRequest, response: ServerResponse) {
  try {
    assertOrigin(request);
    const parts = segments(request);
    const target = new URL(upstreamPath(parts), backendOrigin());
    const query = request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
    target.search = query;
    const body = adaptBody(await readBody(request));
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.method === 'POST' && parts[0] === 'chat' ? 120_000 : 30_000,
    );
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method || 'GET',
        headers: copyRequestHeaders(request),
        ...(body ? { body: body as unknown as BodyInit } : {}),
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new XumengProxyError(
        'UPSTREAM_UNAVAILABLE',
        error instanceof Error && error.name === 'AbortError'
          ? '叙梦服务响应超时'
          : '叙梦后端暂时无法连接',
        503,
      );
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      clearTimeout(timeout);
      await upstream.body?.cancel();
      throw new XumengProxyError('UPSTREAM_REDIRECT', '叙梦服务返回了意外跳转', 502);
    }
    response.statusCode = upstream.status;
    copyResponseHeaders(upstream, response);
    await pipeBody(upstream, response);
    clearTimeout(timeout);
  } catch (error) {
    if (response.writableEnded) return;
    fail(
      response,
      error instanceof XumengProxyError
        ? error
        : new XumengProxyError('UPSTREAM_UNAVAILABLE', '叙梦服务暂时不可用', 503),
    );
  }
}
