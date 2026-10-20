import type { IncomingMessage, ServerResponse } from 'node:http';

/** A narrow proxy boundary for the operator-owned LibTV API. */
export type LibTvRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
};

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SEGMENT = /^[A-Za-z0-9_.-]+$/;
const DEFAULT_TIMEOUT = 30_000;
const STREAM_TIMEOUT = 180_000;
const UPLOAD_TIMEOUT = 120_000;

export class LibTvProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 503,
  ) {
    super(message);
    this.name = 'LibTvProxyError';
  }
}

interface Route {
  timeout: number;
  stream?: boolean;
}

const json = (value: unknown) => JSON.stringify(value);

function fail(response: ServerResponse, error: LibTvProxyError) {
  if (response.writableEnded) return;
  response.statusCode = error.status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (error.status === 405) response.setHeader('Allow', 'GET, POST, PATCH, PUT, DELETE');
  response.end(json({ error: { code: error.code, message: error.message } }));
}

function backendOrigin() {
  const configured = process.env.LIBTV_BACKEND_URL?.trim();
  if (!configured) throw new LibTvProxyError('LIBTV_NOT_CONFIGURED', 'LibTV 后端尚未配置', 503);
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new LibTvProxyError('LIBTV_CONFIG_INVALID', 'LibTV 后端地址无效', 503);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new LibTvProxyError('LIBTV_CONFIG_INVALID', 'LibTV 后端地址必须是 HTTPS 根地址', 503);
  return url;
}

function pathParts(request: LibTvRequest) {
  const raw = request.query?.path;
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('/') : [];
  if (
    !parts.length ||
    parts.some((part) => !part || part === '.' || part === '..' || !SEGMENT.test(part))
  )
    throw new LibTvProxyError('INVALID_PATH', 'LibTV 接口路径无效', 400);
  return parts;
}

function id(value: string | undefined): value is string {
  return Boolean(
    value && ID.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value),
  );
}

function knownPath(parts: string[]) {
  const [root, second, third, fourth] = parts;
  if (root === 'content') return parts.length >= 2;
  if (root === 'projects')
    return (
      parts.length === 1 ||
      (parts.length === 2 && (second === 'copy' || id(second))) ||
      (parts.length === 3 && id(second) && ['canvas', 'share', 'restore'].includes(third || ''))
    );
  if (root === 'folders' || root === 'assets')
    return (
      parts.length === 1 ||
      (parts.length === 2 && id(second)) ||
      (parts.length === 3 && id(second) && third === 'restore')
    );
  if (root === 'skills')
    return (
      parts.length === 1 ||
      (parts.length === 2 && id(second)) ||
      (parts.length === 3 && id(second) && ['restore', 'favorite'].includes(third || ''))
    );
  if (root === 'uploads')
    return (
      parts.length === 1 ||
      (parts.length === 2 && id(second)) ||
      (parts.length === 3 && id(second) && third === 'complete')
    );
  if (root === 'tasks')
    return (
      parts.length === 1 ||
      (parts.length === 2 && id(second)) ||
      (parts.length === 3 && id(second) && ['events', 'cancel', 'retry'].includes(third || ''))
    );
  if (root === 'orders')
    return (
      parts.length === 1 ||
      (parts.length === 2 && id(second)) ||
      (parts.length === 3 && id(second) && third === 'cancel')
    );
  if (root === 'works') return parts.length === 3 && id(second) && third === 'like';
  if (root === 'profiles') return parts.length === 3 && id(second) && third === 'follow';
  if (root === 'social')
    return (
      parts.length === 4 &&
      ['works', 'profiles', 'skills'].includes(second || '') &&
      id(third) &&
      ['like', 'follow', 'favorite'].includes(fourth || '')
    );
  if (root === 'auth')
    return (
      (parts.length === 2 &&
        ['session', 'sms', 'login', 'logout', 'tickets'].includes(second || '')) ||
      (parts.length === 3 && second === 'tickets' && id(third))
    );
  if (root === 'canvas')
    return (
      (parts.length === 2 && id(second)) || (parts.length === 3 && id(second) && third === 'share')
    );
  if (root === 'agent') {
    if (parts.length === 2)
      return ['health', 'memory', 'chat', 'runs', 'sessions'].includes(second || '');
    if (parts.length === 3 && ['runs', 'sessions'].includes(second || ''))
      return second === 'runs' && third === 'stream' ? true : id(third);
    return (
      parts.length === 4 &&
      ['runs', 'sessions'].includes(second || '') &&
      id(third) &&
      ['events', 'cancel', 'retry', 'run', 'plan', 'apply'].includes(fourth || '')
    );
  }
  return false;
}

