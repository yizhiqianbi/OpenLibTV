import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { canvasStoryboardUnlinkNotice } from '../domain/storyboard-unlink-model.js';
import { CanvasDeleteConfirmation } from './CanvasDeleteConfirmation.jsx';

const request = Object.freeze({
  title: '确认删除',
  message: '删除当前节点后，数据可能会丢失，也可通过 ⌘Z 撤销。确定要删除吗？',
  confirmText: '确定删除',
  cancelText: '取消',
});
const controls = (value = request) => ({ request: value, confirm: vi.fn(), cancel: vi.fn() });

describe('shared deletion confirmation view', () => {
  it('renders nothing without a request', () => {
    const page = render(<CanvasDeleteConfirmation controls={controls(null)} />);
    expect(page.container.childElementCount).toBe(0);
  });
  it('uses literal request wording and routes confirm/cancel with its captured opaque request', () => {
    const current = controls();
    render(<CanvasDeleteConfirmation controls={current} />);
    const dialog = screen.getByRole('dialog', { name: '确认删除' });
    expect(within(dialog).getByText(request.message)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '确定删除' }));
    expect(current.confirm).toHaveBeenCalledExactlyOnceWith(request);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(current.cancel).toHaveBeenCalledExactlyOnceWith(request);
  });
  it('routes the existing close button and backdrop through cancel rather than mutation', () => {
    const current = controls();
    const page = render(<CanvasDeleteConfirmation controls={current} />);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.mouseDown(page.container.querySelector('.cv-modal-overlay'));
    expect(current.cancel).toHaveBeenNthCalledWith(1, request);
    expect(current.cancel).toHaveBeenNthCalledWith(2, request);
    expect(current.confirm).not.toHaveBeenCalled();
  });
  it('selects the complete unlink warning on double click without confirming or cancelling', () => {
    const current = controls(canvasStoryboardUnlinkNotice);
    render(<CanvasDeleteConfirmation controls={current} sourceUnlinkChrome />);
    const message = screen.getByText(canvasStoryboardUnlinkNotice.message);
    fireEvent.doubleClick(message);
    expect(String(window.getSelection())).toBe(canvasStoryboardUnlinkNotice.message);
    expect(current.confirm).not.toHaveBeenCalled();
    expect(current.cancel).not.toHaveBeenCalled();
    window.getSelection().removeAllRanges();
  });
  it('isolates pointer, click, double-click and context-menu propagation to the canvas owner', () => {
    const pointer = vi.fn(),
      click = vi.fn(),
      doubleClick = vi.fn(),
      context = vi.fn();
    render(
      <div
        onPointerDown={pointer}
        onClick={click}
        onDoubleClick={doubleClick}
        onContextMenu={context}
      >
        <CanvasDeleteConfirmation controls={controls()} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '确定删除' });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    fireEvent.contextMenu(button);
    expect(pointer).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(doubleClick).not.toHaveBeenCalled();
    expect(context).not.toHaveBeenCalled();
  });
  it('shares the dialog stack with an existing preview and restores its opener after top-layer Escape', async () => {
    const user = userEvent.setup(),
      onPreviewClose = vi.fn(),
      cancel = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <EditorDialog title="已有素材预览" onClose={onPreviewClose}>
            <button onClick={() => setOpen(true)}>打开删除确认</button>
          </EditorDialog>
          {open && (
            <CanvasDeleteConfirmation
              controls={{
                request,
                confirm: vi.fn(),
                cancel: (token) => {
                  cancel(token);
                  setOpen(false);
                },
              }}
            />
          )}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '打开删除确认' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: '确认删除' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(cancel).toHaveBeenCalledExactlyOnceWith(request);
    expect(onPreviewClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '确认删除' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(onPreviewClose).toHaveBeenCalledOnce();
  });
});
