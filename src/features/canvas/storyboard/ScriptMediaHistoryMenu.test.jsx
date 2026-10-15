import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { ScriptMediaHistoryMenu } from './ScriptMediaHistoryMenu.jsx';

const createdAt = new Date(2026, 9, 11, 9, 5).toISOString();
const versions = [
  { versionId: 'first', nodeId: 'n1', createdAt, isActive: false },
  { versionId: 'second', nodeId: 'n2', createdAt: 'invalid', isActive: true },
  { versionId: 'third', nodeId: 'n3', createdAt: undefined, isActive: false },
];
function setup(props = {}) {
  const onClose = vi.fn();
  const onJumpToNode = vi.fn();
  const onSetActive = vi.fn(async () => true);
  const parentClick = vi.fn();
  const renderContent = (options) => (
    <EditorDialog title="最终提示词" onClose={onClose}>
      <div onClick={parentClick}>
        <ScriptMediaHistoryMenu
          versions={versions}
          onJumpToNode={onJumpToNode}
          onSetActive={onSetActive}
          {...options}
        />
      </div>
      <button type="button">其他输入</button>
    </EditorDialog>
  );
  const view = render(renderContent(props));
  return {
    ...view,
    onClose,
    onJumpToNode,
    onSetActive,
    parentClick,
    update: (patch) => view.rerender(renderContent({ ...props, ...patch })),
    open: () => fireEvent.click(screen.getByRole('button', { name: /版本 v/ })),
  };
}
describe('ScriptV2 media history source menu', () => {
  it('renders no trigger for an empty list and leaves the one-version gate with the caller', () => {
    const view = setup({ versions: [] });
    expect(screen.queryByRole('button', { name: /版本 v/ })).toBeNull();
    view.update({ versions: [versions[1]] });
    expect(screen.getByRole('button', { name: '图片版本 v1/1' })).toBeTruthy();
  });
  it('keeps original order, numbers the first active entry and formats only valid timestamps', () => {
    const view = setup();
    expect(screen.getByRole('button', { name: '图片版本 v2/3' }).title).toBe(
      '图片版本 v2/3（点击查看历史）',
    );
    view.open();
    const menu = screen.getByRole('menu', { name: '图片版本历史' });
    expect(menu.querySelector('button button')).toBeNull();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual([
      '跳转到图片版本 v1',
      '将图片版本 v1 设为当前',
      '跳转到图片版本 v2，当前版本',
      '跳转到图片版本 v3',
      '将图片版本 v3 设为当前',
    ]);
    expect(menu.textContent).toContain('10/11 09:05');
    expect(menu.querySelectorAll('img,video')).toHaveLength(0);
    expect(menu.textContent).not.toContain('invalid');
    expect(view.parentClick).not.toHaveBeenCalled();
  });
  it('uses v? when no active entry and marks the first active entry when data contains several', () => {
    const view = setup({ versions: versions.map((item) => ({ ...item, isActive: false })) });
    expect(screen.getByRole('button', { name: '图片版本 v?/3' })).toBeTruthy();
    view.update({ versions: versions.map((item) => ({ ...item, isActive: true })) });
    expect(screen.getByRole('button', { name: '图片版本 v1/3' })).toBeTruthy();
  });
  it('shows a video image-source prefix of six characters and the full ID as its title', () => {
    const view = setup({
      kind: 'video',
      versions: [
        { ...versions[0], sourceImageVersionId: 'image-abcdef' },
        { ...versions[1], sourceImageVersionId: 'abc' },
      ],
    });
    view.open();
    const menu = screen.getByRole('menu', { name: '视频版本历史' });
    expect(screen.getByRole('button', { name: '视频版本 vV2/2' })).toBeTruthy();
    expect(within(menu).getByText('←image-').title).toBe('图源 image-abcdef');
    expect(within(menu).getByText('←abc').title).toBe('图源 abc');
    expect(menu.textContent).toContain('点击行 = 跳转到画布节点；←标记表示绑定的图源版本');
  });
  it('jumps without closing, and changes the active version without triggering a row jump', async () => {
    const view = setup();
    view.open();
    fireEvent.click(screen.getByRole('menuitem', { name: '跳转到图片版本 v1' }));
    expect(view.onJumpToNode).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('menu')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '将图片版本 v3 设为当前' }));
    });
    expect(view.onSetActive).toHaveBeenCalledWith('third');
    expect(view.onJumpToNode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeTruthy();
    view.update({
      versions: versions.map((item) => ({ ...item, isActive: item.versionId === 'third' })),
    });
    expect(screen.getByRole('button', { name: '图片版本 v3/3' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '将图片版本 v3 设为当前' })).toBeNull();
    expect(view.parentClick).not.toHaveBeenCalled();
  });
  it('keeps readonly history navigation and disables only writes when disabled', () => {
    const view = setup({ readonly: true, disabled: true });
    view.open();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('menuitem', { name: '跳转到图片版本 v1' }));
    expect(view.onJumpToNode).toHaveBeenCalledWith('n1');
    view.update({ readonly: false, disabled: true });
    expect(screen.getByRole('menuitem', { name: '将图片版本 v1 设为当前' }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '跳转到图片版本 v1' }).disabled).toBe(false);
  });
  it('keeps the menu and error after async false, then permits a retry', async () => {
    const onSetActive = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const view = setup({ onSetActive });
    view.open();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '将图片版本 v1 设为当前' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('版本切换未保存，请重试');
    expect(screen.getByRole('menu')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '将图片版本 v1 设为当前' }));
    });
    expect(onSetActive).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('supports arrows, Home/End and Enter with looped navigation', () => {
    const view = setup({ readonly: true });
    const trigger = screen.getByRole('button', { name: '图片版本 v2/3' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'End' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: 'Home' });
    fireEvent.keyDown(items[0], { key: 'Enter' });
    expect(view.onJumpToNode).toHaveBeenCalledWith('n1');
    expect(screen.getByRole('menu')).toBeTruthy();
  });
  it('portals inside the owner dialog and Escape closes just the menu, returning to its trigger', () => {
    const view = setup();
    view.open();
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('dialog', { name: '最终提示词' }).contains(menu)).toBe(true);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '图片版本 v2/3' }));
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledTimes(1);
  });
  it('shares the dialog Tab capture and loops through menu actions without leaving the menu', () => {
    setup({ readonly: true }).open();
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(menu, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(items[2]);
  });
  it('closes on outside focus and pointer without stealing the newly focused control', () => {
    const view = setup();
    view.open();
    const other = screen.getByRole('button', { name: '其他输入' });
    act(() => other.focus());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(other);
    view.open();
    fireEvent.pointerDown(other);
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => other.focus());
    expect(document.activeElement).toBe(other);
  });
  it('allows navigation while saving and ignores a late failed result after unmount', async () => {
    let resolve;
    const onSetActive = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = setup({ onSetActive });
    view.open();
    fireEvent.click(screen.getByRole('menuitem', { name: '将图片版本 v1 设为当前' }));
    expect(screen.getByRole('menuitem', { name: '将图片版本 v3 设为当前' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '跳转到图片版本 v3' }));
    expect(view.onJumpToNode).toHaveBeenCalledWith('n3');
    view.unmount();
    await act(async () => resolve(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('positions bottom-start with the source arrow offset and keeps a narrow viewport margin', () => {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    window.innerWidth = 390;
    window.innerHeight = 844;
    const rectangle = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        return this.classList.contains('cv-script-history-menu')
          ? { width: 324, height: 250 }
          : { left: 340, top: 96, bottom: 115, width: 55 };
      });
    const view = setup();
    try {
      view.open();
      const menu = screen.getByRole('menu');
      expect(menu.style.left).toBe('58px');
      expect(menu.style.top).toBe('126.5px');
      expect(menu.style.getPropertyValue('--script-history-arrow-x')).toBe('63px');
      expect(menu.style.getPropertyValue('--script-history-arrow-y')).toBe('123px');
      expect(menu.classList.contains('is-above')).toBe(false);
    } finally {
      view.unmount();
      rectangle.mockRestore();
      window.innerWidth = previousWidth;
      window.innerHeight = previousHeight;
    }
  });
  it('flips above near the viewport bottom and keeps the arrow beside the menu start', () => {
    const previousHeight = window.innerHeight;
    window.innerHeight = 844;
    const rectangle = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        return this.classList.contains('cv-script-history-menu')
          ? { width: 280, height: 250 }
          : { left: 120, top: 790, bottom: 809, width: 55 };
      });
    const view = setup();
    try {
      view.open();
      const menu = screen.getByRole('menu');
      expect(menu.style.bottom).toBe('65.5px');
      expect(menu.style.top).toBe('');
      expect(menu.style.getPropertyValue('--script-history-arrow-x')).toBe('125px');
      expect(menu.style.getPropertyValue('--script-history-arrow-y')).toBe('775px');
      expect(menu.classList.contains('is-above')).toBe(true);
    } finally {
      view.unmount();
      rectangle.mockRestore();
      window.innerHeight = previousHeight;
    }
  });
});
