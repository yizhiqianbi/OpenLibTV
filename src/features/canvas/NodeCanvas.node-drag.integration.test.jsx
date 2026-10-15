import {
  act,
  configure,
  fireEvent,
  getConfig,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'node-drag-integration';
const storageKey = `libtv.canvas.${projectId}`;
let frames, nextFrame;
const nodeFixture = (id, position, extra = {}) => ({
  id,
  type: 'text',
  position,
  width: 200,
  height: 150,
  data: { name: id, action: 'text_resource', text: `${id} 正文`, params: {} },
  ...extra,
});
const baseSnapshot = () => ({
  title: '节点落点与平移联合验收',
  nodes: [
    {
      id: 'group',
      type: 'group',
      position: { x: 400, y: 100 },
      width: 500,
      height: 500,
      data: { name: '目标分组', childNodeIds: ['child'] },
    },
    nodeFixture('child', { x: 40, y: 250 }, { parentId: 'group' }),
    nodeFixture('outside', { x: 80, y: 100 }),
    nodeFixture('other', { x: 80, y: 420 }),
  ],
  edges: [{ id: 'existing', source: 'outside', target: 'child' }],
  view: { x: 0, y: 0, z: 1 },
});
const write = (value) => localStorage.setItem(storageKey, JSON.stringify(value));
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const saved = () => JSON.parse(localStorage.getItem(storageKey));
const savedNode = (id) => saved().nodes.find((node) => node.id === id);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  write(baseSnapshot());
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

function pointer(element, type, { x, y, shiftKey = false, altKey = false } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    shiftKey,
    altKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: 37 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}
function capture(element) {
  let owner;
  element.setPointerCapture = vi.fn((id) => {
    owner = id;
  });
  element.hasPointerCapture = vi.fn((id) => owner === id);
  element.releasePointerCapture = vi.fn(() => {
    owner = undefined;
  });
}
async function pageCanvas() {
  const page = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  const node = (id) => page.container.querySelector(`[data-node-id="${id}"]`);
  await waitFor(() => expect(node('outside')).toBeTruthy());
  const board = page.container.querySelector('.cv-board');
  for (const element of page.container.querySelectorAll('.cv-board,.cv-node')) capture(element);
  return { ...page, node, board, world: () => page.container.querySelector('.cv-world') };
}
function stepFrame(time) {
  const pending = [...frames.entries()];
  frames.clear();
  act(() => pending.forEach(([, callback]) => callback(time)));
}
function dragNode(page, id, start, move, end = move) {
  pointer(page.node(id), 'pointerdown', start);
  pointer(page.board, 'pointermove', move);
  pointer(page.board, 'pointerup', end);
  flush();
}
const undo = () => fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
const redo = () => fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));

