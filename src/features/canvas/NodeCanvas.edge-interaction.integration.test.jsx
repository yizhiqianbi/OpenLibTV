import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import { readPromptDOM } from './generator/node-prompt-dom.js';
import { resolveNodeGenerator } from './generator/node-generator.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: {
      models,
      'script-text-support': scriptSupport,
      'script-presets': presets,
      'image-model-support': imageSupport,
      'video-model-support': videoSupport,
    }[name] || { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'actual-edge-hit-selection-hover';
const storageKey = `libtv.canvas.${projectId}`;
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const undo = () => screen.getByTitle('撤销 ⌘Z');
const redo = () => screen.getByTitle('重做 ⇧⌘Z');
let frames;
const originalPathLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getTotalLength');
const originalPathPoint = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getPointAtLength');
const pathSamples = new WeakMap();

function nativePathSamples(element) {
  // jsdom has no native SVG geometry APIs. Approximate actual rendered cubic
  // arc length here, solely as a DOM platform fixture; no production planner
  // or nearest-point function is used to manufacture graph expectations.
  const path = element.getAttribute('d');
  const cached = pathSamples.get(element);
  if (cached?.path === path) return cached;
  const values = path.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi).map(Number);
  if (values.length !== 8) throw new Error('Fixture supports one rendered cubic SVG path');
  const points = [];
  let length = 0;
  for (let index = 0; index <= 200; index++) {
    const t = index / 200,
      u = 1 - t;
    const point = {
      x:
        u ** 3 * values[0] +
        3 * u ** 2 * t * values[2] +
        3 * u * t ** 2 * values[4] +
        t ** 3 * values[6],
      y:
        u ** 3 * values[1] +
        3 * u ** 2 * t * values[3] +
        3 * u * t ** 2 * values[5] +
        t ** 3 * values[7],
    };
    const previous = points.at(-1);
    if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
    points.push({ ...point, length });
  }
  const result = { path, points, length };
  pathSamples.set(element, result);
  return result;
}

function snapshot() {
  const image = (id, name, position) => ({
    id,
    type: 'image',
    position,
    width: 350,
    height: 230,
    data: {
      type: 'image',
      name,
      action: 'image_resource',
      url: ['/assets/16921729b1e11174.webp'],
      retainedMetadata: { owner: id },
    },
  });
  return {
    title: '真实连线命中与剪刀专项',
    view: { x: 0, y: 0, z: 1 },
    nodes: [
      image('source', '上游图片', { x: 40, y: 80 }),
      image('target', '下游图片', { x: 600, y: 120 }),
      image('other', '另一张图片', { x: 600, y: 440 }),
    ],
    edges: [
      { id: 'first', source: 'source', target: 'target' },
      { id: 'second', source: 'source', target: 'other' },
    ],
    draft: [{ type: 'text', text: '保留Agent未发送输入' }],
    messages: [],
    agentConfig: { mode: 'manual' },
  };
}

function storyboardSnapshot() {
  const value = snapshot();
  const script = createCanvasScriptNode({
    type: 'script',
    id: 'script',
    label: '旧脚本',
    position: { x: 40, y: 80 },
    models,
  });
  script.data = {
    ...script.data,
    linkedImageGroupId: 'story-group',
    rows: [
      {
        id: 'row-1',
        hiddenUuid: 'hidden-1',
        shotNumber: 10,
        plotDescription: '保留原剧情',
        imageGenerationPrompt: '保留原图片提示词',
        videoMotionPrompt: '保留原视频提示词',
        characters: [],
        scenes: [],
        props: [],
      },
    ],
  };
  const group = {
    id: 'story-group',
    type: 'group',
    position: { x: 600, y: 120 },
    width: 350,
    height: 300,
    data: {
      type: 'group',
      name: '关联分镜图组',
      sourceScriptNodeId: script.id,
      storyboardTitle: '必须保留的标题',
      storyboardGroupType: 'image',
      sourceScriptVersion: 'v1',
      childNodeIds: ['shot'],
    },
  };
  const shot = {
    ...value.nodes[1],
    id: 'shot',
    parentId: group.id,
    extent: 'parent',
    position: { x: 20, y: 30 },
    data: { ...value.nodes[1].data, scriptRowHiddenUuid: 'hidden-1' },
  };
  return {
    ...value,
    nodes: [script, group, shot, value.nodes[2]],
    edges: [{ id: 'first', source: script.id, target: group.id }],
  };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperties(SVGElement.prototype, {
    getTotalLength: {
      configurable: true,
      value() {
        return nativePathSamples(this).length;
      },
    },
    getPointAtLength: {
      configurable: true,
      value(distance) {
        const { points, length } = nativePathSamples(this);
        const clamped = Math.min(length, Math.max(0, distance));
        const index = Math.max(
          1,
          points.findIndex((point) => point.length >= clamped),
        );
        const first = points[index - 1],
          second = points[index];
        const fraction = (clamped - first.length) / (second.length - first.length || 1);
        return {
          x: first.x + (second.x - first.x) * fraction,
          y: first.y + (second.y - first.y) * fraction,
        };
      },
    },
  });
  frames = new Map();
  let nextFrame = 1;
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
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalPathLength)
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', originalPathLength);
  else delete SVGElement.prototype.getTotalLength;
  if (originalPathPoint)
    Object.defineProperty(SVGElement.prototype, 'getPointAtLength', originalPathPoint);
  else delete SVGElement.prototype.getPointAtLength;
});

