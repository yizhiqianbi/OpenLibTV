// @vitest-environment node
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

describe('server-safe compatibility module', () => {
  it('imports and server-renders hooks without window, storage, or network access', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { useData, useLocalState, localHref, asset } = await import('../data.js');
    function Preview() {
      const content = useData('home', { title: 'fallback' });
      const [theme] = useLocalState('ssr-theme', 'dark');
      return (
        <span>
          {content.title}:{theme}
        </span>
      );
    }
    expect(renderToString(<Preview />)).toBe('<span>fallback<!-- -->:<!-- -->dark</span>');
    expect(localHref('https://www.liblib.tv/show?x=1')).toBe('/show?x=1');
    expect(asset('https://media.test/a')).toBe('https://media.test/a');
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
