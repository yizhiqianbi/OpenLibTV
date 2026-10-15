import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CanvasReferencePickMask from './CanvasReferencePickMask.jsx';

describe('content-only reference pick masks', () => {
  it('keeps the target and uncomputed candidates untouched', () => {
    const view = render(<CanvasReferencePickMask state="self" />);
    expect(view.container.children).toHaveLength(0);
    view.rerender(<CanvasReferencePickMask />);
    expect(view.container.children).toHaveLength(0);
  });

  it('isolates candidate click, pointer and double-click while invoking one pick', () => {
    const onPick = vi.fn(),
      gesture = vi.fn();
    render(
      <div onPointerDown={gesture} onClick={gesture} onDoubleClick={gesture}>
        <CanvasReferencePickMask state="pickable" label="角色参考图" onPick={onPick} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '选择 角色参考图' });
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(gesture).not.toHaveBeenCalled();
  });

  it('permits real keyboard pick and does not bubble Space into board panning', async () => {
    const onPick = vi.fn(),
      keydown = vi.fn();
    render(
      <div onKeyDown={keydown}>
        <CanvasReferencePickMask state="pickable" onPick={onPick} />
      </div>,
    );
    screen.getByRole('button', { name: '选择参考' }).focus();
    await userEvent.keyboard(' ');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(keydown).not.toHaveBeenCalled();
  });

  it('does not pick disabled candidates', () => {
    const onPick = vi.fn();
    render(<CanvasReferencePickMask state="pickable" disabled onPick={onPick} />);
    const button = screen.getByRole('button', { name: '选择参考' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('blocks unavailable content without offering a fake selection action', () => {
    const onPick = vi.fn(),
      gesture = vi.fn();
    const view = render(
      <div onClick={gesture} onPointerDown={gesture} onDoubleClick={gesture}>
        <CanvasReferencePickMask state="blocked" blockReason="modelUnsupported" onPick={onPick} />
      </div>,
    );
    const mask = view.container.querySelector('.cv-reference-pick-mask');
    fireEvent.pointerDown(mask);
    fireEvent.click(mask);
    fireEvent.doubleClick(mask);
    expect(mask.getAttribute('data-ref-block-reason')).toBe('modelUnsupported');
    expect(screen.queryByRole('button')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
    expect(gesture).not.toHaveBeenCalled();
  });

  it('disconnects the existing reference independently and keeps the button screen-sized', async () => {
    const onDisconnect = vi.fn(),
      onPick = vi.fn(),
      gesture = vi.fn();
    render(
      <div className="cv-node" onClick={gesture} onPointerDown={gesture} onKeyDown={gesture}>
        <CanvasReferencePickMask
          state="connected"
          zoom={0.4}
          onDisconnect={onDisconnect}
          onPick={onPick}
        />
      </div>,
    );
    const button = screen.getByRole('button', { name: '取消选择' });
    expect(button.style.transform).toBe('scale(2.5)');
    fireEvent.pointerDown(button);
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
    expect(gesture).not.toHaveBeenCalled();
  });

  it.each([0, -1, NaN, Infinity])('uses a stable scale for invalid zoom %s', (zoom) => {
    render(<CanvasReferencePickMask state="connected" zoom={zoom} />);
    expect(screen.getByRole('button', { name: '取消选择' }).style.transform).toBe('scale(1)');
  });

  it('never covers group children with blocked or connected masks', () => {
    const view = render(<CanvasReferencePickMask group state="blocked" />);
    expect(view.container.children).toHaveLength(0);
    view.rerender(<CanvasReferencePickMask group state="connected" />);
    expect(view.container.children).toHaveLength(0);
    view.rerender(<CanvasReferencePickMask group state="pickable" label="参考组" />);
    expect(screen.getByRole('button', { name: '选择 参考组' }).classList.contains('is-group')).toBe(
      true,
    );
  });

  it('uses distinct source mask layers and keeps the generator outside its content layer', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/CanvasReferencePickBar.css',
      'utf8',
    );
    document.head.append(style);
    try {
      const view = render(<CanvasReferencePickMask state="blocked" />);
      const maskStyle = () => getComputedStyle(view.container.firstElementChild);
      expect(maskStyle().backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(maskStyle().zIndex).toBe('50');
      expect(maskStyle().inset).toBe('0px');
      view.rerender(<CanvasReferencePickMask state="blocked" blockReason="limit" />);
      expect(maskStyle().backgroundColor).toBe('rgba(0, 0, 0, 0)');
      view.rerender(<CanvasReferencePickMask state="connected" />);
      expect(maskStyle().backgroundColor).toBe('rgba(0, 0, 0, 0.45)');
      expect(maskStyle().zIndex).toBe('40');
      expect(maskStyle().pointerEvents).toBe('none');
      const button = getComputedStyle(screen.getByRole('button', { name: '取消选择' }));
      expect(button.pointerEvents).toBe('auto');
      expect(button.padding).toBe('6px 12px');
      expect(button.opacity).toBe('0');
      view.rerender(<CanvasReferencePickMask state="pickable" group />);
      expect(maskStyle().zIndex).toBe('10');
      expect(maskStyle().borderRadius).toBe('20px');
      expect(view.container.querySelector('[data-generator]')).toBeNull();
      const rules = [...style.sheet.cssRules];
      const focusRule = rules.find((rule) =>
        rule.selectorText?.includes('.cv-reference-pick-disconnect:focus-visible'),
      );
      expect(focusRule.style.opacity).toBe('1');
    } finally {
      style.remove();
    }
  });
});
