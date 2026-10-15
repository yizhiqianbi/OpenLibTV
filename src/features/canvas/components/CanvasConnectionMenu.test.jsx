import { readFileSync } from 'node:fs';
import { StrictMode, useMemo, useRef, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { TYPES } from '../catalog.js';
import { CanvasConnectionMenu } from './CanvasConnectionMenu.jsx';

const entries = [
  ...TYPES,
  { ...TYPES.find((entry) => entry.type === 'script-v2'), type: 'script', label: '脚本（旧版）' },
];

function Fixture({
  options,
  onClose,
  onChoose,
  onDialogClose,
  dialog,
  nodeId = 'n1',
  handleType = 'source',
  clientX = 100,
  clientY = 120,
  screenPosition,
  getScreenPosition,
  kind,
  title,
  restoreFocus,
}) {
  const opener = useRef(null);
  const [request, setRequest] = useState(null);
  const menu = useMemo(
    () =>
      request && { ...request, nodeId, handleType, clientX, clientY, kind, title, restoreFocus },
    [request, nodeId, handleType, clientX, clientY, kind, title, restoreFocus],
  );
  const content = (
    <>
      <button ref={opener} type="button" onClick={() => setRequest({ opener: opener.current })}>
        节点端口
      </button>
      <button type="button">其他输入</button>
      <CanvasConnectionMenu
        menu={menu}
        screenPosition={screenPosition}
        getScreenPosition={getScreenPosition}
        entries={options}
        onChoose={onChoose}
        onClose={(owner, context) => {
          if (context) onClose(owner, context);
          else onClose(owner);
          setRequest(null);
        }}
      />
    </>
  );
  return dialog ? (
    <EditorDialog title="画布" onClose={onDialogClose}>
      {content}
    </EditorDialog>
  ) : (
    <div>{content}</div>
  );
}
function setup(props = {}) {
  const onClose = vi.fn();
  const onChoose = vi.fn();
  const onDialogClose = vi.fn();
  const defaults = { options: entries, onClose, onChoose, onDialogClose, ...props };
  const view = render(<Fixture {...defaults} />);
  return {
    ...view,
    onClose,
    onChoose,
    onDialogClose,
    update: (patch) => view.rerender(<Fixture {...defaults} {...patch} />),
    open: () => fireEvent.click(screen.getByRole('button', { name: '节点端口' })),
  };
}

describe('Canvas handle connection menu', () => {
  it('follows its world anchor without recreating the owner, flyout or focused item', () => {
    const view = setup({ screenPosition: { x: 140, y: 160 } });
    view.open();
    const trigger = screen.getByRole('menuitem', { name: '脚本', exact: true });
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    const item = within(screen.getByRole('menu', { name: '脚本类型' })).getAllByRole('menuitem')[1];
    act(() => item.focus());
    const root = document.querySelector('.cv-connection-menu');
    expect(root.style.left).toBe('140px');
    expect(root.style.top).toBe('160px');
    view.update({ screenPosition: { x: 220, y: 80 } });
    expect(root.style.left).toBe('220px');
    expect(root.style.top).toBe('80px');
    expect(document.activeElement).toBe(item);
    expect(screen.getByRole('menu', { name: '脚本类型' }).isConnected).toBe(true);
    fireEvent.click(item);
    expect(view.onChoose).toHaveBeenCalledOnce();
    expect(view.onClose).not.toHaveBeenCalled();
  });
  it('renders only supplied supported types in source order and retains the script flyout', () => {
    const view = setup({ options: [...entries].reverse() });
    expect(screen.queryByRole('menu')).toBeNull();
    view.open();
    const menu = screen.getByRole('menu', { name: '引用该节点生成' });
    expect(menu.querySelector('button button')).toBeNull();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['文本', '图片', '视频', '智能剪辑', '音频', '脚本', '参考节点']);
    const scriptTrigger = within(menu).getByRole('menuitem', { name: '脚本' });
    fireEvent.mouseEnter(scriptTrigger);
    fireEvent.click(scriptTrigger);
    const scripts = screen.getByRole('menu', { name: '脚本类型' });
    expect(
      within(scripts)
        .getAllByRole('menuitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['脚本', '脚本（旧版）']);
    expect(scripts.textContent).toContain('NEW');
    expect(scripts.textContent).toContain('Beta');
    expect(scripts.querySelector('.cv-connection-icon')).toBeNull();
    expect(view.onChoose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });

  it('uses the target title and a direct ScriptV2 entry without a source flyout', () => {
    const view = setup({
      handleType: 'target',
      options: entries.filter((entry) => entry.type !== 'script'),
    });
    view.open();
    const menu = screen.getByRole('menu', { name: '添加上下文' });
    const script = within(menu).getByRole('menuitem', { name: '脚本' });
    expect(script.getAttribute('aria-haspopup')).toBeNull();
    fireEvent.click(script);
    expect(view.onChoose).toHaveBeenCalledWith(
      'script-v2',
      expect.objectContaining({
        nodeId: 'n1',
        handleType: 'target',
      }),
    );
    // Only a successful graph commit by the caller closes the controlled view.
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('disables rejected entries without suppressing them or allowing keyboard selection', () => {
    const options = entries.map((entry) =>
      entry.type === 'image' ? { ...entry, disabled: true, reason: '此节点不支持图片输入' } : entry,
    );
    const view = setup({ options });
    view.open();
    const image = screen.getByRole('menuitem', { name: '图片' });
    expect(image.disabled).toBe(true);
    expect(image.title).toBe('此节点不支持图片输入');
    fireEvent.click(image);
    fireEvent.keyDown(image, { key: 'Enter' });
    expect(view.onChoose).not.toHaveBeenCalled();
    const text = screen.getByRole('menuitem', { name: '文本' });
    expect(document.activeElement).toBe(text);
    fireEvent.keyDown(text, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '视频' }));
  });

  it('does not open a script group when every script option is disabled', () => {
    const view = setup({
      options: entries.map((entry) =>
        ['script-v2', 'script'].includes(entry.type) ? { ...entry, disabled: true } : entry,
      ),
    });
    view.open();
    const trigger = screen.getByRole('menuitem', { name: '脚本' });
    expect(trigger.disabled).toBe(true);
    fireEvent.mouseEnter(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    expect(screen.queryByRole('menu', { name: '脚本类型' })).toBeNull();
  });

  it('supports arrows, Home, End, Tab and native Enter without invoking graph writes twice', () => {
    const view = setup();
    view.open();
    const text = screen.getByRole('menuitem', { name: '文本' });
    const reference = screen.getByRole('menuitem', { name: '参考节点' });
    fireEvent.keyDown(text, { key: 'End' });
    expect(document.activeElement).toBe(reference);
    fireEvent.keyDown(reference, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(text);
    fireEvent.keyDown(text, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(reference);
    fireEvent.keyDown(reference, { key: 'Home' });
    fireEvent.keyDown(text, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(reference);
    fireEvent.keyDown(reference, { key: 'Tab' });
    fireEvent.keyDown(text, { key: 'Enter' });
    expect(view.onChoose).toHaveBeenCalledTimes(1);
    expect(view.onChoose).toHaveBeenCalledWith('text', expect.objectContaining({ nodeId: 'n1' }));
  });

  it('opens and leaves the script flyout by keyboard, preserving its original item selection', () => {
    const view = setup();
    view.open();
    const trigger = screen.getByRole('menuitem', { name: '脚本' });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    const submenu = screen.getByRole('menu', { name: '脚本类型' });
    const items = within(submenu).getAllByRole('menuitem');
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'Enter' });
    expect(view.onChoose).toHaveBeenCalledWith('script', expect.objectContaining({ nodeId: 'n1' }));
    fireEvent.keyDown(items[1], { key: 'ArrowLeft' });
    expect(screen.queryByRole('menu', { name: '脚本类型' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes just the menu on Escape and restores the actual handle', () => {
    const view = setup({ dialog: true });
    view.open();
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('dialog', { name: '画布' }).contains(menu)).toBe(true);
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '节点端口' }));
    expect(view.onDialogClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(view.onDialogClose).toHaveBeenCalledTimes(1);
  });

  it('shares the dialog Tab handler without letting the parent Escape close first', () => {
    const view = setup({ dialog: true });
    view.open();
    const reference = screen.getByRole('menuitem', { name: '参考节点' });
    act(() => reference.focus());
    fireEvent.keyDown(reference, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '文本' }));
    const trigger = screen.getByRole('menuitem', { name: '脚本' });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(view.onDialogClose).not.toHaveBeenCalled();
  });

  it('dismisses on outside pointer or focus without stealing the new focus', () => {
    const view = setup();
    view.open();
    const other = screen.getByRole('button', { name: '其他输入' });
    act(() => other.focus());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(other);
    expect(view.onClose).toHaveBeenCalledTimes(1);
    view.open();
    fireEvent.pointerDown(other);
    act(() => other.focus());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(other);
    expect(view.onClose).toHaveBeenCalledTimes(2);
  });

  it('preserves the legacy pending source only for outside pointerdown on a plain node body', () => {
    const view = setup();
    const node = document.createElement('article');
    node.className = 'cv-node';
    node.tabIndex = 0;
    const body = document.createElement('div');
    body.className = 'cv-node-content';
    const label = document.createElement('span');
    body.append(label);
    node.append(body);
    document.body.append(node);
    view.open();
    fireEvent.pointerDown(label);
    expect(view.onClose).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: 'n1' }), {
      preserveConnection: true,
    });
    expect(screen.queryByRole('menu')).toBeNull();
    view.open();
    act(() => node.focus());
    expect(view.onClose).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: 'n1' }));
    node.remove();
  });

  it.each([
    ['button', ''],
    ['input', ''],
    ['textarea', ''],
    ['img', ''],
    ['video', ''],
    ['audio', ''],
    ['div', 'cv-floating'],
    ['div', 'cv-inline-generator'],
    ['div', 'cv-storyboard'],
    ['div', 'cv-handle'],
    ['div', 'nopan'],
    ['div', 'nowheel'],
    ['div', 'contenteditable'],
  ])('never preserves a pending connection for a node UI %s %s', (tag, kind) => {
    const view = setup();
    const node = document.createElement('article');
    node.className = 'cv-node';
    const field = document.createElement(tag);
    if (kind === 'contenteditable') field.setAttribute('contenteditable', 'true');
    else field.className = kind;
    node.append(field);
    document.body.append(node);
    view.open();
    fireEvent.pointerDown(field);
    expect(view.onClose).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ nodeId: 'n1' }));
    node.remove();
  });

  it('releases the old owner and uses current callbacks after a document/node change', () => {
    const view = setup();
    view.open();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    const nextChoose = vi.fn();
    view.update({ nodeId: 'n2', onChoose: nextChoose });
    expect(screen.queryByRole('menu', { name: '脚本类型' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '图片' }));
    expect(nextChoose).toHaveBeenCalledWith('image', expect.objectContaining({ nodeId: 'n2' }));
    expect(view.onChoose).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(view.onClose).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'n2' }));
  });

  it('clamps the actual panel size to an eight-pixel viewport margin without adding anchor offset', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(0, 0, 220, 296)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 600);
    const view = setup({ clientX: 385, clientY: 590 });
    view.open();
    const container = screen.getByRole('menu').parentElement;
    expect(container.style.left).toBe('162px');
    expect(container.style.top).toBe('296px');
    view.update({ clientX: 35, clientY: 40 });
    expect(container.style.left).toBe('35px');
    expect(container.style.top).toBe('40px');
    vi.unstubAllGlobals();
  });

  it('ignores unsupported candidates and keeps an accessible dismissible empty menu', () => {
    const view = setup({ options: [{ type: 'unverified', label: '未核实工具' }] });
    view.open();
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('暂无可添加的节点');
    expect(document.activeElement).toBe(screen.getByRole('menu'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '节点端口' }));
  });

  it('keeps the script flyout within a narrow viewport and reverses it when desktop space permits', () => {
    let triggerLeft = 176;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('cv-connection-submenu')) return new DOMRect(0, 0, 220, 86);
      if (this.getAttribute('aria-haspopup') === 'menu')
        return new DOMRect(triggerLeft, 530, 192, 36);
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(162, 296, 220, 296)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 600);
    const view = setup({ clientX: 385, clientY: 590 });
    view.open();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    let submenu = screen.getByRole('menu', { name: '脚本类型' });
    expect(submenu.style.left).toBe('162px');
    expect(submenu.style.top).toBe('436px');
    expect(submenu.getAttribute('data-placement')).toBe('above');
    expect(submenu.classList.contains('is-reversed')).toBe(false);
    expect(document.querySelector('.cv-connection-submenu-bridge').style.left).toBe('162px');
    vi.stubGlobal('innerWidth', 1024);
    triggerLeft = 810;
    view.update({ clientX: 1010 });
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    submenu = screen.getByRole('menu', { name: '脚本类型' });
    expect(submenu.style.left).toBe('582px');
    expect(submenu.classList.contains('is-reversed')).toBe(true);
    expect(document.querySelector('.cv-connection-submenu-bridge').style.left).toBe('802px');
    vi.unstubAllGlobals();
  });

  it.each([
    { mainTop: 450, triggerTop: 667, placement: 'below', subTop: 711, bridgeTop: 703 },
    { mainTop: 528, triggerTop: 745, placement: 'above', subTop: 651, bridgeTop: 737 },
  ])(
    'keeps a 390×844 hover then click off the script submenu: $placement',
    ({ mainTop, triggerTop, placement, subTop, bridgeTop }) => {
      const anchor = new DOMRect(119, triggerTop, 206, 36);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.classList.contains('cv-connection-submenu')) return new DOMRect(0, 0, 220, 86);
        if (this.getAttribute('aria-haspopup') === 'menu') return anchor;
        return this.classList.contains('cv-connection-panel')
          ? new DOMRect(112, mainTop, 220, 296)
          : new DOMRect();
      });
      vi.stubGlobal('innerWidth', 390);
      vi.stubGlobal('innerHeight', 844);
      const view = setup({ clientX: 112, clientY: mainTop });
      view.open();
      const trigger = screen.getByRole('menuitem', { name: '脚本' });
      fireEvent.mouseEnter(trigger);
      const submenu = screen.getByRole('menu', { name: '脚本类型' });
      const left = Number.parseFloat(submenu.style.left);
      const top = Number.parseFloat(submenu.style.top);
      expect(submenu.getAttribute('data-placement')).toBe(placement);
      expect(left).toBe(119);
      expect(top).toBe(subTop);
      expect(top + 86 <= anchor.top || top >= anchor.bottom).toBe(true);
      expect(left >= 8 && left + 220 <= 382).toBe(true);
      expect(top >= 8 && top + 86 <= 836).toBe(true);
      const bridge = document.querySelector('.cv-connection-submenu-bridge');
      expect(bridge.style.left).toBe('119px');
      expect(bridge.style.top).toBe(`${bridgeTop}px`);
      expect(bridge.style.width).toBe('220px');
      expect(bridge.style.height).toBe('8px');
      fireEvent.click(trigger);
      expect(view.onChoose).not.toHaveBeenCalled();
      expect(screen.getByRole('menu', { name: '脚本类型' })).toBe(submenu);
      fireEvent.click(within(submenu).getByRole('menuitem', { name: '脚本' }));
      expect(view.onChoose).toHaveBeenCalledExactlyOnceWith(
        'script-v2',
        expect.objectContaining({ nodeId: 'n1' }),
      );
      vi.unstubAllGlobals();
    },
  );

  it('keeps the source right-side flyout on a desktop with sufficient horizontal space', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('cv-connection-submenu')) return new DOMRect(0, 0, 220, 86);
      if (this.getAttribute('aria-haspopup') === 'menu') return new DOMRect(307, 467, 206, 36);
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(300, 250, 220, 296)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 1280);
    vi.stubGlobal('innerHeight', 844);
    const view = setup({ clientX: 300, clientY: 250 });
    view.open();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    const submenu = screen.getByRole('menu', { name: '脚本类型' });
    expect(submenu.getAttribute('data-placement')).toBe('right');
    expect(submenu.style.left).toBe('521px');
    expect(submenu.style.top).toBe('467px');
    expect(document.querySelector('.cv-connection-submenu-bridge').style.width).toBe('8px');
    vi.unstubAllGlobals();
  });

  it('limits a vertical flyout to available height so a small viewport still avoids its trigger', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('cv-connection-submenu')) return new DOMRect(0, 0, 220, 86);
      if (this.getAttribute('aria-haspopup') === 'menu') return new DOMRect(119, 54, 206, 36);
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(112, 8, 220, 104)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 120);
    const view = setup({ clientX: 112, clientY: 8 });
    view.open();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    const submenu = screen.getByRole('menu', { name: '脚本类型' });
    expect(submenu.getAttribute('data-placement')).toBe('above');
    expect(submenu.style.top).toBe('8px');
    expect(submenu.style.maxHeight).toBe('38px');
    expect(8 + 38).toBeLessThan(54);
    vi.unstubAllGlobals();
  });

  it('cancels scheduled resize work and disconnects each observer when the menu owner ends', () => {
    const frames = new Map();
    let nextFrame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
    const observers = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }
      },
    );
    const view = setup();
    view.open();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '脚本' }));
    fireEvent(window, new Event('resize'));
    expect(frames.size).toBeGreaterThan(0);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(observers.every((observer) => observer.disconnect.mock.calls.length > 0)).toBe(true);
    vi.unstubAllGlobals();
  });

  it('cleans listeners and observers through StrictMode replay and final unmount', () => {
    const close = vi.fn();
    const view = render(
      <StrictMode>
        <Fixture options={entries} onClose={close} onChoose={vi.fn()} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: '节点端口' }));
    expect(close).not.toHaveBeenCalled();
    view.unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
});

