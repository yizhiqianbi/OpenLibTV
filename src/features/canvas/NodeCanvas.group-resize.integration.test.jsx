import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import { canvasWorldPosition } from './domain/groups.js';
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
const projectId = 'group-resize-integration';
const key = `libtv.canvas.${projectId}`;
const snapshot = (empty = false) => ({
  title: '分组尺寸',
  view: { x: 0, y: 0, z: 0.5 },
  edges: empty ? [] : [{ id: 'edge', source: 'child', target: 'outside' }],
  nodes: [
    {
      id: 'g',
      type: 'group',
      position: { x: 100, y: 100 },
      width: 300,
      height: 220,
      measured: { width: 300, height: 220 },
      data: { name: '普通组', childNodeIds: empty ? [] : ['child'] },
    },
    ...(!empty
      ? [
          {
            id: 'child',
            type: 'image',
            parentId: 'g',
            extent: 'parent',
            position: { x: 20, y: 20 },
            width: 100,
            height: 80,
            data: {
              name: '图片',
              type: 'image',
              action: 'image_resource',
              url: ['/real-sample.webp'],
              params: { prompt: '保留正文', model: 'lib-image-2.5-s', settings: { ratio: '16:9' } },
            },
          },
          {
            id: 'outside',
            type: 'text',
            position: { x: 900, y: 900 },
            data: { name: '外部', content: ['保持'] },
          },
        ]
      : []),
  ],
});
let frames, frameId;
const read = () => JSON.parse(localStorage.getItem(key));
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  frames = new Map();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
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
const pointer = (target, type, x, y) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: 43 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(target, event);
};
const paint = () =>
  act(() => {
    const queue = [...frames.values()];
    frames.clear();
    queue.forEach((callback) => callback(0));
  });
async function page(value) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  const rendered = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const board = rendered.container.querySelector('.cv-board');
  let captured;
  board.setPointerCapture = vi.fn((id) => (captured = id));
  board.hasPointerCapture = vi.fn((id) => captured === id);
  board.releasePointerCapture = vi.fn(() => (captured = undefined));
  const node = (id) => rendered.container.querySelector(`[data-node-id="${id}"]`);
  fireEvent.click(node('g'));
  return { ...rendered, board, node };
}

