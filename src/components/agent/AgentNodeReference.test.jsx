import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentNodeReference from './AgentNodeReference.jsx';
import { AgentNodePresentationProvider } from './AgentNodePresentationContext.jsx';

const reference = {
  type: 'node',
  id: 'n',
  nodeKey: 'n',
  name: '原名',
  projectId: 'a',
  nodeType: 'image',
  url: '/snapshot.png',
  mediaType: 'image',
};
const node = { id: 'n', type: 'image', data: { name: '新名', type: 'image', url: '/live.png' } };
const value = { projectId: 'a', nodes: [node], ready: true };
const view = (props, refs = [reference]) => (
  <AgentNodePresentationProvider value={props}>
    {refs.map((ref, index) => (
      <AgentNodeReference key={index} reference={ref} occurrenceKey={`occurrence-${index}`} />
    ))}
  </AgentNodePresentationProvider>
);
afterEach(() => vi.useRealTimers());

describe('shared live Canvas node reference', () => {
  it('renders repeated occurrences and live edits/deletions with keyboard locating in readonly messages', async () => {
    const onLocate = vi.fn(),
      parentClick = vi.fn();
    const { rerender } = render(
      <div onClick={parentClick}>
        {view({ ...value, onLocate, readonly: true }, [reference, reference])}
      </div>,
    );
    const labels = screen.getAllByRole('button', { name: '定位 新名' });
    expect(labels).toHaveLength(2);
    expect(labels.map((element) => element.dataset.referenceKey)).toEqual([
      'occurrence-0',
      'occurrence-1',
    ]);
    labels[1].focus();
    await userEvent.keyboard('{Enter}');
    expect(onLocate).toHaveBeenCalledWith(reference);
    expect(parentClick).not.toHaveBeenCalled();
    rerender(
      view({
        ...value,
        nodes: [{ ...node, data: { ...node.data, name: '再次改名', url: '/renamed.png' } }],
        onLocate,
      }),
    );
    expect(screen.getByRole('button', { name: '定位 再次改名' }).dataset.nodeState).toBe('live');
    expect(screen.getByRole('img', { name: '再次改名' }).getAttribute('src')).toBe('/renamed.png');
    rerender(view({ ...value, nodes: [], onLocate }));
    const missing = screen.getByTitle('节点已删除');
    expect(missing.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('uses explicit snapshot fallback without a provider and never locates a wrong-project node', () => {
    const { rerender } = render(<AgentNodeReference reference={reference} />);
    expect(screen.getByTitle('原名').closest('[data-node-state]').dataset.nodeState).toBe(
      'snapshot',
    );
    expect(screen.getByRole('img').getAttribute('src')).toBe('/snapshot.png');
    const onLocate = vi.fn();
    rerender(view({ ...value, projectId: 'b', onLocate }));
    fireEvent.click(screen.getByText('非本画布节点'));
    expect(onLocate).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('opens live image/video hover after 180ms, clears stale preview on delete/switch/unmount', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(view({ ...value, onLocate: vi.fn() }));
    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => vi.advanceTimersByTime(179));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(
      screen.getByRole('tooltip', { name: '新名 预览' }).querySelector('img').getAttribute('src'),
    ).toBe('/live.png');
    rerender(
      view({
        ...value,
        nodes: [{ ...node, data: { name: '视频', type: 'video', url: '/live.mp4' } }],
        onLocate: vi.fn(),
      }),
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button'));
    act(() => vi.advanceTimersByTime(180));
    const video = screen.getByRole('tooltip').querySelector('video');
    expect(video.getAttribute('src')).toBe('/live.mp4');
    expect(video.loop).toBe(true);
    expect(video.controls).toBe(false);
    rerender(view({ ...value, nodes: [], onLocate: vi.fn() }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    rerender(view({ ...value, onLocate: vi.fn() }));
    fireEvent.mouseEnter(screen.getByRole('button'));
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
