import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorDialog } from './EditorDialog.jsx';

describe('editor dialog keyboard behavior', () => {
  it('closes with Escape and restores the opening control focus', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const close = vi.fn();
    const { unmount } = render(
      <EditorDialog title="导出" onClose={close}>
        <button>下载</button>
      </EditorDialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('wraps Tab between the first and last enabled controls', () => {
    render(
      <EditorDialog title="导出" onClose={() => {}}>
        <button disabled>不可用</button>
        <button>下载</button>
      </EditorDialog>,
    );
    screen.getByRole('button', { name: '下载' }).focus();
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }));
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '下载' }));
  });
});
