import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

// Exercise the actual page, menu, graph transaction, history and persistence.
// Only the public content catalogue avoids unrelated network IO.
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'connection-feedback-integration';
const storageKey = `libtv.canvas.${projectId}`;
let frames, nextFrame, elementFromPointDescriptor;

function snapshot(patch = {}) {
  return {
    title: '节点连接视觉集成验收',
    nodes: [
      {
        id: 'origin',
        type: 'image',
        position: { x: 100, y: 100 },
        width: 350,
        height: 230,
        data: {
          name: '图片起点',
          action: 'image_generate',
          url: ['/assets/sample.webp'],
          params: { model: 'lib-image-2', modeType: 'text2image', prompt: '已有图片提示词' },
        },
      },
      {
        id: 'video',
        type: 'video',
        position: { x: 600, y: 200 },
        width: 350,
        height: 230,
        data: {
          name: '视频目标',
          action: 'video_generate',
          params: { model: 'star-video2', modeType: 'text2video', prompt: '原提示词' },
        },
      },
      {
        id: 'text',
        type: 'text',
        position: { x: 100, y: 450 },
        width: 350,
        height: 220,
        data: { name: '现有文本', action: 'text_resource', text: '现有正文' },
      },
    ],
    edges: [],
    view: { x: 0, y: 0, z: 1 },
    ...patch,
  };
}
const saved = () => JSON.parse(localStorage.getItem(storageKey));

beforeEach(() => {
  elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(snapshot()));
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
    if (id === captured) captured = undefined;
  });
}
function pointer(element, type, { x, y, id = 71, shiftKey = false } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    shiftKey,
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
  await waitFor(() => expect(node('origin')?.getAttribute('aria-label')).toBe('图片起点'));
  await waitFor(() => expect(node('origin').querySelector('.cv-handle-out').disabled).toBe(false));
  for (const element of page.container.querySelectorAll('.cv-board,.cv-node,.cv-handle'))
    installCapture(element);
  return {
    ...page,
    node,
    board: () => page.container.querySelector('.cv-board'),
    ghost: () => page.container.querySelector('.cv-connection-ghost'),
    ghostEdge: () => page.container.querySelector('.cv-connection-ghost-edge'),
    realEdges: () =>
      page.container.querySelectorAll(
        '.cv-edges > [data-edge-id]:not(.cv-link-preview):not(.cv-connection-ghost-edge)',
      ),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
    port: (handleType) =>
      node('origin').querySelector(handleType === 'target' ? '.cv-handle-in' : '.cv-handle-out'),
  };
}
function releaseIntoBlank(page, handleType = 'source', point = { x: 850, y: 520 }) {
  const port = page.port(handleType);
  pointer(port, 'pointerdown', { x: handleType === 'source' ? 450 : 100, y: 215 });
  pointer(window, 'pointermove', point);
  pointer(window, 'pointerup', point);
  expect(screen.getByRole('menu')).toBeTruthy();
  return port;
}
const flushPagehide = () => act(() => window.dispatchEvent(new Event('pagehide')));
const expectRealGraph = (expected) => {
  expect(saved().nodes).toEqual(expected.nodes);
  expect(saved().edges).toEqual(expected.edges);
  expect(saved().nodes.every((node) => node.type !== 'temp')).toBe(true);
};

