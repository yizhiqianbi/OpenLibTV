import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CanvasShotBreakdownNode from './CanvasShotBreakdownNode.jsx';

const node = { id: 'film', type: 'shot-breakdown', data: { type: 'shot-breakdown' } };

describe('CanvasShotBreakdownNode', () => {
  it('renders the dedicated source card and keeps dimension selection local to the node patch', () => {
    const update = vi.fn();
    render(
      <CanvasShotBreakdownNode
        node={node}
        nodes={[
          { id: 'video', type: 'video', data: { type: 'video', url: ['/clip.mp4'], name: '片源' } },
        ]}
        edges={[{ id: 'edge', source: 'video', target: 'film' }]}
        update={update}
      />,
    );
    expect(screen.getByTestId('shot-breakdown-node')).toBeTruthy();
    expect(screen.getByText('片源')).toBeTruthy();
    const dimension = screen.getByRole('button', { name: /分镜/ });
    fireEvent.click(dimension);
    expect(update).toHaveBeenCalledWith('film', { dimensions: ['cameraMoves', 'musicRef'] });
    expect(screen.getByRole('button', { name: '开始拉片' }).disabled).toBe(false);
  });

  it('supports local upload and canvas-pick entry points without claiming a remote task', () => {
    const onUpload = vi.fn();
    const onPick = vi.fn();
    const notify = vi.fn();
    const { container } = render(
      <CanvasShotBreakdownNode
        node={{ ...node, data: { type: 'shot-breakdown', dimensions: ['storyboard'] } }}
        onUpload={onUpload}
        onPickFromCanvas={onPick}
        notify={notify}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '从画布选择' }));
    expect(onPick).toHaveBeenCalledWith('film');
    const file = new File(['video'], 'demo.mp4', { type: 'video/mp4' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith(file);
  });
});
