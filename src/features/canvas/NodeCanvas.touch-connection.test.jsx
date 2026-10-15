import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

// Keep the real document, graph, pointer, touch, connection and menu controllers.
// The public model snapshot makes the generation policy deterministic without IO.
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectA = 'touch-connection-A';
const projectB = 'touch-connection-B';
let frames, nextFrame;

function snapshot(projectId, patch = {}) {
  return {
    title: projectId,
    nodes: [
      {
        id: 'origin',
        type: 'image',
        position: { x: 100, y: 100 },
        width: 350,
        height: 230,
        data: {
          name: `起点 ${projectId}`,
          action: 'image_resource',
          url: ['/assets/touch-test.png'],
          params: {},
        },
      },
      {
        id: 'target',
        type: 'video',
        position: { x: 600, y: 200 },
        width: 350,
        height: 230,
        data: {
          name: `目标 ${projectId}`,
          action: 'video_generate',
          params: { model: 'star-video2', modeType: 'text2video', prompt: '保留提示词' },
        },
      },
      {
        id: 'text',
        type: 'text',
        position: { x: 100, y: 450 },
        width: 350,
        height: 230,
        data: { name: '文本输入', action: 'text_resource', text: '可滚动的原生文本输入' },
      },
    ],
    edges: [],
    view: { x: 0, y: 0, z: 1 },
    ...patch,
  };
}
function seed(projectId, patch) {
  localStorage.setItem(`libtv.canvas.${projectId}`, JSON.stringify(snapshot(projectId, patch)));
}
function stored(projectId = projectA) {
  return JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  seed(projectA);
  seed(projectB, { view: { x: 30, y: -10, z: 0.5 } });
  frames = new Map();
  nextFrame = 1;
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
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});
afterEach(() => vi.unstubAllGlobals());

function installCapture(element) {
  let captured = null;
  element.setPointerCapture = vi.fn((id) => {
    captured = id;
  });
  element.hasPointerCapture = vi.fn((id) => captured === id);
  element.releasePointerCapture = vi.fn((id) => {
    if (captured === id) captured = null;
  });
}
function pointer(target, type, { x = 450, y = 215, id = 11, pointerType = 'mouse' } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  fireEvent(target, event);
  return event;
}
const finger = (target, id, x, y) => ({ target, identifier: id, clientX: x, clientY: y });
function touch(target, type, touches, changedTouches = touches) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: touches },
    changedTouches: { value: changedTouches },
  });
  fireEvent(target, event);
  return event;
}
function oldFrames() {
  return [...frames.values()];
}
function runOldFrames(callbacks) {
  act(() => callbacks.forEach((callback) => callback(16)));
}
function viewport(page) {
  const match = page
    .world()
    .style.transform.match(/translate\(([-\d.e]+)px,([-\d.e]+)px\) scale\(([-\d.e]+)\)/);
  if (!match) throw new Error('Canvas viewport is missing its transform');
  return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
}

async function mountedCanvas(projectId = projectA) {
  const login = vi.fn(),
    navigate = vi.fn();
  const props = (id) => ({
    path: `/canvas?projectId=${id}`,
    user: LOCAL_WORKSPACE_USER,
    login,
    navigate,
  });
  const page = render(<NodeCanvas {...props(projectId)} />);
  const node = (id) => page.container.querySelector(`[data-node-id="${id}"]`);
  const ready = async (id) => {
    await waitFor(() => expect(node('origin')?.getAttribute('aria-label')).toBe(`起点 ${id}`));
    await waitFor(() =>
      expect(page.container.querySelector('.cv-handle-out')?.disabled).toBe(false),
    );
    for (const element of page.container.querySelectorAll('.cv-board,.cv-node,.cv-handle'))
      installCapture(element);
  };
  await ready(projectId);
  expect(login).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
  return {
    ...page,
    node,
    login,
    navigate,
    board: () => page.container.querySelector('.cv-board'),
    world: () => page.container.querySelector('.cv-world'),
    source: () => node('origin').querySelector('.cv-handle-out'),
    body: () => node('origin').querySelector('.cv-node-content'),
    preview: () => page.container.querySelector('.cv-link-preview'),
    edgeCount: () =>
      page.container.querySelectorAll('.cv-edges > [data-edge-id]:not(.cv-link-preview)').length,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    switchTo: async (id) => {
      page.rerender(<NodeCanvas {...props(id)} />);
      await ready(id);
    },
  };
}
function startPinch(page) {
  const board = page.board();
  const left = finger(board, 1, 50, 40),
    right = finger(board, 2, 150, 40);
  touch(board, 'touchstart', [left, right]);
  return { board, left, right };
}
function movePinch(board) {
  return touch(board, 'touchmove', [finger(board, 1, 40, 60), finger(board, 2, 200, 60)]);
}
function endPinch(board) {
  touch(board, 'touchend', [], [finger(board, 1, 40, 60), finger(board, 2, 200, 60)]);
}
function startConnection(page, pointerType = 'mouse') {
  const handle = page.source();
  pointer(handle, 'pointerdown', { pointerType });
  pointer(window, 'pointermove', { x: 990, y: 400, pointerType });
  expect(page.preview()).toBeTruthy();
  expect(frames.size).toBeGreaterThan(0);
  return handle;
}

