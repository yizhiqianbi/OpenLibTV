import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import secondary from '../../../public/data/secondary.json';
import ArticlePage from './ArticlePage.jsx';

vi.mock('../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: secondary, loading: false, error: null, reload: vi.fn() }),
}));

const item = secondary.details.articles[secondary.articles[0].articleUuid];
const props = (articleSource) => ({
  path: `/academy/article/${item.articleUuid}`,
  navigate: vi.fn(),
  login: vi.fn(),
  asset: (url) => url,
  articleSource,
});

describe('academy article source states', () => {
  it('renders the distinct not-found state for a source 60016 mapping', async () => {
    render(<ArticlePage {...props({ load: vi.fn().mockResolvedValue({ status: 'notFound' }) })} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('不存在或已下架'));
  });

  it('renders the offline state and retries the same article key', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ status: 'offline' })
      .mockResolvedValueOnce({ status: 'ok', detail: item });
    render(<ArticlePage {...props({ load })} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '重试' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: item.title })).toBeTruthy());
    expect(load.mock.calls).toEqual([[item.articleUuid], [item.articleUuid]]);
  });
});
