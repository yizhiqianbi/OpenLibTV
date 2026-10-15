import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScriptEmptyCard from './ScriptEmptyCard.jsx';

const labels = ['剧本生成分镜脚本', '角色生成分镜脚本', '自己编写分镜脚本'];
const functionKeys = ['scriptToStoryboard', 'characterToStoryboard', 'writeStoryboard'];
const buttons = () => screen.getAllByRole('button');

describe('source ScriptV2 empty hints and pending card (jsdom)', () => {
  it('renders only the exact source Try hint and ordered actions, with the ListDetail icon', () => {
    render(<ScriptEmptyCard onAction={vi.fn()} />);
    expect(screen.getByText('尝试：')).toBeTruthy();
    expect(buttons().map((button) => button.textContent)).toEqual(labels);
    expect(buttons().map((button) => button.dataset.functionKey)).toEqual(functionKeys);
    for (const button of buttons()) {
      expect(button.type).toBe('button');
      expect(button.disabled).toBe(false);
      expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
    }
    expect(screen.getByTestId('scriptv2-empty-card-icon').getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/等待|镜头数量|服务尚未连接/)).toBeNull();
  });

  it.each(functionKeys)(
    'delegates %s exactly once without changing local graph or opening UI',
    (key) => {
      const action = vi.fn();
      render(<ScriptEmptyCard onAction={action} />);
      fireEvent.click(buttons()[functionKeys.indexOf(key)]);
      expect(action).toHaveBeenCalledExactlyOnceWith(key);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByText('尝试：')).toBeTruthy();
    },
  );

  it('leaves promise ownership with the caller and changes disabled state only from props', () => {
    const action = vi.fn(() => new Promise(() => {}));
    const view = render(<ScriptEmptyCard onAction={action} />);
    fireEvent.click(buttons()[0]);
    expect(buttons().every((button) => !button.disabled)).toBe(true);
    view.rerender(<ScriptEmptyCard onAction={action} disabled />);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    for (const button of buttons()) fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    view.rerender(<ScriptEmptyCard onAction={action} disabled={false} />);
    fireEvent.click(buttons()[2]);
    expect(action).toHaveBeenLastCalledWith('writeStoryboard');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('shows unavailable actions safely without fabricating a callback when the host omits it', () => {
    render(<ScriptEmptyCard />);
    expect(screen.getByText('尝试：')).toBeTruthy();
    expect(buttons().map((button) => button.disabled)).toEqual([true, true, true]);
    for (const button of buttons()) fireEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps manual writing available while either preset is blocked by its own catalog readiness', () => {
    const action = vi.fn();
    const view = render(
      <ScriptEmptyCard
        onAction={action}
        disabledActions={{ scriptToStoryboard: true, characterToStoryboard: true }}
      />,
    );
    expect(buttons().map((button) => button.disabled)).toEqual([true, true, false]);
    for (const button of buttons()) fireEvent.click(button);
    expect(action).toHaveBeenCalledExactlyOnceWith('writeStoryboard');
    view.rerender(
      <ScriptEmptyCard onAction={action} disabledActions={{ characterToStoryboard: true }} />,
    );
    expect(buttons().map((button) => button.disabled)).toEqual([false, true, false]);
    fireEvent.click(buttons()[0]);
    expect(action).toHaveBeenLastCalledWith('scriptToStoryboard');
    view.rerender(
      <ScriptEmptyCard onAction={action} disabledActions={{ writeStoryboard: true }} />,
    );
    expect(buttons().map((button) => button.disabled)).toEqual([false, false, true]);
    fireEvent.click(buttons()[1]);
    expect(action).toHaveBeenLastCalledWith('characterToStoryboard');
    view.rerender(<ScriptEmptyCard onAction={action} disabled disabledActions={{}} />);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    expect(action).toHaveBeenCalledTimes(3);
  });

  it.each(['empty_generate', 'pending'])(
    'readonly %s keeps only its source icon and hides the entire hint area',
    (kind) => {
      const action = vi.fn();
      render(<ScriptEmptyCard kind={kind} readonly onAction={action} />);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText('尝试：')).toBeNull();
      expect(screen.queryByTestId('scriptv2-empty-card-hints')).toBeNull();
      expect(screen.getByTestId('scriptv2-empty-card-icon')).toBeTruthy();
      expect(screen.getByTestId('scriptv2-empty-card').classList.contains('has-hints')).toBe(false);
      fireEvent.click(screen.getByTestId('scriptv2-empty-card-icon'));
      expect(action).not.toHaveBeenCalled();
    },
  );

  it('pending is only the source centered icon, regardless of available callbacks or disabled props', () => {
    const view = render(<ScriptEmptyCard kind="pending" onAction={vi.fn()} />);
    expect(screen.getByTestId('scriptv2-empty-card').textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/等待|尝试|服务|镜头/)).toBeNull();
    view.rerender(<ScriptEmptyCard kind="pending" disabled onAction={vi.fn()} />);
    expect(screen.getByTestId('scriptv2-empty-card').textContent).toBe('');
    expect(screen.getByTestId('scriptv2-empty-card-icon')).toBeTruthy();
  });

  it('lets icon and noninteractive blank space reach host drag and double-click owners', () => {
    const pointer = vi.fn(),
      mouse = vi.fn(),
      click = vi.fn(),
      double = vi.fn(),
      action = vi.fn();
    render(
      <div onPointerDown={pointer} onMouseDown={mouse} onClick={click} onDoubleClick={double}>
        <ScriptEmptyCard onAction={action} />
      </div>,
    );
    const card = screen.getByTestId('scriptv2-empty-card');
    fireEvent.pointerDown(card);
    fireEvent.mouseDown(screen.getByTestId('scriptv2-empty-card-icon'));
    fireEvent.click(screen.getByText('尝试：'));
    fireEvent.doubleClick(card);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(mouse).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(double).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    const button = buttons()[0];
    fireEvent.pointerDown(button.firstChild);
    fireEvent.mouseDown(button);
    fireEvent.click(button.lastChild);
    fireEvent.doubleClick(button);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(mouse).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(double).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledExactlyOnceWith('scriptToStoryboard');
  });

  it('preserves native Tab order and Space/Enter activation while keeping Space away from the canvas', async () => {
    const key = vi.fn(),
      action = vi.fn();
    render(
      <div onKeyDown={key}>
        <ScriptEmptyCard onAction={action} />
      </div>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(buttons()[0]);
    expect(fireEvent.keyDown(buttons()[0], { key: ' ', code: 'Space' })).toBe(true);
    expect(key).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(action).toHaveBeenCalledExactlyOnceWith('scriptToStoryboard');
    await user.tab();
    expect(document.activeElement).toBe(buttons()[1]);
    await user.keyboard('{Enter}');
    expect(action).toHaveBeenLastCalledWith('characterToStoryboard');
    await user.tab();
    expect(document.activeElement).toBe(buttons()[2]);
    await user.keyboard(' ');
    expect(action).toHaveBeenLastCalledWith('writeStoryboard');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('removes stale actions immediately when the host changes kind or readonly ownership', () => {
    const old = vi.fn(),
      current = vi.fn();
    const view = render(<ScriptEmptyCard onAction={old} />);
    view.rerender(<ScriptEmptyCard onAction={current} />);
    fireEvent.click(buttons()[2]);
    expect(old).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledExactlyOnceWith('writeStoryboard');
    view.rerender(<ScriptEmptyCard readonly onAction={current} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<ScriptEmptyCard kind="pending" onAction={current} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<ScriptEmptyCard kind="empty_generate" onAction={current} />);
    expect(buttons()).toHaveLength(3);
    expect(current).toHaveBeenCalledTimes(1);
  });

  it('uses the verified original icon assets and theme selectors without reading document state', () => {
    const css = readFileSync('src/features/canvas/storyboard/ScriptEmptyCard.css', 'utf8');
    for (const asset of [
      'list-detail.svg',
      'text-align-center.svg',
      'perspnal-n.svg',
      'text-file.svg',
    ]) {
      expect(css).toContain(`/assets/icons/${asset}`);
    }
    expect(css).toContain('.canvas-light .cv-script-empty-card');
    const before = document.documentElement.className;
    render(
      <div className="canvas-light">
        <ScriptEmptyCard onAction={vi.fn()} />
      </div>,
    );
    expect(document.documentElement.className).toBe(before);
    expect(screen.getByTestId('scriptv2-empty-card').getAttribute('style')).toBeNull();
  });

  it('does not run an action during StrictMode replay or render an unknown source card kind', () => {
    const action = vi.fn();
    const view = render(
      <StrictMode>
        <ScriptEmptyCard onAction={action} />
      </StrictMode>,
    );
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(buttons()[0]);
    expect(action).toHaveBeenCalledTimes(1);
    view.rerender(<ScriptEmptyCard kind="resource" onAction={action} />);
    expect(screen.queryByTestId('scriptv2-empty-card')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
