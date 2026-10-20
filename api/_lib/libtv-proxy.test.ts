// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLibTvProxy, resolveLibTvRoute, type LibTvRequest } from './libtv-proxy.ts';

function responseMock() {
  const headers = new Map<string, unknown>();
  const chunks: Buffer[] = [];
  const result = {
    headers,
    chunks,
    statusCode: 0,
    writableEnded: false,
    headersSent: false,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    write(value: Buffer) {
      chunks.push(value);
    },
    end(value?: string) {
      if (value) chunks.push(Buffer.from(value));
      result.writableEnded = true;
    },
  };
  return result as unknown as import('node:http').ServerResponse & {
    chunks: Buffer[];
    headers: Map<string, unknown>;
  };
}

function request(path: string, method = 'GET', body?: unknown): LibTvRequest {
  return {
    method,
    url: `/api/backend/${path}`,
    query: { path: path.split('/') },
    headers: {
      host: 'app.test',
      ...(method !== 'GET'
        ? { origin: 'https://app.test', 'content-type': 'application/json' }
        : {}),
    },
    ...(body === undefined ? {} : { body }),
  } as unknown as LibTvRequest;
}

describe('LibTV backend proxy route boundary', () => {
  const original = process.env.LIBTV_BACKEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.LIBTV_BACKEND_URL;
    else process.env.LIBTV_BACKEND_URL = original;
  });

  it('allows generic content, canvas CAS, and Agent streaming routes', () => {
    expect(resolveLibTvRoute(['content', 'gallery'], 'GET')).toMatchObject({ timeout: 30000 });
    expect(resolveLibTvRoute(['projects', 'p1', 'canvas'], 'PUT')).toMatchObject({
      timeout: 30000,
    });
    expect(resolveLibTvRoute(['agent', 'runs', 'stream'], 'POST')).toMatchObject({ stream: true });
    expect(resolveLibTvRoute(['agent', 'runs', 'run1', 'events'], 'GET')).toMatchObject({
      stream: true,
    });
  });

  it('rejects arbitrary upstream paths and unsupported methods', () => {
    expect(() => resolveLibTvRoute(['admin', 'delete-all'], 'POST')).toThrow(/不存在/);
    expect(() => resolveLibTvRoute(['content', 'gallery'], 'POST')).toThrow(/不存在|不可用/);
    expect(() => resolveLibTvRoute(['agent', 'runs', '../secret'], 'GET')).toThrow(/不存在|不可用/);
  });

  it('returns configuration errors before touching an upstream', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const response = responseMock();
    await handleLibTvProxy(request('agent/runs/stream', 'POST', {}), response);
    expect(response.statusCode).toBe(503);
    expect(Buffer.concat(response.chunks).toString()).toContain('LIBTV_NOT_CONFIGURED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('forwards a streaming run with CAS and filtered cookies', async () => {
    process.env.LIBTV_BACKEND_URL = 'https://backend.example';
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('data: {"type":"done"}\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const response = responseMock();
    await handleLibTvProxy(
      {
        ...request('agent/runs/stream', 'POST', { requestId: 'r1' }),
        headers: {
          host: 'app.test',
          origin: 'https://app.test',
          'content-type': 'application/json',
          'if-match': '7',
          cookie: 'libtv_session=ok; tracking=drop',
        },
      } as LibTvRequest,
      response,
    );
    expect(String(fetcher.mock.calls[0][0])).toBe('https://backend.example/agent/runs/stream');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('if-match')).toBe('7');
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('cookie')).toBe('libtv_session=ok');
    expect(response.statusCode).toBe(200);
    expect(Buffer.concat(response.chunks).toString()).toContain('"type":"done"');
  });
});
