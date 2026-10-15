import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import support from '../../../public/data/script-text-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: name === 'models' ? models : name === 'script-text-support' ? support : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'actual-reference-gesture-review';
const storageKey = `libtv.canvas.${projectId}`;
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
  });
});
afterEach(() => vi.unstubAllGlobals());

function pointer(element, type, { x, y, button = 0, pointerId = 7, pointerType = 'mouse' }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons: type === 'pointerup' ? 0 : button === 1 ? 4 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

async function page(connected = false, unmeasuredImage = false) {
  const value = {
    title: '参考手势验收',
    view: { x: 0, y: 0, z: 1 },
    nodes: [
      createCanvasScriptNode({ id: 'script', position: { x: 400, y: 100 }, models }),
      {
        id: 'image',
        type: 'image',
        position: { x: 0, y: 0 },
        ...(unmeasuredImage ? {} : { width: 100, height: 100 }),
        data: {
          type: 'image',
          name: '参考角色',
          action: 'image_resource',
          url: ['/reference.png'],
        },
      },
    ],
    edges: connected
      ? [
          {
            id: 'incoming',
            source: 'image',
            sourceHandle: 'source',
            target: 'script',
            targetHandle: 'target',
          },
        ]
      : [],
  };
  localStorage.setItem(storageKey, JSON.stringify(value));
  const rendered = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => rendered.container.querySelector(`article[data-node-id="${id}"]`);
  const board = rendered.container.querySelector('.cv-board');
  const captures = new Set();
  board.setPointerCapture = vi.fn((id) => captures.add(id));
  board.hasPointerCapture = vi.fn((id) => captures.has(id));
  board.releasePointerCapture = vi.fn((id) => captures.delete(id));
  if (unmeasuredImage)
    node('image').getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 350,
      bottom: 230,
      width: 350,
      height: 230,
    });
  fireEvent.click(node('script'));
  const widget = await screen.findByTestId('scriptv2-generator-view');
  fireEvent.click(within(widget).getByRole('button', { name: '添加参考图' }));
  fireEvent.click(
    within(screen.getByRole('menu', { name: '添加参考图方式' })).getByRole('menuitem', {
      name: '在当前画布中添加参考',
    }),
  );
  await waitFor(() => expect(node('script').dataset.refPickState).toBe('self'));
  return { ...rendered, board, node };
}

