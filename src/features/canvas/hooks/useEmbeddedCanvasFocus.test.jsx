import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useEmbeddedCanvasFocus } from './useEmbeddedCanvasFocus.js';

function EmbeddedCanvas({ onClose }) {
  const canvasRoot = useRef();
  useEmbeddedCanvasFocus({ canvasRoot, embedded: true, onClose });
  return (
    <section ref={canvasRoot} tabIndex={-1}>
      <button>关闭画布</button>
      <button>缩放</button>
    </section>
  );
}

it('updates the Escape callback without moving focus on a parent rerender', () => {
  const firstClose = vi.fn();
  const updatedClose = vi.fn();
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const previousOverflow = document.body.style.overflow;
  const { rerender, unmount } = render(<EmbeddedCanvas onClose={firstClose} />);

  expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭画布' }));
  const zoom = screen.getByRole('button', { name: '缩放' });
  zoom.focus();
  rerender(<EmbeddedCanvas onClose={updatedClose} />);

  expect(document.activeElement).toBe(zoom);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(zoom, { key: 'Escape' });
  expect(firstClose).not.toHaveBeenCalled();
  expect(updatedClose).toHaveBeenCalledOnce();

  unmount();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).toBe(previousOverflow);
  opener.remove();
});