describe('actual group resize, history and persistence', () => {
  it('keeps preview out of canonical storage, commits release coordinates, undoes once and restores after reload', async () => {
    const canvas = await page(snapshot());
    flush();
    const original = graph(read());
    const handle = screen.getByRole('button', { name: '调整分组大小 右下角' });
    pointer(handle, 'pointerdown', 200, 160);
    pointer(canvas.board, 'pointermove', 220, 170);
    paint();
    expect(canvas.node('g').style.width).toBe('340px');
    expect(graph(read())).toEqual(original);
    pointer(canvas.board, 'pointerup', 260, 190);
    const resized = graph(read());
    expect(resized.nodes[0]).toMatchObject({
      width: 420,
      height: 280,
      position: { x: 100, y: 100 },
    });
    expect(resized.nodes[1]).toEqual(original.nodes[1]);
    expect(resized.edges).toEqual(original.edges);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(false);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(resized);
    canvas.unmount();
    const restored = await page();
    expect(restored.node('g').style.width).toBe('420px');
    expect(restored.node('g').style.height).toBe('280px');
    restored.unmount();
  });

  it('preserves child world coordinates with extent constraints and source stop padding', async () => {
    const canvas = await page(snapshot());
    const originalChild = canvasWorldPosition(snapshot().nodes[1], snapshot().nodes);
    pointer(screen.getByRole('button', { name: '调整分组大小 左上角' }), 'pointerdown', 50, 50);
    pointer(canvas.board, 'pointermove', 130, 130);
    paint();
    expect(canvas.node('g').style.left).toBe('120px');
    expect(canvas.node('child').style.left).toBe('120px');
    pointer(canvas.board, 'pointerup', 130, 130);
    const saved = read();
    expect(saved.nodes[0]).toMatchObject({
      position: { x: 108, y: 108 },
      width: 292,
      height: 212,
      measured: { width: 280, height: 200 },
      data: { nodeWidth: 292, nodeHeight: 212 },
    });
    expect(saved.nodes[1].position).toEqual({ x: 12, y: 12 });
    expect(canvasWorldPosition(saved.nodes[1], saved.nodes)).toEqual(originalChild);
    expect(saved.nodes[1].data).toEqual(snapshot().nodes[1].data);
    expect(canvas.node('g').style.width).toBe('292px');
  });

  it('clamps an empty group to 120 by 80 without creating data dimension metadata', async () => {
    const canvas = await page(snapshot(true));
    pointer(screen.getByRole('button', { name: '调整分组大小 左上角' }), 'pointerdown', 50, 50);
    pointer(canvas.board, 'pointerup', 1050, 1050);
    expect(read().nodes[0]).toMatchObject({
      position: { x: 280, y: 240 },
      width: 120,
      height: 80,
      data: snapshot(true).nodes[0].data,
    });
    expect(read().nodes[0].data.nodeWidth).toBeUndefined();
    expect(read().nodes[0].data.nodeHeight).toBeUndefined();
  });

  it('retains the last pending inline prompt through resize, immediate unmount and undo', async () => {
    const canvas = await page(snapshot());
    fireEvent.click(canvas.node('child'));
    const input = await screen.findByRole('textbox', { name: '提示词' });
    expect(input.getAttribute('contenteditable')).toBe('true');
    input.textContent = '最后150ms的输入';
    fireEvent.input(input);
    fireEvent.click(canvas.node('g'));
    pointer(screen.getByRole('button', { name: '调整分组大小 右边' }), 'pointerdown', 200, 100);
    pointer(canvas.board, 'pointerup', 230, 100);
    expect(read().nodes[1].data.params.prompt).toBe('最后150ms的输入');
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(read().nodes[0].width).toBe(300);
    expect(read().nodes[1].data.params.prompt).toBe('最后150ms的输入');
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    canvas.unmount();
    expect(read().nodes[1].data.params.prompt).toBe('最后150ms的输入');
    expect(read().nodes[0].width).toBe(360);
  });

  it('pagehide flushes the final pending preview before the document writer and Escape cancels without a history entry', async () => {
    const canvas = await page(snapshot());
    pointer(screen.getByRole('button', { name: '调整分组大小 右边' }), 'pointerdown', 200, 100);
    pointer(canvas.board, 'pointermove', 230, 100);
    flush();
    expect(read().nodes[0].width).toBe(360);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    const original = graph(read());
    pointer(screen.getByRole('button', { name: '调整分组大小 右边' }), 'pointerdown', 200, 100);
    pointer(canvas.board, 'pointermove', 240, 100);
    paint();
    fireEvent.keyDown(window, { key: 'Escape' });
    pointer(canvas.board, 'pointerup', 300, 100);
    flush();
    expect(graph(read())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    expect(document.activeElement).toBe(canvas.node('g'));
  });

  it('does not open add on a captured handle doubleclick or commit an in-progress name when resize is canceled', async () => {
    const canvas = await page(snapshot());
    const corner = screen.getByRole('button', { name: '调整分组大小 右下角' });
    pointer(corner, 'pointerdown', 200, 160);
    pointer(canvas.board, 'pointerup', 200, 160);
    fireEvent.doubleClick(canvas.board, { clientX: 200, clientY: 160 });
    expect(canvas.container.querySelector('.cv-add-menu')).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分组' }));
    const input = screen.getByRole('textbox', { name: '分组名称' });
    fireEvent.change(input, { target: { value: '未提交名称' } });
    pointer(corner, 'pointerdown', 200, 160);
    pointer(canvas.board, 'pointermove', 220, 170);
    paint();
    expect(canvas.container.querySelector('.cv-selection-add-hit')).toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('未提交名称');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: '分组名称' })).toBeNull();
    flush();
    expect(read().nodes[0].data.name).toBe('普通组');
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('lets the top-level shortcuts modal handle Escape after taking over a resize', async () => {
    const canvas = await page(snapshot());
    pointer(screen.getByRole('button', { name: '调整分组大小 右边' }), 'pointerdown', 200, 100);
    pointer(canvas.board, 'pointermove', 230, 100);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: '快捷键' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '快捷键' })).toBeNull();
    pointer(canvas.board, 'pointerup', 260, 100);
    flush();
    expect(read().nodes[0].width).toBe(300);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });
});
