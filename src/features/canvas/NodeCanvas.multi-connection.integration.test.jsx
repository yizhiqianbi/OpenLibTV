import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

// Keep the real page, selection, gesture owners, graph transaction, history and storage.
// Only the captured public catalogue replaces unrelated content network requests.
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'multi-connection-integration';
const storageKey = `libtv.canvas.${projectId}`;
let frames, nextFrame, elementFromPointDescriptor;
const fixtureNode = (id, type, position, data = {}, height = 230) => ({
  id,
  type,
  position,
  width: 350,
  height,
  data: { type, name: id, action: `${type}_generate`, params: { prompt: '' }, ...data },
});
function snapshot(patch = {}) {
  return {
    title: '多选连接集成验收',
    nodes: [
      fixtureNode(
        'a',
        'image',
        { x: 100, y: 100 },
        {
          name: '选中的图片',
          action: 'image_resource',
          url: ['/assets/sample.webp'],
        },
      ),
      fixtureNode(
        'b',
        'text',
        { x: 100, y: 450 },
        {
          name: '选中的文本',
          action: 'text_resource',
          text: '保留来源正文',
        },
        220,
      ),
      fixtureNode(
        'target',
        'video',
        { x: 600, y: 100 },
        {
          name: '共享视频目标',
          params: { model: 'star-video2', modeType: 'text2video', prompt: '保留目标提示词' },
        },
      ),
    ],
    edges: [],
    view: { x: 0, y: 0, z: 1 },
    ...patch,
  };
}
const saved = (key = storageKey) => JSON.parse(localStorage.getItem(key));
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const expectGraph = (expected, key = storageKey) => {
  expect(saved(key).nodes).toEqual(expected.nodes);
  expect(saved(key).edges).toEqual(expected.edges);
  expect(saved(key).nodes.some((node) => node.type === 'temp')).toBe(false);
  expect(saved(key)).not.toHaveProperty('preview');
  expect(saved(key)).not.toHaveProperty('menu');
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(snapshot()));
  elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  document.elementFromPoint = vi.fn(() => null);
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (elementFromPointDescriptor)
    Object.defineProperty(document, 'elementFromPoint', elementFromPointDescriptor);
  else delete document.elementFromPoint;
});

function installCapture(element) {
  let captured;
  element.setPointerCapture = vi.fn((id) => {
    captured = id;
  });
  element.hasPointerCapture = vi.fn((id) => id === captured);
  element.releasePointerCapture = vi.fn((id) => {
    if (captured === id) captured = undefined;
  });
}
function pointer(
  element,
  type,
  { x, y, shiftKey = false, altKey = false, metaKey = false, ctrlKey = false, id = 91 } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    shiftKey,
    altKey,
    metaKey,
    ctrlKey,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}
