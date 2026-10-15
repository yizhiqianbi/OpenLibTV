import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
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

const projectId = 'pointer-interaction-regression';
const user = { name: 'local' };
const originalPositions = { video: { x: 100, y: 100 }, target: { x: 600, y: 200 } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    `libtv.canvas.${projectId}`,
    JSON.stringify({
      title: '画布指针交互回归',
      nodes: [
        {
          id: 'video',
          type: 'video',
          width: 350,
          height: 230,
          position: originalPositions.video,
          data: {
            name: '视频生成器',
            action: 'video_generate',
            params: { model: 'star-video2', modeType: 'text2video', prompt: '原提示词' },
          },
        },
        {
          id: 'target',
          type: 'image',
          width: 350,
          height: 230,
          position: originalPositions.target,
          data: {
            name: '目标图片',
            action: 'image_resource',
            url: ['https://example.test/image.png'],
            params: {},
          },
        },
      ],
      edges: [],
      view: { x: 0, y: 0, z: 1 },
    }),
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

// jsdom may expose MouseEvent without PointerEvent. Keep the pointer identity and
// coordinates used by production pointerup/capture guards in either environment.
function pointer(element, type, { x, y, button = 0, pointerId = 7 } = {}) {
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
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function installCapture(element) {
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = vi.fn(() => true);
  element.releasePointerCapture = vi.fn();
}

async function mountedCanvas() {
  const page = render(<NodeCanvas path={`/canvas?projectId=${projectId}`} user={user} />);
  const node = (id) => page.container.querySelector(`[data-node-id="${id}"]`);
  await waitFor(() => expect(node('video')).toBeTruthy());
  const board = page.container.querySelector('.cv-board');
  installCapture(board);
  for (const id of ['video', 'target']) installCapture(node(id));
  fireEvent.click(node('video'), { detail: 1 });
  await act(async () => vi.dynamicImportSettled());
  const input = await screen.findByRole('textbox', { name: '提示词' });
  await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
  return {
    ...page,
    node,
    board,
    input,
    world: page.container.querySelector('.cv-world'),
    selectedIds: () =>
      [...page.container.querySelectorAll('.cv-node.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
    edgeCount: () => page.container.querySelectorAll('.cv-edges > [data-edge-id]').length,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}

function expectOriginalPositions(page) {
  for (const [id, position] of Object.entries(originalPositions)) {
    expect(page.node(id).style.left).toBe(`${position.x}px`);
    expect(page.node(id).style.top).toBe(`${position.y}px`);
  }
}

describe('actual NodeCanvas pointer interactions', () => {
  it.each([
    ['plain click', 0],
    ['pointer jitter below the local 4px drag threshold', 3],
  ])('retains the inline editor DOM and creates no undo entry on %s', async (_, dx) => {
    const page = await mountedCanvas();
    const body = page.node('video').querySelector('.cv-node-content');
    expect(page.undo().disabled).toBe(true);

    pointer(body, 'pointerdown', { x: 150, y: 150 });
    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(page.input);
    expect(page.node('video').setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    if (dx) {
      pointer(page.node('video'), 'pointermove', { x: 150 + dx, y: 150 });
      expect(screen.getByRole('textbox', { name: '提示词' })).toBe(page.input);
      expect(page.undo().disabled).toBe(true);
    }
    pointer(page.node('video'), 'pointerup', { x: 150 + dx, y: 150 });
    fireEvent.click(body, { detail: 1 });

    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(page.input);
    expect(page.input.textContent).toBe('原提示词');
    expect(page.selectedIds()).toEqual(['video']);
    expectOriginalPositions(page);
    expect(page.undo().disabled).toBe(true);
    expect(page.redo().disabled).toBe(true);
    expect(page.node('video').releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(page.board.releasePointerCapture).not.toHaveBeenCalled();
  });

  it('records a real drag once, applies the release coordinates and restores it with one undo', async () => {
    const page = await mountedCanvas();
    const body = page.node('video').querySelector('.cv-node-content');
    pointer(body, 'pointerdown', { x: 150, y: 150 });
    expect(page.undo().disabled).toBe(true);

    pointer(page.node('video'), 'pointermove', { x: 170, y: 180 });
    expect(page.node('video').style.left).toBe('120px');
    expect(page.node('video').style.top).toBe('130px');
    expect(page.input.isConnected).toBe(false);
    expect(page.undo().disabled).toBe(false);
    pointer(page.node('video'), 'pointermove', { x: 200, y: 210 });
    pointer(page.node('video'), 'pointerup', { x: 220, y: 240 });
    fireEvent.click(body, { detail: 1 });

    expect(page.node('video').style.left).toBe('170px');
    expect(page.node('video').style.top).toBe('190px');
    expect(page.node('target').style.left).toBe('600px');
    expect(page.node('target').style.top).toBe('200px');
    expect(page.selectedIds()).toEqual(['video']);
    expect(page.edgeCount()).toBe(0);
    fireEvent.click(page.undo());
    expectOriginalPositions(page);
    // An extra pointerdown/move record would leave a second undo entry here.
    expect(page.undo().disabled).toBe(true);
    expect(page.redo().disabled).toBe(false);
    fireEvent.click(page.redo());
    expect(page.node('video').style.left).toBe('170px');
    expect(page.node('video').style.top).toBe('190px');
    expect(page.redo().disabled).toBe(true);
  });

  it.each(['hand tool', 'Space', 'middle button'])(
    'pans from an unselected node with %s without changing nodes, selection or undo',
    async (mode) => {
      const page = await mountedCanvas();
      const target = page.node('target');
      const body = target.querySelector('.cv-node-content');
      target.focus();
      if (mode === 'hand tool') fireEvent.click(screen.getByTitle('抓手 H'));
      if (mode === 'Space') fireEvent.keyDown(window, { code: 'Space', key: ' ' });
      const button = mode === 'middle button' ? 1 : 0;

      pointer(body, 'pointerdown', { x: 650, y: 250, button });
      expect(page.board.classList.contains('cv-panning')).toBe(true);
      expect(page.board.setPointerCapture).toHaveBeenCalledWith(7);
      expect(target.setPointerCapture).not.toHaveBeenCalled();
      pointer(page.board, 'pointermove', { x: 690, y: 300, button });
      expect(page.world.style.transform).toBe('translate(40px,50px) scale(1)');
      pointer(page.board, 'pointerup', { x: 710, y: 320, button });
      fireEvent.click(body, { detail: 1 });
      if (mode === 'Space') fireEvent.keyUp(window, { code: 'Space', key: ' ' });

      expect(page.world.style.transform).toBe('translate(60px,70px) scale(1)');
      expect(page.board.classList.contains('cv-panning')).toBe(false);
      expect(page.board.releasePointerCapture).toHaveBeenCalledWith(7);
      expectOriginalPositions(page);
      expect(page.selectedIds()).toEqual(['video']);
      expect(screen.getByRole('textbox', { name: '提示词' })).toBe(page.input);
      expect(page.edgeCount()).toBe(0);
      expect(page.undo().disabled).toBe(true);
      expect(page.redo().disabled).toBe(true);
    },
  );

  it('connects with an ordinary target-body click without arming a drag or adding extra history', async () => {
    const page = await mountedCanvas();
    const source = page.node('target');
    const target = page.node('video');
    const body = target.querySelector('.cv-node-content');
    const port = within(source).getByTitle('连接节点');
    pointer(port, 'pointerdown', { x: 990, y: 315 });
    pointer(port, 'pointerup', { x: 990, y: 315 });
    fireEvent.click(port, { detail: 1 });
    expect(page.undo().disabled).toBe(true);
    pointer(body, 'pointerdown', { x: 150, y: 150 });
    expect(page.selectedIds()).toEqual(['video']);
    expect(target.setPointerCapture).not.toHaveBeenCalled();
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    pointer(body, 'pointerup', { x: 150, y: 150 });
    fireEvent.click(body, { detail: 1 });

    expect(page.edgeCount()).toBe(1);
    expect(page.selectedIds()).toEqual(['video']);
    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(page.input);
    expectOriginalPositions(page);
    expect(page.world.style.transform).toBe('translate(0px,0px) scale(1)');
    expect(page.undo().disabled).toBe(false);
    fireEvent.click(page.undo());
    expect(page.edgeCount()).toBe(0);
    expect(page.undo().disabled).toBe(true);
    expectOriginalPositions(page);
    fireEvent.click(page.redo());
    expect(page.edgeCount()).toBe(1);
    expect(page.redo().disabled).toBe(true);
    page.unmount();
    const saved = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
    expect(saved.edges).toEqual([{ id: expect.any(String), source: 'target', target: 'video' }]);
    expect(Object.fromEntries(saved.nodes.map((node) => [node.id, node.position]))).toEqual(
      originalPositions,
    );
  });
});
