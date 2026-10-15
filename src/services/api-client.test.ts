// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, ServiceError } from './api-client.ts';

describe('API client', () => {
  it('does not call fetch until an endpoint is invoked and refuses unconfigured services', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createApiClient({ baseUrl: '', fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(client.api.auth.session()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('unwraps envelopes including an intentionally null payload', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"data":null}'))
      .mockResolvedValueOnce(new Response('{"items":[]}'));
    const client = createApiClient({ baseUrl: '/api/', fetcher });
    await expect(client.request('/one')).resolves.toBeNull();
    await expect(client.request('/two')).resolves.toEqual({ items: [] });
    expect(fetcher.mock.calls[0][0]).toBe('/api/one');
  });
  it('encodes IDs and query parameters and serializes writes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('{"data":{}}')));
    const { api } = createApiClient({ baseUrl: '/api', fetcher });
    await api.projects.list({ query: '中文 空格', deleted: false, limit: 20 });
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/projects?query=%E4%B8%AD%E6%96%87+%E7%A9%BA%E6%A0%BC&deleted=false&limit=20',
    );
    await api.projects.update('a/b', { name: 'New' });
    expect(fetcher.mock.calls[1][0]).toBe('/api/projects/a%2Fb');
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      body: '{"name":"New"}',
      credentials: 'include',
    });
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Content-Type')).toBe(
      'application/json',
    );
  });
  it('accepts a 204 response and rejects malformed successful payloads', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('<html>error</html>'));
    const client = createApiClient({ baseUrl: '/api', fetcher });
    await expect(client.api.projects.remove('a')).resolves.toBeNull();
    await expect(client.request('/broken')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });
  it('exposes structured backend errors and notifies expired sessions without a DOM', async () => {
    const onSessionExpired = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          '{"error":{"code":"SESSION_EXPIRED","message":"Expired","details":{"retry":true}}}',
          { status: 401 },
        ),
      );
    const client = createApiClient({ baseUrl: '/api', fetcher, onSessionExpired });
    await expect(client.api.auth.session()).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
      message: 'Expired',
      details: { retry: true },
    });
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });
  it('preserves caller cancellation and translates network errors', async () => {
    const abort = new DOMException('cancelled', 'AbortError');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(abort)
      .mockRejectedValueOnce(new Error('offline'));
    const client = createApiClient({ baseUrl: '/api', fetcher });
    await expect(client.request('/first')).rejects.toBe(abort);
    await expect(client.request('/second')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
  it('passes collection pagination cancellation to fetch', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"items":[]}'));
    const client = createApiClient({ baseUrl: '/api', fetcher });
    const controller = new AbortController();
    await client.api.assets.list(
      { limit: 100, cursor: 'second page' },
      { signal: controller.signal },
    );
    expect(fetcher.mock.calls[0][0]).toBe('/api/assets?limit=100&cursor=second+page');
    expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
  it('lets the browser set a multipart upload boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"data":[]}'));
    const client = createApiClient({ baseUrl: '/api', fetcher });
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    await client.api.upload([file]);
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('Content-Type')).toBe(false);
  });
  it('reports non-JSON HTTP failure with the original status', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(new Response('bad gateway', { status: 502 })));
    const client = createApiClient({ baseUrl: '/api', fetcher });
    await expect(client.request('/broken')).rejects.toBeInstanceOf(ServiceError);
    await expect(client.request('/broken')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502',
    });
  });
});