async function mountedCanvas() {
  const page = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  const node = (id) => page.container.querySelector(`[data-node-id="${id}"]`);
  await waitFor(() => expect(node('a')?.getAttribute('aria-label')).toBe('选中的图片'));
  await waitFor(() => expect(node('a').querySelector('.cv-handle-out').disabled).toBe(false));
  for (const element of page.container.querySelectorAll('.cv-board,.cv-node,.cv-handle'))
    installCapture(element);
  return {
    ...page,
    node,
    board: () => page.container.querySelector('.cv-board'),
    frame: () => page.container.querySelector('.cv-selection-overlay'),
    add: () => page.container.querySelector('.cv-selection-add-hit'),
    portal: () => document.querySelector('.cv-multi-connection-portal'),
    sources: () =>
      [...document.querySelectorAll('[data-multi-source-id]')].map(
        (element) => element.dataset.multiSourceId,
      ),
    selectedIds: () =>
      [...page.container.querySelectorAll('.cv-node.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
    realEdges: () =>
      page.container.querySelectorAll(
        '.cv-edges > [data-edge-id]:not(.cv-link-preview):not(.cv-connection-ghost-edge)',
      ),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}
function selectSources(page) {
  pointer(page.node('a'), 'pointerdown', { x: 150, y: 110 });
  pointer(page.node('a'), 'pointerup', { x: 150, y: 110 });
  fireEvent.click(page.node('a'), { detail: 1 });
  pointer(page.node('b'), 'pointerdown', { x: 150, y: 460, shiftKey: true });
  pointer(page.node('b'), 'pointerup', { x: 150, y: 460, shiftKey: true });
  fireEvent.click(page.node('b'), { detail: 1, shiftKey: true });
  expect(page.selectedIds()).toEqual(['a', 'b']);
  expect(page.frame()).toBeTruthy();
  expect(page.add()).toBeTruthy();
  for (const element of page.container.querySelectorAll(
    '.cv-selection-overlay-fill,.cv-selection-overlay-hit,.cv-selection-add-hit',
  ))
    installCapture(element);
}
function realGroupSnapshot({ single = false, data = {}, zoom = 1 } = {}) {
  const original = snapshot(),
    a = { ...original.nodes[0], parentId: 'group', position: { x: 50, y: 50 } },
    b = { ...original.nodes[1], parentId: 'nested', position: { x: 20, y: 20 } };
  return snapshot({
    nodes: [
      {
        id: 'group',
        type: 'group',
        position: { x: 50, y: 50 },
        width: 500,
        height: 600,
        data: {
          type: 'group',
          name: '真实普通组',
          childNodeIds: single ? ['a'] : ['a', 'nested'],
          ...data,
        },
      },
      a,
      ...(!single
        ? [
            {
              id: 'nested',
              type: 'group',
              parentId: 'group',
              position: { x: 30, y: 300 },
              width: 400,
              height: 270,
              data: { type: 'group', name: '嵌套普通组', childNodeIds: ['b'] },
            },
            b,
          ]
        : []),
      original.nodes[2],
    ],
    view: { x: 20, y: 30, z: zoom },
  });
}
function selectGroup(page) {
  pointer(page.node('group'), 'pointerdown', { x: 60, y: 60 });
  pointer(page.node('group'), 'pointerup', { x: 60, y: 60 });
  fireEvent.click(page.node('group'), { detail: 1 });
}
function startConnection(page) {
  const add = page.add(),
    point = { x: parseFloat(add.style.left) + 17, y: parseFloat(add.style.top) };
  pointer(add, 'pointerdown', point);
  return { add, point };
}
function releaseAt(page, point) {
  const started = startConnection(page);
  pointer(window, 'pointermove', point);
  pointer(window, 'pointerup', point);
  return started;
}
function lateFrameCallbacks() {
  return [...frames.values()];
}

describe('actual NodeCanvas multi-selection frame and connection transaction', () => {
  it('moves the frame selection together, keeps both selected, hides per-node actions, and undoes once', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    expect(page.container.querySelectorAll('.cv-node-actions')).toHaveLength(0);
    expect(page.frame().querySelectorAll('.cv-selection-overlay-hit')).toHaveLength(5);
    const fill = page.frame().querySelector('.cv-selection-overlay-fill');
    pointer(fill, 'pointerdown', { x: 80, y: 80 });
    pointer(page.board(), 'pointermove', { x: 100, y: 100 });
    pointer(page.board(), 'pointerup', { x: 110, y: 120 });
    fireEvent.click(fill, { detail: 1 });
    expect(page.selectedIds()).toEqual(['a', 'b']);
    expect(page.node('a').style.left).toBe('130px');
    expect(page.node('a').style.top).toBe('140px');
    expect(page.node('b').style.left).toBe('130px');
    expect(page.node('b').style.top).toBe('490px');
    expect(page.node('target').style.left).toBe('600px');
    expect(fill.setPointerCapture).toHaveBeenCalledWith(91);
    expect(fill.releasePointerCapture).toHaveBeenCalledWith(91);
    expect(page.realEdges()).toHaveLength(0);
    fireEvent.click(page.undo());
    expect(page.node('a').style.left).toBe('100px');
    expect(page.node('b').style.top).toBe('450px');
    expect(page.undo().disabled).toBe(true);
    expect(page.selectedIds()).toEqual(['a', 'b']);
    flush();
    expectGraph(snapshot());
    fireEvent.click(page.redo());
    expect(page.node('a').style.top).toBe('140px');
    expect(page.node('b').style.top).toBe('490px');
    expect(page.redo().disabled).toBe(true);
  });

  it('connects all sources to an existing target with its aggregate model patch in one undo item', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    document.elementFromPoint.mockReturnValue(page.node('target'));
    const started = startConnection(page);
    pointer(window, 'pointermove', { x: 720, y: 215 });
    expect(page.sources()).toEqual(['a', 'b']);
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    pointer(window, 'pointerup', { x: 720, y: 215 });
    expect(page.portal()).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(page.realEdges()).toHaveLength(2);
    expect(page.board().releasePointerCapture).toHaveBeenCalledWith(91);
    expect(started.add.isConnected).toBe(false);
    flush();
    const connected = saved();
    expect(connected.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: 'target' },
      { source: 'b', target: 'target' },
    ]);
    expect(connected.nodes.at(-1).data.params).toMatchObject({
      model: 'star-video2.5',
      prompt: '保留目标提示词',
    });
    expect(connected.nodes.at(-1).data.params.modeType).not.toBe('text2video');
    fireEvent.click(page.undo());
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(snapshot());
    fireEvent.click(page.redo());
    expect(page.realEdges()).toHaveLength(2);
    expect(page.redo().disabled).toBe(true);
    flush();
    expectGraph(connected);
  });

  it('keeps an existing input edge, appends the other source, and removes only the new edge on undo', async () => {
    const original = snapshot({ edges: [{ id: 'existing-a', source: 'a', target: 'target' }] });
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectSources(page);
    document.elementFromPoint.mockReturnValue(page.node('target'));
    releaseAt(page, { x: 720, y: 215 });
    expect(page.realEdges()).toHaveLength(2);
    flush();
    expect(saved().edges[0]).toEqual(original.edges[0]);
    expect(saved().edges[1]).toMatchObject({ source: 'b', target: 'target' });
    fireEvent.click(page.undo());
    expect(page.realEdges()).toHaveLength(1);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
  });

  it('opens creation on a drop whose whole qualified set is already connected without recording history', async () => {
    const original = snapshot({
      edges: [
        { id: 'a-edge', source: 'a', target: 'target' },
        { id: 'b-edge', source: 'b', target: 'target' },
      ],
    });
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectSources(page);
    document.elementFromPoint.mockReturnValue(page.node('target'));
    releaseAt(page, { x: 720, y: 215 });
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(page.sources()).toEqual(['a', 'b']);
    expect(page.realEdges()).toHaveLength(2);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
  });

  it('opens the six source creation entries and commits one shared empty-prompt target at the release flow point', async () => {
    const original = snapshot({ view: { x: 20, y: 30, z: 0.5 } });
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectSources(page);
    releaseAt(page, { x: 850, y: 520 });
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['文本生成', '图片生成', '视频生成', '视频', '音频', '脚本生成']);
    expect(menu.closest('.cv-connection-menu').querySelector('[aria-haspopup="menu"]')).toBeNull();
    expect(page.sources()).toEqual(['a', 'b']);
    expect(page.container.querySelector('.cv-connection-ghost')).toBeNull();
    expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
    flush();
    expectGraph(original);
    fireEvent.click(within(menu).getByRole('menuitem', { name: '文本生成' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(page.portal()).toBeNull();
    const created = [...page.container.querySelectorAll('.cv-node')].find(
      (element) => !['a', 'b', 'target'].includes(element.dataset.nodeId),
    );
    expect(created).toBeTruthy();
    expect(created.style.left).toBe('1660px');
    expect(created.style.top).toBe('980px');
    expect(created.querySelector('textarea').value).toBe('');
    expect(page.selectedIds()).toEqual([created.dataset.nodeId]);
    expect(page.realEdges()).toHaveLength(2);
    flush();
    const connected = saved();
    expect(connected.nodes).toHaveLength(4);
    expect(connected.nodes.at(-1).data.params.prompt).toBe('');
    expect(connected.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: created.dataset.nodeId },
      { source: 'b', target: created.dataset.nodeId },
    ]);
    fireEvent.click(page.undo());
    expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
    fireEvent.click(page.redo());
    flush();
    expectGraph(connected);
    expect(page.redo().disabled).toBe(true);
  });

  it('keeps a disabled creation attempt open without an orphan node, edge or history item', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    releaseAt(page, { x: 0, y: 0 });
    const menu = screen.getByRole('menu'),
      clip = within(menu).getByRole('menuitem', { name: '视频' });
    expect(clip.disabled).toBe(true);
    fireEvent.click(clip);
    expect(screen.getByRole('menu')).toBe(menu);
    expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(snapshot());
  });

  it('uses the short-click selection placement after sub-threshold jitter without blank previews', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    const { point } = startConnection(page);
    pointer(window, 'pointermove', { x: point.x + 9, y: point.y });
    expect(page.portal()).toBeNull();
    pointer(window, 'pointerup', { x: point.x + 9, y: point.y });
    expect(page.portal()).toBeNull();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '文本生成' }));
    flush();
    expect(saved().nodes.at(-1).position).toEqual({ x: 595, y: 307 });
    expect(saved().nodes.at(-1).data.params.prompt).toBe('');
    expect(saved().edges).toHaveLength(2);
  });

  it('persists only the real graph during both an active multi-preview and a blank release menu', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    startConnection(page);
    pointer(window, 'pointermove', { x: 960, y: 620 });
    expect(page.sources()).toEqual(['a', 'b']);
    expect(page.container.querySelector('.cv-connection-ghost-edge')).toBeNull();
    flush();
    expectGraph(snapshot());
    pointer(window, 'pointerup', { x: 960, y: 620 });
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(page.sources()).toEqual(['a', 'b']);
    flush();
    expectGraph(snapshot());
    expect(page.undo().disabled).toBe(true);
  });

  it.each(['blur', 'hidden'])(
    'cancels on %s and ignores already scheduled frame callbacks',
    async (kind) => {
      const page = await mountedCanvas();
      selectSources(page);
      startConnection(page);
      pointer(window, 'pointermove', { x: 960, y: 620 });
      const late = lateFrameCallbacks();
      expect(page.portal()).toBeTruthy();
      if (kind === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        fireEvent(document, new Event('visibilitychange'));
      } else fireEvent(window, new Event('blur'));
      expect(page.portal()).toBeNull();
      act(() => late.forEach((callback) => callback(16)));
      pointer(window, 'pointerup', { x: 960, y: 620 });
      expect(page.portal()).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
      expect(page.undo().disabled).toBe(true);
      flush();
      expectGraph(snapshot());
    },
  );

  it.each(['project', 'readonly'])(
    'cancels before a late pointerup can write across a %s owner change',
    async (kind) => {
      const page = await mountedCanvas();
      selectSources(page);
      startConnection(page);
      pointer(window, 'pointermove', { x: 960, y: 620 });
      const late = lateFrameCallbacks(),
        nextKey = 'libtv.canvas.multi-other';
      const next = snapshot({
        title: '另一个项目',
        nodes: snapshot().nodes.map((node) => ({
          ...node,
          position: { ...node.position, x: node.position.x + 70 },
        })),
      });
      if (kind === 'project') localStorage.setItem(nextKey, JSON.stringify(next));
      page.rerender(
        <NodeCanvas
          path={`/canvas?projectId=${kind === 'project' ? 'multi-other' : projectId}`}
          embedded={kind === 'readonly'}
          user={LOCAL_WORKSPACE_USER}
        />,
      );
      await waitFor(() => expect(page.portal()).toBeNull());
      await waitFor(() =>
        expect(page.node('a')?.style.left).toBe(kind === 'project' ? '170px' : '100px'),
      );
      act(() => late.forEach((callback) => callback(16)));
      pointer(window, 'pointerup', { x: 720, y: 215 });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(page.portal()).toBeNull();
      expect(page.add()).toBeNull();
      expect(page.realEdges()).toHaveLength(0);
      flush();
      expectGraph(snapshot());
      if (kind === 'project') expectGraph(next, nextKey);
    },
  );
});