describe('actual NodeCanvas node drag, group drop, history and storage', () => {
  it('retains the first captured drag when readiness is visible before passive effects settle', async () => {
    const originalAsyncWrapper = getConfig().asyncWrapper;
    // A DOM observer can see the ready commit before React's scheduled passive
    // cleanup. Omit only the testing helper's extra timer drain for this case.
    configure({
      asyncWrapper: async (callback) => {
        const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
        globalThis.IS_REACT_ACT_ENVIRONMENT = false;
        try {
          return await callback();
        } finally {
          globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
        }
      },
    });
    try {
      const page = await pageCanvas();
      const node = page.node('outside');
      expect(screen.getByRole('button', { name: baseSnapshot().title }).disabled).toBe(false);
      expect(page.container.querySelector('.cv-loading')).toBeNull();
      pointer(node, 'pointerdown', { x: 100, y: 110 });
      expect(node.setPointerCapture).toHaveBeenCalledWith(37);
      expect(node.releasePointerCapture).not.toHaveBeenCalled();
      expect(node.hasPointerCapture(37)).toBe(true);
      pointer(page.board, 'pointermove', { x: 400, y: 210 });
      expect(node.style.left).toBe('380px');
      expect(node.style.top).toBe('200px');
      pointer(page.board, 'pointerup', { x: 400, y: 210 });
      expect(node.releasePointerCapture).toHaveBeenCalledTimes(1);
      flush();
      expect(savedNode('outside').parentId).toBeUndefined();
      expect(savedNode('outside').position).toEqual({ x: 380, y: 200 });
      expect(savedNode('group').data.childNodeIds).toEqual(['child']);
      expect(saved().edges).toEqual(baseSnapshot().edges);
      undo();
      flush();
      expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
      expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
      redo();
      flush();
      expect(savedNode('outside').position).toEqual({ x: 380, y: 200 });
    } finally {
      configure({ asyncWrapper: originalAsyncWrapper });
    }
  });

  it('raises a selected child above an overlapping peer without rebuilding its input or persisting a layer', async () => {
    const snapshot = baseSnapshot();
    snapshot.nodes[2] = { ...snapshot.nodes[2], parentId: 'group', position: { x: 40, y: 100 } };
    write(snapshot);
    const page = await pageCanvas();
    const input = page.node('child').querySelector('textarea');
    fireEvent.click(input);
    expect(Number(page.node('child').style.zIndex)).toBeGreaterThan(
      Number(page.node('outside').style.zIndex),
    );
    expect(page.node('child').querySelector('textarea')).toBe(input);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    flush();
    expect(savedNode('child')).not.toHaveProperty('zIndex');
    expect(savedNode('child')).not.toHaveProperty('selected');
    fireEvent.click(page.node('other').querySelector('textarea'));
    expect(page.node('child').style.zIndex).toBe(page.node('outside').style.zIndex);
  });

  it('uses the final pointerup point to attach, preserves world position and edges, then undoes once', async () => {
    const page = await pageCanvas();
    dragNode(page, 'outside', { x: 100, y: 110 }, { x: 400, y: 180 }, { x: 460, y: 210 });
    expect(savedNode('outside').parentId).toBe('group');
    expect(savedNode('outside').position).toEqual({ x: 40, y: 100 });
    expect(savedNode('group').data.childNodeIds).toEqual(['child', 'outside']);
    expect(savedNode('group').width).toBe(500);
    expect(saved().edges).toEqual(baseSnapshot().edges);
    expect(page.node('outside').style.left).toBe('440px');
    expect(page.node('outside').classList.contains('cv-selected')).toBe(true);
    undo();
    flush();
    expect(savedNode('outside').parentId).toBeUndefined();
    expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    redo();
    flush();
    expect(savedNode('outside').position).toEqual({ x: 40, y: 100 });
    page.unmount();
    const restored = await pageCanvas();
    expect(restored.node('outside').style.left).toBe('440px');
    expect(restored.node('outside').classList.contains('cv-selected')).toBe(false);
  });

  it('keeps overlapping children in their group and detaches only on complete separation', async () => {
    const page = await pageCanvas();
    dragNode(page, 'child', { x: 450, y: 360 }, { x: 900, y: 360 });
    expect(savedNode('child').parentId).toBe('group');
    expect(savedNode('child').position).toEqual({ x: 490, y: 250 });
    undo();
    dragNode(page, 'child', { x: 450, y: 360 }, { x: 150, y: 360 });
    expect(savedNode('child').parentId).toBeUndefined();
    expect(savedNode('child').position).toEqual({ x: 140, y: 350 });
    expect(savedNode('group').data.childNodeIds).toEqual([]);
    expect(page.node('child').style.left).toBe('140px');
    undo();
    flush();
    expect(savedNode('child').parentId).toBe('group');
    expect(savedNode('child').position).toEqual({ x: 40, y: 250 });
  });

  it('does not attach an overlapping outside node until it fits completely', async () => {
    const page = await pageCanvas();
    dragNode(page, 'outside', { x: 100, y: 110 }, { x: 400, y: 210 });
    expect(savedNode('outside').parentId).toBeUndefined();
    expect(savedNode('outside').position).toEqual({ x: 380, y: 200 });
    expect(savedNode('group').data.childNodeIds).toEqual(['child']);
  });

  it('moving the virtual selection into a group keeps both independent nodes and one history', async () => {
    const page = await pageCanvas();
    for (const [id, point, shiftKey] of [
      ['outside', { x: 100, y: 110 }, false],
      ['other', { x: 100, y: 430 }, true],
    ]) {
      pointer(page.node(id), 'pointerdown', { ...point, shiftKey });
      pointer(page.node(id), 'pointerup', { ...point, shiftKey });
    }
    const surface = page.container.querySelector('.cv-selection-overlay-fill');
    expect(surface).toBeTruthy();
    capture(surface);
    pointer(surface, 'pointerdown', { x: 100, y: 300 });
    pointer(page.board, 'pointermove', { x: 460, y: 300 });
    pointer(page.board, 'pointerup', { x: 460, y: 300 });
    flush();
    expect(savedNode('outside').parentId).toBeUndefined();
    expect(savedNode('other').parentId).toBeUndefined();
    expect(savedNode('outside').position).toEqual({ x: 440, y: 100 });
    expect(savedNode('other').position).toEqual({ x: 440, y: 420 });
    undo();
    flush();
    expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
    expect(savedNode('other').position).toEqual({ x: 80, y: 420 });
  });

  it('Escape cancels group drop and ignores late pointerup without losing the current moved position', async () => {
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 100, y: 110 });
    pointer(page.board, 'pointermove', { x: 460, y: 210 });
    fireEvent.keyDown(window, { key: 'Escape' });
    pointer(page.board, 'pointerup', { x: 500, y: 250 });
    flush();
    expect(savedNode('outside').parentId).toBeUndefined();
    expect(savedNode('outside').position).toEqual({ x: 440, y: 200 });
    undo();
    flush();
    expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
  });

  it('auto-pans a stationary edge pointer at non-unit zoom, keeps the node under it, and stops on release', async () => {
    write({ ...baseSnapshot(), view: { x: 20, y: 30, z: 0.5 } });
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 70, y: 90 });
    pointer(page.board, 'pointermove', { x: 995, y: 300 });
    stepFrame(0);
    stepFrame(16);
    stepFrame(32);
    flush();
    const during = saved();
    expect(during.view.x).toBeLessThan(20);
    const moved = savedNode('outside');
    // The pointer was 10 screen pixels inside the node at down.
    expect(during.view.x + moved.position.x * during.view.z).toBeCloseTo(985);
    expect(during.view.y + moved.position.y * during.view.z).toBeCloseTo(290);
    pointer(page.board, 'pointerup', { x: 995, y: 300 });
    flush();
    const completed = saved();
    stepFrame(64);
    flush();
    expect(saved().view).toEqual(completed.view);
    expect(savedNode('outside').position).toEqual(
      completed.nodes.find((node) => node.id === 'outside').position,
    );
    undo();
    flush();
    expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('keeps the virtual frame panning after its zero-delta first frame and preserves the selection', async () => {
    const page = await pageCanvas();
    for (const [id, y, shiftKey] of [
      ['outside', 110, false],
      ['other', 430, true],
    ]) {
      pointer(page.node(id), 'pointerdown', { x: 100, y, shiftKey });
      pointer(page.node(id), 'pointerup', { x: 100, y, shiftKey });
    }
    const surface = page.container.querySelector('.cv-selection-overlay-fill');
    capture(surface);
    pointer(surface, 'pointerdown', { x: 100, y: 300 });
    pointer(page.board, 'pointermove', { x: 995, y: 300 });
    stepFrame(0);
    flush();
    expect(saved().view.x).toBe(0);
    stepFrame(16);
    stepFrame(32);
    flush();
    const moved = saved();
    expect(moved.view.x).toBeLessThan(0);
    expect(moved.view.x + savedNode('outside').position.x).toBeCloseTo(975);
    expect(savedNode('other').position.x).toBe(savedNode('outside').position.x);
    pointer(page.board, 'pointerup', { x: 995, y: 300 });
    expect(
      [...page.container.querySelectorAll('.cv-node.cv-selected')].map(
        (node) => node.dataset.nodeId,
      ),
    ).toEqual(['outside', 'other']);
    undo();
    flush();
    expect(savedNode('outside').position).toEqual({ x: 80, y: 100 });
    expect(savedNode('other').position).toEqual({ x: 80, y: 420 });
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });
});
