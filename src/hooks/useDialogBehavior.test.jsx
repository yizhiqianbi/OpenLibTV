import { StrictMode, useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from '../components/Modal.jsx';
import { useEmbeddedCanvasFocus } from '../features/canvas/hooks/useEmbeddedCanvasFocus.js';
import { useDialogBehavior } from './useDialogBehavior.js';

const originalFullscreen = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
afterEach(() => {
  if (originalFullscreen) Object.defineProperty(document, 'fullscreenElement', originalFullscreen);
  else Reflect.deleteProperty(document, 'fullscreenElement');
});

function AutoFocusDialogs() {
  const [preview, setPreview] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button onClick={() => setPreview(true)}>打开素材预览</button>
      {preview && (
        <Modal title="素材预览" onClose={() => setPreview(false)}>
          <button onClick={() => setEditing(true)}>重命名素材</button>
        </Modal>
      )}
      {editing && (
        <Modal title="重命名素材" onClose={() => setEditing(false)}>
          <input autoFocus aria-label="素材名称" />
          <button onClick={() => setEditing(false)}>取消编辑</button>
        </Modal>
      )}
    </>
  );
}

function EnabledAutoFocusDialog() {
  const [enabled, setEnabled] = useState(false);
  const ref = useRef(null);
  useDialogBehavior(ref, { enabled, onClose: () => setEnabled(false) });
  return (
    <>
      <button onClick={() => setEnabled(true)}>首次打开</button>
      <button onClick={() => setEnabled(true)}>再次打开</button>
      <section ref={ref} role={enabled ? 'dialog' : undefined} tabIndex={-1}>
        {enabled && <input autoFocus aria-label="编辑内容" />}
      </section>
    </>
  );
}

function Canvas({ children, onClose, disableCopy = false }) {
  const canvasRoot = useRef();
  useEmbeddedCanvasFocus({ canvasRoot, embedded: true, onClose });
  return (
    <section ref={canvasRoot} role="dialog" aria-label="创作过程" tabIndex={-1}>
      <button>关闭画布</button>
      <button disabled={disableCopy}>复制到项目</button>
      {children}
    </section>
  );
}

function Stack({ canvas = true, modal = false, onCanvasClose, onModalClose, disableCopy = false }) {
  return (
    <>
      <button>页面入口</button>
      {canvas && <Canvas onClose={onCanvasClose} disableCopy={disableCopy} />}
      {modal && (
        <Modal title="登录" onClose={onModalClose}>
          <button>手机号登录</button>
        </Modal>
      )}
    </>
  );
}