describe('actual NodeCanvas ordinary-group output entry', () => {
  it('projects one right-middle entry without a virtual frame and connects recursive leaves in one undo step', async () => {
    const original = realGroupSnapshot();
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectGroup(page);
    expect(page.frame()).toBeNull();
    expect(page.selectedIds()).toEqual(['group']);
    expect(page.add().dataset.canvasConnectionEntry).toBe(encodeURIComponent('group:group'));
    expect(page.add().style.left).toBe('570px');
    expect(page.add().style.top).toBe('380px');
    installCapture(page.add());
    document.elementFromPoint.mockReturnValue(page.node('target'));
    releaseAt(page, { x: 720, y: 215 });
    expect(page.realEdges()).toHaveLength(2);
    flush();
    expect(saved().edges.map(({ source, target }) => [source, target])).toEqual([
      ['a', 'target'],
      ['b', 'target'],
    ]);
    expect(saved().nodes.find((node) => node.id === 'target').data.params.prompt).toBe(
      '保留目标提示词',
    );
    fireEvent.click(page.undo());
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
  });

  it('allows a group with one leaf and uses the real shell at half zoom for short-click creation', async () => {
    const original = realGroupSnapshot({ single: true, zoom: 0.5 });
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectGroup(page);
    expect(page.frame()).toBeNull();
    expect(page.add().style.left).toBe('295px');
    expect(page.add().style.top).toBe('205px');
    installCapture(page.add());
    const { point } = startConnection(page);
    pointer(window, 'pointerup', point);
    const menu = screen.getByRole('menu');
    expect(page.portal()).toBeNull();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(6);
    fireEvent.click(within(menu).getByRole('menuitem', { name: '图片生成' }));
    flush();
    expect(saved().nodes).toHaveLength(original.nodes.length + 1);
    expect(saved().nodes.at(-1).position).toEqual({ x: 650, y: 290 });
    expect(saved().edges).toHaveLength(1);
    expect(saved().edges[0].source).toBe('a');
    fireEvent.click(page.undo());
    flush();
    expectGraph(original);
  });

  it.each([{ sourceScriptNodeId: 'script' }, { breakdownSourceNodeId: 'storyboard' }])(
    'does not expose an ordinary group entry on a derived shell %j',
    async (data) => {
      localStorage.setItem(storageKey, JSON.stringify(realGroupSnapshot({ data })));
      const page = await mountedCanvas();
      selectGroup(page);
      expect(page.frame()).toBeNull();
      expect(page.add()).toBeNull();
      expect(page.undo().disabled).toBe(true);
    },
  );

  it('keeps a character-asset ordinary group operable and hides its entry in hand mode', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify(realGroupSnapshot({ data: { characterAsset: { name: '角色' } } })),
    );
    const page = await mountedCanvas();
    selectGroup(page);
    installCapture(page.add());
    const { point } = startConnection(page);
    pointer(window, 'pointerup', point);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '文本生成' }));
    expect(page.realEdges()).toHaveLength(2);
    fireEvent.click(page.undo());
    selectGroup(page);
    fireEvent.click(screen.getByTitle('抓手 H'));
    expect(page.add()).toBeNull();
    expect(page.frame()).toBeNull();
  });
  it('exposes an actionless leaf entry without pretending its unavailable generator actions are valid', async () => {
    const original = realGroupSnapshot({ single: true });
    delete original.nodes[1].data.action;
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectGroup(page);
    expect(page.add()).toBeTruthy();
    installCapture(page.add());
    const { point } = startConnection(page);
    pointer(window, 'pointerup', point);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .every((item) => item.disabled),
    ).toBe(true);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
  });
  it('restores the recreated exact group entry after a blank release menu is dismissed with Escape', async () => {
    const original = realGroupSnapshot();
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    selectGroup(page);
    installCapture(page.add());
    const oldEntry = page.add();
    releaseAt(page, { x: 850, y: 520 });
    expect(oldEntry.isConnected).toBe(false);
    const menu = screen.getByRole('menu');
    expect(document.activeElement.closest('[role="menu"]')).toBe(menu);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(page.add()).not.toBe(oldEntry);
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(1000));
    });
    expect(document.activeElement).toBe(page.add());
    expect(document.activeElement.dataset.canvasConnectionEntry).toBe(
      encodeURIComponent('group:group'),
    );
    expect(page.selectedIds()).toEqual(['group']);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(original);
  });
});

