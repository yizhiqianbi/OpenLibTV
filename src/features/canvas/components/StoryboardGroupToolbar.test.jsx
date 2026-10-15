import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryboardGroupToolbar } from './StoryboardGroupToolbar.jsx';

const resolutionKey = 'libtv.storyboard.stitch.resolution';
let portal;
const options = (extra = {}) => ({
  groupId: 'group',
  aspect: '16:9',
  cols: 2,
  rows: 2,
  manualCols: 2,
  manualRows: 2,
  anchor: { x: 400, y: 250 },
  portal,
  onCommand: vi.fn(),
  onUngroup: vi.fn(),
  ...extra,
});
beforeEach(() => {
  localStorage.removeItem(resolutionKey);
  portal = document.createElement('div');
  document.body.append(portal);
});
afterEach(() => {
  portal.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('source standalone storyboard group toolbar', () => {
  it('locks a script-linked ratio, preserves the other grid commands and offers regeneration without conversion', () => {
    vi.useFakeTimers();
    const props = options({ isScriptLinked: true, aspectLocked: true, onRunGroup: vi.fn() });
    render(<StoryboardGroupToolbar {...props} />);
    const bar = screen.getByRole('toolbar', { name: '分镜组操作' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['16:9', '宫格 2×2', '拼接(2k)', '序号', '清空', '重新生成', '解组']);
    const ratio = screen.getByRole('button', { name: '16:9' });
    expect(ratio.disabled).toBe(true);
    fireEvent.click(ratio);
    fireEvent.keyDown(ratio, { key: 'ArrowDown' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseEnter(ratio);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip').textContent).toBe('比例由脚本节点统一配置');
    fireEvent.mouseLeave(ratio);
    const clear = screen.getByRole('button', { name: '清空' });
    fireEvent.mouseEnter(clear);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('tooltip').textContent).toBe(
      '删除组内所有子节点；脚本对应关系保留，可重新生成分镜',
    );
    fireEvent.mouseLeave(clear);
    fireEvent.click(clear);
    expect(props.onCommand).toHaveBeenLastCalledWith('group', { type: 'clear' });
    fireEvent.click(screen.getByRole('button', { name: '宫格 2×2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '3×3' }));
    expect(props.onCommand).toHaveBeenLastCalledWith('group', { type: 'grid', cols: 3, rows: 3 });
    expect(screen.queryByRole('button', { name: '转普通组' })).toBeNull();
    expect(screen.queryByRole('button', { name: '整组执行' })).toBeNull();
    const run = screen.getByRole('button', { name: '重新生成' });
    expect(run.querySelector('.cv-storyboard-script-refresh').style.maskImage).toBe(
      'url("/assets/icons/refresh.svg")',
    );
    fireEvent.click(run);
    expect(props.onRunGroup).toHaveBeenCalledExactlyOnceWith('group');
  });

  it('renders only the injected linked running state and delegates stop without inventing a completed task', () => {
    const props = options({
      isScriptLinked: true,
      aspectLocked: true,
      isGroupRunning: true,
      pipelineProgress: '1/4',
      onRunGroup: vi.fn(),
    });
    const view = render(<StoryboardGroupToolbar {...props} />);
    const stop = screen.getByRole('button', { name: '停止 (1/4)' });
    expect(stop.classList.contains('cv-storyboard-script-running')).toBe(true);
    fireEvent.click(stop);
    expect(props.onRunGroup).toHaveBeenCalledExactlyOnceWith('group');
    expect(screen.getByRole('button', { name: '停止 (1/4)' })).toBe(stop);
    view.rerender(<StoryboardGroupToolbar {...props} disabled />);
    expect(stop.disabled).toBe(true);
    fireEvent.click(stop);
    expect(props.onRunGroup).toHaveBeenCalledTimes(1);
    view.rerender(
      <StoryboardGroupToolbar {...props} isGroupRunning={false} onRunGroup={undefined} />,
    );
    expect(screen.getByRole('button', { name: '重新生成' }).disabled).toBe(true);
  });

  it('closes an open ratio menu when its script ownership locks the ratio', () => {
    const props = options();
    const view = render(<StoryboardGroupToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    expect(screen.getByRole('menu', { name: '分镜比例' })).toBeTruthy();
    view.rerender(<StoryboardGroupToolbar {...props} aspectLocked isScriptLinked />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(props.onCommand).not.toHaveBeenCalled();
  });

  it('renders the dedicated source row and delegates actions with their current group', () => {
    const props = options({ showShotNumbers: true });
    render(<StoryboardGroupToolbar {...props} />);
    const bar = screen.getByRole('toolbar', { name: '分镜组操作' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['16:9', '宫格 2×2', '拼接(2k)', '序号', '清空', '转普通组', '解组']);
    expect(screen.queryByText('整组执行')).toBeNull();
    expect(within(bar).getByRole('button', { name: '序号' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    for (const [name, type] of [
      ['序号', 'toggleShotNumbers'],
      ['清空', 'clear'],
      ['转普通组', 'convertToNormal'],
    ]) {
      fireEvent.click(within(bar).getByRole('button', { name }));
      expect(props.onCommand).toHaveBeenLastCalledWith('group', { type });
    }
    fireEvent.click(within(bar).getByRole('button', { name: '解组' }));
    expect(props.onUngroup).toHaveBeenCalledExactlyOnceWith('group');
  });

  it('offers the six source ratios, moves keyboard focus and restores the trigger after selection', () => {
    const props = options();
    render(<StoryboardGroupToolbar {...props} />);
    const trigger = screen.getByRole('button', { name: '16:9' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: '分镜比例' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '21:9',
      '16:9',
      '4:3',
      '1:1',
      '3:4',
      '9:16',
    ]);
    expect(items[1].getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'End' });
    expect(document.activeElement).toBe(items[5]);
    fireEvent.keyDown(items[5], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.click(items[2]);
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'aspect',
      value: '4:3',
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes mutually exclusive menus, restores on Escape and leaves outside focus intact', () => {
    render(
      <>
        <StoryboardGroupToolbar {...options()} />
        <button>其他输入</button>
      </>,
    );
    const ratio = screen.getByRole('button', { name: '16:9' });
    const grid = screen.getByRole('button', { name: '宫格 2×2' });
    fireEvent.click(ratio);
    fireEvent.click(grid);
    expect(screen.queryByRole('menu', { name: '分镜比例' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '3×3' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(grid);
    fireEvent.click(ratio);
    const outside = screen.getByRole('button', { name: '其他输入' });
    act(() => outside.focus());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it('marks only the exact manual square preset and does not mark an automatic layout', () => {
    const props = options({ manualCols: undefined, manualRows: undefined });
    const view = render(<StoryboardGroupToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '宫格 2×2' }));
    expect(screen.getByRole('menuitem', { name: '2×2' }).getAttribute('aria-current')).toBeNull();
    view.rerender(<StoryboardGroupToolbar {...props} manualCols={3} manualRows={3} />);
    expect(screen.getByRole('menuitem', { name: '3×3' }).getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: '4×4' }));
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'grid',
      cols: 4,
      rows: 4,
    });
  });

  it('opens the 5 by 5 custom flyout and preserves source column/row order', () => {
    const props = options();
    render(<StoryboardGroupToolbar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '宫格 2×2' }));
    const custom = screen.getByRole('menuitem', { name: '自定义' });
    fireEvent.mouseEnter(custom);
    const menu = screen.getByRole('menu', { name: '自定义分镜宫格' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(25);
    const cell = within(menu).getByRole('menuitem', { name: '4 列 2 行' });
    fireEvent.mouseEnter(cell);
    expect(within(menu).getByText('4 x 2')).toBeTruthy();
    expect(menu.querySelectorAll('[data-highlighted="true"]')).toHaveLength(8);
    fireEvent.click(cell);
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'grid',
      cols: 4,
      rows: 2,
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '宫格 2×2' }));
  });

  it('returns from a custom flyout with Escape without reopening it on focus', () => {
    render(<StoryboardGroupToolbar {...options()} />);
    const trigger = screen.getByRole('button', { name: '宫格 2×2' });
    fireEvent.click(trigger);
    const custom = screen.getByRole('menuitem', { name: '自定义' });
    fireEvent.click(custom);
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '1 列 1 行' }), { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: '自定义分镜宫格' })).toBeNull();
    expect(document.activeElement).toBe(custom);
    expect(screen.getByRole('menu', { name: '分镜宫格' })).toBeTruthy();
    fireEvent.keyDown(custom, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('stitches at the remembered resolution and changes it by selecting a hover menu action', () => {
    localStorage.setItem(resolutionKey, '4k');
    const props = options();
    render(<StoryboardGroupToolbar {...props} />);
    let trigger = screen.getByRole('button', { name: '拼接(4k)' });
    fireEvent.click(trigger);
    expect(props.onCommand).toHaveBeenLastCalledWith('group', { type: 'stitch', resolution: '4k' });
    fireEvent.mouseEnter(trigger);
    const option = screen.getByRole('menuitem', { name: '2k' });
    act(() => option.focus());
    fireEvent.click(option);
    trigger = screen.getByRole('button', { name: '拼接(2k)' });
    expect(localStorage.getItem(resolutionKey)).toBe('2k');
    expect(props.onCommand).toHaveBeenLastCalledWith('group', { type: 'stitch', resolution: '2k' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps source hover menus alive across the 120ms gap and cancels delayed work on unmount', () => {
    vi.useFakeTimers();
    const view = render(<StoryboardGroupToolbar {...options()} />);
    const trigger = screen.getByRole('button', { name: '拼接(2k)' });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(119));
    const menu = screen.getByRole('menu', { name: '拼接分辨率' });
    fireEvent.mouseEnter(menu);
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('menu', { name: '拼接分辨率' })).toBe(menu);
    fireEvent.mouseLeave(menu);
    act(() => vi.advanceTimersByTime(120));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows passive source tooltips after 200ms and removes them on leave or unmount', () => {
    vi.useFakeTimers();
    const view = render(<StoryboardGroupToolbar {...options()} />);
    const clear = screen.getByRole('button', { name: '清空' });
    fireEvent.mouseEnter(clear);
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe('删除组内所有子节点');
    fireEvent.mouseLeave(clear);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(clear);
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it.each([{ disabled: true }, { busy: true }, { onCommand: undefined }])(
    'disables unavailable commands and clears their open menus: %j',
    (patch) => {
      const props = options();
      const view = render(<StoryboardGroupToolbar {...props} />);
      fireEvent.click(screen.getByRole('button', { name: '16:9' }));
      view.rerender(<StoryboardGroupToolbar {...props} {...patch} />);
      expect(screen.queryByRole('menu')).toBeNull();
      for (const name of ['16:9', '宫格 2×2', '拼接(2k)', '序号', '清空', '转普通组']) {
        const button = screen.getByRole('button', { name });
        expect(button.disabled).toBe(true);
        fireEvent.click(button);
      }
      expect(props.onCommand).not.toHaveBeenCalled();
    },
  );

  it('does not offer a usable ungroup action without its callback', () => {
    render(<StoryboardGroupToolbar {...options({ onUngroup: undefined })} />);
    expect(screen.getByRole('button', { name: '解组' }).disabled).toBe(true);
  });

  it('clamps a screen-sized toolbar to a 390px board and responds to board resizing', () => {
    let boardWidth = 390;
    const disconnected = vi.fn();
    let observerCallback;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          observerCallback = callback;
        }
        observe() {}
        disconnect() {
          disconnected();
        }
      },
    );
    vi.spyOn(portal, 'getBoundingClientRect').mockImplementation(() => ({
      width: boardWidth,
      height: 844,
    }));
    const view = render(<StoryboardGroupToolbar {...options({ anchor: { x: 380, y: 200 } })} />);
    const bar = screen.getByRole('toolbar');
    expect(bar.style.left).toBe('8px');
    expect(bar.style.maxWidth).toBe('374px');
    expect(bar.style.top).toBe('123px');
    boardWidth = 320;
    act(() => observerCallback());
    expect(bar.style.maxWidth).toBe('304px');
    expect(bar.style.left).toBe('8px');
    view.unmount();
    expect(disconnected).toHaveBeenCalled();
  });

  it('uses source below-first, left-aligned aspect placement while clamping at the viewport edge', () => {
    const view = render(<StoryboardGroupToolbar {...options()} />);
    const trigger = screen.getByRole('button', { name: '16:9' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 400,
      top: 300,
      bottom: 332,
      width: 80,
    });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: '分镜比例' });
    expect(menu.style.left).toBe('400px');
    expect(menu.style.top).toBe('340px');
    view.unmount();
  });

  it.each([
    {
      name: 'below',
      panel: { left: 88.71, right: 238.71, top: 254.5, bottom: 487.5, width: 150, height: 233 },
      expectedTop: 493.5,
    },
    {
      name: 'above',
      panel: { left: 88.71, right: 238.71, top: 600, bottom: 833, width: 150, height: 233 },
      expectedTop: 358,
    },
  ])(
    'opens the 390px custom flyout $name the parent when neither side fits, without covering its trigger',
    ({ panel, expectedTop }) => {
      vi.stubGlobal('innerWidth', 390);
      vi.stubGlobal('innerHeight', 844);
      const originalRect = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.getAttribute('aria-label') === '自定义分镜宫格')
          return { left: 0, right: 205, top: 0, bottom: 236, width: 205, height: 236 };
        return originalRect.call(this);
      });
      const props = options();
      render(<StoryboardGroupToolbar {...props} />);
      fireEvent.click(screen.getByRole('button', { name: '宫格 2×2' }));
      const parent = screen.getByRole('menu', { name: '分镜宫格' });
      Object.defineProperty(parent, 'getBoundingClientRect', {
        configurable: true,
        value: () => panel,
      });
      const customTrigger = screen.getByRole('menuitem', { name: '自定义' });
      Object.defineProperty(customTrigger, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          left: panel.left + 6,
          right: panel.right - 6,
          top: panel.bottom - 46,
          bottom: panel.bottom - 6,
          width: 138,
          height: 40,
        }),
      });
      fireEvent.mouseEnter(customTrigger);
      const child = screen.getByRole('menu', { name: '自定义分镜宫格' });
      const left = Number.parseFloat(child.style.left),
        top = Number.parseFloat(child.style.top),
        width = Number.parseFloat(child.style.width);
      expect(left).toBe(panel.left);
      expect(top).toBe(expectedTop);
      expect(left).toBeGreaterThanOrEqual(8);
      expect(left + width).toBeLessThanOrEqual(382);
      expect(top).toBeGreaterThanOrEqual(8);
      expect(top + 236).toBeLessThanOrEqual(836);
      expect(top >= panel.bottom + 6 || top + 236 <= panel.top - 6).toBe(true);
      fireEvent.click(within(child).getByRole('menuitem', { name: '3 列 2 行' }));
      expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('group', {
        type: 'grid',
        cols: 3,
        rows: 2,
      });
      expect(screen.queryByRole('menu')).toBeNull();
    },
  );

  it.each([
    {
      name: 'right',
      panel: { left: 100, right: 250, top: 254, bottom: 487, width: 150, height: 233 },
      expectedLeft: 256,
    },
    {
      name: 'left',
      panel: { left: 500, right: 650, top: 254, bottom: 487, width: 150, height: 233 },
      expectedLeft: 289,
    },
  ])(
    'preserves side placement on the $name when a 205px flyout fits',
    ({ panel, expectedLeft }) => {
      vi.stubGlobal('innerWidth', 700);
      vi.stubGlobal('innerHeight', 844);
      render(<StoryboardGroupToolbar {...options()} />);
      fireEvent.click(screen.getByRole('button', { name: '宫格 2×2' }));
      vi.spyOn(
        screen.getByRole('menu', { name: '分镜宫格' }),
        'getBoundingClientRect',
      ).mockReturnValue(panel);
      fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '自定义' }));
      const child = screen.getByRole('menu', { name: '自定义分镜宫格' });
      expect(Number.parseFloat(child.style.left)).toBe(expectedLeft);
      expect(Number.parseFloat(child.style.top)).toBe(panel.top);
    },
  );
});
