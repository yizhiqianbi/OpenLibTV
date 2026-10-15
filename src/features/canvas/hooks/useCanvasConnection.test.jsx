import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasConnection } from './useCanvasConnection.js';

let frames, nextFrame;
const originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = nextFrame++;
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
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (originalHitTest) Object.defineProperty(document, 'elementFromPoint', originalHitTest);
  else delete document.elementFromPoint;
});

const node = (id, x, y, patch = {}) => ({
  id,
  type: 'text',
  position: { x, y },
  width: 200,
  height: 200,
  ...patch,
});

function setup(patch = {}, { realView = false } = {}) {
  const board = document.createElement('main');
  const handle = document.createElement('button');
  board.append(handle);
  document.body.append(board);
  board.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 700 });
  let captured = null;
  handle.setPointerCapture = vi.fn((id) => {
    captured = id;
  });
  handle.hasPointerCapture = vi.fn((id) => captured === id);
  handle.releasePointerCapture = vi.fn((id) => {
    if (captured === id) captured = null;
  });
  const options = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    nodes: [node('origin', 0, 0), node('target', 500, 0)],
    board: { current: board },
    viewRef: { current: { x: 0, y: 0, z: 1 } },
    setLinking: vi.fn(),
    setLinkPoint: vi.fn(),
    closeMenu: vi.fn(),
    cancelPointer: vi.fn(),
    onConnect: vi.fn(),
    onOpenMenu: vi.fn(),
    ...patch,
  };
  options.point = (event) => {
    const rect = board.getBoundingClientRect(),
      view = options.viewRef.current;
    return {
      x: (event.clientX - rect.left - view.x) / view.z,
      y: (event.clientY - rect.top - view.y) / view.z,
    };
  };
  options.setView = vi.fn((next) => {
    options.viewRef.current = typeof next === 'function' ? next(options.viewRef.current) : next;
  });
  const page = renderHook(() => {
    const [view, setView] = useState(options.viewRef.current);
    if (realView) options.setView = setView;
    return { ...useCanvasConnection(options), renderedView: view };
  });
  const native = (type, patch = {}, target = window) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(
      event,
      Object.fromEntries(
        Object.entries({
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: 600,
          clientY: 150,
          ...patch,
        }).map(([key, value]) => [key, { value }]),
      ),
    );
    act(() => target.dispatchEvent(event));
    return event;
  };
  const down = (patch = {}, handleType = 'source', nodeId = 'origin') => {
    const event = {
      currentTarget: handle,
      target: handle,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 300,
      clientY: 150,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
      ...patch,
    };
    act(() => page.result.current.start(event, nodeId, handleType));
    return event;
  };
  const frame = () => {
    const [id, callback] = frames.entries().next().value || [];
    if (!callback) throw new Error('No connection animation frame scheduled');
    frames.delete(id);
    act(() => callback(16));
    return callback;
  };
  return { options, page, board, handle, native, down, frame };
}

