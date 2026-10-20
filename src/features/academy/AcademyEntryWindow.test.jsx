import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import secondary from '../../../public/data/secondary.json';
import AcademyPage from './AcademyPage.jsx';

vi.mock('../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: secondary, loading: false, error: null, reload: vi.fn() }),
}));

beforeEach(() => {
  window.history.replaceState({}, '', '/academy');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

const props = () => ({
  navigate: vi.fn(),
  login: vi.fn(),
  asset: (url) => url,
  user: { name: '本地测试' },
});

describe('academy card entry windows', () => {
  it('opens masterclass, article and tutorial cards in new attributed tabs', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AcademyPage {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /AI大师公开课/ }));
    fireEvent.click(screen.getByRole('tab', { name: '图文教程' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(secondary.articles[0].title) }));
    fireEvent.click(screen.getByRole('tab', { name: '亮点功能' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(secondary.tutorials[0].title) }));

    expect(open.mock.calls).toEqual([
      [
        `/academy/masterclass/${secondary.masterclasses[0].masterclassUuid}`,
        '_blank',
        'noopener,noreferrer',
      ],
      [`/academy/article/${secondary.articles[0].articleUuid}`, '_blank', 'noopener,noreferrer'],
      [`/academy/tutorial/${secondary.tutorials[0].tutorialUuid}`, '_blank', 'noopener,noreferrer'],
    ]);
    open.mockRestore();
  });

  it('keeps the login gate for anonymous card clicks', () => {
    const login = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AcademyPage {...props()} user={null} login={login} />);
    fireEvent.click(screen.getByRole('button', { name: /AI大师公开课/ }));
    expect(login).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
