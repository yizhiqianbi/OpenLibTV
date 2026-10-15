import { describe, expect, it } from 'vitest';
import { normalizeLocation, resolveRoute } from './routes';

describe('route resolution', () => {
  it.each([
    ['/show', 'gallery', 'shell'],
    ['/skill/create', 'skill-create', 'shell'],
    ['/skill/share', 'skill-share', 'shell'],
    ['/detail/example', 'detail', 'standalone'],
    ['/canvas/share', 'canvas', 'standalone'],
    ['/canvas/chat-share', 'canvas', 'standalone'],
    ['/canvas/import/blender', 'canvas', 'standalone'],
    ['/animation-preview', 'studio-editor', 'standalone'],
    ['/interactive-film', 'interactive-film', 'standalone'],
    ['/interactive-film/play/example', 'film-release', 'standalone'],
    ['/academy/article/example', 'academy-article', 'standalone'],
    ['/academy/tutorial/example', 'academy-video', 'standalone'],
    ['/academy/masterclass/example', 'academy-video', 'standalone'],
    ['/academy/course/example', 'academy-course', 'standalone'],
    ['/academy/practice/example', 'academy-practice', 'standalone'],
    ['/academy/product/example', 'academy-product', 'chrome'],
    ['/mcp/authorize', 'mcp-authorize', 'standalone'],
    ['/seedance-verify', 'seedance-verify', 'standalone'],
  ])('matches %s without relying on prefix order', (path, id, layout) => {
    expect(resolveRoute(path)).toMatchObject({ id, layout });
  });

  it('rejects unknown suffixes instead of routing them into an editor', () => {
    expect(resolveRoute('/canvas/not-a-route').id).toBe('not-found');
    expect(resolveRoute('/detail/one/two').id).toBe('not-found');
    expect(resolveRoute('/transaction').id).toBe('not-found');
    expect(resolveRoute('/academy/course/one/two').id).toBe('not-found');
    expect(resolveRoute('/academy/practice').id).toBe('not-found');
    expect(resolveRoute('/academy/product').id).toBe('not-found');
  });

  it('normalizes aliases while preserving query and fragment', () => {
    expect(normalizeLocation(new URL('https://example.test/en/skill?tab=mine#list'))).toBe(
      '/skill?tab=mine#list',
    );
    expect(normalizeLocation(new URL('https://example.test/en'))).toBe('/');
    expect(normalizeLocation(new URL('https://example.test/forbidden'))).toBe('/');
    expect(normalizeLocation(new URL('https://example.test/forbidden?reason=private'))).toBe(
      '/forbidden?reason=private',
    );
  });
});