function assertRoute(route: Route | null, parts: string[]) {
  if (!route) {
    const supported = knownPath(parts);
    throw new LibTvProxyError(
      supported ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND',
      supported ? '请求方法不可用' : 'LibTV 接口不存在',
      supported ? 405 : 404,
    );
  }
}

function collectionRoute(parts: string[], requestMethod: string, collection: string): Route | null {
  if (parts.length === 1) {
    if (requestMethod === 'GET' || requestMethod === 'POST') return { timeout: DEFAULT_TIMEOUT };
    return null;
  }
  if (!id(parts[1])) return null;
  if (parts.length === 2) {
    if (requestMethod === 'GET' || requestMethod === 'PATCH' || requestMethod === 'DELETE')
      return { timeout: DEFAULT_TIMEOUT };
    return null;
  }
  if (parts.length === 3 && parts[2] === 'restore' && requestMethod === 'POST')
    return { timeout: DEFAULT_TIMEOUT };
  if (collection === 'skills' && parts.length === 3 && parts[2] === 'favorite') {
    return requestMethod === 'PUT' ? { timeout: DEFAULT_TIMEOUT } : null;
  }
  return null;
}

/** Returns a route only when its path and method are explicitly supported. */
export function resolveLibTvRoute(parts: string[], requestMethod: string): Route {
  const root = parts[0];
  let route: Route | null = null;
  if (root === 'content' && parts.length >= 2) {
    route = requestMethod === 'GET' ? { timeout: DEFAULT_TIMEOUT } : null;
  } else if (root === 'projects') {
    if (parts.length === 2 && parts[1] === 'copy') {
      route = requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
    } else if (parts.length >= 2 && id(parts[1]) && parts.length === 3) {
      const action = parts[2];
      if (action === 'canvas')
        route = ['GET', 'PUT'].includes(requestMethod) ? { timeout: DEFAULT_TIMEOUT } : null;
      else if (action === 'share')
        route = requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
      else if (action === 'restore')
        route = requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
    } else if (parts.length === 1) {
      route =
        requestMethod === 'GET' || requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
    } else if (parts.length === 2 && id(parts[1])) {
      route = ['GET', 'PATCH', 'DELETE'].includes(requestMethod)
        ? { timeout: DEFAULT_TIMEOUT }
        : null;
    }
  } else if (root === 'folders' || root === 'assets' || root === 'skills') {
    route = collectionRoute(parts, requestMethod, root);
  } else if (root === 'uploads') {
    if (parts.length === 1) route = requestMethod === 'POST' ? { timeout: UPLOAD_TIMEOUT } : null;
    else if (parts.length === 2 && id(parts[1]))
      route = ['GET', 'DELETE'].includes(requestMethod) ? { timeout: UPLOAD_TIMEOUT } : null;
    else if (parts.length === 3 && id(parts[1]) && parts[2] === 'complete')
      route = requestMethod === 'POST' ? { timeout: UPLOAD_TIMEOUT } : null;
  } else if (root === 'tasks') {
    if (parts.length === 1)
      route =
        requestMethod === 'POST'
          ? { timeout: STREAM_TIMEOUT, stream: true }
          : requestMethod === 'GET'
            ? { timeout: DEFAULT_TIMEOUT }
            : null;
    else if (parts.length === 2 && id(parts[1]))
      route = requestMethod === 'GET' ? { timeout: DEFAULT_TIMEOUT } : null;
    else if (parts.length === 3 && id(parts[1])) {
      if (parts[2] === 'events')
        route = requestMethod === 'GET' ? { timeout: STREAM_TIMEOUT, stream: true } : null;
      else if (parts[2] === 'cancel' || parts[2] === 'retry')
        route = requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
    }
  } else if (root === 'orders') {
    if (parts.length === 1)
      route =
        requestMethod === 'POST'
          ? { timeout: DEFAULT_TIMEOUT }
          : requestMethod === 'GET'
            ? { timeout: DEFAULT_TIMEOUT }
            : null;
    else if (parts.length === 2 && id(parts[1]))
      route = requestMethod === 'GET' ? { timeout: DEFAULT_TIMEOUT } : null;
    else if (parts.length === 3 && id(parts[1]) && parts[2] === 'cancel')
      route = requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
  } else if (root === 'works' || root === 'profiles') {
    route =
      parts.length === 3 &&
      id(parts[1]) &&
      ((root === 'works' && parts[2] === 'like') ||
        (root === 'profiles' && parts[2] === 'follow')) &&
      requestMethod === 'PUT'
        ? { timeout: DEFAULT_TIMEOUT }
        : null;
  } else if (root === 'social') {
    route =
      parts.length === 4 &&
      ['works', 'profiles', 'skills'].includes(parts[1]) &&
      id(parts[2]) &&
      ((parts[1] === 'works' && parts[3] === 'like') ||
        (parts[1] === 'profiles' && parts[3] === 'follow') ||
        (parts[1] === 'skills' && parts[3] === 'favorite')) &&
      requestMethod === 'PUT'
        ? { timeout: DEFAULT_TIMEOUT }
        : null;
  } else if (root === 'auth') {
    route =
      (parts.length === 2 && parts[1] === 'session' && requestMethod === 'GET') ||
      (parts.length === 2 && parts[1] === 'sms' && requestMethod === 'POST') ||
      (parts.length === 2 && parts[1] === 'login' && requestMethod === 'POST') ||
      (parts.length === 2 && parts[1] === 'logout' && requestMethod === 'POST')
        ? { timeout: DEFAULT_TIMEOUT }
        : parts.length === 2 && parts[1] === 'tickets' && requestMethod === 'POST'
          ? { timeout: DEFAULT_TIMEOUT }
          : parts.length === 3 && parts[1] === 'tickets' && id(parts[2]) && requestMethod === 'GET'
            ? { timeout: DEFAULT_TIMEOUT }
            : null;
  } else if (root === 'agent') {
    route = resolveAgentRoute(parts, requestMethod);
  } else if (root === 'canvas') {
    route = resolveCanvasRoute(parts, requestMethod);
  }
  assertRoute(route, parts);
  return route as Route;
}