describe('native connection pointer lifecycle', () => {
  it.each([
    ['opposite handle', 600, 150],
    ['target body', 760, 225],
  ])(
    'connects output to %s once using the actual final release point',
    (_name, clientX, clientY) => {
      const p = setup();
      p.down();
      const move = p.native('pointermove', { clientX: 400, clientY: 400 });
      expect(move.defaultPrevented).toBe(true);
      expect(p.page.result.current.preview.target).toBeNull();
      p.native('pointerup', { clientX, clientY });
      expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
        nodeId: 'target',
        sourceId: 'origin',
        targetId: 'target',
      });
      expect(p.options.onOpenMenu).not.toHaveBeenCalled();
      expect(p.page.result.current.preview).toBeNull();
      expect(p.handle.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(frames.size).toBe(0);
      p.native('pointerup', { clientX, clientY });
      expect(p.options.onConnect).toHaveBeenCalledOnce();
      expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 1, pointerId: 1 })).toBe(
        true,
      );
      expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 1, pointerId: 1 })).toBe(
        false,
      );
    },
  );

  it('normalizes an input-origin drag to the dropped output as its source', () => {
    const p = setup();
    p.down({ clientX: 100 }, 'target');
    p.native('pointermove', { clientX: 200, clientY: 400 });
    p.native('pointerup', { clientX: 800, clientY: 150 });
    expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'target',
      sourceId: 'target',
      targetId: 'origin',
    });
  });

  it('starts drag only beyond 1 screen pixel and still commits a drag whose only movement is pointerup', () => {
    const p = setup();
    p.down();
    const jitter = p.native('pointermove', { clientX: 301 });
    expect(jitter.defaultPrevented).toBe(false);
    expect(p.page.result.current.preview).toBeNull();
    expect(frames.size).toBe(0);
    p.native('pointermove', { clientX: 301.01 });
    expect(p.page.result.current.preview).not.toBeNull();
    expect(frames.size).toBe(1);
    p.native('pointerup');
    expect(p.options.onConnect).toHaveBeenCalledOnce();
    p.down();
    p.native('pointerup');
    expect(p.options.onConnect).toHaveBeenCalledTimes(2);
  });

  it('opens an empty-release menu with the real flow coordinate and direction instead of connecting', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 400, clientY: 400 });
    p.native('pointerup', { clientX: 850, clientY: 650 });
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.options.onOpenMenu).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        nodeId: 'origin',
        handleType: 'source',
        clientX: 850,
        clientY: 650,
        point: { x: 750, y: 600 },
      }),
    );
  });

  it('opens one short-press menu and preserves keyboard clicks while suppressing its pointer click', () => {
    const p = setup();
    p.down({}, 'target');
    act(() => vi.advanceTimersByTime(299));
    p.native('pointerup', { clientX: 300, clientY: 150 });
    expect(p.options.onOpenMenu).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nodeId: 'origin', handleType: 'target' }),
    );
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 0 })).toBe(false);
    expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 1, pointerId: 2 })).toBe(
      false,
    );
    expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 1, pointerId: 1 })).toBe(
      true,
    );
  });

  it('does not treat a 300ms stationary hold as a short press', () => {
    const p = setup();
    p.down();
    act(() => vi.advanceTimersByTime(300));
    p.native('pointerup', { clientX: 300, clientY: 150 });
    expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.page.result.current.shouldSuppressConnectionClick({ detail: 1 })).toBe(false);
  });

  it('cancels node pointer ownership before capturing and ignores competing pointers', () => {
    const p = setup();
    p.down();
    expect(p.options.cancelPointer.mock.invocationCallOrder[0]).toBeLessThan(
      p.handle.setPointerCapture.mock.invocationCallOrder[0],
    );
    p.down({ pointerId: 2 });
    p.native('pointermove', { pointerId: 2, clientX: 600 });
    p.native('pointerup', { pointerId: 2 });
    expect(p.handle.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(p.page.result.current.preview).toBeNull();
    expect(p.options.onConnect).not.toHaveBeenCalled();
    p.native('pointerup');
    expect(p.options.onConnect).toHaveBeenCalledOnce();
  });

  it.each([{ button: 2 }, { button: 1 }, { isPrimary: false }, { button: undefined }])(
    'rejects an unsupported pointerdown %j',
    (patch) => {
      const p = setup();
      const event = p.down(patch);
      p.native('pointermove');
      p.native('pointerup');
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(p.handle.setPointerCapture).not.toHaveBeenCalled();
      expect(p.options.cancelPointer).not.toHaveBeenCalled();
      expect(p.options.onConnect).not.toHaveBeenCalled();
      expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    },
  );

  it('reads the current nodes at release after a target is removed or moved', () => {
    const p = setup();
    p.down();
    p.native('pointermove');
    expect(p.page.result.current.preview.target.nodeId).toBe('target');
    p.options.nodes = [node('origin', 0, 0), node('target', 900, 0)];
    p.page.rerender();
    p.native('pointerup');
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.options.onOpenMenu).toHaveBeenCalledOnce();
  });

  it('passes an invalid existing-node drop once to the validator without opening a creation menu', () => {
    const p = setup({ onConnect: vi.fn(() => false) });
    p.down();
    p.native('pointermove');
    p.native('pointerup');
    expect(p.options.onConnect).toHaveBeenCalledOnce();
    expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    expect(p.page.result.current.preview).toBeNull();
  });

  it('prefers the actual opposite handle DOM hit over a nearer geometric handle at release', () => {
    const p = setup({ nodes: [node('origin', 0, 0), node('near', 500, 0), node('hit', 550, 0)] });
    const article = document.createElement('article');
    article.dataset.nodeId = 'hit';
    const handle = document.createElement('button');
    handle.className = 'cv-handle';
    handle.dataset.handleType = 'target';
    const graphic = document.createElement('span');
    handle.append(graphic);
    article.append(handle);
    p.board.append(article);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => graphic),
    });
    p.down();
    p.native('pointermove', { clientX: 610 });
    p.native('pointerup', { clientX: 610 });
    expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'hit',
      sourceId: 'origin',
      targetId: 'hit',
    });
  });

  it('ignores a removed node in the DOM hit-test and resolves the current geometric candidate', () => {
    const p = setup();
    const article = document.createElement('article');
    article.dataset.nodeId = 'removed';
    const handle = document.createElement('button');
    handle.className = 'cv-handle';
    handle.dataset.handleType = 'target';
    article.append(handle);
    p.board.append(article);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => handle),
    });
    p.down();
    p.native('pointermove');
    p.native('pointerup');
    expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'target',
      sourceId: 'origin',
      targetId: 'target',
    });
  });

  it('cancels an origin deleted during the drag before any final connect or menu', () => {
    const p = setup();
    p.down();
    p.native('pointermove');
    p.options.nodes = [node('target', 500, 0)];
    p.page.rerender();
    p.native('pointerup');
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    expect(p.handle.releasePointerCapture).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'Escape', 'hidden'])(
    'clears %s and ignores subsequent move, frame and release',
    (kind) => {
      const p = setup();
      p.down();
      p.native('pointermove', { clientX: 1100 });
      const callback = [...frames.values()][0];
      if (kind === 'Escape') {
        act(() => p.board.focus());
        const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
        act(() => window.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(p.handle);
      } else if (kind === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      } else p.native(kind);
      expect(p.page.result.current.preview).toBeNull();
      expect(p.handle.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(frames.size).toBe(0);
      act(() => callback(16));
      p.native('pointermove');
      p.native('pointerup');
      expect(p.options.setView).not.toHaveBeenCalled();
      expect(p.options.onConnect).not.toHaveBeenCalled();
      expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    },
  );

  it.each([{ documentKey: 'B' }, { ready: false }, { readonly: true }])(
    'cancels boundary %j even if it later returns to the old value',
    (patch) => {
      const p = setup();
      p.down();
      p.native('pointermove', { clientX: 1100 });
      const callback = [...frames.values()][0];
      Object.assign(p.options, patch);
      p.page.rerender();
      Object.assign(p.options, { documentKey: 'A', ready: true, readonly: false });
      p.page.rerender();
      act(() => callback(16));
      p.native('pointermove');
      p.native('pointerup');
      expect(p.options.setView).not.toHaveBeenCalled();
      expect(p.options.onConnect).not.toHaveBeenCalled();
      expect(p.options.onOpenMenu).not.toHaveBeenCalled();
      expect(p.handle.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each([{ ready: false }, { readonly: true }])(
    'does not capture an unwritable document %j',
    (patch) => {
      const p = setup(patch);
      p.down();
      p.native('pointermove');
      p.native('pointerup');
      expect(p.handle.setPointerCapture).not.toHaveBeenCalled();
      expect(p.options.onConnect).not.toHaveBeenCalled();
      expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    },
  );

  it('removes the exact native listeners and RAF/capture on unmount', () => {
    const addedWindow = vi.spyOn(window, 'addEventListener');
    const removedWindow = vi.spyOn(window, 'removeEventListener');
    const addedDocument = vi.spyOn(document, 'addEventListener');
    const removedDocument = vi.spyOn(document, 'removeEventListener');
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 1100 });
    const callback = [...frames.values()][0];
    p.page.unmount();
    for (const type of [
      'pointermove',
      'pointerup',
      'pointercancel',
      'lostpointercapture',
      'blur',
      'keydown',
    ]) {
      const entry = addedWindow.mock.calls.find(([name]) => name === type);
      expect(entry).toBeTruthy();
      expect(
        removedWindow.mock.calls.some(
          ([name, listener, capture]) =>
            name === type && listener === entry[1] && (type !== 'keydown' || capture === true),
        ),
      ).toBe(true);
    }
    const visibility = addedDocument.mock.calls.find(([name]) => name === 'visibilitychange');
    expect(removedDocument).toHaveBeenCalledWith('visibilitychange', visibility[1]);
    expect(frames.size).toBe(0);
    expect(p.handle.releasePointerCapture).toHaveBeenCalledOnce();
    act(() => callback(16));
    p.native('pointermove');
    p.native('pointerup');
    expect(p.options.onConnect).not.toHaveBeenCalled();
    expect(p.options.setView).not.toHaveBeenCalled();
  });
});

describe('connection auto pan and transformed endpoints', () => {
  it('keeps physical node hover separate from handle eligibility and capture ownership', () => {
    const p = setup({ validate: vi.fn(() => ({ valid: false, reason: 'duplicate' })) });
    const article = document.createElement('article');
    article.className = 'cv-node';
    article.dataset.nodeId = 'target';
    const content = document.createElement('textarea');
    article.append(content);
    p.board.append(article);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => content,
    });
    p.down();
    p.native('pointermove', { clientX: 795, clientY: 210 });
    expect(p.page.result.current.preview).toMatchObject({
      target: null,
      status: 'unknown',
      hoveredNodeId: 'target',
      screenPoint: { x: 795, y: 210 },
    });
    expect(p.options.validate).not.toHaveBeenCalled();
    p.native('pointermove', { clientX: 620, clientY: 150 });
    expect(p.page.result.current.preview).toMatchObject({
      status: 'invalid',
      target: { nodeId: 'target' },
      hoveredNodeId: 'target',
      screenPoint: { x: 620, y: 150 },
    });
    p.native('pointercancel');
    expect(p.page.result.current.preview).toBeNull();
  });

  it.each(['outside', 'missing', 'hidden'])(
    'ignores a %s physical hit for node feedback',
    (kind) => {
      const p = setup();
      const article = document.createElement('article');
      article.className = 'cv-node';
      article.dataset.nodeId = kind === 'missing' ? 'other-document-node' : 'target';
      (kind === 'outside' ? document.body : p.board).append(article);
      if (kind === 'hidden') p.options.nodes[1] = { ...p.options.nodes[1], hidden: true };
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => article,
      });
      p.down();
      p.native('pointermove', { clientX: 795, clientY: 210 });
      expect(p.page.result.current.preview.hoveredNodeId).toBeNull();
    },
  );

  it('snaps only a valid opposite handle while retaining the actual pointer position', () => {
    const p = setup({ validate: vi.fn(() => ({ valid: true })) });
    p.down();
    p.native('pointermove', { clientX: 620 });
    expect(p.page.result.current.preview).toMatchObject({
      status: 'valid',
      point: { x: 520, y: 100 },
      endpoint: { x: 500, y: 100 },
    });
    p.options.validate.mockReturnValue({ valid: false, reason: 'duplicate' });
    p.options.models = {};
    p.page.rerender();
    expect(p.page.result.current.preview).toMatchObject({
      status: 'invalid',
      endpoint: { x: 520, y: 100 },
      reasonLabel: '节点之间已有连接',
    });
  });

  it('keeps the pointer endpoint over a distant node body and only falls back on release', () => {
    const p = setup({ validate: vi.fn(() => ({ valid: true })) });
    p.down();
    p.native('pointermove', { clientX: 795, clientY: 210 });
    expect(p.page.result.current.preview).toMatchObject({
      target: null,
      status: 'unknown',
      endpoint: { x: 695, y: 160 },
    });
    expect(p.options.validate).not.toHaveBeenCalled();
    p.native('pointerup', { clientX: 795, clientY: 210 });
    expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'target',
      sourceId: 'origin',
      targetId: 'target',
    });
  });

  it.each([0.5, 2])('uses an 80 flow-unit snap radius at zoom %s', (z) => {
    const p = setup({ viewRef: { current: { x: 0, y: 0, z } } });
    p.down({ clientX: 100 + 200 * z, clientY: 50 + 100 * z });
    p.native('pointermove', { clientX: 100 + 420 * z, clientY: 50 + 100 * z });
    expect(p.page.result.current.preview.target.nodeId).toBe('target');
    p.native('pointermove', { clientX: 100 + 419 * z, clientY: 50 + 100 * z });
    expect(p.page.result.current.preview.target).toBeNull();
  });

  it('pans only after true drag, clamps each frame to 15 screen px and updates flow endpoint from the new view', () => {
    const p = setup({ viewRef: { current: { x: 10, y: 20, z: 0.5 } } });
    p.down({ clientX: 1100, clientY: 750 });
    expect(frames.size).toBe(0);
    p.native('pointermove', { clientX: 1101, clientY: 751 });
    p.frame();
    expect(p.options.viewRef.current).toEqual({ x: -5, y: 5, z: 0.5 });
    expect(p.page.result.current.preview.point).toEqual({ x: 2012, y: 1392 });
    p.frame();
    expect(p.options.viewRef.current).toEqual({ x: -20, y: -10, z: 0.5 });
    expect(p.page.result.current.preview.point).toEqual({ x: 2042, y: 1422 });
    p.native('pointermove', { clientX: 500, clientY: 400 });
    p.options.setView.mockClear();
    p.frame();
    expect(p.options.setView).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it('uses React queued viewport updates for the latest endpoint across consecutive frames', () => {
    const p = setup({}, { realView: true });
    p.down();
    p.native('pointermove', { clientX: 1100, clientY: 400 });
    p.frame();
    p.frame();
    expect(p.page.result.current.renderedView).toEqual({ x: -30, y: 0, z: 1 });
    expect(p.page.result.current.preview.point).toEqual({ x: 1030, y: 350 });
  });

  it('resolves the final pointerup against the latest viewport after edge pan', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 1100, clientY: 400 });
    p.frame();
    expect(p.options.viewRef.current.x).toBe(-15);
    p.native('pointerup', { clientX: 585, clientY: 150 });
    expect(p.options.onConnect).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'target',
      sourceId: 'origin',
      targetId: 'target',
    });
    expect(p.options.onOpenMenu).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('stops and clears an active frame when its originating node disappears without another pointer event', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 1100 });
    p.options.nodes = [node('target', 500, 0)];
    p.page.rerender();
    if (frames.size) p.frame();
    expect(p.page.result.current.preview).toBeNull();
    expect(p.handle.releasePointerCapture).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(p.options.setView).not.toHaveBeenCalled();
  });
});
