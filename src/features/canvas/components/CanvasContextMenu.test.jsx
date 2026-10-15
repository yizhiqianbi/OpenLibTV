import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CanvasContextMenu } from './CanvasContextMenu.jsx';

const props = (contextNode) => ({
  context: { nodeId: 'target', x: 100, y: 100 },
  contextNode,
  duplicate: vi.fn(),
  fileInput: { current: null },
  fit: vi.fn(),
  remove: vi.fn(),
  setContext: vi.fn(),
  setDialog: vi.fn(),
  setMenu: vi.fn(),
  setPanel: vi.fn(),
});

it.each([
  { type: 'group', data: { name: '普通组' } },
  { type: 'group', data: { sourceScriptNodeId: 'script', storyboardGroupType: 'image' } },
  { type: 'group', data: { standaloneStoryboardImageGrid: true, storyboardGroupType: 'image' } },
])(
  'omits the dead settings action for actual group nodes while retaining their other actions',
  (node) => {
    const current = props({ id: 'target', ...node });
    render(<CanvasContextMenu {...current} />);
    expect(screen.queryByRole('button', { name: '节点设置' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /创建副本/ }));
    expect(current.duplicate).toHaveBeenCalledExactlyOnceWith(['target']);
    expect(current.setContext).toHaveBeenCalledWith(null);
    expect(current.setPanel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /删除/ }));
    expect(current.remove).toHaveBeenCalledOnce();
  },
);

it('retains settings for a normal node and uses the context target rather than a group-shaped data label', () => {
  const current = props({ id: 'target', type: 'image', data: { name: 'group', type: 'image' } });
  render(<CanvasContextMenu {...current} />);
  fireEvent.click(screen.getByRole('button', { name: '节点设置' }));
  expect(current.setPanel).toHaveBeenCalledExactlyOnceWith('target');
  expect(current.setContext).toHaveBeenCalledWith(null);
});

it('keeps the board context actions independent of the previous context node', () => {
  const current = props({ type: 'group' });
  render(<CanvasContextMenu {...current} context={{ x: 0, y: 0 }} />);
  expect(screen.queryByRole('button', { name: '节点设置' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '适应画布' }));
  expect(current.fit).toHaveBeenCalledOnce();
});
