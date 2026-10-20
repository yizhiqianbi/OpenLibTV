import { describe, expect, it, vi, afterEach } from 'vitest';
import { handleXumengProxy, type XumengRequest } from './xumeng-proxy.js';

function responseMock() {
  const headers = new Map<string, unknown>();
  const chunks: Buffer[] = [];
  const result = {
    headers,
    chunks,
    statusCode: 0,
    writableEnded: false,
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

function request(path: string, method = 'GET', body?: unknown): XumengRequest {
  return {
    method,
    url: `/api/xumeng/${path}`,
    query: { path: path.split('/') },
    headers: {
      host: 'app.test',
      ...(method === 'POST'
        ? { origin: 'https://app.test', 'content-type': 'application/json' }
        : {}),
    },
    ...(body === undefined ? {} : { body }),
  } as unknown as XumengRequest;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.XUMENG_BACKEND_URL;
  delete process.env.XUMENG_BACKEND_PROTOCOL;
});

describe('xumeng API proxy', () => {
  it('returns a safe configuration error without calling fetch', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const response = responseMock();
    await handleXumengProxy(request('health'), response);
    expect(response.statusCode).toBe(503);
    expect(Buffer.concat(response.chunks).toString()).toContain('XUMENG_NOT_CONFIGURED');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps the allowlisted generic chat route and preserves streamed content', async () => {
    process.env.XUMENG_BACKEND_URL = 'https://backend.example';
    process.env.XUMENG_BACKEND_PROTOCOL = 'generic';
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('data', { headers: { 'Content-Type': 'text/plain' } }));
    const response = responseMock();
    await handleXumengProxy(request('chat', 'POST', { messages: [] }), response);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://backend.example/chat');
    expect(response.statusCode).toBe(200);
    expect(Buffer.concat(response.chunks).toString()).toBe('data');
  });

  it('rejects cross-origin mutations and unknown paths before forwarding', async () => {
    process.env.XUMENG_BACKEND_URL = 'https://backend.example';
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const cross = responseMock();
    await handleXumengProxy(
      {
        ...request('chat', 'POST', {}),
        headers: { host: 'app.test', origin: 'https://evil.test' },
      } as XumengRequest,
      cross,
    );
    expect(cross.statusCode).toBe(403);
    const unknown = responseMock();
    await handleXumengProxy(request('backend/admin'), unknown);
    expect(unknown.statusCode).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
