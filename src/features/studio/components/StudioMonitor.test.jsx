import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioMonitor } from './StudioMonitor.jsx';
import { MONITOR_ORBIT, MONITOR_TOP } from '../monitor/model.js';

describe('source monitor card interactions', () => {
  // This checks interaction semantics, not UI latency; allow the full suite's jsdom contention.
  it('uses one switching top/3D card, selects on click, enters on double click and exits to top', () => {
    const view = vi.fn(),
      select = vi.fn();
    const props = {
      monitor: {
        observe: () => () => {},
        cameras: [{ id: 'cam', name: '机位 1' }],
        frames: {
          [MONITOR_TOP]: 'data:image/jpeg;base64,top',
          [MONITOR_ORBIT]: 'data:image/jpeg;base64,orbit',
          cam: 'data:image/jpeg;base64,camera',
        },
        scrollContainerRef: { current: null },
      },
      setViewMode: view,
      onSelectCamera: select,
      viewMode: 'orbit',
    };
    const page = render(<StudioMonitor {...props} />);
    expect(page.baseElement.querySelectorAll('.cv-studio-monitor-thumb img')).toHaveLength(2);
    fireEvent.click(screen.getByTitle('机位 1'));
    expect(select).toHaveBeenCalledExactlyOnceWith('cam');
    expect(view).not.toHaveBeenCalled();
    fireEvent.doubleClick(screen.getByTitle('机位 1'));
    expect(view).toHaveBeenLastCalledWith('cam');
    fireEvent.click(screen.getByRole('button', { name: '进入俯视图' }));
    expect(view).toHaveBeenLastCalledWith('top');
    page.rerender(<StudioMonitor {...props} viewMode="cam" />);
    fireEvent.click(screen.getByRole('button', { name: '退出机位' }));
    expect(view).toHaveBeenLastCalledWith('top');
    page.rerender(<StudioMonitor {...props} viewMode="top" />);
    fireEvent.click(screen.getByRole('button', { name: '返回 3D 视图' }));
    expect(view).toHaveBeenLastCalledWith('orbit');
  }, 15_000);
});
