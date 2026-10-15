import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

const config = {
  newcomer: { showDelayMs: 60000 },
  promotion: { imageUrl: '/assets/test-promotion.webp' },
  sidebarBanners: [{ title: '挑战赛', pic: '/assets/test-banner.webp', url: '/activity/62' }],
};

vi.mock('../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useData: (name, fallback) => (name === 'shell-config' ? config : fallback),
}));
vi.mock('./router/RouteOutlet.jsx', () => ({
  default: ({ path, user, login }) => (
    <main data-testid="route-content" data-local-workspace={user?.localWorkspace}>
      当前页面：{path}
      <button onClick={login}>请求账号操作</button>
    </main>
  ),
}));
vi.mock('../features/membership/MembershipModal.jsx', () => ({
  default: () => <section role="dialog" aria-label="会员界面" />,
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('local workspace application shell', () => {
  it('navigates through the drawer and closes it without requiring a session', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }));
    const drawer = screen.getByRole('dialog', { name: '侧边栏' });
    fireEvent.click(within(drawer).getByRole('button', { name: '资产' }));

    expect(window.location.pathname).toBe('/assets');
    expect(screen.getByTestId('route-content').textContent).toContain('/assets');
    expect(screen.queryByRole('dialog', { name: '侧边栏' })).toBeNull();
    expect(screen.getByRole('button', { name: '本地工作区' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '注册/登录' })).toBeNull();
  });

  it('closes plugin and help menus on navigation and Escape', () => {
    render(<App />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '插件与扩展' }));
    fireEvent.click(screen.getByRole('button', { name: 'PenStudio CLI' }));
    expect(window.location.pathname).toBe('/plugin');
    expect(screen.queryByRole('button', { name: 'PenStudio CLI' })).toBeNull();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '插件与扩展' }));
    fireEvent.click(screen.getByRole('button', { name: '帮助信息' }));
    expect(screen.getByRole('button', { name: '联系客服' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: '联系客服' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'PenStudio CLI' })).toBeNull();
  });

  it('opens a canvas directly without creating a login session', async () => {
    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
      await vi.dynamicImportSettled();
    });
    expect(window.location.pathname).toBe('/canvas');
    expect(screen.getByTestId('route-content').getAttribute('data-local-workspace')).toBe('true');
    expect(screen.queryByRole('dialog', { name: '本地登录界面' })).toBeNull();
    expect(localStorage.getItem('libtv-user')).toBeNull();
  });

  it('ignores an old account session without overwriting it or exposing account actions', () => {
    const previous = JSON.stringify({ id: 'old-user', name: '旧演示账号', demo: true });
    localStorage.setItem('libtv-user', previous);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '本地工作区' }));
    expect(screen.getByText('本地工作区')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '我的主页' })).toBeNull();
    expect(screen.queryByText('旧演示账号')).toBeNull();
    expect(localStorage.getItem('libtv-user')).toBe(previous);
  });

  it('handles a deferred account action without opening a login modal or writing credentials', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '请求账号操作' }));
    expect(screen.getByRole('status').textContent).toContain('无需登录');
    expect(screen.queryByRole('dialog', { name: '登录' })).toBeNull();
    expect(localStorage.getItem('libtv-user')).toBeNull();
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.queryByText('登录开启创意大片')).toBeNull();
  });

  it('keeps the automatic promotion removed across fresh visits and remounts', async () => {
    const view = render(<App />);
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.queryByRole('dialog', { name: '节后回归特惠' })).toBeNull();
    expect(sessionStorage.getItem('libtv-promo-dismissed')).toBeNull();

    view.unmount();
    render(<App />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('dialog', { name: '节后回归特惠' })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^开通会员/ }));
      await vi.dynamicImportSettled();
    });
    expect(screen.getByRole('dialog', { name: '会员界面' })).toBeTruthy();
  });

  it('normalizes a public alias without opening a promotion', () => {
    window.history.replaceState({}, '', '/en/show?sort=latest');
    render(<App />);
    act(() => vi.advanceTimersByTime(2000));
    expect(window.location.pathname + window.location.search).toBe('/show?sort=latest');
    expect(screen.getByTestId('route-content').textContent).toContain('/show');
    expect(screen.queryByRole('dialog', { name: '节后回归特惠' })).toBeNull();
  });
});
