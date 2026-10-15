import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERAL_GROUP_COLORS } from '../domain/general-group-controls-model.js';
import { GeneralGroupToolbar } from './GeneralGroupToolbar.jsx';

let portal;
const options = (extra = {}) => ({
  groupId: 'ordinary',
  anchor: { x: 400, y: 250 },
  portal,
  allChildrenAreImageNodes: true,
  canDownload: true,
  onCommand: vi.fn(),
  onRun: vi.fn(),
  onUngroup: vi.fn(),
  onCreateWorkflow: vi.fn(),
  onBatchGenerateVideo: vi.fn(),
  onDownload: vi.fn(),
  onCancelDownload: vi.fn(),
  ...extra,
});
beforeEach(() => {
  portal = document.createElement('div');
  document.body.append(portal);
});
afterEach(() => {
  portal.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('source general group toolbar', () => {
  it('renders the source action order and delegates each action to the current group', () => {
    const props = options();
    render(<GeneralGroupToolbar {...props} />);
    const toolbar = screen.getByRole('toolbar', { name: '分组操作' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') || button.textContent),
    ).toEqual(['分组颜色', '分组布局', '整组执行', '添加到工具箱', '转分镜组', '解组', '批量下载']);
    for (const [name, callback] of [
      ['整组执行', props.onRun],
      ['添加到工具箱', props.onCreateWorkflow],
      ['解组', props.onUngroup],
      ['批量下载', props.onDownload],
    ]) {
      fireEvent.click(within(toolbar).getByRole('button', { name }));
      expect(callback).toHaveBeenCalledExactlyOnceWith('ordinary');
    }
    fireEvent.click(screen.getByRole('button', { name: '转分镜组' }));
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('ordinary', {
      type: 'convertToStoryboard',
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('uses the shared ten source colors, marks the current choice and toggles it to null', () => {
    const props = options({ groupColor: '#E74C3C' });
    render(<GeneralGroupToolbar {...props} />);
    const trigger = screen.getByRole('button', { name: '分组颜色' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: '分组颜色选择' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((button) => button.getAttribute('aria-label'))).toEqual(
      GENERAL_GROUP_COLORS.map((color) => `分组颜色 ${color}`),
    );
    expect(document.activeElement).toBe(items[0]);
    const current = within(menu).getByRole('menuitem', { name: '分组颜色 #E74C3C' });
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(current.style.outline).toBe('2px solid #E74C3C');
    fireEvent.click(current);
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('ordinary', {
      type: 'color',
      value: null,
    });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '分组颜色 #08B6DD' }));
    expect(props.onCommand).toHaveBeenLastCalledWith('ordinary', {
      type: 'color',
      value: '#08B6DD',
    });
  });

  it.each([
    ['宫格排列', 'grid'],
    ['水平排列', 'horizontal'],
    ['垂直排列', 'vertical'],
  ])('dispatches the source %s layout command', (name, mode) => {
    const props = options();
    render(<GeneralGroupToolbar {...props} />);
    const trigger = screen.getByRole('button', { name: '分组布局' });
    fireEvent.click(trigger);
    expect(
      within(screen.getByRole('menu', { name: '分组排列' }))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['宫格排列', '水平排列', '垂直排列']);
    fireEvent.click(screen.getByRole('menuitem', { name }));
    expect(props.onCommand).toHaveBeenCalledExactlyOnceWith('ordinary', { type: 'layout', mode });
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps menus mutually exclusive, handles keyboard navigation and preserves outside focus', () => {
    render(
      <>
        <GeneralGroupToolbar {...options()} />
        <button>外部输入</button>
      </>,
    );
    const color = screen.getByRole('button', { name: '分组颜色' });
    const layout = screen.getByRole('button', { name: '分组布局' });
    fireEvent.click(color);
    fireEvent.click(layout);
    expect(screen.queryByRole('menu', { name: '分组颜色选择' })).toBeNull();
    const first = screen.getByRole('menuitem', { name: '宫格排列' });
    fireEvent.keyDown(first, { key: 'End' });
    const last = screen.getByRole('menuitem', { name: '垂直排列' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(layout);
    fireEvent.click(color);
    const outside = screen.getByRole('button', { name: '外部输入' });
    act(() => outside.focus());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it.each(['v1', undefined])(
    'uses linked %s regeneration and omits the ordinary toolbox/conversion',
    (sourceScriptVersion) => {
      const props = options({ linked: true, sourceScriptVersion });
      render(<GeneralGroupToolbar {...props} />);
      const run = screen.getByRole('button', { name: '重新生成' });
      expect(run.querySelector('.cv-general-group-icon').style.maskImage).toBe(
        'url("/assets/icons/refresh.svg")',
      );
      expect(screen.queryByRole('button', { name: '整组执行' })).toBeNull();
      expect(screen.queryByRole('button', { name: '添加到工具箱' })).toBeNull();
      expect(screen.queryByRole('button', { name: '转分镜组' })).toBeNull();
      expect(screen.queryByRole('button', { name: '批量生成视频' })).toBeNull();
      fireEvent.click(run);
      expect(props.onRun).toHaveBeenCalledExactlyOnceWith('ordinary');
    },
  );

  it('uses the linked v2 run cue only before actual child content, with the source 300ms passive tooltip', () => {
    vi.useFakeTimers();
    const props = options({ linked: true, sourceScriptVersion: 'v2' });
    const view = render(<GeneralGroupToolbar {...props} />);
    const run = screen.getByRole('button', { name: '整组执行' });
    expect(run.classList.contains('cv-general-group-brand')).toBe(true);
    expect(run.querySelector('.cv-general-group-hand-cue')).toBeTruthy();
    fireEvent.mouseEnter(run);
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip').textContent).toBe(
      '请点击下方的生成器，检查提示词和参考图连接无问题后，点击整组执行开始批量生成',
    );
    fireEvent.mouseLeave(run);
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(<GeneralGroupToolbar {...props} anyChildHasContent />);
    expect(run.querySelector('.cv-general-group-hand-cue')).toBeNull();
    expect(run.classList.contains('cv-general-group-brand')).toBe(true);
    view.rerender(<GeneralGroupToolbar {...props} isGroupRunning pipelineProgress="2/5" />);
    const stop = screen.getByRole('button', { name: '停止 (2/5)' });
    expect(stop.classList.contains('cv-general-group-running')).toBe(true);
    expect(stop.classList.contains('cv-general-group-brand')).toBe(false);
    expect(stop.querySelector('.cv-general-group-hand-cue')).toBeNull();
    fireEvent.click(stop);
    expect(props.onRun).toHaveBeenCalledExactlyOnceWith('ordinary');
  });

  it('uses injected batch-video eligibility and does not infer readiness from image children', () => {
    vi.useFakeTimers();
    const props = options({
      linked: true,
      sourceScriptVersion: 'v1',
      batchVideoAvailability: { visible: true, enabled: false, reason: '请先生成分镜图' },
    });
    const view = render(<GeneralGroupToolbar {...props} />);
    const generate = screen.getByRole('button', { name: '批量生成视频' });
    expect(generate.disabled).toBe(true);
    fireEvent.mouseEnter(generate);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tooltip').textContent).toBe('请先生成分镜图');
    fireEvent.click(generate);
    expect(props.onBatchGenerateVideo).not.toHaveBeenCalled();
    view.rerender(
      <GeneralGroupToolbar {...props} batchVideoAvailability={{ visible: true, enabled: true }} />,
    );
    expect(generate.disabled).toBe(false);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(generate);
    expect(props.onBatchGenerateVideo).toHaveBeenCalledExactlyOnceWith('ordinary');
    view.rerender(
      <GeneralGroupToolbar
        {...props}
        batchVideoAvailability={{ visible: false, enabled: false }}
      />,
    );
    expect(screen.queryByRole('button', { name: '批量生成视频' })).toBeNull();
  });

  it('disables invalid conversion and unavailable download with source explanations', () => {
    vi.useFakeTimers();
    const props = options({
      allChildrenAreImageNodes: false,
      canDownload: false,
      workflowUuid: 'workflow',
    });
    render(<GeneralGroupToolbar {...props} />);
    expect(screen.getByRole('button', { name: '更新工具箱' })).toBeTruthy();
    for (const [name, explanation] of [
      ['转分镜组', '组内须全部为图片节点'],
      ['批量下载', '当前选区无可下载的资源'],
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      fireEvent.mouseEnter(button);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole('tooltip').textContent).toBe(explanation);
      fireEvent.mouseLeave(button);
    }
    expect(props.onCommand).not.toHaveBeenCalled();
    expect(props.onDownload).not.toHaveBeenCalled();
  });

  it('renders actual download progress and delegates cancellation without pretending completion', () => {
    const props = options({ isDownloading: true, downloadProgress: { current: 2, total: 7 } });
    const view = render(<GeneralGroupToolbar {...props} />);
    expect(screen.queryByRole('button', { name: '批量下载' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '停止下载 (2/7)' }));
    expect(props.onCancelDownload).toHaveBeenCalledExactlyOnceWith('ordinary');
    expect(screen.getByRole('button', { name: '停止下载 (2/7)' })).toBeTruthy();
    view.rerender(<GeneralGroupToolbar {...props} isDownloading={false} />);
    fireEvent.click(screen.getByRole('button', { name: '批量下载' }));
    expect(props.onDownload).toHaveBeenCalledExactlyOnceWith('ordinary');
  });

  it.each([{ disabled: true }, { busy: true }])(
    'closes open menus and prevents every mutation while unavailable: %j',
    (patch) => {
      const props = options({ batchVideoAvailability: { visible: true, enabled: true } });
      const view = render(<GeneralGroupToolbar {...props} />);
      fireEvent.click(screen.getByRole('button', { name: '分组颜色' }));
      view.rerender(<GeneralGroupToolbar {...props} {...patch} />);
      expect(screen.queryByRole('menu')).toBeNull();
      for (const button of within(screen.getByRole('toolbar')).getAllByRole('button')) {
        expect(button.disabled).toBe(true);
        fireEvent.click(button);
      }
      for (const key of [
        'onCommand',
        'onRun',
        'onUngroup',
        'onCreateWorkflow',
        'onBatchGenerateVideo',
        'onDownload',
      ])
        expect(props[key]).not.toHaveBeenCalled();
    },
  );

  it('disables commands without their adapters and cancels delayed tooltip work on unmount', () => {
    vi.useFakeTimers();
    const props = options({
      onCommand: undefined,
      onRun: undefined,
      onUngroup: undefined,
      onCreateWorkflow: undefined,
      onDownload: undefined,
    });
    const view = render(<GeneralGroupToolbar {...props} />);
    for (const button of within(screen.getByRole('toolbar')).getAllByRole('button'))
      expect(button.disabled).toBe(true);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '批量下载' }));
    view.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clamps the screen-sized row on a 390px board and remeasures after resize', () => {
    let width = 390;
    const callbacks = new Set();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          callbacks.add(callback);
        }
        observe() {}
        disconnect() {
          callbacks.delete(this.callback);
          disconnect();
        }
      },
    );
    vi.spyOn(portal, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 844 }));
    const view = render(<GeneralGroupToolbar {...options({ anchor: { x: 380, y: 200 } })} />);
    const bar = screen.getByRole('toolbar');
    expect(bar.style.maxWidth).toBe('374px');
    expect(bar.style.left).toBe('8px');
    expect(bar.style.top).toBe('123px');
    expect(bar.style.transform).toBe('');
    width = 320;
    act(() => callbacks.forEach((callback) => callback()));
    expect(bar.style.maxWidth).toBe('304px');
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('opens the color menu above its trigger and flips/clamps when the viewport has less room', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    render(<GeneralGroupToolbar {...options()} />);
    const trigger = screen.getByRole('button', { name: '分组颜色' });
    const rect = { left: 340, top: 300, bottom: 340, width: 40 };
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => rect);
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: '分组颜色选择' });
    expect(menu.style.left).toBe('130px');
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(rect.top);
    fireEvent.keyDown(menu, { key: 'Escape' });
    rect.top = 10;
    rect.bottom = 50;
    fireEvent.click(trigger);
    expect(screen.getByRole('menu').style.top).toBe('58px');
    expect(screen.getByRole('menu').style.left).toBe('130px');
  });
});