function frame() {
  act(() => {
    const pending = [...frames];
    for (const [id, callback] of pending) {
      frames.delete(id);
      callback(16);
    }
  });
}

function pointer(
  element,
  type,
  { x = 490, y = 215, ctrlKey = false, metaKey = false, shiftKey = false, button = 0 } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : button === 1 ? 4 : 1,
    ctrlKey,
    metaKey,
    shiftKey,
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

async function page(value = snapshot(), { readonly = false } = {}) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas
      path={`/canvas?projectId=${projectId}`}
      user={LOCAL_WORKSPACE_USER}
      embedded={readonly}
    />,
  );
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(node(value.nodes[0].id)).toBeTruthy());
  if (!readonly)
    await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const board = canvas.container.querySelector('.cv-board');
  for (const element of canvas.container.querySelectorAll('.cv-board,.cv-node')) capture(element);
  flush();
  if (!readonly) {
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
  }
  return {
    ...canvas,
    node,
    board,
    baseline: read(),
    baselineRaw: localStorage.getItem(storageKey),
  };
}

function hit(canvas, index = 0) {
  // The historical fallback permits real pre-fix events. New geometry is
  // asserted separately; firing a DOM event is not a browser hit-test proof.
  return (
    canvas.container.querySelectorAll('.cv-edge-hit')[index] ||
    canvas.container.querySelectorAll('.cv-edge-visual')[index] ||
    canvas.container.querySelectorAll('.cv-edges > path')[index]
  );
}

function clickEdge(canvas, index = 0, modifiers = {}) {
  const path = hit(canvas, index);
  expect(path).toBeTruthy();
  pointer(path, 'pointerdown', modifiers);
  pointer(canvas.board, 'pointerup', modifiers);
  fireEvent.click(path, { detail: 1, ...modifiers });
}

function unchanged(canvas) {
  flush();
  expect(read()).toEqual(canvas.baseline);
  expect(localStorage.getItem(storageKey)).toBe(canvas.baselineRaw);
  expect(undo().disabled).toBe(true);
  expect(redo().disabled).toBe(true);
}

async function tick(ms) {
  await act(async () => vi.advanceTimersByTime(ms));
}

function hover(canvas, index = 0) {
  fireEvent.mouseEnter(hit(canvas, index), { clientX: 490, clientY: 215 });
  fireEvent.mouseMove(hit(canvas, index), { clientX: 490, clientY: 215 });
  frame();
}

function leave(canvas, index = 0) {
  fireEvent.mouseLeave(hit(canvas, index));
}

function expectDocument(canvas, expectedGraph) {
  const value = read();
  expect(value).toEqual({ ...canvas.baseline, ...expectedGraph, savedAt: expect.any(Number) });
  expect(value.savedAt).toBeGreaterThanOrEqual(canvas.baseline.savedAt);
}

function history(canvas, before, after) {
  fireEvent.click(undo());
  flush();
  expectDocument(canvas, before);
  expect(undo().disabled).toBe(true);
  fireEvent.click(redo());
  flush();
  expectDocument(canvas, after);
  expect(redo().disabled).toBe(true);
}