function resolveCanvasRoute(parts: string[], requestMethod: string): Route | null {
  if (parts.length === 2 && id(parts[1]))
    return ['GET', 'PUT'].includes(requestMethod) ? { timeout: DEFAULT_TIMEOUT } : null;
  if (parts.length === 3 && id(parts[1]) && parts[2] === 'share')
    return requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
  return null;
}

function resolveAgentRoute(parts: string[], requestMethod: string): Route | null {
  if (parts.length === 2 && ['health', 'memory'].includes(parts[1])) {
    if (parts[1] === 'health') return requestMethod === 'GET' ? { timeout: DEFAULT_TIMEOUT } : null;
    return requestMethod === 'GET' || requestMethod === 'POST'
      ? { timeout: DEFAULT_TIMEOUT }
      : null;
  }
  if (parts.length === 2 && parts[1] === 'chat')
    return requestMethod === 'POST' ? { timeout: STREAM_TIMEOUT, stream: true } : null;
  if (parts.length === 2 && parts[1] === 'runs')
    return requestMethod === 'POST'
      ? { timeout: STREAM_TIMEOUT, stream: true }
      : requestMethod === 'GET'
        ? { timeout: DEFAULT_TIMEOUT }
        : null;
  if (parts.length === 3 && parts[1] === 'runs' && parts[2] === 'stream')
    return requestMethod === 'POST' ? { timeout: STREAM_TIMEOUT, stream: true } : null;
  if (parts.length >= 3 && parts[1] === 'runs' && id(parts[2])) {
    if (parts.length === 3) return requestMethod === 'GET' ? { timeout: DEFAULT_TIMEOUT } : null;
    if (parts.length === 4 && parts[3] === 'events')
      return requestMethod === 'GET' ? { timeout: STREAM_TIMEOUT, stream: true } : null;
    if (parts.length === 4 && ['cancel', 'retry'].includes(parts[3]))
      return requestMethod === 'POST' ? { timeout: DEFAULT_TIMEOUT } : null;
  }
  if (parts.length === 2 && parts[1] === 'sessions')
    return requestMethod === 'GET' || requestMethod === 'POST'
      ? { timeout: DEFAULT_TIMEOUT }
      : null;
  if (parts.length >= 3 && parts[1] === 'sessions' && id(parts[2])) {
    if (parts.length === 3)
      return ['GET', 'PATCH', 'DELETE'].includes(requestMethod)
        ? { timeout: DEFAULT_TIMEOUT }
        : null;
    if (parts.length === 4 && parts[3] === 'events')
      return requestMethod === 'GET' ? { timeout: STREAM_TIMEOUT, stream: true } : null;
    if (parts.length === 4 && ['run', 'plan', 'apply'].includes(parts[3]))
      return requestMethod === 'POST'
        ? { timeout: STREAM_TIMEOUT, stream: parts[3] === 'run' }
        : null;
  }
  return null;
}

function assertOrigin(request: LibTvRequest) {
  if (!MUTATING.has(request.method || '')) return;
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host) throw new LibTvProxyError('INVALID_ORIGIN', '请求来源不被允许', 403);
  if (origin) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new LibTvProxyError('INVALID_ORIGIN', '请求来源不被允许', 403);
    }
    const production = process.env.NODE_ENV === 'production';
    const allowed =
      parsed.host === host &&
      (parsed.protocol === 'https:' || (!production && parsed.protocol === 'http:'));
    if (!allowed) throw new LibTvProxyError('INVALID_ORIGIN', '请求来源不被允许', 403);
  }
  if (request.headers['sec-fetch-site'] === 'cross-site')
    throw new LibTvProxyError('INVALID_ORIGIN', '请求来源不被允许', 403);
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(', ') : value;
}

