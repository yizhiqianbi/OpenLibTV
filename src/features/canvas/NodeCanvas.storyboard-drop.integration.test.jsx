import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'gallery'
          ? {
              data: {
                items: [
                  { templateUuid: 'sample', name: '代表图片', coverUrl: '/assets/sample.webp' },
                ],
              },
            }
          : {
              items: [
                { templateUuid: 'sample', name: '代表图片', coverUrl: '/assets/sample.webp' },
              ],
            },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
const projectId = 'storyboard-drop-integration',
  storageKey = `libtv.canvas.${projectId}`;
const image = (id, x, y, extra = {}) => ({
  id,
  type: 'image',
  position: { x, y },
  width: 100,
  height: 60,
  data: {
    name: id,
    type: 'image',
    action: 'image_resource',
    url: [`/${id}.webp`],
    params: { settings: { ratio: '1:1', seed: 77 }, prompt: '保留提示词' },
  },
  ...extra,
});
function snapshot(standalone = false) {
  const children = standalone
    ? [
        image('one', 4, 4, { parentId: 'group' }),
        image('two', 108, 4, { parentId: 'group' }),
        image('three', 4, 68, { parentId: 'group' }),
      ]
    : [image('one', 30, 340, { parentId: 'group' })];
  if (!standalone) children[0].data.params.settings.ratio = '16:9';
  return {
    title: '分镜组交互验收',
    view: { x: 0, y: 0, z: 1 },
    edges: [{ id: 'edge', source: 'outside', target: 'one' }],
    nodes: [
      {
        id: 'group',
        type: 'group',
        position: { x: 400, y: 100 },
        width: standalone ? 212 : 700,
        height: standalone ? 136 : 700,
        data: {
          name: '目标分镜组',
          storyboardGroupType: 'image',
          standaloneStoryboardImageGrid: standalone,
          storyboardManualGridCols: 2,
          childNodeIds: children.map((node) => node.id),
        },
      },
      ...children,
      image('outside', 80, 100),
      image('other', 80, 240),
    ],
  };
}
const write = (value) => localStorage.setItem(storageKey, JSON.stringify(value));
const saved = () => JSON.parse(localStorage.getItem(storageKey));
const stored = (id) => saved().nodes.find((node) => node.id === id);
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const undo = () => {
  fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
  flush();
};
function pointer(element, type, { x, y, shiftKey = false, altKey = false }) {
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
    pointerId: { value: 44 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}
function capture(element) {
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  write(snapshot());
  let next = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => next++),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
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
async function page() {
  const toast = vi.fn();
  const mounted = render(
    <NodeCanvas
      path={`/canvas?projectId=${projectId}`}
      user={LOCAL_WORKSPACE_USER}
      toast={toast}
    />,
  );
  const node = (id) => mounted.container.querySelector(`[data-node-id="${id}"]`);
  await waitFor(() => expect(node('outside')).toBeTruthy());
  const board = mounted.container.querySelector('.cv-board');
  for (const element of mounted.container.querySelectorAll('.cv-node,.cv-board')) capture(element);
  return { ...mounted, node, board, toast };
}
function drag(page, id, start, end, altKey = false) {
  pointer(page.node(id), 'pointerdown', { ...start, altKey });
  pointer(page.board, 'pointermove', { ...end, altKey });
  pointer(page.board, 'pointerup', { ...end, altKey });
  flush();
}
function selectFrame(page) {
  for (const [id, y, shiftKey] of [
    ['outside', 110, false],
    ['other', 250, true],
  ]) {
    pointer(page.node(id), 'pointerdown', { x: 100, y, shiftKey });
    pointer(page.node(id), 'pointerup', { x: 100, y, shiftKey });
  }
  const frame = page.container.querySelector('.cv-selection-overlay-fill');
  capture(frame);
  return frame;
}
describe('production storyboard drops, committed selection, slots and history', () => {
  it('attaches to an image-derived group with ratio fields, retains media and edges, then undoes exactly once', async () => {
    const canvas = await page();
    drag(canvas, 'outside', { x: 100, y: 110 }, { x: 460, y: 150 });
    expect(stored('outside')).toMatchObject({
      parentId: 'group',
      position: { x: 40, y: 56 },
      width: 622,
      height: 350,
      data: {
        url: ['/outside.webp'],
        params: { prompt: '保留提示词', settings: { ratio: '16:9', seed: 77 } },
      },
    });
    expect(stored('group').data.childNodeIds).toEqual(['one', 'outside']);
    expect(stored('group').position.y + stored('outside').position.y).toBe(140);
    expect(saved().edges).toEqual(snapshot().edges);
    undo();
    expect(stored('outside')).toEqual(snapshot().nodes.find((node) => node.id === 'outside'));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('commits a virtual frame to a standalone group, reflows actual members and clears only the moved selection', async () => {
    write(snapshot(true));
    const canvas = await page();
    const frame = selectFrame(canvas);
    pointer(frame, 'pointerdown', { x: 100, y: 180 });
    pointer(canvas.board, 'pointermove', { x: 440, y: 180 });
    pointer(canvas.board, 'pointerup', { x: 440, y: 180 });
    flush();
    expect(stored('outside').parentId).toBe('group');
    expect(stored('other').parentId).toBe('group');
    expect(stored('group').data.childNodeIds).toEqual(['one', 'two', 'three', 'outside', 'other']);
    expect(canvas.container.querySelector('.cv-selection-overlay')).toBeNull();
    expect(canvas.node('outside').classList.contains('cv-selected')).toBe(false);
    const committed = saved();
    undo();
    expect(stored('outside').parentId).toBeUndefined();
    expect(stored('other').parentId).toBeUndefined();
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(saved().nodes).toEqual(committed.nodes);
    canvas.unmount();
    const restored = await page();
    expect(restored.node('outside').style.width).toBe(`${stored('outside').data.contentWidth}px`);
  });

  it('shows one capacity warning across move/stop and keeps a rejected frame selected', async () => {
    const document = snapshot(true);
    document.nodes[0].data.storyboardManualGridRows = 2;
    document.nodes.splice(4, 0, image('four', 108, 68, { parentId: 'group' }));
    document.nodes[0].data.childNodeIds.push('four');
    write(document);
    const canvas = await page();
    const frame = selectFrame(canvas);
    pointer(frame, 'pointerdown', { x: 100, y: 180 });
    pointer(canvas.board, 'pointermove', { x: 440, y: 180 });
    pointer(canvas.board, 'pointerup', { x: 440, y: 180 });
    flush();
    expect(stored('outside').parentId).toBeUndefined();
    expect(stored('other').parentId).toBeUndefined();
    expect(canvas.toast).toHaveBeenCalledExactlyOnceWith('分镜宫格已满，无法继续添加');
    expect(canvas.container.querySelector('.cv-selection-overlay')).toBeTruthy();
  });

  it('previews a single incoming image, commits its slot, reorders and detaches with one history each', async () => {
    write(snapshot(true));
    const canvas = await page();
    drag(canvas, 'outside', { x: 100, y: 110 }, { x: 528, y: 178 });
    expect(stored('outside').parentId).toBe('group');
    expect(stored('outside').position).toEqual({ x: 108, y: 68 });
    expect(canvas.node('outside').style.width).toBe('100px');
    expect(canvas.node('outside').querySelector('.cv-node-title')).toBeNull();
    expect(canvas.node('outside').querySelector('.cv-handle-in,.cv-handle-out')).toBeNull();
    const committed = saved().nodes;
    drag(canvas, 'outside', { x: 518, y: 178 }, { x: 414, y: 114 });
    expect(stored('group').data.childNodeIds[0]).toBe('outside');
    expect(stored('outside').position).toEqual({ x: 4, y: 4 });
    undo();
    expect(saved().nodes).toEqual(committed);
    drag(canvas, 'outside', { x: 518, y: 178 }, { x: 180, y: 420 });
    expect(stored('outside').parentId).toBeUndefined();
    expect(canvas.node('outside').querySelector('.cv-node-title')).toBeTruthy();
    expect(canvas.node('outside').querySelector('.cv-handle-out')).toBeTruthy();
    expect(stored('group').data.childNodeIds).toEqual(['one', 'two', 'three']);
    undo();
    expect(saved().nodes).toEqual(committed);
  });

  it('inserts a history image through the real empty-slot menu and returns focus through the dialog stack', async () => {
    write(snapshot(true));
    const canvas = await page();
    const slot = canvas.node('group').querySelector('.cv-storyboard-grid-slot');
    expect(slot).toBeTruthy();
    slot.focus();
    fireEvent.click(slot);
    fireEvent.click(await screen.findByRole('menuitem', { name: '从历史记录中选择' }));
    const dialog = await screen.findByRole('dialog', { name: '从历史记录中选择' });
    fireEvent.click(dialog.querySelector('.cv-library-grid button'));
    flush();
    const inserted = saved().nodes.find((node) => node.data.url?.[0] === '/assets/sample.webp');
    expect(inserted).toMatchObject({
      parentId: 'group',
      position: { x: 108, y: 68 },
      width: 100,
      height: 60,
      data: { _explicitContentDims: true, contentWidth: 100, contentHeight: 60, params: {} },
    });
    expect(screen.queryByRole('dialog', { name: '从历史记录中选择' })).toBeNull();
    expect(stored('group').data.childNodeIds.at(-1)).toBe(inserted.id);
    undo();
    expect(saved().nodes).toEqual(snapshot(true).nodes);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });
});