const multiTypes = ['text', 'image', 'video', 'video-clip', 'audio', 'script-v2'];
const multiLabels = ['文本生成', '图片生成', '视频生成', '视频', '音频', '脚本生成'];
const multiIcons = [
  'text-align-left',
  'image-generator-n',
  'video-generator-n',
  'icon-scissors',
  'audio-lines',
  'imageset',
];
const multiEntries = multiTypes.map((type, index) => ({
  ...entries.find((entry) => entry.type === type),
  label: multiLabels[index],
  iconAsset: multiIcons[index],
}));
const multiTitle = '引用选中的 2 个图片节点';
const setupMulti = (props = {}) =>
  setup({
    kind: 'multi',
    title: multiTitle,
    options: multiEntries,
    ...props,
  });

describe('multiple-source connection menu view', () => {
  it('presents the six supplied batch types directly in source order without script grouping or badges', () => {
    const options = [...multiEntries].reverse();
    const view = setupMulti({ options });
    view.open();
    const panel = screen.getByRole('menu', { name: multiTitle });
    expect(panel.parentElement.classList.contains('cv-multi-connection-menu')).toBe(true);
    const items = within(panel).getAllByRole('menuitem');
    expect(items.map((item) => item.getAttribute('data-feature-id'))).toEqual(
      multiTypes.map((type) => `node-type:${type}`),
    );
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(multiLabels);
    expect(
      [...panel.querySelectorAll('.cv-connection-source-icon')].map((icon) => icon.style.maskImage),
    ).toEqual(multiIcons.map((icon) => `url("/assets/icons/${icon}.svg")`));
    expect(panel.querySelector('.cv-connection-badge')).toBeNull();
    const script = within(panel).getByRole('menuitem', { name: '脚本生成', exact: true });
    expect(script.getAttribute('aria-haspopup')).toBeNull();
    fireEvent.mouseEnter(script);
    fireEvent.keyDown(script, { key: 'ArrowRight' });
    expect(screen.queryByRole('menu', { name: '脚本类型' })).toBeNull();
    fireEvent.click(script);
    expect(view.onChoose).toHaveBeenCalledExactlyOnceWith(
      'script-v2',
      expect.objectContaining({ kind: 'multi', title: multiTitle }),
    );
    expect(screen.getByRole('menu', { name: multiTitle })).toBe(panel);
  });

  it('keeps the source 196-pixel panel, 32-pixel rows and 14-pixel icons independent of the ordinary menu', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-connection-menu.css',
      'utf8',
    );
    document.head.append(style);
    try {
      const view = setupMulti();
      view.open();
      const panel = screen.getByRole('menu', { name: multiTitle });
      const rules = [...style.sheet.cssRules];
      const panelRule = rules.find(
        (rule) => rule.selectorText === '.cv-multi-connection-menu .cv-connection-panel',
      );
      // jsdom drops this viewport min()/calc() declaration from its CSSOM.
      expect(panelRule).toBeDefined();
      expect(style.textContent).toMatch(
        /\.cv-multi-connection-menu \.cv-connection-panel\s*\{\s*width:\s*min\(196px, calc\(100vw - 16px\)\);/,
      );
      expect(getComputedStyle(panel).minWidth).toBe('0px');
      expect(getComputedStyle(panel).gap).toBe('4px');
      expect(getComputedStyle(panel).padding).toBe('8px');
      expect(getComputedStyle(panel).borderWidth).toBe('0.5px');
      expect(
        within(panel)
          .getAllByRole('menuitem')
          .map((item) => getComputedStyle(item).height),
      ).toEqual(Array(6).fill('32px'));
      expect(
        [...panel.querySelectorAll('.cv-connection-icon')].map(
          (icon) => getComputedStyle(icon).width,
        ),
      ).toEqual(Array(6).fill('14px'));
    } finally {
      style.remove();
    }
  });

  it('centers vertically on the endpoint and clamps the measured panel to all viewport edges', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(0, 0, 196, 264)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 600);
    try {
      const view = setupMulti({ screenPosition: { x: 120, y: 300 } });
      view.open();
      const root = screen.getByRole('menu', { name: multiTitle }).parentElement;
      expect(root.style.left).toBe('120px');
      expect(root.style.top).toBe('168px');
      view.update({ screenPosition: { x: -50, y: 20 } });
      expect(root.style.left).toBe('8px');
      expect(root.style.top).toBe('8px');
      view.update({ screenPosition: { x: 385, y: 580 } });
      expect(root.style.left).toBe('186px');
      expect(root.style.top).toBe('328px');
      vi.stubGlobal('innerHeight', 120);
      view.update({ screenPosition: { x: 385, y: 119 } });
      expect(root.style.top).toBe('8px');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('updates its screen anchor and viewport clamp without remounting or stealing the focused batch item', () => {
    const frames = new Map();
    let nextFrame = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('cv-connection-panel')
        ? new DOMRect(0, 0, 196, 264)
        : new DOMRect();
    });
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 700);
    try {
      let point = { x: 220, y: 300 };
      const readPosition = () => point;
      const view = setupMulti({ screenPosition: point, getScreenPosition: readPosition });
      view.open();
      const panel = screen.getByRole('menu', { name: multiTitle });
      const root = panel.parentElement;
      const focused = within(panel).getByRole('menuitem', { name: '音频' });
      act(() => focused.focus());
      point = { x: 410, y: 400 };
      view.update({ screenPosition: point });
      expect(root.style.left).toBe('410px');
      expect(root.style.top).toBe('268px');
      expect(document.activeElement).toBe(focused);
      point = { x: 380, y: 590 };
      vi.stubGlobal('innerWidth', 390);
      vi.stubGlobal('innerHeight', 600);
      fireEvent(window, new Event('resize'));
      act(() => {
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(0));
      });
      expect(root.style.left).toBe('186px');
      expect(root.style.top).toBe('328px');
      expect(screen.getByRole('menu', { name: multiTitle })).toBe(panel);
      expect(document.activeElement).toBe(focused);
      fireEvent.keyDown(focused, { key: 'Enter' });
      expect(view.onChoose).toHaveBeenCalledExactlyOnceWith(
        'audio',
        expect.objectContaining({ kind: 'multi' }),
      );
      expect(view.onClose).not.toHaveBeenCalled();
      view.unmount();
      expect(frames.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores the batch opener on Escape and leaves the containing editor dialog open', () => {
    const view = setupMulti({ dialog: true });
    view.open();
    const panel = screen.getByRole('menu', { name: multiTitle });
    expect(screen.getByRole('dialog', { name: '画布' }).contains(panel)).toBe(true);
    fireEvent.keyDown(within(panel).getByRole('menuitem', { name: '视频' }), { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: multiTitle })).toBeNull();
    expect(view.onClose).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'multi' }),
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '节点端口' }));
    expect(view.onDialogClose).not.toHaveBeenCalled();
  });

  it('uses the caller focus fallback once when the transient selection opener is gone', () => {
    const restoreFocus = vi.fn(() => screen.getByRole('button', { name: '其他输入' }).focus());
    const view = setupMulti({ restoreFocus });
    view.open();
    screen.getByRole('button', { name: '节点端口' }).remove();
    fireEvent.keyDown(screen.getByRole('menu', { name: multiTitle }), { key: 'Escape' });
    expect(restoreFocus).toHaveBeenCalledOnce();
    expect(view.onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '其他输入' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

  it('dismisses on a plain node body without retaining the ordinary pending-link protocol or stealing focus', () => {
    const view = setupMulti();
    const node = document.createElement('article');
    node.className = 'cv-node';
    node.tabIndex = 0;
    const body = document.createElement('div');
    body.className = 'cv-node-content';
    node.append(body);
    document.body.append(node);
    try {
      view.open();
      fireEvent.pointerDown(body);
      act(() => node.focus());
      expect(view.onClose).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ kind: 'multi' }),
      );
      expect(screen.queryByRole('menu', { name: multiTitle })).toBeNull();
      expect(document.activeElement).toBe(node);
    } finally {
      node.remove();
    }
  });

  it('keeps rejected batch choices visible and skips them during keyboard navigation', () => {
    const view = setupMulti({
      options: multiEntries.map((entry) =>
        ['text', 'video-clip', 'script-v2'].includes(entry.type)
          ? { ...entry, disabled: true, reason: '不支持所选输入' }
          : entry,
      ),
    });
    view.open();
    const panel = screen.getByRole('menu', { name: multiTitle });
    expect(within(panel).getAllByRole('menuitem')).toHaveLength(6);
    const text = within(panel).getByRole('menuitem', { name: '文本生成' });
    expect(text.disabled).toBe(true);
    expect(text.title).toBe('不支持所选输入');
    fireEvent.click(text);
    fireEvent.keyDown(text, { key: 'Enter' });
    expect(view.onChoose).not.toHaveBeenCalled();
    const image = within(panel).getByRole('menuitem', { name: '图片生成' });
    expect(document.activeElement).toBe(image);
    fireEvent.keyDown(image, { key: 'End' });
    const audio = within(panel).getByRole('menuitem', { name: '音频' });
    expect(document.activeElement).toBe(audio);
    fireEvent.keyDown(audio, { key: 'Tab' });
    expect(document.activeElement).toBe(image);
    fireEvent.keyDown(image, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(panel).getByRole('menuitem', { name: '视频生成' }));
  });

  it('does not call the transient-opener fallback when focus moves to an outside control', () => {
    const restoreFocus = vi.fn();
    const view = setupMulti({ restoreFocus });
    view.open();
    screen.getByRole('button', { name: '节点端口' }).remove();
    const other = screen.getByRole('button', { name: '其他输入' });
    act(() => other.focus());
    expect(screen.queryByRole('menu', { name: multiTitle })).toBeNull();
    expect(view.onClose).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: 'multi' }),
    );
    expect(restoreFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(other);
  });
});