describe('actual NodeCanvas touch and connection ownership', () => {
  it('hands a one-finger node edit to pinch without a second history entry or late node writes', async () => {
    const page = await mountedCanvas();
    const body = page.body(),
      node = page.node('origin');
    pointer(body, 'pointerdown', { id: 1, x: 150, y: 150, pointerType: 'touch' });
    touch(body, 'touchstart', [finger(body, 1, 150, 150)]);
    pointer(node, 'pointermove', { id: 1, x: 160, y: 150, pointerType: 'touch' });
    touch(body, 'touchmove', [finger(body, 1, 160, 150)]);
    expect(node.style.left).toBe('110px');
    expect(page.undo().disabled).toBe(false);

    const left = finger(body, 1, 160, 150),
      right = finger(page.board(), 2, 260, 150);
    touch(page.board(), 'touchstart', [left, right], [right]);
    expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
    pointer(node, 'pointermove', { id: 1, x: 600, y: 500, pointerType: 'touch' });
    pointer(node, 'pointerup', { id: 1, x: 650, y: 550, pointerType: 'touch' });
    touch(body, 'touchmove', [finger(body, 1, 140, 150), finger(page.board(), 2, 300, 150)]);
    expect(viewport(page).z).toBeCloseTo(1.6);
    expect(node.style.left).toBe('110px');
    expect(page.edgeCount()).toBe(0);
    touch(
      page.board(),
      'touchend',
      [],
      [finger(body, 1, 140, 150), finger(page.board(), 2, 300, 150)],
    );
    fireEvent.click(page.undo());
    expect(page.node('origin').style.left).toBe('100px');
    expect(page.undo().disabled).toBe(true);
  });

  it.each(['mouse', 'pen'])(
    'lets native pinch take over an active %s port drag and cancels its old frame and release',
    async (pointerType) => {
      const page = await mountedCanvas();
      const handle = startConnection(page, pointerType),
        callbacks = oldFrames();
      startPinch(page);
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(11);
      expect(page.preview()).toBeNull();
      movePinch(page.board());
      const view = viewport(page);
      expect(view.z).toBeCloseTo(1.6);
      runOldFrames(callbacks);
      pointer(window, 'pointermove', { x: 600, y: 315, pointerType });
      pointer(window, 'pointerup', { x: 600, y: 315, pointerType });
      expect(viewport(page)).toEqual(view);
      expect(page.preview()).toBeNull();
      expect(page.edgeCount()).toBe(0);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(page.undo().disabled).toBe(true);
      expect(frames.size).toBe(0);
      endPinch(page.board());
    },
  );

  it('lets a port drag take over native pinch and ignores the old touch movement and end', async () => {
    const page = await mountedCanvas();
    startPinch(page);
    movePinch(page.board());
    const view = viewport(page);
    const handle = page.source();
    pointer(handle, 'pointerdown', { pointerType: 'pen' });
    expect(page.board().classList.contains('cv-panning')).toBe(false);
    movePinch(page.board());
    touch(page.board(), 'touchmove', [
      finger(page.board(), 1, 0, 300),
      finger(page.board(), 2, 800, 300),
    ]);
    endPinch(page.board());
    expect(viewport(page)).toEqual(view);
    pointer(window, 'pointermove', { x: 500, y: 400, pointerType: 'pen' });
    pointer(window, 'pointerup', {
      x: view.x + 600 * view.z,
      y: view.y + 315 * view.z,
      pointerType: 'pen',
    });
    expect(page.preview()).toBeNull();
    expect(page.edgeCount()).toBe(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(11);
    expect(page.undo().disabled).toBe(false);
    fireEvent.click(page.undo());
    expect(page.edgeCount()).toBe(0);
    expect(page.undo().disabled).toBe(true);
  });

  it.each(['node', 'pinch', 'connection'])(
    'rejects old %s events across A to B to A while allowing a fresh A gesture',
    async (kind) => {
      const page = await mountedCanvas();
      const board = page.board();
      if (kind === 'node') pointer(page.body(), 'pointerdown', { id: 1, x: 150, y: 150 });
      if (kind === 'pinch') startPinch(page);
      if (kind === 'connection') startConnection(page);
      const callbacks = oldFrames();
      const late = () => {
        runOldFrames(callbacks);
        touch(board, 'touchmove', [finger(board, 1, 0, 300), finger(board, 2, 800, 300)]);
        touch(board, 'touchend', [], [finger(board, 1, 0, 300), finger(board, 2, 800, 300)]);
        pointer(board, 'pointermove', { id: kind === 'node' ? 1 : 11, x: 600, y: 315 });
        pointer(board, 'pointerup', { id: kind === 'node' ? 1 : 11, x: 600, y: 315 });
      };
      await page.switchTo(projectB);
      late();
      expect(viewport(page)).toEqual({ x: 30, y: -10, z: 0.5 });
      expect(page.node('origin').style.left).toBe('100px');
      expect(page.edgeCount()).toBe(0);
      await page.switchTo(projectA);
      expect(page.board()).toBe(board);
      late();
      expect(viewport(page)).toEqual({ x: 0, y: 0, z: 1 });
      expect(page.node('origin').style.left).toBe('100px');
      expect(page.preview()).toBeNull();
      expect(page.edgeCount()).toBe(0);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(page.undo().disabled).toBe(true);
      touch(board, 'touchstart', [finger(board, 99, 50, 50)]);
      touch(board, 'touchmove', [finger(board, 99, 80, 90)]);
      touch(board, 'touchend', [], [finger(board, 99, 80, 90)]);
      expect(viewport(page)).toEqual({ x: 30, y: 40, z: 1 });
      page.unmount();
      expect(stored().view).toEqual({ x: 30, y: 40, z: 1 });
      expect(stored(projectB).view).toEqual({ x: 30, y: -10, z: 0.5 });
      expect(stored().edges).toEqual([]);
    },
  );

  it.each(['node', 'pinch', 'connection'])(
    'releases an active %s owner on unmount before late events can alter the saved document',
    async (kind) => {
      const added = vi.spyOn(EventTarget.prototype, 'addEventListener');
      const removed = vi.spyOn(EventTarget.prototype, 'removeEventListener');
      const page = await mountedCanvas(),
        board = page.board(),
        node = page.node('origin');
      if (kind === 'node') {
        pointer(page.body(), 'pointerdown', { id: 1, x: 150, y: 150 });
        pointer(node, 'pointermove', { id: 1, x: 160, y: 150 });
      }
      if (kind === 'pinch') {
        startPinch(page);
        movePinch(board);
      }
      const handle = kind === 'connection' ? startConnection(page) : null;
      const callbacks = oldFrames();
      page.unmount();
      const saved = localStorage.getItem(`libtv.canvas.${projectA}`);
      expect(stored().edges).toEqual([]);
      if (kind === 'node') {
        expect(stored().nodes.find((item) => item.id === 'origin').position.x).toBe(110);
        expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
      }
      if (kind === 'pinch') expect(stored().view.z).toBeCloseTo(1.6);
      if (handle) expect(handle.releasePointerCapture).toHaveBeenCalledWith(11);
      expect(frames.size).toBe(0);
      const nativeTypes = [
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
        'pointermove',
        'pointerup',
        'pointercancel',
        'lostpointercapture',
        'blur',
        'keydown',
        'visibilitychange',
      ];
      for (let index = 0; index < added.mock.calls.length; index += 1) {
        const [type, listener, options] = added.mock.calls[index],
          target = added.mock.contexts[index];
        if (!nativeTypes.includes(type) || ![board, window, document].includes(target)) continue;
        const capture = typeof options === 'boolean' ? options : !!options?.capture;
        expect(
          removed.mock.calls.some(
            ([removedType, removedListener, removedOptions], removedIndex) => {
              const removedCapture =
                typeof removedOptions === 'boolean' ? removedOptions : !!removedOptions?.capture;
              return (
                removed.mock.contexts[removedIndex] === target &&
                type === removedType &&
                listener === removedListener &&
                capture === removedCapture
              );
            },
          ),
          `native ${type} owner should remove its exact listener`,
        ).toBe(true);
      }
      runOldFrames(callbacks);
      pointer(window, 'pointermove', { x: 600, y: 315 });
      pointer(window, 'pointerup', { x: 600, y: 315 });
      touch(board, 'touchmove', [finger(board, 1, 0, 300), finger(board, 2, 800, 300)]);
      touch(board, 'touchend', [], [finger(board, 1, 0, 300), finger(board, 2, 800, 300)]);
      fireEvent(window, new Event('pagehide'));
      expect(frames.size).toBe(0);
      expect(localStorage.getItem(`libtv.canvas.${projectA}`)).toBe(saved);
    },
  );

  it('preserves native textarea gestures while preventing default for a board-owned pan', async () => {
    const page = await mountedCanvas();
    const input = page.node('text').querySelector('textarea');
    const start = touch(input, 'touchstart', [finger(input, 1, 150, 500)]);
    const move = touch(input, 'touchmove', [finger(input, 1, 150, 550)]);
    const end = touch(input, 'touchend', [], [finger(input, 1, 150, 550)]);
    expect([start.defaultPrevented, move.defaultPrevented, end.defaultPrevented]).toEqual([
      false,
      false,
      false,
    ]);
    expect(viewport(page)).toEqual({ x: 0, y: 0, z: 1 });
    touch(page.board(), 'touchstart', [finger(page.board(), 2, 50, 50)]);
    const pan = touch(page.board(), 'touchmove', [finger(page.board(), 2, 80, 90)]);
    expect(pan.defaultPrevented).toBe(true);
    expect(viewport(page)).toEqual({ x: 30, y: 40, z: 1 });
    expect(page.undo().disabled).toBe(true);
  });

  it('keeps the zoom unchanged on the first pan after a source-padding fit of a huge canvas', async () => {
    const document = snapshot(projectA);
    document.nodes[1].position.x = 10000;
    localStorage.setItem(`libtv.canvas.${projectA}`, JSON.stringify(document));
    const page = await mountedCanvas(),
      board = page.board();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    touch(board, 'touchstart', [finger(board, 1, 50, 50)]);
    touch(board, 'touchend', [], [finger(board, 1, 50, 50)]);
    now.mockReturnValue(1150);
    touch(board, 'touchstart', [finger(board, 2, 50, 50)]);
    touch(board, 'touchend', [], [finger(board, 2, 50, 50)]);
    const fitted = viewport(page);
    expect(fitted.z).toBe(0.1);
    expect(page.world().style.transition).toBe('transform 300ms ease');
    touch(board, 'touchstart', [finger(board, 3, 50, 50)]);
    touch(board, 'touchmove', [finger(board, 3, 80, 90)]);
    expect(viewport(page)).toEqual({ ...fitted, x: fitted.x + 30, y: fitted.y + 40 });
    expect(page.world().style.transition).toBe('');
    expect(page.undo().disabled).toBe(true);
  });

  it('passes the original .15 numeric padding through double tap and allows fit zoom above one', async () => {
    const page = await mountedCanvas(),
      board = page.board();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    touch(board, 'touchstart', [finger(board, 1, 50, 50)]);
    touch(board, 'touchend', [], [finger(board, 1, 50, 50)]);
    now.mockReturnValue(1150);
    touch(board, 'touchstart', [finger(board, 2, 50, 50)]);
    const fit = touch(board, 'touchend', [], [finger(board, 2, 50, 50)]);
    expect(fit.defaultPrevented).toBe(true);
    // The source parser floors each side to 65px, leaving 870px for 850 world units.
    expect(viewport(page).z).toBeCloseTo(87 / 85);
    expect(page.world().style.transition).toBe('transform 300ms ease');
    expect(page.undo().disabled).toBe(true);
  });

  it.each(['touch', 'connection'])(
    'does not let a finished %s gesture suppress a fresh mouse double click on the board',
    async (kind) => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const page = await mountedCanvas(),
        board = page.board();
      if (kind === 'touch') {
        touch(board, 'touchstart', [finger(board, 1, 50, 50)]);
        touch(board, 'touchmove', [finger(board, 1, 80, 90)]);
        touch(board, 'touchend', [], [finger(board, 1, 80, 90)]);
      } else {
        startConnection(page);
        pointer(window, 'pointerup', { x: 600, y: 315 });
        expect(page.edgeCount()).toBe(1);
      }
      for (let detail = 1; detail <= 2; detail += 1) {
        pointer(board, 'pointerdown', { x: 400, y: 100 });
        pointer(board, 'pointerup', { x: 400, y: 100 });
        fireEvent.click(board, { detail, clientX: 400, clientY: 100 });
      }
      fireEvent.doubleClick(board, { detail: 2, clientX: 400, clientY: 100 });
      expect(screen.queryByText('添加节点')).toBeTruthy();
      expect(page.edgeCount()).toBe(kind === 'touch' ? 0 : 1);
      expect(page.undo().disabled).toBe(kind === 'touch');
    },
  );
});
