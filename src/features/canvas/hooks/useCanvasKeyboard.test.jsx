import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasKeyboard } from './useCanvasKeyboard.js';

function setup() {
  const actions = {
    space: { current: false },
    nodes: [],
    selected: [],
    copied: { current: [] },
    ready: true,
    addNode: vi.fn(),
    setTool: vi.fn(),
    remove: vi.fn(),
  };
  const hook = renderHook(() => useCanvasKeyboard(actions));
  return { actions, hook };
}

describe('canvas keyboard gesture ownership', () => {
  it.each(['Delete', 'Backspace'])(
    '%s dispatches once per press while async work is pending',
    (key) => {
      const page = setup();
      page.actions.removeSelected = vi.fn(() => new Promise(() => {}));
      fireEvent.keyDown(window, { key });
      for (let index = 0; index < 3; index += 1) fireEvent.keyDown(window, { key, repeat: true });
      expect(page.actions.removeSelected).toHaveBeenCalledOnce();
      fireEvent.keyUp(window, { key });
      fireEvent.keyDown(window, { key });
      expect(page.actions.removeSelected).toHaveBeenCalledTimes(2);
      fireEvent.blur(window);
      fireEvent.keyDown(window, { key });
      expect(page.actions.removeSelected).toHaveBeenCalledTimes(3);
      fireEvent.contextMenu(document.body);
      fireEvent.keyDown(window, { key });
      expect(page.actions.removeSelected).toHaveBeenCalledTimes(4);
      expect(page.actions.remove).not.toHaveBeenCalled();
    },
  );
  it.each(['Delete', 'Backspace'])(
    'dispatches %s to the selected node-and-edge coordinator',
    (key) => {
      const page = setup();
      page.actions.removeSelected = vi.fn();
      fireEvent.keyDown(window, { key });
      expect(page.actions.removeSelected).toHaveBeenCalledOnce();
      expect(page.actions.remove).not.toHaveBeenCalled();
      page.actions.readonly = true;
      fireEvent.keyDown(window, { key });
      expect(page.actions.removeSelected).toHaveBeenCalledOnce();
    },
  );
  it.each(['ctrlKey', 'metaKey', 'altKey'])('does not delete input DOM with %s', (modifier) => {
    const page = setup();
    const nokey = document.createElement('div');
    nokey.className = 'nokey';
    const child = document.createElement('span');
    nokey.append(child);
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'false');
    document.body.append(nokey, editable);
    for (const target of [child, editable])
      for (const key of ['Delete', 'Backspace'])
        fireEvent.keyDown(target, { key, [modifier]: true });
    expect(page.actions.remove).not.toHaveBeenCalled();
    nokey.remove();
    editable.remove();
  });
  it('uses the actual composed-path input target behind a shadow host', () => {
    const page = setup();
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    root.append(input);
    document.body.append(host);
    for (const key of ['Delete', 'Backspace'])
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    expect(page.actions.remove).not.toHaveBeenCalled();
    host.remove();
  });
  it('releases effective Space hand mode when a context menu opens', () => {
    const page = setup();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(page.actions.space.current).toBe(true);
    fireEvent.contextMenu(document.body);
    expect(page.actions.space.current).toBe(false);
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(page.actions.remove).toHaveBeenCalledOnce();
  });
  it.each(['Delete', 'Backspace'])(
    'effective hand mode blocks %s until select mode is restored',
    (key) => {
      const page = setup();
      page.actions.tool = 'hand';
      page.hook.rerender();
      fireEvent.keyDown(window, { key });
      expect.soft(page.actions.remove).not.toHaveBeenCalled();
      page.actions.tool = 'select';
      page.hook.rerender();
      fireEvent.keyDown(window, { key });
      expect(page.actions.remove).toHaveBeenCalledOnce();
    },
  );

  it.each(['Delete', 'Backspace'])(
    'effective Space hand mode blocks %s until Space is released',
    (key) => {
      const page = setup();
      page.actions.tool = 'select';
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      expect(page.actions.space.current).toBe(true);
      fireEvent.keyDown(window, { key });
      expect.soft(page.actions.remove).not.toHaveBeenCalled();
      fireEvent.keyUp(window, { key: ' ', code: 'Space' });
      expect(page.actions.space.current).toBe(false);
      fireEvent.keyDown(window, { key });
      expect(page.actions.remove).toHaveBeenCalledOnce();
    },
  );
  it('arms Space only while held and resets it when the window loses focus', () => {
    const page = setup();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(page.actions.space.current).toBe(true);
    fireEvent.blur(window);
    expect(page.actions.space.current).toBe(false);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    expect(page.actions.space.current).toBe(false);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    page.hook.unmount();
    expect(page.actions.space.current).toBe(false);
  });
  it.each(['ctrlKey', 'metaKey', 'altKey'])(
    'does not arm pan or create nodes for %s browser shortcuts',
    (modifier) => {
      const page = setup();
      for (const key of ['h', 'v', 't', 'i', 'f'])
        fireEvent.keyDown(window, { key, [modifier]: true });
      fireEvent.keyDown(window, { key: ' ', code: 'Space', [modifier]: true });
      expect(page.actions.space.current).toBe(false);
      expect(page.actions.addNode).not.toHaveBeenCalled();
      expect(page.actions.setTool).not.toHaveBeenCalled();
    },
  );
  it('preserves the existing unmodified canvas shortcuts', () => {
    const page = setup();
    for (const key of ['h', 'v', 't', 'i', 'f']) fireEvent.keyDown(window, { key });
    expect(page.actions.setTool.mock.calls).toEqual([['hand'], ['select']]);
    expect(page.actions.addNode.mock.calls).toEqual([['text'], ['image'], ['video']]);
  });
  it.each(['textarea', 'contenteditable', 'dialog', 'menu'])(
    'leaves Space and text shortcuts owned by %s',
    (kind) => {
      const page = setup();
      const surface = document.createElement(kind === 'textarea' ? 'textarea' : 'div');
      if (kind === 'contenteditable') surface.setAttribute('contenteditable', 'true');
      if (kind === 'dialog' || kind === 'menu') surface.setAttribute('role', kind);
      document.body.append(surface);
      fireEvent.keyDown(surface, { key: ' ', code: 'Space' });
      fireEvent.keyDown(surface, { key: 't' });
      expect(page.actions.space.current).toBe(false);
      expect(page.actions.addNode).not.toHaveBeenCalled();
      surface.remove();
    },
  );
});
