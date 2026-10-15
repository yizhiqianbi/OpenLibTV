import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CanvasSelectionToolbar from './CanvasSelectionToolbar.jsx';

const nodes = ['a', 'b', 'c'].map((id) => ({ id, type: 'text', data: {} }));
afterEach(() => vi.unstubAllGlobals());
describe('source ordinary multi-selection toolbar', () => {
  it('preserves source action order and does not add a mixed generator or an unwired action', async () => {
    const callbacks = Object.fromEntries(
      [
        'onCreateAsset',
        'onDuplicate',
        'onGroup',
        'onDownloadAll',
        'onAddToChat',
        'onCreateSkill',
      ].map((name) => [name, vi.fn()]),
    );
    render(
      <CanvasSelectionToolbar
        nodes={nodes}
        selectedIds={['b', 'a', 'missing', 'a']}
        onLayoutChange={vi.fn()}
        {...callbacks}
      />,
    );
    expect(
      within(screen.getByRole('toolbar'))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') || button.textContent),
    ).toEqual([
      '整理布局',
      '保存到资产',
      '创建副本',
      '分组菜单',
      '批量下载',
      '添加到Chat',
      '创建为Skill',
    ]);
    expect(screen.queryByRole('button', { name: /生成|模型|参数/ })).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '添加到Chat' }));
    expect(callbacks.onAddToChat).toHaveBeenCalledWith(['a', 'b']);
  });
  it('opens a hover group menu on click without toggling it shut, blocks unavailable storyboard creation, and restores keyboard focus', async () => {
    const user = userEvent.setup();
    const onGroup = vi.fn();
    const onGroupStoryboard = vi.fn();
    render(
      <CanvasSelectionToolbar
        nodes={nodes}
        selectedIds={['a', 'b']}
        onGroup={onGroup}
        onGroupStoryboard={onGroupStoryboard}
        canStoryboardGroup={false}
        storyboardGroupDisabledReason="需要图片节点"
      />,
    );
    const trigger = screen.getByRole('button', { name: '分组菜单' });
    await user.hover(trigger);
    await screen.findByRole('menu', { name: '分组' });
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: '分组' })).toBeTruthy();
    const storyboard = screen.getByRole('menuitem', { name: '合并分镜组' });
    expect(storyboard.disabled).toBe(true);
    await user.click(storyboard);
    expect(onGroupStoryboard).not.toHaveBeenCalled();
    await user.click(screen.getByRole('menuitem', { name: '打组' }));
    expect(onGroup).toHaveBeenCalledWith(['a', 'b']);
    expect(screen.queryByRole('menu', { name: '分组' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('uses only source layout values, restores Escape focus, and closes when the document stops being editable', async () => {
    const user = userEvent.setup();
    const onLayoutChange = vi.fn();
    const props = { nodes, selectedIds: ['a', 'b'], onLayoutChange };
    const view = render(<CanvasSelectionToolbar {...props} />);
    const trigger = screen.getByRole('button', { name: '整理布局' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('menu', { name: '整理布局' });
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '宫格排列',
      '水平排列',
      '垂直排列',
    ]);
    await user.click(screen.getByRole('menuitem', { name: '水平排列' }));
    expect(onLayoutChange).toHaveBeenCalledWith('horizontal', ['a', 'b']);
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    view.rerender(<CanvasSelectionToolbar {...props} ready={false} />);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger.disabled).toBe(true);
    view.rerender(<CanvasSelectionToolbar {...props} readonly />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

function anchoredGeometry({
  width = 1280,
  height = 720,
  toolbarWidth = 400,
  toolbarHeight = 48,
} = {}) {
  const geometry = { width, height, toolbarWidth, toolbarHeight };
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.classList.contains('cv-board'))
      return new DOMRect(80, 40, geometry.width, geometry.height);
    if (this.classList.contains('cv-selection-toolbar'))
      return new DOMRect(0, 0, geometry.toolbarWidth, geometry.toolbarHeight);
    const toolbar = this.closest('.cv-selection-toolbar');
    if (toolbar && this.tagName === 'BUTTON')
      return new DOMRect(
        80 +
          Number.parseFloat(toolbar.style.left) -
          Math.min(geometry.toolbarWidth, geometry.width - 16) / 2 +
          8,
        40 + Number.parseFloat(toolbar.style.top) - geometry.toolbarHeight - 14 + 8,
        40,
        32,
      );
    if (this.classList.contains('cv-batch-menu')) return new DOMRect(0, 0, 150, 96);
    return original.call(this);
  });
  return geometry;
}
const anchoredProps = {
  nodes,
  selectedIds: ['a', 'b'],
  onLayoutChange: vi.fn(),
  onDuplicate: vi.fn(),
  onGroup: vi.fn(),
};
const anchoredView = (props = {}) => (
  <div className="cv-board">
    <CanvasSelectionToolbar {...anchoredProps} {...props} />
  </div>
);

describe('selection-bound source toolbar anchoring', () => {
  it('keeps source screen-sized controls 14px above the supplied canvas-local anchor', () => {
    anchoredGeometry();
    const style = document.createElement('style');
    style.textContent = readFileSync('src/features/canvas/batch/batch.css', 'utf8');
    document.head.append(style);
    render(anchoredView({ anchorPoint: { x: 640, y: 300 } }));
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.style.left).toBe('640px');
    expect(toolbar.style.top).toBe('300px');
    expect(toolbar.style.transform).toBe('translate(-50%, -100%) translateY(-14px)');
    expect(toolbar.style.maxWidth).toBe('1264px');
    const computed = getComputedStyle(toolbar);
    const rowStyle = [...style.sheet.cssRules].find(
      (rule) => rule.selectorText === '.cv-selection-toolbar',
    ).style;
    expect(computed.gap).toBe('8px');
    expect(computed.padding).toBe('8px');
    // jsdom does not resolve custom-property fallbacks in these declarations.
    expect(rowStyle.background).toBe('var(--canvas-controls-bg, #262626)');
    expect(rowStyle.border).toBe('0.5px solid var(--canvas-controls-border, #363636)');
    expect(computed.backdropFilter).toBe('blur(16px)');
    expect(computed.boxShadow).toBe('0 4px 10px #00000014');
    style.remove();
  });

  it('preserves the legacy caller style when no finite anchor is supplied', () => {
    const props = {
      style: {
        position: 'absolute',
        left: '50%',
        top: 16,
        transform: 'translateX(-50%)',
        zIndex: 99,
      },
    };
    const view = render(anchoredView(props));
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.style.left).toBe('50%');
    expect(toolbar.style.top).toBe('16px');
    expect(toolbar.style.transform).toBe('translateX(-50%)');
    expect(toolbar.style.zIndex).toBe('99');
    view.rerender(anchoredView({ ...props, anchorPoint: { x: NaN, y: 30 } }));
    expect(toolbar.style.left).toBe('50%');
  });

  it('keeps a wide row reachable in a narrow board with eight-pixel margins', () => {
    anchoredGeometry({ width: 320, height: 640, toolbarWidth: 720 });
    const view = render(anchoredView({ anchorPoint: { x: -900, y: -100 } }));
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.style.left).toBe('160px');
    expect(toolbar.style.top).toBe('70px');
    expect(toolbar.style.maxWidth).toBe('304px');
    view.rerender(anchoredView({ anchorPoint: { x: 9000, y: 9000 } }));
    expect(toolbar.style.left).toBe('160px');
    expect(toolbar.style.top).toBe('646px');
    expect(toolbar.style.transform).not.toContain('scale');
  });

  it('does not recreate an open menu or steal its keyboard focus when the selection moves', async () => {
    anchoredGeometry();
    const user = userEvent.setup();
    const view = render(anchoredView({ anchorPoint: { x: 640, y: 300 } }));
    const trigger = screen.getByRole('button', { name: '整理布局' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    const menu = await screen.findByRole('menu', { name: '整理布局' });
    const firstItem = screen.getByRole('menuitem', { name: '宫格排列' });
    expect(document.activeElement).toBe(firstItem);
    const previousLeft = menu.style.left;
    view.rerender(anchoredView({ anchorPoint: { x: 1000, y: 400 } }));
    expect(screen.getByRole('menu', { name: '整理布局' })).toBe(menu);
    expect(screen.getByRole('button', { name: '整理布局' })).toBe(trigger);
    expect(document.activeElement).toBe(firstItem);
    expect(menu.style.left).not.toBe(previousLeft);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
  });

  it('remeasures both the row and its board on resize, and cancels queued work when unmounted', () => {
    const geometry = anchoredGeometry();
    const observers = [],
      frames = new Map();
    let frameId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback) => {
        const id = ++frameId;
        frames.set(id, callback);
        return id;
      }),
    );
    const cancel = vi.fn((id) => frames.delete(id));
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          this.targets = [];
          this.disconnect = vi.fn();
          observers.push(this);
        }
        observe(target) {
          this.targets.push(target);
        }
      },
    );
    const view = render(anchoredView({ anchorPoint: { x: 900, y: 300 } }));
    const toolbar = screen.getByRole('toolbar');
    const observer = observers.find((item) => item.targets.includes(toolbar));
    expect(observer.targets.map((target) => target.className)).toEqual([
      'cv-selection-toolbar nodrag nopan nowheel ',
      'cv-board',
    ]);
    geometry.width = 390;
    act(() => observer.callback());
    act(() => {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback(16);
      }
    });
    expect(toolbar.style.left).toBe('195px');
    expect(toolbar.style.maxWidth).toBe('374px');
    fireEvent(window, new Event('resize'));
    expect(frames.size).toBe(1);
    view.unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(cancel).toHaveBeenCalled();
  });

  it('preserves source-relative positioning while a host temporarily has no measurable dimensions', () => {
    anchoredGeometry({ width: 0, height: 0, toolbarWidth: 0, toolbarHeight: 0 });
    render(anchoredView({ anchorPoint: { x: 420, y: 170 } }));
    expect(screen.getByRole('toolbar').style.left).toBe('420px');
    expect(screen.getByRole('toolbar').style.top).toBe('170px');
    expect(screen.getByRole('toolbar').style.maxWidth).toBe('');
  });
});