describe('actual NodeCanvas connection feedback and temporary endpoint ownership', () => {
  it.each(['source', 'target'])(
    'keeps a %s blank-release ghost out of pagehide persistence and undo while restoring port focus on Escape',
    async (handleType) => {
      const original = snapshot({ view: { x: 20, y: 30, z: 0.5 } });
      localStorage.setItem(storageKey, JSON.stringify(original));
      const page = await mountedCanvas();
      const port = releaseIntoBlank(page, handleType);
      const ghost = page.ghost();
      expect(ghost).toBeTruthy();
      expect(ghost.style.left).toBe('1660px');
      expect(ghost.style.top).toBe('980px');
      expect(ghost.getAttribute('aria-hidden')).toBe('true');
      expect(ghost.hasAttribute('data-node-id')).toBe(false);
      expect(ghost.querySelector('button,input,[tabindex]')).toBeNull();
      expect(page.ghostEdge()).toBeTruthy();
      expect(page.ghostEdge().getAttribute('data-connection-source')).toBe(
        handleType === 'source' ? 'origin' : '__temp_connection_node__',
      );
      expect(page.ghostEdge().getAttribute('data-connection-target')).toBe(
        handleType === 'source' ? '__temp_connection_node__' : 'origin',
      );
      expect(page.realEdges()).toHaveLength(0);
      expect(page.container.querySelectorAll('[data-node-id]')).toHaveLength(3);
      expect(page.undo().disabled).toBe(true);
      flushPagehide();
      expectRealGraph(original);
      fireEvent.keyDown(document.activeElement, { key: 'Escape' });
      expect(page.ghost()).toBeNull();
      expect(page.ghostEdge()).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(port);
      expect(page.undo().disabled).toBe(true);
      page.unmount();
      expectRealGraph(original);
    },
  );

  it('opens a short-click menu without fabricating a ghost endpoint or graph change', async () => {
    const page = await mountedCanvas();
    const port = page.port('source');
    pointer(port, 'pointerdown', { x: 465, y: 215 });
    pointer(window, 'pointerup', { x: 465, y: 215 });
    fireEvent.click(port, { detail: 1 });
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(page.ghost()).toBeNull();
    expect(page.ghostEdge()).toBeNull();
    expect(page.realEdges()).toHaveLength(0);
    expect(page.undo().disabled).toBe(true);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    page.unmount();
    expectRealGraph(snapshot());
  });

  it.each(['blur', 'hidden'])(
    'dismisses a blank-release request on %s before its old scheduled work can recreate a ghost',
    async (kind) => {
      const page = await mountedCanvas();
      releaseIntoBlank(page);
      expect(page.ghost()).toBeTruthy();
      const lateFrames = [...frames.values()];
      if (kind === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        fireEvent(document, new Event('visibilitychange'));
      } else fireEvent(window, new Event('blur'));
      expect(page.ghost()).toBeNull();
      expect(page.ghostEdge()).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
      act(() => lateFrames.forEach((callback) => callback(16)));
      expect(page.ghost()).toBeNull();
      expect(page.realEdges()).toHaveLength(0);
      expect(page.undo().disabled).toBe(true);
      page.unmount();
      expectRealGraph(snapshot());
    },
  );

  it.each(['source', 'target'])(
    'replaces the %s temporary endpoint with one real node and edge that undo together',
    async (handleType) => {
      const page = await mountedCanvas();
      releaseIntoBlank(page, handleType, { x: 0, y: 0 });
      expect(page.ghost()).toBeTruthy();
      const menu = screen.getByRole('menu');
      fireEvent.click(within(menu).getByRole('menuitem', { name: '文本' }));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(page.ghost()).toBeNull();
      expect(page.ghostEdge()).toBeNull();
      expect(page.realEdges()).toHaveLength(1);
      const created = [...page.container.querySelectorAll('.cv-node')].find(
        (node) => !['origin', 'video', 'text'].includes(node.dataset.nodeId),
      );
      expect(created).toBeTruthy();
      expect(created.style.left).toBe('0px');
      expect(created.style.top).toBe('0px');
      expect(created.classList.contains('cv-selected')).toBe(true);
      expect(created.querySelector('textarea').value).toBe('根据图片生成提示词');
      flushPagehide();
      expect(saved().nodes).toHaveLength(4);
      expect(saved().edges).toEqual([
        {
          id: expect.any(String),
          source: handleType === 'source' ? 'origin' : created.dataset.nodeId,
          target: handleType === 'source' ? created.dataset.nodeId : 'origin',
        },
      ]);
      expect(saved().nodes.some((node) => node.type === 'temp')).toBe(false);
      fireEvent.click(page.undo());
      expect(page.container.querySelectorAll('.cv-node')).toHaveLength(3);
      expect(page.realEdges()).toHaveLength(0);
      expect(page.undo().disabled).toBe(true);
      fireEvent.click(page.redo());
      expect(page.realEdges()).toHaveLength(1);
      expect(page.redo().disabled).toBe(true);
      page.unmount();
      expect(saved().nodes).toHaveLength(4);
      expect(saved().edges).toHaveLength(1);
      expect(saved().nodes.every((node) => node.type !== 'temp')).toBe(true);
    },
  );

  it('keeps an inline editor and its pending draft when outside input dismisses the ghost menu', async () => {
    const page = await mountedCanvas();
    fireEvent.click(page.node('video'));
    const input = await screen.findByRole('textbox', { name: '提示词' });
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    vi.useFakeTimers();
    input.textContent = '尚未过150ms的连续输入';
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireEvent.input(input, { inputType: 'insertText' });
    releaseIntoBlank(page);
    expect(page.ghost()).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(input);
    pointer(input, 'pointerdown', { x: 650, y: 500 });
    input.focus();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(page.ghost()).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.textContent).toBe('尚未过150ms的连续输入');
    expect(page.node('video').classList.contains('cv-selected')).toBe(true);
    expect(page.realEdges()).toHaveLength(0);
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe('原提示词');
    page.unmount();
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(
      '尚未过150ms的连续输入',
    );
    expect(saved().edges).toEqual([]);
    expect(saved().nodes.every((node) => node.type !== 'temp')).toBe(true);
  });

  it('preserves the same inline editor and pending draft through connection feedback and cancellation', async () => {
    const page = await mountedCanvas();
    fireEvent.click(page.node('video'));
    const input = await screen.findByRole('textbox', { name: '提示词' });
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    const node = page.node('video');
    const shell = node.querySelector('.cv-node-feedback-surface');
    const generator = input.closest('.cv-inline-generator');
    expect(node.contains(input)).toBe(true);
    expect(shell.contains(input)).toBe(false);
    expect(generator.parentElement).toBe(node);
    expect(node.classList.contains('cv-selected')).toBe(true);
    const beforePosition = { left: node.style.left, top: node.style.top };
    const beforeInlinePosition = input.closest('.cv-inline-generator').style.cssText;
    vi.useFakeTimers();
    input.textContent = '悬停反馈不能丢弃的最后150ms';
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireEvent.input(input, { inputType: 'insertText' });
    const hit = node.querySelector('.cv-node-content');
    const elementFromPoint = vi.fn(() => hit);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });
    const port = page.port('source');
    pointer(port, 'pointerdown', { x: 450, y: 215 });
    pointer(window, 'pointermove', { x: 650, y: 350 });
    expect(node.querySelector('.cv-node-connection-border')).toBeTruthy();
    act(() => [...frames.values()].forEach((callback) => callback(16)));
    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(input);
    expect(node.querySelector('.cv-node-feedback-surface')).toBe(shell);
    expect(node.contains(input)).toBe(true);
    expect(shell.contains(input)).toBe(false);
    expect(input.closest('.cv-inline-generator')).toBe(generator);
    expect(generator.parentElement).toBe(node);
    expect(node.classList.contains('cv-selected')).toBe(true);
    expect(input.textContent).toBe('悬停反馈不能丢弃的最后150ms');
    expect(input.closest('.cv-inline-generator').style.cssText).toBe(beforeInlinePosition);
    expect({ left: node.style.left, top: node.style.top }).toEqual(beforePosition);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(node.querySelector('.cv-node-connection-border')).toBeNull();
    expect(node.querySelector('.cv-node-connection-frosted')).toBeNull();
    expect(screen.getByRole('textbox', { name: '提示词' })).toBe(input);
    expect(node.contains(input)).toBe(true);
    expect(shell.contains(input)).toBe(false);
    expect(input.closest('.cv-inline-generator')).toBe(generator);
    expect(generator.parentElement).toBe(node);
    expect(node.classList.contains('cv-selected')).toBe(true);
    expect(input.textContent).toBe('悬停反馈不能丢弃的最后150ms');
    expect(page.realEdges()).toHaveLength(0);
    flushPagehide();
    expect(saved().nodes.find((item) => item.id === 'video').data.params.prompt).toBe(
      '悬停反馈不能丢弃的最后150ms',
    );
    expect(saved().nodes.find((item) => item.id === 'video').position).toEqual({ x: 600, y: 200 });
    expect(saved().edges).toEqual([]);
    page.unmount();
  });

  it('creates a short-click upstream root node beside a grouped anchor using world coordinates once', async () => {
    const original = snapshot();
    original.nodes.unshift({
      id: 'group',
      type: 'group',
      position: { x: 1000, y: 500 },
      width: 550,
      height: 400,
      data: { name: '分组', childNodeIds: ['origin'] },
    });
    original.nodes.find((node) => node.id === 'origin').parentId = 'group';
    localStorage.setItem(storageKey, JSON.stringify(original));
    const page = await mountedCanvas();
    expect(page.node('origin').style.left).toBe('1100px');
    expect(page.node('origin').style.top).toBe('600px');
    const port = page.port('target');
    pointer(port, 'pointerdown', { x: 1085, y: 715 });
    pointer(window, 'pointerup', { x: 1085, y: 715 });
    expect(page.ghost()).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '文本' }));
    flushPagehide();
    const graph = saved();
    const created = graph.nodes.find((node) => !original.nodes.some((old) => old.id === node.id));
    expect(created.type).toBe('text');
    // Source uses NODE_HEIGHT_EMPTY=350 before a menu type is chosen.
    expect(created.position).toEqual({ x: 650, y: 540 });
    expect(created.parentId).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === 'origin').position).toEqual({ x: 100, y: 100 });
    expect(graph.nodes.find((node) => node.id === 'origin').parentId).toBe('group');
    expect(graph.edges).toEqual([{ id: expect.any(String), source: created.id, target: 'origin' }]);
    fireEvent.click(page.undo());
    expect(page.undo().disabled).toBe(true);
    expect(page.node(created.id)).toBeNull();
    expect(page.realEdges()).toHaveLength(0);
    expect(page.node('origin').style.left).toBe('1100px');
    expect(page.node('origin').style.top).toBe('600px');
    page.unmount();
    expectRealGraph(original);
  });

  it('settles an unmounted inline draft after successful autosave before zoom, multi creation, and undo can overwrite it', async () => {
    const page = await mountedCanvas();
    fireEvent.click(page.node('video'));
    const input = await screen.findByRole('textbox', { name: '提示词' });
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    vi.useFakeTimers();
    const pending = '立即输入后多选、保存与撤销都要保留的提示词';
    input.textContent = pending;
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    fireEvent.input(input, { inputType: 'insertText' });
    pointer(page.node('origin'), 'pointerdown', { x: 200, y: 150, shiftKey: true });
    expect(screen.queryByRole('textbox', { name: '提示词' })).toBeNull();
    expect(page.node('video').classList.contains('cv-selected')).toBe(true);
    expect(page.node('origin').classList.contains('cv-selected')).toBe(true);
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe('原提示词');

    act(() => vi.advanceTimersByTime(600));
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(pending);
    // Successful acknowledgement must settle the React graph, not only the stored snapshot.
    expect(page.node('video').querySelector('.cv-node-empty small').textContent).toBe(pending);
    fireEvent.click(screen.getByTitle('放大'));
    act(() => vi.advanceTimersByTime(600));
    expect(saved().view.z).toBe(1.25);
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(pending);

    fireEvent.click(screen.getByRole('button', { name: '拖拽连线或点击选择节点类型' }), {
      detail: 0,
    });
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: '视频' }));
    expect(page.realEdges()).toHaveLength(2);
    act(() => vi.advanceTimersByTime(600));
    expect(saved().nodes).toHaveLength(4);
    expect(saved().edges).toHaveLength(2);
    expect(new Set(saved().edges.map((edge) => edge.target)).size).toBe(1);
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(pending);
    fireEvent.click(page.undo());
    expect(page.realEdges()).toHaveLength(0);
    act(() => vi.advanceTimersByTime(600));
    expect(saved().nodes).toHaveLength(3);
    expect(saved().edges).toEqual([]);
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(pending);
    page.unmount();
    expect(saved().nodes.find((node) => node.id === 'video').data.params.prompt).toBe(pending);
  });
});