function capability(canvas, { selected = false, disabled = false, edgeId = 'first' } = {}) {
  const edge = canvas.container.querySelector(`[data-edge-id="${edgeId}"]`);
  expect(edge).toBeTruthy();
  expect(edge.getAttribute('role')).toBe(disabled ? 'img' : 'button');
  expect(edge.getAttribute('data-edge-interaction-disabled')).toBe(disabled ? 'true' : null);
  expect(edge.querySelector('.cv-edge-hit').style.pointerEvents).toBe(disabled ? 'none' : 'stroke');
  if (!disabled) expect(edge.getAttribute('aria-pressed')).toBe(selected ? 'true' : 'false');
  return edge;
}

describe('actual Canvas source edge hit, selection and hover scissors', () => {
  it('separates the transparent 20-world hit path from the 2-world visual and exposes the real endpoints', async () => {
    const canvas = await page();
    const edge = screen.getByRole('button', { name: '连线：上游图片 → 下游图片' });
    const path = edge.querySelector('.cv-edge-hit');
    const visual = edge.querySelector('.cv-edge-visual');
    expect(path).toBeTruthy();
    expect(visual).toBeTruthy();
    expect(path.getAttribute('d')).toBe(visual.getAttribute('d'));
    expect(Number(path.getAttribute('stroke-width'))).toBe(20);
    expect(path.getAttribute('stroke')).toBe('transparent');
    expect(Number(visual.getAttribute('stroke-width'))).toBe(2);
    expect(visual.style.pointerEvents).toBe('none');
    expect(path.hasAttribute('vector-effect')).toBe(false);
    unchanged(canvas);
  });

  it('a normal real pointer click selects only the edge, clears node selection and makes no document/history write', async () => {
    const canvas = await page();
    fireEvent.click(canvas.node('source'));
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(true);
    clickEdge(canvas);
    expect.soft(canvas.node('source').classList.contains('cv-selected')).toBe(false);
    const edge = screen.getByRole('button', { name: '连线：上游图片 → 下游图片' });
    expect(edge.getAttribute('aria-pressed')).toBe('true');
    edge.focus();
    fireEvent.keyDown(edge, { key: 'Escape' });
    expect(edge.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).not.toBe(edge);
    fireEvent.keyDown(edge, { key: 'Enter' });
    expect(edge.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(edge, { key: ' ', code: 'Space' });
    expect(edge.getAttribute('aria-pressed')).toBe('true');
    unchanged(canvas);
  });

  it('Ctrl and Meta clicks toggle real edge IDs, while an ordinary click replaces the edge selection', async () => {
    const canvas = await page();
    clickEdge(canvas);
    clickEdge(canvas, 1, { ctrlKey: true });
    const first = screen.getByRole('button', { name: '连线：上游图片 → 下游图片' });
    const second = screen.getByRole('button', { name: '连线：上游图片 → 另一张图片' });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    clickEdge(canvas, 0, { metaKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    clickEdge(canvas);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(canvas.node('source'));
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(true);
    clickEdge(canvas, 1, { ctrlKey: true });
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(true);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    clickEdge(canvas);
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(false);
    pointer(canvas.node('source'), 'pointerdown', { x: 100, y: 100, shiftKey: true });
    pointer(canvas.board, 'pointerup', { x: 100, y: 100, shiftKey: true });
    fireEvent.click(canvas.node('source'), { detail: 1, shiftKey: true });
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(true);
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    second.focus();
    fireEvent.keyDown(second, { key: 'Enter', shiftKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    first.focus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(false);
    pointer(canvas.node('target'), 'pointerdown', { x: 640, y: 180 });
    pointer(canvas.board, 'pointerup', { x: 640, y: 180 });
    fireEvent.click(canvas.node('target'), { detail: 1 });
    expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    unchanged(canvas);
  });

  it('double-clicking the edge does not delete it or open a disconnect confirmation', async () => {
    const canvas = await page();
    clickEdge(canvas);
    fireEvent.doubleClick(hit(canvas));
    unchanged(canvas);
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
  });

  it('waits exactly 1000ms before exposing the 48-world scissors and routes cancellation through the real storyboard owner', async () => {
    const canvas = await page(storyboardSnapshot());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(999);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    await tick(1);
    const scissors = screen.getByRole('button', { name: '断开连线' });
    const foreignObject = scissors.parentElement;
    expect(foreignObject.localName).toBe('foreignObject');
    expect(foreignObject.getAttribute('width')).toBe('48');
    expect(foreignObject.getAttribute('height')).toBe('48');
    fireEvent.click(scissors);
    const dialog = screen.getByRole('dialog', { name: '断开连线' });
    expect(
      within(dialog).getByText(
        '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
      ),
    ).toBeTruthy();
    unchanged(canvas);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    unchanged(canvas);
  });

  it('hand and held Space permit panning from an edge hit instead of isolating it or deleting the graph', async () => {
    const canvas = await page();
    clickEdge(canvas);
    const selectedPaint = () => {
      const visual = canvas.container.querySelector('[data-edge-id="first"] .cv-edge-visual');
      expect(visual.getAttribute('stroke-width')).toBe('3');
      expect(visual.getAttribute('stroke')).toBe('var(--canvas-edge-selected)');
    };
    fireEvent.keyDown(window, { key: 'h' });
    capability(canvas, { disabled: true });
    selectedPaint();
    pointer(hit(canvas), 'pointerdown', { x: 490, y: 215 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(true);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(true);
    pointer(canvas.board, 'pointermove', { x: 545, y: 245 });
    pointer(canvas.board, 'pointerup', { x: 550, y: 250 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(false);
    capability(canvas, { disabled: true });
    selectedPaint();
    frame();
    flush();
    expect(read().view).toEqual({ x: 60, y: 35, z: 1 });
    expect(graph(read())).toEqual(graph(canvas.baseline));
    expect(undo().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    fireEvent.keyDown(window, { key: 'v' });
    capability(canvas, { selected: true });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    capability(canvas, { disabled: true });
    selectedPaint();
    pointer(hit(canvas), 'pointerdown', { x: 490, y: 215 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(true);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(true);
    pointer(canvas.board, 'pointermove', { x: 525, y: 235 });
    pointer(canvas.board, 'pointerup', { x: 530, y: 240 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(false);
    capability(canvas, { disabled: true });
    selectedPaint();
    frame();
    flush();
    expect(read().view).toEqual({ x: 100, y: 60, z: 1 });
    expect(graph(read())).toEqual(graph(canvas.baseline));
    expect(undo().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    fireEvent.keyUp(window, { key: ' ', code: 'Space' });
    capability(canvas, { selected: true });
    expect(screen.getByRole('button', { name: '连线：上游图片 → 下游图片' })).toBeTruthy();
  });

  it('ordinary scissors commit the last active 150ms sibling input, save all metadata and produce one complete undo/redo', async () => {
    const value = snapshot();
    const media = value.nodes[2];
    media.data = {
      type: 'image',
      name: '正在输入的生成器',
      action: 'image_generate',
      generationError: '',
      params: {
        model: 'flux-2-pro',
        modeType: 'image2image',
        prompt: '原始生成器输入',
        count: 1,
        settings: { ratio: '16:9' },
      },
    };
    media.data.params = resolveNodeGenerator(media, value.nodes, value.edges, models).params;
    const canvas = await page(value);
    fireEvent.click(canvas.node(media.id));
    const frameElement = () => canvas.node(media.id).querySelector('.cv-inline-generator');
    await waitFor(() =>
      expect(within(frameElement()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
    );
    const input = within(frameElement()).getByRole('textbox', { name: '提示词' });
    flush();
    canvas.baseline = read();
    const before = graph(canvas.baseline);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(1000);
    const scissors = screen.getByRole('button', { name: '断开连线' });
    const pending = '剪刀点击前最后150ms未发送输入';
    input.textContent = pending;
    fireEvent.input(input, { inputType: 'insertText' });
    expect(readPromptDOM(input)).toBe(pending);
    expect(read().nodes.find((node) => node.id === media.id).data.params.prompt).toBe(
      '原始生成器输入',
    );
    fireEvent.click(scissors);
    flush();
    const latestNodes = before.nodes.map((node) =>
      node.id === media.id
        ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: pending } } }
        : node,
    );
    const expected = { nodes: latestNodes, edges: [before.edges[1]] };
    expectDocument(canvas, expected);
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    expect(canvas.node(media.id).classList.contains('cv-selected')).toBe(true);
    expect(within(frameElement()).getByRole('textbox', { name: '提示词' })).toBe(input);
    await tick(200);
    flush();
    expectDocument(canvas, expected);
    history(canvas, { ...before, nodes: latestNodes }, expected);
  });

  it('confirmed storyboard scissors clear only matching bindings and the one edge, preserving raw rows/children in one undo', async () => {
    const canvas = await page(storyboardSnapshot());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(1000);
    fireEvent.click(screen.getByRole('button', { name: '断开连线' }));
    const dialog = screen.getByRole('dialog', { name: '断开连线' });
    unchanged(canvas);
    fireEvent.click(within(dialog).getByRole('button', { name: '确定断开' }));
    flush();
    const before = graph(canvas.baseline);
    const expected = {
      nodes: before.nodes.map((node) => {
        if (node.id === 'script') {
          const { linkedImageGroupId: _link, ...data } = node.data;
          return { ...node, data };
        }
        if (node.id === 'story-group') {
          const { sourceScriptNodeId: _source, storyboardTitle: _title, ...data } = node.data;
          return { ...node, data };
        }
        return node;
      }),
      edges: [],
    };
    expectDocument(canvas, expected);
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    history(canvas, before, expected);
  });

  it('the main shared layer hides scissors immediately on leave and restarts the full 1000ms on reentry', async () => {
    const canvas = await page();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(999);
    leave(canvas);
    await tick(1000);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    hover(canvas);
    await tick(1000);
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    leave(canvas);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    hover(canvas);
    await tick(999);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    await tick(1);
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    unchanged(canvas);
  });

  it('window blur retires both a pending and a visible scissors timer without graph/history writes', async () => {
    const canvas = await page();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(500);
    fireEvent.blur(window);
    await tick(1500);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    hover(canvas);
    await tick(1000);
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    fireEvent.blur(window);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    await tick(1500);
    unchanged(canvas);
  });

  it('a document switch with identical edge IDs cannot show or execute the previous document hover callback', async () => {
    const canvas = await page();
    const secondId = `${projectId}-second`,
      secondKey = `libtv.canvas.${secondId}`;
    const second = snapshot();
    second.title = '另一个同ID文档';
    second.nodes[0].data.name = '新文档上游';
    localStorage.setItem(secondKey, JSON.stringify(second));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(999);
    await act(async () =>
      canvas.rerender(
        <NodeCanvas path={`/canvas?projectId=${secondId}`} user={LOCAL_WORKSPACE_USER} />,
      ),
    );
    expect(screen.getByRole('button', { name: second.title })).toBeTruthy();
    flush();
    const secondBaseline = JSON.parse(localStorage.getItem(secondKey));
    await tick(1);
    frame();
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(read()).toEqual(canvas.baseline);
    expect(JSON.parse(localStorage.getItem(secondKey))).toEqual(secondBaseline);
    hover(canvas);
    await tick(1000);
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    canvas.unmount();
    await tick(1500);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(read()).toEqual(canvas.baseline);
    expect(JSON.parse(localStorage.getItem(secondKey))).toEqual(secondBaseline);
  });

  it('readonly edges remain selectable while never exposing scissors or writing even after double-click', async () => {
    const canvas = await page(snapshot(), { readonly: true });
    const baseline = read();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    clickEdge(canvas);
    const first = screen.getByRole('button', { name: '连线：上游图片 → 下游图片' });
    const second = screen.getByRole('button', { name: '连线：上游图片 → 另一张图片' });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    clickEdge(canvas, 1, { ctrlKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true, metaKey: true, shiftKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    clickEdge(canvas, 1, { metaKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    second.focus();
    fireEvent.keyDown(second, { key: 'Enter', ctrlKey: true, metaKey: true, shiftKey: true });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    pointer(canvas.node('source'), 'pointerdown', { x: 100, y: 100, shiftKey: true });
    pointer(canvas.board, 'pointerup', { x: 100, y: 100, shiftKey: true });
    fireEvent.click(canvas.node('source'), { detail: 1, shiftKey: true });
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(true);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('false');
    clickEdge(canvas);
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(1000);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    fireEvent.doubleClick(hit(canvas));
    flush();
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    expect(read()).toEqual(baseline);
    expect(writes.mock.calls.filter(([key]) => key === storageKey)).toEqual([]);
  });

  it('native Space activates the focused scissors without switching the canvas into hand mode or canceling the button click', async () => {
    const canvas = await page();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hover(canvas);
    await tick(1000);
    const scissors = screen.getByRole('button', { name: '断开连线' });
    // The owned hover deadline has completed. Native keyboard activation uses
    // RTL/user-event's real asynchronous scheduler, independently of that timer.
    vi.useRealTimers();
    const user = userEvent.setup();
    scissors.focus();
    expect(document.activeElement).toBe(scissors);
    await user.keyboard('[Space>]');
    expect.soft(canvas.board.classList.contains('cv-hand')).toBe(false);
    expect.soft(screen.queryByRole('button', { name: '断开连线' })).toBe(scissors);
    await user.keyboard('[/Space]');
    flush();
    const before = graph(canvas.baseline);
    const expected = { nodes: before.nodes, edges: [before.edges[1]] };
    expectDocument(canvas, expected);
    expect(canvas.board.classList.contains('cv-hand')).toBe(false);
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    history(canvas, before, expected);
  });

  it('an already-started node drag restores edge capability immediately on up and keeps the final position in one history', async () => {
    const canvas = await page();
    pointer(canvas.node('source'), 'pointerdown', { x: 100, y: 100 });
    capability(canvas, { disabled: true });
    pointer(canvas.board, 'pointermove', { x: 130, y: 120 });
    capability(canvas, { disabled: true });
    pointer(canvas.board, 'pointerup', { x: 150, y: 140 });
    // No frame, timeout, click, save or unrelated state change may reopen it.
    capability(canvas);
    flush();
    const before = graph(canvas.baseline);
    const expected = {
      nodes: before.nodes.map((node) =>
        node.id === 'source' ? { ...node, position: { x: 90, y: 120 } } : node,
      ),
      edges: before.edges,
    };
    expectDocument(canvas, expected);
    history(canvas, before, expected);
    capability(canvas);
  });

  it('middle-button pane pan restores selected edge capability immediately on up without a graph/history mutation', async () => {
    const canvas = await page();
    clickEdge(canvas);
    pointer(canvas.board, 'pointerdown', { x: 1050, y: 600, button: 1 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(true);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(true);
    capability(canvas, { disabled: true });
    pointer(canvas.board, 'pointermove', { x: 1080, y: 620, button: 1 });
    pointer(canvas.board, 'pointerup', { x: 1090, y: 630, button: 1 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    expect(canvas.board.classList.contains('cv-edge-interacting')).toBe(false);
    capability(canvas, { selected: true });
    flush();
    expectDocument(canvas, { ...graph(canvas.baseline), view: { x: 40, y: 30, z: 1 } });
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
  });

  it.each(['pointercancel', 'blur'])(
    '%s restores capability after an unmoved node press and rejects late moves/up with zero writes',
    async (ending) => {
      const canvas = await page();
      pointer(canvas.node('source'), 'pointerdown', { x: 100, y: 100 });
      capability(canvas, { disabled: true });
      if (ending === 'blur') fireEvent.blur(window);
      else pointer(canvas.board, 'pointercancel', { x: 100, y: 100 });
      capability(canvas);
      pointer(canvas.board, 'pointermove', { x: 170, y: 170 });
      pointer(canvas.board, 'pointerup', { x: 170, y: 170 });
      capability(canvas);
      unchanged(canvas);
      clickEdge(canvas);
      capability(canvas, { selected: true });
      unchanged(canvas);
    },
  );

  it('owner cleanup retires an old active pointer and publishes selectable fresh edges before any new gesture', async () => {
    const canvas = await page();
    pointer(canvas.node('source'), 'pointerdown', { x: 100, y: 100 });
    capability(canvas, { disabled: true });
    const secondId = `${projectId}-active-pointer`,
      secondKey = `libtv.canvas.${secondId}`;
    const second = snapshot();
    second.title = 'active手势切换的新文档';
    second.nodes[0].data.name = '新owner上游';
    localStorage.setItem(secondKey, JSON.stringify(second));
    await act(async () =>
      canvas.rerender(
        <NodeCanvas path={`/canvas?projectId=${secondId}`} user={LOCAL_WORKSPACE_USER} />,
      ),
    );
    expect(screen.getByRole('button', { name: second.title })).toBeTruthy();
    capability(canvas);
    flush();
    const baseline = JSON.parse(localStorage.getItem(secondKey));
    expect(graph(baseline)).toEqual(graph(second));
    expect(read()).toEqual(canvas.baseline);
    pointer(canvas.board, 'pointermove', { x: 180, y: 170 });
    pointer(canvas.board, 'pointerup', { x: 180, y: 170 });
    capability(canvas);
    flush();
    expect(JSON.parse(localStorage.getItem(secondKey))).toEqual(baseline);
    expect(read()).toEqual(canvas.baseline);
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
    clickEdge(canvas);
    capability(canvas, { selected: true });
    flush();
    expect(JSON.parse(localStorage.getItem(secondKey))).toEqual(baseline);
  });
});
