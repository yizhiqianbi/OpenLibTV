import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStudioKeyboard } from './useStudioKeyboard.js';

function actionsFixture() {
  return {
    addKey: vi.fn(),
    cameraMotion: { activeRig: null, addState: vi.fn(), stepState: vi.fn() },
    copy: vi.fn(() => true),
    duplicate: vi.fn(),
    objects: [{ id: 'selected-model', type: 'box' }],
    paste: vi.fn(() => true),
    record: vi.fn(),
    redo: vi.fn(),
    remove: vi.fn(),
    selected: 'selected-model',
    setDialog: vi.fn(),
    setMenu: vi.fn(),
    setMode: vi.fn(),
    setPlaying: vi.fn(),
    setSelected: vi.fn(),
    setWorkspace: vi.fn(),
    setViewMode: vi.fn(),
    undo: vi.fn(),
    viewMode: 'orbit',
    viewport: {
      current: { focus: vi.fn(), frameAll: vi.fn(), viewAxis: vi.fn() },
    },
  };
}

function Harness({ actions }) {
  useStudioKeyboard(actions);
  return (
    <div>
      <div data-testid="scene" tabIndex={0} />
      <input aria-label="Name" />
      <textarea aria-label="Prompt" />
      <select aria-label="Choice">
        <option>One</option>
      </select>
      <div role="textbox" data-testid="custom-textbox" tabIndex={0} />
      <div contentEditable suppressContentEditableWarning>
        <span data-testid="editable-child">Draft text</span>
      </div>
      <button>Native button</button>
      <a href="#native">Native link</a>
      <div role="button" tabIndex={0}>
        Native role button
      </div>
      <div className="modal-overlay">
        <div data-testid="modal-child" tabIndex={0} />
      </div>
      <div className="cv-modal-overlay">
        <div data-testid="studio-modal-child" tabIndex={0} />
      </div>
    </div>
  );
}

