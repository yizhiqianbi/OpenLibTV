import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasDialogs } from './CanvasDialogs.jsx';

const props = (search = '') => ({
  dialog: 'search',
  setDialog: vi.fn(),
  nodes: [
    {
      id: 'image-1',
      type: 'image',
      data: { name: '山间湖泊', prompt: '清晨的湖面' },
    },
  ],
  search,
  setSearch: vi.fn(),
  setSelected: vi.fn(),
  fit: vi.fn(),
  setPanel: vi.fn(),
});

describe('CanvasDialogs search', () => {
  it('keeps the empty-canvas state distinct from a no-match result', () => {
    render(<CanvasDialogs {...props('')} nodes={[]} />);
    expect(screen.getByText('暂无节点')).toBeTruthy();
  });

  it('shows a no-match state after filtering existing nodes', () => {
    const input = props('不存在的节点');
    render(<CanvasDialogs {...input} />);
    expect(screen.getByText('暂无匹配节点')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /山间湖泊/ })).toBeNull();
  });
});

const assetProps = (libraryLoadState, library = [], libraryTab = '图片', overrides = {}) => ({
  dialog: 'assets',
  setDialog: vi.fn(),
  library,
  libraryLoadState,
  retryLibrary: vi.fn(),
  libraryTab,
  setLibraryTab: vi.fn(),
  fileInput: { current: null },
  readonly: false,
  addNode: vi.fn(),
  setNodes: vi.fn(),
  src: (value) => value,
  ...overrides,
});

describe('CanvasDialogs asset library states', () => {
  it('exposes loading, empty and retryable error states instead of a blank grid', () => {
    const { rerender } = render(<CanvasDialogs {...assetProps('loading')} />);
    expect(screen.getByRole('status').textContent).toContain('正在加载资产库');

    rerender(<CanvasDialogs {...assetProps('ready')} />);
    expect(screen.getByRole('status').textContent).toContain('当前没有可用资产');

    rerender(<CanvasDialogs {...assetProps('error')} />);
    expect(screen.getByRole('alert').textContent).toContain('资产库暂时无法加载');
    expect(screen.getByRole('button', { name: '重试加载' })).toBeTruthy();
  });

  it('does not show video-only records in the audio tab', () => {
    render(
      <CanvasDialogs
        {...assetProps('ready', [{ name: '视频样本', finalOutput: '/sample.mp4' }], '音频')}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('当前没有可用资产');
    expect(screen.queryByRole('button', { name: '视频样本' })).toBeNull();
  });

  it('creates an audio node with the selected audio URL', () => {
    const addNode = vi.fn(() => ({ id: 'new-audio', data: {} }));
    const setNodes = vi.fn();
    render(
      <CanvasDialogs
        {...assetProps(
          'ready',
          [
            {
              id: 'audio-1',
              name: '音频样本',
              audioUrl: '/sample.mp3',
              coverUrl: '/sample.webp',
            },
          ],
          '音频',
          { addNode, setNodes },
        )}
      />,
    );

    screen.getByRole('button', { name: '音频样本' }).click();
    expect(addNode).toHaveBeenCalledWith('audio');
    const update = setNodes.mock.calls[0][0];
    expect(update([{ id: 'new-audio', data: {} }])[0].data.url).toEqual(['/sample.mp3']);
  });
});