describe('actual NodeCanvas Alt-copy selection gesture', () => {
  it('copies a newly selected video generator with canonical incoming references and current input', async () => {
    const original = snapshot({
      edges: [
        { id: 'image-input', source: 'a', target: 'target' },
        { id: 'text-input', source: 'b', target: 'target' },
      ],
    });
    original.nodes[2].data.params.imageList = [{ nodeId: 'a', url: '/assets/sample.webp' }];
    original.nodes[2].data.params.textList = [{ nodeId: 'b', text: '保留来源正文' }];
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    pointer(page.node('target'), 'pointerdown', { x: 650, y: 110, altKey: true, metaKey: true });
    await waitFor(() => expect(page.selectedIds()).toEqual(['target']));
    pointer(page.board(), 'pointermove', { x: 680, y: 135, altKey: true, metaKey: true });
    pointer(page.board(), 'pointerup', { x: 700, y: 150 });
    flush();
    const copied = saved(),
      copy = copied.nodes.at(-1);
    expect(copied.nodes).toHaveLength(4);
    expect(copy.position).toEqual({ x: 650, y: 140 });
    expect(copy.data.params.prompt).toBe('保留目标提示词');
    expect(copy.data.params.imageList.map((ref) => ref.nodeId)).toEqual(['a']);
    expect(copy.data.params.textList.map((ref) => ref.nodeId)).toEqual(['b']);
    expect(copied.edges.slice(2).map(({ source, target }) => [source, target])).toEqual([
      ['a', copy.id],
      ['b', copy.id],
    ]);
    fireEvent.click(page.undo());
    flush();
    expect(saved().nodes).toHaveLength(3);
    expect(saved().edges).toEqual(original.edges);
    expect(page.undo().disabled).toBe(true);
  });

  it.each([{}, { ctrlKey: true }, { metaKey: true }])(
    'selects an unselected ordinary node before Alt copying with fixed modifiers %j',
    async (modifier) => {
      const original = snapshot({
        edges: [
          { id: 'upstream', source: 'b', target: 'a' },
          { id: 'downstream', source: 'a', target: 'target' },
        ],
      });
      localStorage.setItem(storageKey, JSON.stringify(original));
      const page = await mountedCanvas();
      pointer(page.node('a'), 'pointerdown', { x: 150, y: 110, altKey: true, ...modifier });
      expect(page.selectedIds()).toEqual(['a']);
      pointer(page.board(), 'pointermove', { x: 180, y: 130, altKey: true, ...modifier });
      pointer(page.board(), 'pointerup', { x: 210, y: 150 });
      fireEvent.click(page.node('a'), { detail: 1 });
      flush();
      const copied = saved(),
        copy = copied.nodes.at(-1);
      expect(copied.nodes.slice(0, 3)).toEqual(original.nodes);
      expect(copy.position).toEqual({ x: 160, y: 140 });
      expect(copy.data.name).toBe('选中的图片 副本');
      expect(page.selectedIds()).toEqual([copy.id]);
      expect(copied.edges.slice(2).map(({ source, target }) => [source, target])).toEqual(
        modifier.ctrlKey || modifier.metaKey ? [['b', copy.id]] : [],
      );
      fireEvent.click(page.undo());
      flush();
      expectGraph(original);
      expect(page.undo().disabled).toBe(true);
      fireEvent.click(page.redo());
      flush();
      expectGraph(copied);
    },
  );

  it('copies only a group child at its world position and keeps the original tree intact', async () => {
    const original = realGroupSnapshot();
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    pointer(page.node('a'), 'pointerdown', { x: 150, y: 110, altKey: true });
    pointer(page.board(), 'pointermove', { x: 180, y: 140, altKey: true });
    pointer(page.board(), 'pointerup', { x: 200, y: 150 });
    fireEvent.click(page.node('a'), { detail: 1 });
    flush();
    const copied = saved(),
      copy = copied.nodes.at(-1);
    expect(copied.nodes.slice(0, original.nodes.length)).toEqual(original.nodes);
    expect(copied.nodes).toHaveLength(original.nodes.length + 1);
    expect(copy.position).toEqual({ x: 150, y: 140 });
    expect(copy).not.toHaveProperty('parentId');
    expect(copy.data).toMatchObject({ name: '选中的图片', canvasAltDetachedCopy: true });
    expect(page.selectedIds()).toEqual([copy.id]);
    fireEvent.click(page.undo());
    flush();
    expectGraph(original);
  });

  it.each([false, true])(
    'copies a real group and all descendants in one drag, single child=%s',
    async (single) => {
      const original = realGroupSnapshot({ single });
      localStorage.setItem(storageKey, JSON.stringify(original));
      const page = await mountedCanvas();
      pointer(page.node('group'), 'pointerdown', { x: 60, y: 60, altKey: true });
      pointer(page.board(), 'pointermove', { x: 90, y: 80, altKey: true });
      pointer(page.board(), 'pointerup', { x: 100, y: 90 });
      fireEvent.click(page.node('group'), { detail: 1 });
      flush();
      const copied = saved(),
        additions = copied.nodes.slice(original.nodes.length),
        root = additions[0];
      expect(copied.nodes.slice(0, original.nodes.length)).toEqual(original.nodes);
      expect(additions).toHaveLength(single ? 2 : 4);
      expect(root.type).toBe('group');
      expect(root.position).toEqual({ x: 90, y: 80 });
      expect(root.data.name).toBe('真实普通组 副本');
      expect(additions[1].parentId).toBe(root.id);
      expect(additions[1].position).toEqual({ x: 50, y: 50 });
      expect(new Set(page.selectedIds())).toEqual(new Set(additions.map((node) => node.id)));
      fireEvent.click(page.undo());
      flush();
      expectGraph(original);
      expect(page.undo().disabled).toBe(true);
      fireEvent.click(page.redo());
      flush();
      expectGraph(copied);
    },
  );

  it('copies a multi-selection from its member and stops without reselecting originals after Escape', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    pointer(page.node('a'), 'pointerdown', { x: 150, y: 110, altKey: true });
    pointer(page.board(), 'pointermove', { x: 180, y: 130, altKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    pointer(page.board(), 'pointermove', { x: 350, y: 310 });
    pointer(page.board(), 'pointerup', { x: 350, y: 310 });
    fireEvent.click(page.node('a'), { detail: 1 });
    flush();
    const copied = saved();
    expect(copied.nodes).toHaveLength(5);
    expect(copied.nodes.slice(0, 3)).toEqual(snapshot().nodes);
    expect(copied.nodes.slice(3).map((node) => node.position)).toEqual([
      { x: 130, y: 120 },
      { x: 130, y: 470 },
    ]);
    expect(page.selectedIds()).not.toContain('a');
    expect(page.board().hasPointerCapture(91)).toBe(false);
    fireEvent.click(page.undo());
    flush();
    expectGraph(snapshot());
  });

  it.each([{}, { ctrlKey: true }, { metaKey: true }])(
    'copies the frame selection once with fixed pointerdown modifiers %j',
    async (modifier) => {
      const original = snapshot({
        edges: [
          { id: 'upstream', source: 'target', target: 'a' },
          { id: 'internal', source: 'a', target: 'b' },
          { id: 'downstream', source: 'b', target: 'target' },
        ],
      });
      localStorage.setItem(storageKey, JSON.stringify(original));
      const page = await mountedCanvas();
      selectSources(page);
      const fill = page.frame().querySelector('.cv-selection-overlay-fill');
      installCapture(fill);
      pointer(fill, 'pointerdown', { x: 80, y: 80, altKey: true, ...modifier });
      expect(fill.style.cursor).toBe('copy');
      pointer(page.board(), 'pointermove', { x: 110, y: 100 });
      pointer(page.board(), 'pointermove', { x: 120, y: 105 });
      pointer(page.board(), 'pointerup', { x: 140, y: 110 });
      expect(page.node('a').style.left).toBe('100px');
      expect(page.node('b').style.top).toBe('450px');
      expect(page.selectedIds()).toHaveLength(2);
      expect(page.selectedIds()).not.toContain('a');
      expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(5);
      flush();
      const copied = saved(),
        additions = copied.nodes.slice(3),
        copyEdges = modifier.ctrlKey || modifier.metaKey;
      expect(additions.map((node) => node.position)).toEqual([
        { x: 160, y: 130 },
        { x: 160, y: 480 },
      ]);
      expect(copied.edges).toHaveLength(copyEdges ? 5 : 3);
      if (copyEdges)
        expect(copied.edges.slice(3).map(({ source, target }) => [source, target])).toEqual([
          ['target', additions[0].id],
          [additions[0].id, additions[1].id],
        ]);
      fireEvent.click(page.undo());
      expect(page.undo().disabled).toBe(true);
      expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
      flush();
      expectGraph(original);
      fireEvent.click(page.redo());
      flush();
      expectGraph(copied);
    },
  );

  it('leaves the graph and history unchanged on a sub-threshold Alt click', async () => {
    const page = await mountedCanvas();
    selectSources(page);
    const fill = page.frame().querySelector('.cv-selection-overlay-fill');
    installCapture(fill);
    pointer(fill, 'pointerdown', { x: 80, y: 80, altKey: true });
    pointer(page.board(), 'pointerup', { x: 82, y: 82 });
    expect(page.selectedIds()).toEqual(['a', 'b']);
    expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(page.undo().disabled).toBe(true);
    flush();
    expectGraph(snapshot());
  });
});