function press(target, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    code: 'KeyF',
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

function expectNoEditorActions(actions) {
  for (const value of Object.values(actions))
    if (typeof value === 'function') expect(value).not.toHaveBeenCalled();
  for (const action of Object.values(actions.viewport.current))
    expect(action).not.toHaveBeenCalled();
  expect(actions.cameraMotion.addState).not.toHaveBeenCalled();
}

describe('Studio viewport keyboard navigation', () => {
  it('leaves the camera view before framing and dispatches to the current selected object and viewport', () => {
    const actions = actionsFixture();
    const order = [];
    actions.setViewMode.mockImplementation((mode) => order.push(mode));
    actions.viewport.current.focus.mockImplementation((id) => order.push(id));
    const { rerender, unmount } = render(<Harness actions={actions} />);
    const event = press(screen.getByTestId('scene'), { key: 'F' });
    expect(event.defaultPrevented).toBe(true);
    expect(order).toEqual(['orbit', 'selected-model']);
    const next = actionsFixture();
    next.selected = 'new-selection';
    rerender(<Harness actions={next} />);
    press(screen.getByTestId('scene'));
    expect(next.viewport.current.focus).toHaveBeenCalledExactlyOnceWith('new-selection');
    expect(actions.viewport.current.focus).toHaveBeenCalledOnce();
    unmount();
    press(document.body, { key: 'Home', code: 'Home' });
    expect(next.viewport.current.frameAll).not.toHaveBeenCalled();
  });

  it('frames the whole scene with Home and the selection with NumpadDecimal without deleting it', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    expect(press(scene, { key: 'Home', code: 'Home' }).defaultPrevented).toBe(true);
    expect(actions.viewport.current.frameAll).toHaveBeenCalledOnce();
    expect(actions.viewport.current.focus).not.toHaveBeenCalled();
    expect(press(scene, { key: '.', code: 'NumpadDecimal' }).defaultPrevented).toBe(true);
    // With Num Lock off this physical key reports Delete; it must still only frame.
    expect(press(scene, { key: 'Delete', code: 'NumpadDecimal' }).defaultPrevented).toBe(true);
    expect(actions.viewport.current.focus.mock.calls).toEqual([
      ['selected-model'],
      ['selected-model'],
    ]);
    expect(actions.remove).not.toHaveBeenCalled();
    expect(actions.setViewMode.mock.calls).toEqual([['orbit'], ['orbit'], ['orbit']]);
    press(scene, { key: 'Delete', code: 'Delete' });
    expect(actions.remove).toHaveBeenCalledOnce();
  });

  it.each([
    ['Numpad1', 'End', false, 'front'],
    ['Numpad1', 'End', true, 'back'],
    ['Numpad3', 'PageDown', false, 'right'],
    ['Numpad3', 'PageDown', true, 'left'],
    ['Numpad7', 'Home', false, 'top'],
    ['Numpad7', 'Home', true, 'bottom'],
  ])(
    'uses physical %s (key=%s, Ctrl=%s) for %s, even with Num Lock off',
    (code, key, ctrlKey, axis) => {
      const actions = actionsFixture();
      const order = [];
      actions.setViewMode.mockImplementation((mode) => order.push(mode));
      actions.viewport.current.viewAxis.mockImplementation((view) => order.push(view));
      render(<Harness actions={actions} />);
      expect(press(screen.getByTestId('scene'), { code, key, ctrlKey }).defaultPrevented).toBe(
        true,
      );
      expect(order).toEqual(['orbit', axis]);
      expect(actions.viewport.current.frameAll).not.toHaveBeenCalled();
      expect(actions.remove).not.toHaveBeenCalled();
    },
  );

  it('preserves browser shortcuts and ordinary number keys', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    for (const options of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { code: 'Home', key: 'Home', metaKey: true },
      { code: 'Numpad1', key: '1', metaKey: true },
      { code: 'Numpad3', key: '3', altKey: true },
    ])
      expect(press(scene, options).defaultPrevented).toBe(false);
    expectNoEditorActions(actions);
    expect(press(scene, { code: 'Digit1', key: '1' }).defaultPrevented).toBe(true);
    expect(actions.setWorkspace).toHaveBeenCalledWith('compose');
  });

  it('matches source keyboard workspace, add-object, camera-view and waypoint shortcuts', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    expect(press(scene, { key: '2', code: 'Digit2' }).defaultPrevented).toBe(true);
    expect(actions.setWorkspace).toHaveBeenCalledWith('animation');
    expect(press(scene, { key: 'a', code: 'KeyA', shiftKey: true }).defaultPrevented).toBe(true);
    expect(actions.setMenu).toHaveBeenCalledWith('add');
    actions.objects = [{ id: 'camera-1', type: 'camera' }];
    actions.selected = 'camera-1';
    expect(press(scene, { key: 'c', code: 'KeyC' }).defaultPrevented).toBe(true);
    expect(actions.setViewMode).toHaveBeenCalledWith('camera-1');
    expect(
      press(scene, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true }).defaultPrevented,
    ).toBe(false);
    expect(actions.cameraMotion.stepState).toHaveBeenCalledWith(1);
    actions.cameraMotion.stepState.mockReturnValue(true);
    expect(
      press(scene, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true }).defaultPrevented,
    ).toBe(true);
    expect(actions.cameraMotion.stepState).toHaveBeenLastCalledWith(1);
  });

  it('matches source copy, paste and duplicate keyboard variants while preserving native shortcuts without a selection action', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    expect(press(scene, { key: 'c', code: 'KeyC', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(actions.copy).toHaveBeenCalledOnce();
    expect(press(scene, { key: 'v', code: 'KeyV', metaKey: true }).defaultPrevented).toBe(true);
    expect(actions.paste).toHaveBeenCalledOnce();
    expect(press(scene, { key: 'd', code: 'KeyD', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press(scene, { key: 'D', code: 'KeyD', shiftKey: true }).defaultPrevented).toBe(true);
    expect(actions.duplicate).toHaveBeenCalledTimes(2);
    expect(
      press(scene, { key: 'c', code: 'KeyC', ctrlKey: true, repeat: true }).defaultPrevented,
    ).toBe(false);
    expect(
      press(scene, { key: 'v', code: 'KeyV', ctrlKey: true, repeat: true }).defaultPrevented,
    ).toBe(false);
    expect(actions.copy).toHaveBeenCalledOnce();
    expect(actions.paste).toHaveBeenCalledOnce();
    expect(
      press(scene, { key: 'd', code: 'KeyD', ctrlKey: true, repeat: true }).defaultPrevented,
    ).toBe(false);
    expect(actions.duplicate).toHaveBeenCalledTimes(2);
  });

  it('leaves copy and paste available to the browser when no local action is possible', () => {
    const actions = actionsFixture();
    actions.copy.mockReturnValue(false);
    actions.paste.mockReturnValue(false);
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    expect(press(scene, { key: 'c', code: 'KeyC', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(scene, { key: 'v', code: 'KeyV', ctrlKey: true }).defaultPrevented).toBe(false);
  });
});

describe('Studio keyboard ownership guards', () => {
  it('keeps navigation and edit keys inside native and rich text controls', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    for (const target of [
      screen.getByLabelText('Name'),
      screen.getByLabelText('Prompt'),
      screen.getByLabelText('Choice'),
      screen.getByTestId('custom-textbox'),
      screen.getByTestId('editable-child'),
    ]) {
      for (const options of [
        { key: 'f', code: 'KeyF' },
        { key: 'Home', code: 'Home' },
        { key: '1', code: 'Numpad1' },
        { key: 'Delete', code: 'Delete' },
        { key: ' ', code: 'Space' },
      ])
        expect(press(target, options).defaultPrevented).toBe(false);
    }
    expectNoEditorActions(actions);
  });

  it('does not consume editing shortcuts with browser modifiers', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    const scene = screen.getByTestId('scene');
    for (const key of ['w', 'e', 'r', 'q', 'Delete', 'Backspace', 'k']) {
      for (const modifiers of [
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true },
        { shiftKey: true },
      ]) {
        press(scene, {
          key,
          code: key === 'Delete' || key === 'Backspace' ? `Key${key}` : `Key${key.toUpperCase()}`,
          ...modifiers,
        });
      }
    }
    expectNoEditorActions(actions);
  });

  it('keeps Space available to native controls while toggling scene playback', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    for (const target of [
      screen.getByRole('button', { name: 'Native button' }),
      screen.getByRole('link', { name: 'Native link' }),
      screen.getByRole('button', { name: 'Native role button' }),
    ])
      expect(press(target, { key: ' ', code: 'Space' }).defaultPrevented).toBe(false);
    expectNoEditorActions(actions);
    expect(press(screen.getByTestId('scene'), { key: ' ', code: 'Space' }).defaultPrevented).toBe(
      true,
    );
    const toggle = actions.setPlaying.mock.calls[0][0];
    expect(toggle(false)).toBe(true);
    expect(toggle(true)).toBe(false);
  });

  it('leaves modal, IME and already-handled events to their current owners', () => {
    const actions = actionsFixture();
    render(<Harness actions={actions} />);
    for (const target of [
      screen.getByTestId('modal-child'),
      screen.getByTestId('studio-modal-child'),
    ]) {
      press(target);
      press(target, { key: 'Escape', code: 'Escape' });
      press(target, { key: 'Home', code: 'Home' });
    }
    const scene = screen.getByTestId('scene');
    press(scene, { isComposing: true });
    press(scene, { keyCode: 229 });
    const handled = new KeyboardEvent('keydown', {
      key: 'f',
      code: 'KeyF',
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    scene.dispatchEvent(handled);
    expectNoEditorActions(actions);
  });
});