describe('actual reference mask after ordinary pan ownership', () => {
  it.each(['space', 'middle'])(
    'does not consume a queued pointer click on the pick mask after %s pan',
    async (kind) => {
      const canvas = await page();
      const original = graph(read());
      if (kind === 'space') fireEvent.keyDown(document, { key: ' ', code: 'Space' });
      const title = canvas.node('image').querySelector('.cv-node-title span');
      const button = kind === 'middle' ? 1 : 0;
      pointer(title, 'pointerdown', { x: 10, y: 10, button });
      expect(canvas.board.classList.contains('cv-panning')).toBe(true);
      pointer(canvas.board, 'pointermove', { x: 110, y: 50, button });
      pointer(canvas.board, 'pointerup', { x: 110, y: 50, button });
      if (kind === 'space') fireEvent.keyUp(document, { key: ' ', code: 'Space' });
      fireEvent.click(within(canvas.node('image')).getByRole('button', { name: '选择 参考角色' }), {
        detail: 1,
      });
      act(() => window.dispatchEvent(new Event('pagehide')));
      expect(read().view).toMatchObject({ x: 100, y: 40, z: 1 });
      expect(graph(read())).toEqual(original);
      expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    },
  );

  it('does not consume a queued pointer click on the disconnect mask after a Space pan', async () => {
    const canvas = await page(true);
    const original = graph(read());
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    const title = canvas.node('image').querySelector('.cv-node-title span');
    pointer(title, 'pointerdown', { x: 10, y: 10 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(true);
    pointer(canvas.board, 'pointermove', { x: 110, y: 50 });
    pointer(canvas.board, 'pointerup', { x: 110, y: 50 });
    fireEvent.keyUp(document, { key: ' ', code: 'Space' });
    fireEvent.click(within(canvas.node('image')).getByRole('button', { name: '取消选择' }), {
      detail: 1,
    });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(graph(read())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('accepts a fresh intentional mask pointer gesture immediately after panning with the same mouse pointer ID', async () => {
    const canvas = await page();
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    const title = canvas.node('image').querySelector('.cv-node-title span');
    pointer(title, 'pointerdown', { x: 10, y: 10 });
    pointer(canvas.board, 'pointermove', { x: 110, y: 50 });
    pointer(canvas.board, 'pointerup', { x: 110, y: 50 });
    fireEvent.keyUp(document, { key: ' ', code: 'Space' });
    const pick = within(canvas.node('image')).getByRole('button', { name: '选择 参考角色' });
    pointer(pick, 'pointerdown', { x: 150, y: 90 });
    pointer(pick, 'pointerup', { x: 150, y: 90 });
    fireEvent.click(pick, { detail: 1 });
    expect(read().edges).toMatchObject([{ source: 'image', target: 'script' }]);
    expect(canvas.node('image').dataset.refPickState).toBe('connected');
  });

  it('keeps native keyboard Space activation of a focused pick button working', async () => {
    const canvas = await page();
    const pick = within(canvas.node('image')).getByRole('button', { name: '选择 参考角色' });
    act(() => pick.focus());
    await userEvent.setup().keyboard('[Space]');
    expect(read().edges).toMatchObject([{ source: 'image', target: 'script' }]);
    expect(canvas.node('image').dataset.refPickState).toBe('connected');
    expect(canvas.node('script').dataset.refPickState).toBe('self');
    expect(screen.getByTestId('scriptv2-generator-view')).toBeTruthy();
  });

  it('uses the actual mounted image bounds when a source resource has no stored or measured dimensions', async () => {
    const canvas = await page(false, true);
    expect(canvas.node('image').style.width).toBe('350px');
    expect(canvas.node('image').style.height).toBe('230px');
    expect(read().nodes.find((node) => node.id === 'image')).not.toHaveProperty('width');
    expect(read().nodes.find((node) => node.id === 'image')).not.toHaveProperty('height');
    // This intersects the visible lower-right image surface, outside the pure fallback 200×120.
    pointer(canvas.board, 'pointerdown', { x: 260, y: 140 });
    pointer(canvas.board, 'pointermove', { x: 320, y: 210 });
    pointer(canvas.board, 'pointerup', { x: 320, y: 210 });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(read().edges).toMatchObject([{ source: 'image', target: 'script' }]);
    expect(canvas.node('image').dataset.refPickState).toBe('connected');
    expect(read().nodes.find((node) => node.id === 'image')).not.toHaveProperty('measured');
  });

  it('does not hand a second mouse primary pointer to ordinary panning while a pen reference box still owns the board', async () => {
    const canvas = await page();
    pointer(canvas.board, 'pointerdown', { x: -1, y: -1, pointerType: 'pen' });
    pointer(canvas.board, 'pointermove', { x: 80, y: 80, pointerType: 'pen' });
    const rectangle = canvas.container.querySelector('.cv-reference-pick-box');
    expect(rectangle).toBeTruthy();
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    pointer(canvas.board, 'pointerdown', { x: 700, y: 500, pointerId: 8 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    expect(canvas.board.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(canvas.container.querySelector('.cv-reference-pick-box')).toBe(rectangle);
    pointer(canvas.board, 'pointerup', { x: 700, y: 500, pointerId: 8 });
    expect(read().edges).toEqual([]);
    pointer(canvas.board, 'pointerup', { x: 80, y: 80, pointerType: 'pen' });
    expect(read().edges).toMatchObject([{ source: 'image', target: 'script' }]);
    expect(read().view).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('does not start a second pen reference box while an ordinary mouse pan still owns its capture', async () => {
    const canvas = await page();
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    pointer(canvas.board, 'pointerdown', { x: 0, y: 0 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(true);
    fireEvent.keyUp(document, { key: ' ', code: 'Space' });
    pointer(canvas.board, 'pointerdown', { x: 300, y: 300, pointerType: 'pen', pointerId: 8 });
    expect(canvas.board.setPointerCapture).toHaveBeenCalledTimes(1);
    pointer(canvas.board, 'pointermove', { x: 40, y: 40, pointerType: 'pen', pointerId: 8 });
    expect(canvas.container.querySelector('.cv-reference-pick-box')).toBeNull();
    pointer(canvas.board, 'pointerup', { x: 40, y: 40, pointerType: 'pen', pointerId: 8 });
    expect(read().edges).toEqual([]);
    pointer(canvas.board, 'pointerup', { x: 100, y: 40 });
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(read().view).toMatchObject({ x: 100, y: 40, z: 1 });
    expect(read().edges).toEqual([]);
  });
});
