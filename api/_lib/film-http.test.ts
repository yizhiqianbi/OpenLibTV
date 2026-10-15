// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkFilmMethod, filmHttp, readFilmBody, type FilmRequest } from './film-http';
import { FilmPublishError } from './film-publish';
import type { ServerResponse } from 'node:http';

const request = (extra: Partial<FilmRequest> = {}) =>
  ({
    method: 'POST',
    headers: { host: 'penstudio.example', 'content-type': 'application/json' },
    body: {},
    ...extra,
  }) as FilmRequest;
describe('film HTTP boundary', () => {
  it('requires JSON, bounded bodies, correct methods and same-origin browser mutations', async () => {
    await expect(
      readFilmBody(request({ headers: { 'content-type': 'text/plain' } })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(readFilmBody(request({ body: '{broken' }))).rejects.toThrow('请求数据无效');
    await expect(readFilmBody(request({ body: 'x'.repeat(2_000_001) }))).rejects.toThrow();
    expect(() => checkFilmMethod(request({ method: 'GET' }), 'POST')).toThrow('请求方法不可用');
    expect(() =>
      checkFilmMethod(
        request({ headers: { host: 'penstudio.example', origin: 'https://attacker.example' } }),
        'POST',
      ),
    ).toThrow('请求来源无效');
    expect(() =>
      checkFilmMethod(
        request({ headers: { host: 'penstudio.example', origin: 'https://penstudio.example' } }),
        'POST',
      ),
    ).not.toThrow();
  });
  it('returns a safe error without leaking tokens, credentials or provider internals', async () => {
    const headers: Record<string, unknown> = {};
    let body = '';
    const response = {
      statusCode: 0,
      setHeader(key: string, value: unknown) {
        headers[key] = value;
      },
      end(value: string) {
        body = value;
      },
    } as unknown as ServerResponse;
    await filmHttp(response, async () => {
      throw new Error('provider secret-token');
    });
    expect(response.statusCode).toBe(503);
    expect(body).not.toContain('secret-token');
    expect(headers['Cache-Control']).toBe('no-store');
    await filmHttp(response, async () => {
      throw new FilmPublishError('INVALID_PASSWORD', '管理口令不正确', 401);
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(body).code).toBe('INVALID_PASSWORD');
  });
});
