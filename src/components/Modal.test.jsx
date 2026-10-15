import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from './Modal.jsx';

describe('shared dialog lifecycle', () => {
  it('uses the current callback and Escape setting after rerender', () => {
    const oldClose = vi.fn();
    const close = vi.fn();
    const { rerender } = render(<Modal title="dialog" onClose={oldClose} />);
    rerender(<Modal title="dialog" onClose={close} closeOnEscape={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    rerender(<Modal title="dialog" onClose={close} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    expect(oldClose).not.toHaveBeenCalled();
  });

  it('dismisses only the top dialog and keeps scrolling locked until the last closes', () => {
    document.body.style.overflow = 'auto';
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender, unmount } = render(
      <>
        <Modal title="first" onClose={firstClose} />
        <Modal title="second" onClose={secondClose} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(secondClose).toHaveBeenCalledOnce();
    expect(firstClose).not.toHaveBeenCalled();
    rerender(<Modal title="first" onClose={firstClose} />);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('traps Tab in the dialog and restores the opener focus', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Modal title="focus" closeButton={false}>
        <button>first</button>
        <button disabled>disabled</button>
        <button>last</button>
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
