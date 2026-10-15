import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import McpAuthorizePage from './McpAuthorizePage.jsx';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';

afterEach(() => window.history.replaceState({}, '', '/'));

it('does not present account consent or request login for a local workspace', () => {
  window.history.replaceState(
    {},
    '',
    '/mcp/authorize?transaction=local-proof&callback=https%3A%2F%2Fmcp.liblib.tv%2Foauth%2Flogin%2Fcallback&scope=libtv%3Aproject%3Awrite',
  );
  const login = vi.fn();
  render(<McpAuthorizePage user={LOCAL_WORKSPACE_USER} login={login} />);
  expect(screen.getByRole('heading', { name: '账号授权暂不可用' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '允许' })).toBeNull();
  expect(screen.queryByRole('button', { name: '登录' })).toBeNull();
  expect(login).not.toHaveBeenCalled();
});

it('still validates the request before displaying the local workspace boundary', () => {
  window.history.replaceState({}, '', '/mcp/authorize?transaction=local-proof&callback=invalid');
  render(<McpAuthorizePage user={LOCAL_WORKSPACE_USER} />);
  expect(screen.getByRole('heading', { name: '授权请求无效' })).toBeTruthy();
});