function copyRequestHeaders(request: LibTvRequest, hasBody: boolean) {
  const headers = new Headers();
  for (const name of [
    'content-type',
    'if-match',
    'if-none-match',
    'range',
    'accept',
    'x-csrf-token',
    'x-request-id',
  ]) {
    const value = headerValue(request.headers[name]);
    if (value) headers.set(name, value);
  }
  if (hasBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const cookies = headerValue(request.headers.cookie)
    ?.split(';')
    .map((part) => part.trim())
    .filter((part) =>
      /^(?:libtv|penstudio|session|csrf|__Host-|__Secure-)[A-Za-z0-9_.-]*=/i.test(part),
    );
  if (cookies?.length) headers.set('cookie', cookies.join('; '));
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
    'content-disposition',
    'last-modified',
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
  else {
    const cookie = upstream.headers.get('set-cookie');
    if (cookie) response.setHeader('Set-Cookie', cookie);
  }
}

function queryString(request: LibTvRequest) {
  if (!request.url?.includes('?')) return '';
  const parsed = new URL(request.url, 'https://libtv.local');
  parsed.searchParams.delete('path');
  return parsed.search;
}

async function readBody(request: LibTvRequest): Promise<Buffer | undefined> {
  if (!MUTATING.has(request.method || '')) return undefined;
  if (request.body !== undefined) {
    let body: Buffer;
    if (Buffer.isBuffer(request.body)) body = request.body;
    else if (request.body instanceof Uint8Array) body = Buffer.from(request.body);
    else if (typeof request.body === 'string') body = Buffer.from(request.body);
    else {
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(request.body);
      } catch {
        throw new LibTvProxyError('INVALID_BODY', '请求数据无效', 400);
      }
      if (serialized === undefined) throw new LibTvProxyError('INVALID_BODY', '请求数据无效', 400);
      body = Buffer.from(serialized);
    }
    if (body.byteLength > MAX_BODY_BYTES)
      throw new LibTvProxyError('BODY_TOO_LARGE', '请求内容不能超过 25 MB', 413);
    return body;
  }
  const declared = Number(headerValue(request.headers['content-length']));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new LibTvProxyError('BODY_TOO_LARGE', '请求内容不能超过 25 MB', 413);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const item = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += item.byteLength;
    if (size > MAX_BODY_BYTES)
      throw new LibTvProxyError('BODY_TOO_LARGE', '请求内容不能超过 25 MB', 413);
    chunks.push(item);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function pipeBody(upstream: Response, response: ServerResponse) {
  if (!upstream.body) return response.end();
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (response.writableEnded) break;
      response.write(Buffer.from(chunk.value));
    }
  } finally {
    reader.releaseLock();
    if (!response.writableEnded) response.end();
  }
}

export async function handleLibTvProxy(request: LibTvRequest, response: ServerResponse) {
  let route: Route;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let responseAbort: (() => void) | undefined;
  const abort = () => controller?.abort();
  try {
    assertOrigin(request);
    const parts = pathParts(request);
    route = resolveLibTvRoute(parts, request.method || 'GET');
    const body = await readBody(request);
    const origin = backendOrigin();
    const target = new URL('/' + parts.join('/'), origin);
    target.search = queryString(request);
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), route.timeout);
    request.on?.('aborted', abort);
    responseAbort = () => {
      if (!response.writableEnded) controller?.abort();
    };
    response.on?.('close', responseAbort);
    const headers = copyRequestHeaders(request, body !== undefined);
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: request.method || 'GET',
        headers,
        ...(body ? { body: body as unknown as BodyInit } : {}),
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error) {
      throw new LibTvProxyError(
        'UPSTREAM_UNAVAILABLE',
        error instanceof Error && error.name === 'AbortError'
          ? 'LibTV 后端响应超时'
          : 'LibTV 后端暂时无法连接',
        503,
      );
    }
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      throw new LibTvProxyError('UPSTREAM_REDIRECT', 'LibTV 后端返回了意外跳转', 502);
    }
    response.statusCode = upstream.status;
    copyResponseHeaders(upstream, response);
    await pipeBody(upstream, response);
  } catch (error) {
    if (response.writableEnded) return;
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    fail(
      response,
      error instanceof LibTvProxyError
        ? error
        : new LibTvProxyError('UPSTREAM_UNAVAILABLE', 'LibTV 后端暂时不可用', 503),
    );
  } finally {
    if (timeout) clearTimeout(timeout);
    request.removeListener?.('aborted', abort);
    if (responseAbort) response.removeListener?.('close', responseAbort);
  }
}
