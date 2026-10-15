import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarkPromptBadge from './MarkPromptBadge.jsx';
import { resolveMarkPromptToken } from './mark-prompt-model.js';

let anchor, rect, frames, sequence;
const metadata = { id: { suggestions: [{ label: '真实衣服' }, { label: '真实人物' }] } };
const part = resolveMarkPromptToken('{{magic:id:0}}', metadata);
beforeEach(() => {
  rect = { left: 60, top: 40, width: 90, height: 24, bottom: 64 };
  anchor = document.createElement('span');
  anchor.tabIndex = 0;
  anchor.getBoundingClientRect = () => rect;
  document.body.append(anchor);
  frames = new Map();
  sequence = 0;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = ++sequence;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
});
afterEach(() => {
  cleanup();
  anchor.remove();
  vi.unstubAllGlobals();
});
function step() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  });
}
describe('source magic prompt menu', () => {
  it('uses source labels, order and selected dot without a fabricated delete action or modal', () => {
    render(<MarkPromptBadge anchor={anchor} part={part} onSelect={vi.fn()} onClose={vi.fn()} />);
    const menu = screen.getByRole('menu', { name: '元素建议' });
    expect(menu.parentElement).toBe(document.body);
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['真实衣服', '真实人物']);
    expect(
      screen.getByRole('menuitemradio', { name: '真实衣服' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(menu.style.left).toBe('60px');
    expect(menu.style.top).toBe('68px');
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('chooses on primary mousedown preserving focus and also supports a native keyboard click', () => {
    const select = vi.fn();
    const close = vi.fn();
    const page = render(
      <MarkPromptBadge anchor={anchor} part={part} onSelect={select} onClose={close} />,
    );
    anchor.focus();
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: '真实人物' }), { button: 0 });
    expect(select).toHaveBeenCalledExactlyOnceWith('id', 1);
    expect(document.activeElement).toBe(anchor);
    expect(screen.queryByRole('menu')).toBeNull();
    page.unmount();
    render(<MarkPromptBadge anchor={anchor} part={part} onSelect={select} onClose={close} />);
    fireEvent.click(screen.getByRole('menuitemradio', { name: '真实衣服' }), { detail: 0 });
    expect(select.mock.calls).toEqual([
      ['id', 1],
      ['id', 0],
    ]);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('uses the shared Escape owner and returns to its exact current DOM badge', () => {
    const close = vi.fn();
    render(
      <MarkPromptBadge anchor={anchor} part={part} onSelect={vi.fn()} onClose={close} focus />,
    );
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: '真实衣服' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(anchor);
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not steal outside focus and hides readonly or unavailable choices', () => {
    const close = vi.fn();
    const page = render(
      <MarkPromptBadge anchor={anchor} part={part} onSelect={vi.fn()} onClose={close} />,
    );
    const outside = document.createElement('button');
    document.body.append(outside);
    act(() => outside.focus());
    expect(document.activeElement).toBe(outside);
    expect(screen.queryByRole('menu')).toBeNull();
    outside.remove();
    page.rerender(
      <MarkPromptBadge anchor={anchor} part={part} disabled onSelect={vi.fn()} onClose={close} />,
    );
    expect(screen.queryByRole('menu')).toBeNull();
    page.rerender(
      <MarkPromptBadge
        anchor={anchor}
        part={{ ...part, options: [part.options[0]] }}
        onSelect={vi.fn()}
        onClose={close}
      />,
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('follows the actual badge rect, clamps a narrow viewport, and releases every pending frame', () => {
    vi.stubGlobal('innerWidth', 390);
    const page = render(
      <MarkPromptBadge anchor={anchor} part={part} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    rect = { ...rect, left: 380, bottom: 130 };
    step();
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('162px');
    expect(menu.style.top).toBe('134px');
    page.unmount();
    expect(frames.size).toBe(0);
  });

  it('retires a removed badge and never emits its stale suggestion', () => {
    const select = vi.fn();
    const close = vi.fn();
    render(<MarkPromptBadge anchor={anchor} part={part} onSelect={select} onClose={close} />);
    const item = screen.getByRole('menuitemradio', { name: '真实人物' });
    anchor.remove();
    fireEvent.mouseDown(item, { button: 0 });
    expect(select).not.toHaveBeenCalled();
    step();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(close).toHaveBeenCalledOnce();
  });
});