describe('canvas and site dialog lifecycle', () => {
  it('returns from an auto-focused nested dialog to its opener, then back to the page', async () => {
    const user = userEvent.setup();
    render(<AutoFocusDialogs />);
    const opener = screen.getByRole('button', { name: '打开素材预览' });
    await user.click(opener);
    const rename = screen.getByRole('button', { name: '重命名素材' });
    await user.click(rename);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '素材名称' }));
    await user.click(screen.getByRole('button', { name: '取消编辑' }));
    expect(document.activeElement).toBe(rename);
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(
      within(screen.getByRole('dialog', { name: '素材预览' })).getByRole('button', {
        name: '关闭',
      }),
    );
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('preserves autoFocus through StrictMode effect replay and restores the outside opener', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <AutoFocusDialogs />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', { name: '打开素材预览' });
    await user.click(opener);
    const rename = screen.getByRole('button', { name: '重命名素材' });
    await user.click(rename);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '素材名称' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(rename);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('captures a fresh opener whenever an existing dialog becomes enabled again', async () => {
    const user = userEvent.setup();
    render(<EnabledAutoFocusDialog />);
    const first = screen.getByRole('button', { name: '首次打开' });
    await user.click(first);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '编辑内容' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(first);
    const second = screen.getByRole('button', { name: '再次打开' });
    await user.click(second);
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '编辑内容' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(second);
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps scrolling locked when a lower canvas unmounts before the top modal', () => {
    document.body.style.overflow = 'auto';
    const { rerender, unmount } = render(<Stack />);
    rerender(<Stack modal />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Stack canvas={false} modal />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('isolates only the top dialog, then returns focus to the canvas control', () => {
    const canvasClose = vi.fn();
    const modalClose = vi.fn();
    const { rerender, unmount } = render(<Stack onCanvasClose={canvasClose} />);
    const canvas = screen.getByRole('dialog', { name: '创作过程' });
    const copy = screen.getByRole('button', { name: '复制到项目' });
    copy.focus();
    rerender(<Stack modal onCanvasClose={canvasClose} onModalClose={modalClose} />);
    const modal = screen.getByRole('dialog', { name: '登录' });
    expect(canvas.inert).toBe(true);
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(modal);
    fireEvent.keyDown(modal, { key: 'Escape' });
    expect(modalClose).toHaveBeenCalledOnce();
    expect(canvasClose).not.toHaveBeenCalled();
    rerender(<Stack onCanvasClose={canvasClose} />);
    expect(canvas.inert).not.toBe(true);
    expect(canvas.getAttribute('aria-hidden')).toBeNull();
    expect(document.activeElement).toBe(copy);
    fireEvent.keyDown(copy, { key: 'Escape' });
    expect(canvasClose).toHaveBeenCalledOnce();
    unmount();
  });

  it('falls back to an enabled canvas control if the opening control is disabled', () => {
    const { rerender } = render(<Stack />);
    screen.getByRole('button', { name: '复制到项目' }).focus();
    rerender(<Stack modal disableCopy />);
    rerender(<Stack disableCopy />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭画布' }));
  });

  it('keeps a nested child dialog above its enclosing canvas on the first render', () => {
    const canvasClose = vi.fn();
    const modalClose = vi.fn();
    render(
      <Canvas onClose={canvasClose}>
        <Modal title="预览" onClose={modalClose}>
          <button>播放</button>
        </Modal>
      </Canvas>,
    );
    const preview = screen.getByRole('dialog', { name: '预览' });
    expect(document.activeElement).toBe(preview);
    fireEvent.keyDown(preview, { key: 'Escape' });
    expect(modalClose).toHaveBeenCalledOnce();
    expect(canvasClose).not.toHaveBeenCalled();
  });

  it('isolates new background controls while allowing feedback live regions to announce', async () => {
    const view = (feedback) => (
      <>
        <Modal title="操作" onClose={() => {}}>
          <button>复制</button>
        </Modal>
        {feedback && (
          <>
            <button aria-label="新增背景控件">背景</button>
            <div role="status">链接已复制</div>
          </>
        )}
      </>
    );
    const { rerender } = render(view(false));
    rerender(view(true));
    const background = screen.getByLabelText('新增背景控件');
    await waitFor(() => expect(background.getAttribute('aria-hidden')).toBe('true'));
    expect(screen.getByRole('status').getAttribute('aria-hidden')).toBeNull();
  });

  it('includes keyboard-accessible native media controls in the focus loop', () => {
    render(
      <Modal title="声音预览" onClose={() => {}}>
        <audio controls tabIndex={0} aria-label="参考音频" />
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: '声音预览' });
    const media = screen.getByLabelText('参考音频');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(media);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    media.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(media);
    dialog.querySelector('[data-dialog-focus-boundary="end"]').focus();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));
  });

  it('keeps the top modal focus loop inside a fullscreen player and restores the whole modal after exit', () => {
    let fullscreen = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreen,
    });
    const close = vi.fn();
    const { unmount } = render(
      <Canvas>
        <Modal title="影游试玩" onClose={close}>
          <section aria-label="全屏播放器" tabIndex={-1}>
            <button>选择剧情</button>
            <button>退出全屏</button>
          </section>
        </Modal>
      </Canvas>,
    );
    const modal = screen.getByRole('dialog', { name: '影游试玩' });
    const player = screen.getByLabelText('全屏播放器');
    const first = screen.getByRole('button', { name: '选择剧情' });
    const last = screen.getByRole('button', { name: '退出全屏' });
    const outside = within(modal).getByRole('button', { name: '关闭' });
    outside.focus();
    fullscreen = player;
    fireEvent(document, new Event('fullscreenchange'));
    expect(document.activeElement).toBe(player);
    fireEvent.keyDown(player, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    outside.focus();
    expect(document.activeElement).toBe(first);
    expect(document.body.style.overflow).toBe('hidden');
    expect(close).not.toHaveBeenCalled();
    fullscreen = null;
    fireEvent(document, new Event('fullscreenchange'));
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(outside, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps the modal as focus owner when the fullscreen element contains it', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => parent,
    });
    const { unmount } = render(
      <Modal title="全屏内弹窗" onClose={() => {}}>
        <button>确认全屏内操作</button>
      </Modal>,
      { container: parent },
    );
    const modal = screen.getByRole('dialog', { name: '全屏内弹窗' });
    const first = within(modal).getByRole('button', { name: '关闭' });
    const last = within(modal).getByRole('button', { name: '确认全屏内操作' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    unmount();
    parent.remove();
  });

  it('restores preexisting accessibility attributes and skips CSS-hidden controls', () => {
    const outside = document.createElement('div');
    outside.setAttribute('aria-hidden', 'false');
    outside.inert = false;
    document.body.appendChild(outside);
    const { unmount } = render(
      <Modal title="操作" onClose={() => {}} closeButton={false}>
        <button style={{ display: 'none' }}>隐藏</button>
        <button>确认</button>
        <button>取消</button>
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '确认' }));
    unmount();
    expect(outside.getAttribute('aria-hidden')).toBe('false');
    expect(outside.inert).toBe(false);
    outside.remove();
  });
});
