import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { readPromptDOM } from './generator/node-prompt-dom.js';
import { resolveNodeGenerator } from './generator/node-generator.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'destructive-delete-actual-app';
const storageKey = `libtv.canvas.${projectId}`;
const rawPrompt = '{{Image 1}}';
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const owner = (value = read(), id = 'target') => value.nodes.find((node) => node.id === id);
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));

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
  const sources = ['first', 'second', 'third'].map((id, index) => ({
    id,
    type: 'image',
    position: { x: 50 + index * 400, y: 650 },
    width: 350,
    height: 350,
    data: {
      type: 'image',
      name: `上游素材 ${index + 1}`,
      action: 'image_resource',
      url: [`https://destructive-delete.example.test/${id}.png`],
    },
  }));
  const value = {
    title: '键盘删除整图事务实际应用验收',
    view: { x: -40, y: 20, z: 0.8 },
    nodes: [
      ...sources,
      {
        id: 'target',
        type: 'image',
        position: { x: 1200, y: 200 },
        width: 350,
        height: 230,
        data: {
          type: 'image',
          name: '下游生成目标',
          action: 'image_generate',
          generationError: '',
          params: {
            model: 'flux-2-pro',
            modeType: 'image2image',
            prompt: rawPrompt,
            count: 1,
            settings: { ratio: '16:9' },
            imageList: sources.map((source) => ({
              nodeId: source.id,
              url: source.data.url[0],
              label: source.data.name,
            })),
            videoList: [],
            audioList: [],
            imageListOrder: sources.map((source) => source.id),
            videoListOrder: [],
            audioListOrder: [],
            mixedListOrder: sources.map((source) => source.id),
          },
        },
      },
      {
        id: 'unrelated',
        type: 'text',
        position: { x: 2000, y: 100 },
        width: 260,
        height: 160,
        data: { type: 'text', name: '无关资源', action: 'text_resource', content: ['原文不改'] },
      },
    ],
    edges: sources.map((source, index) => ({
      id: `edge-${index}`,
      source: source.id,
      sourceHandle: 'source',
      target: 'target',
      targetHandle: 'target',
    })),
  };
  const target = owner(value);
  target.data.params = resolveNodeGenerator(target, value.nodes, value.edges, models).params;
  return value;
}

function lockedSnapshot(phase) {
  const value = snapshot();
  const source = value.nodes[0];
  source.type = 'video';
  source.data = { ...source.data, type: 'video', action: 'video_resource', url: ['/source.webm'] };
  const target = owner(value);
  target.type = 'video';
  target.data = {
    ...target.data,
    type: 'video',
    action: 'video_generate',
    params: {
      ...target.data.params,
      model: 'kling-v3-omni',
      modeType: 'videoEdit2video',
      prompt: 'prefix {{Video 1}} {{SegmentRange:segment-a}} suffix',
      imageList: value.nodes
        .slice(1, 3)
        .map((node) => ({ nodeId: node.id, url: node.data.url[0], label: node.data.name })),
      videoList: [{ nodeId: source.id, url: '/source.webm', label: source.data.name }],
      imageListOrder: ['second', 'third'],
      videoListOrder: ['first'],
      mixedListOrder: ['first', 'second', 'third'],
      ...(phase
        ? {
            segmentRemakeLock: true,
            segmentRemakeDraft: { phase, sourceNodeId: source.id, ranges: ['segment-a'] },
          }
        : { pictureEditLock: true }),
    },
  };
  target.data.params = resolveNodeGenerator(target, value.nodes, value.edges, models).params;
  return value;
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
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
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

async function page(value = snapshot()) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  fireEvent.click(node('target'));
  const frame = () => node('target')?.querySelector('.cv-inline-generator');
  // Await the actual lazy editor surface; retain all graph/draft assertions below.
  await waitFor(
    () => expect(within(frame()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
    { timeout: 10_000 },
  );
  const editor = () => within(frame()).getByRole('textbox', { name: '提示词' });
  flush();
  expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  return {
    ...canvas,
    node,
    frame,
    editor,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}

async function armDisconnect(canvas, index = 0) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const edge = canvas.container.querySelectorAll('.cv-edge-hit')[index];
  expect(edge).toBeTruthy();
  // Main shared-layer scissors appear after real hover, without selecting the
  // edge first: ordinary edge clicks intentionally clear node selection.
  fireEvent.mouseEnter(edge, { clientX: 900, clientY: 500 });
  fireEvent.mouseMove(edge, { clientX: 900, clientY: 500 });
  act(() => {
    const pending = [...frames];
    for (const [id, callback] of pending) {
      frames.delete(id);
      callback(16);
    }
  });
  await act(async () => vi.advanceTimersByTime(1000));
  return screen.getByRole('button', { name: '断开连线' });
}

async function disconnect(canvas, index = 0) {
  const button = await armDisconnect(canvas, index);
  await act(async () => {
    fireEvent.click(button);
    await Promise.resolve();
  });
}

function pendingInput(canvas, prompt) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  canvas.editor().textContent = prompt;
  fireEvent.input(canvas.editor(), { inputType: 'insertText' });
  expect(owner().data.params.prompt).toBe(rawPrompt);
  expect(readPromptDOM(canvas.editor())).toBe(prompt);
}

async function deleteSelected(canvas, id) {
  fireEvent.click(canvas.node(id));
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyUp(window, { key: 'Delete' });
    await Promise.resolve();
  });
  flush();
}

async function selectedPrompt(canvas, id = 'target') {
  // The actual lazy entry publishes its cached module through a promise on each
  // owner switch. Flush microtasks without advancing the pending input timeout.
  await act(async () => {
    fireEvent.click(canvas.node(id));
    await Promise.resolve();
  });
  return within(canvas.node(id).querySelector('.cv-inline-generator')).getByRole('textbox', {
    name: '提示词',
  });
}

async function oneHistory(canvas, before, pendingById, committed) {
  await act(async () => vi.advanceTimersByTime(200));
  flush();
  expect(graph(read())).toEqual(committed);
  fireEvent.click(canvas.undo());
  flush();
  expect(graph(read())).toEqual({
    ...before,
    nodes: before.nodes.map((node) =>
      pendingById[node.id] === undefined
        ? node
        : {
            ...node,
            data: { ...node.data, params: { ...node.data.params, prompt: pendingById[node.id] } },
          },
    ),
  });
  expect(canvas.undo().disabled).toBe(true);
  fireEvent.click(canvas.redo());
  flush();
  expect(graph(read())).toEqual(committed);
  expect(canvas.redo().disabled).toBe(true);
}

describe('actual App destructive source deletion and downstream input reconciliation', () => {
  it('uses rendered hover scissors to clean an active input whose accepted value equals its original baseline', async () => {
    const canvas = await page();
    const before = graph(read());
    const editor = canvas.editor();
    const pending = '{{Image 1}} {{Image 2}}';
    const scissors = await armDisconnect(canvas, 1);
    pendingInput(canvas, pending);
    expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
    // Arm hover before editing so this remains a genuine <150ms input race.
    // The scissors pointer press must remain isolated from board capture.
    fireEvent.pointerDown(scissors, { pointerId: 1, button: 0, clientX: 900, clientY: 500 });
    fireEvent.pointerUp(scissors, { pointerId: 1, button: 0, clientX: 900, clientY: 500 });
    expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
    expect(canvas.editor()).toBe(editor);
    expect(readPromptDOM(editor)).toBe(pending);
    fireEvent.click(scissors);
    flush();
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.id !== 'edge-1'));
    expect(owner().data.params.prompt).toBe(rawPrompt);
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['first', 'third']);
    expect(canvas.editor()).toBe(editor);
    expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
    expect(readPromptDOM(editor)).toBe(rawPrompt);
    await oneHistory(canvas, before, { target: pending }, committed);
    expect(readPromptDOM(canvas.editor())).toBe(rawPrompt);
  }, 15_000);

  it('immediately reconciles a surviving group consumer after deleting its child as a bounded local interaction improvement', async () => {
    const value = snapshot();
    for (const [index, id] of ['first', 'second', 'third'].entries()) {
      const source = owner(value, id);
      source.parentId = 'group';
      source.position = { x: 20 + index * 400, y: 30 };
    }
    const group = {
      id: 'group',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 1300,
      height: 450,
      measured: { width: 1300, height: 450 },
      data: {
        type: 'group',
        name: '即时更新真实消费者的源组',
        childNodeIds: ['first', 'second', 'third'],
      },
    };
    const outside = {
      ...structuredClone(owner(value, 'first')),
      id: 'outside',
      position: { x: 2600, y: 800 },
    };
    delete outside.parentId;
    outside.data = { ...outside.data, name: '未修改的独立素材' };
    const unrelatedConsumer = {
      ...structuredClone(owner(value)),
      id: 'unrelated-consumer',
      position: { x: 3000, y: 300 },
    };
    unrelatedConsumer.data = {
      ...unrelatedConsumer.data,
      name: '不受影响的消费者',
      params: {
        ...unrelatedConsumer.data.params,
        prompt: 'unrelated {{Image 1}}',
        imageList: [{ nodeId: outside.id, url: outside.data.url[0], label: outside.data.name }],
        imageListOrder: [outside.id],
        mixedListOrder: [outside.id],
      },
    };
    value.nodes.unshift(group);
    value.nodes.push(outside, unrelatedConsumer);
    value.edges = [
      { id: 'group-consumer-edge', source: group.id, target: 'target' },
      { id: 'unrelated-consumer-edge', source: outside.id, target: unrelatedConsumer.id },
    ];
    owner(value).data.params = resolveNodeGenerator(
      owner(value),
      value.nodes,
      value.edges,
      models,
    ).params;
    unrelatedConsumer.data.params = resolveNodeGenerator(
      unrelatedConsumer,
      value.nodes,
      value.edges,
      models,
    ).params;
    const canvas = await page(value);
    const beforeDocument = read();
    const before = graph(beforeDocument);
    const pending = '{{Image 1}} {{Image 2}} {{Portrait 3}}';
    pendingInput(canvas, pending);
    await deleteSelected(canvas, 'second');
    const committedDocument = read();
    const committed = graph(committedDocument);
    expect(committed.nodes.map((node) => node.id)).toEqual([
      'group',
      'first',
      'third',
      'target',
      'unrelated',
      'outside',
      'unrelated-consumer',
    ]);
    expect(committed.edges).toEqual(before.edges);
    expect(owner().data.params.prompt).toBe('{{Image 1}} {{Portrait 2}}');
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['first', 'third']);
    const oldGroup = owner(before, 'group');
    const newGroup = owner(read(), 'group');
    for (const id of ['first', 'third']) {
      const oldSource = owner(before, id);
      const newSource = owner(read(), id);
      expect({ ...newSource, position: oldSource.position }).toEqual(oldSource);
      expect(newGroup.position.x + newSource.position.x).toBeCloseTo(
        oldGroup.position.x + oldSource.position.x,
        12,
      );
      expect(newGroup.position.y + newSource.position.y).toBeCloseTo(
        oldGroup.position.y + oldSource.position.y,
        12,
      );
    }
    expect(
      committed.nodes.filter((node) =>
        ['unrelated', 'outside', 'unrelated-consumer'].includes(node.id),
      ),
    ).toEqual(
      before.nodes.filter((node) =>
        ['unrelated', 'outside', 'unrelated-consumer'].includes(node.id),
      ),
    );
    const {
      nodes: _beforeNodes,
      edges: _beforeEdges,
      savedAt: beforeSavedAt,
      ...beforeMetadata
    } = beforeDocument;
    const {
      nodes: _afterNodes,
      edges: _afterEdges,
      savedAt: afterSavedAt,
      ...afterMetadata
    } = committedDocument;
    expect(afterMetadata).toEqual(beforeMetadata);
    expect(afterSavedAt).toBeGreaterThanOrEqual(beforeSavedAt);
    await oneHistory(canvas, before, { target: pending }, committed);
  }, 15_000);

  it('uses the ordinary reference card to reset picture-edit params after removing its last video while retaining the source node', async () => {
    const value = lockedSnapshot();
    value.nodes = value.nodes.filter((node) => !['second', 'third'].includes(node.id));
    value.edges = value.edges.filter((edge) => edge.source === 'first');
    const target = owner(value);
    target.data.params = resolveNodeGenerator(
      {
        ...target,
        data: {
          ...target.data,
          params: {
            ...target.data.params,
            imageList: [],
            imageListOrder: [],
            mixedListOrder: ['first'],
          },
        },
      },
      value.nodes,
      value.edges,
      models,
    ).params;
    const canvas = await page(value);
    const before = graph(read());
    fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 1' }));
    flush();
    const committed = graph(read());
    expect(committed.edges).toEqual([]);
    expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
      before.nodes.filter((node) => node.id !== 'target'),
    );
    expect(owner().data).toEqual({
      ...owner(before).data,
      params: {
        prompt: '',
        model: 'kling-v3-omni',
        modeType: '',
        count: 1,
        settings: {},
        textList: [],
        imageList: [],
        videoList: [],
        audioList: [],
      },
    });
    expect(canvas.node('first')).toBeTruthy();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('uses the ordinary reference card to cascade an editing continuation and preserve every source node', async () => {
    const value = lockedSnapshot('editing');
    value.nodes = value.nodes.filter((node) => !['second', 'third'].includes(node.id));
    value.edges = value.edges.filter((edge) => edge.source === 'first');
    const target = owner(value);
    target.data.params = resolveNodeGenerator(
      {
        ...target,
        data: {
          ...target.data,
          params: {
            ...target.data.params,
            imageList: [],
            imageListOrder: [],
            mixedListOrder: ['first'],
          },
        },
      },
      value.nodes,
      value.edges,
      models,
    ).params;
    const canvas = await page(value);
    const before = graph(read());
    fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 1' }));
    flush();
    const committed = graph(read());
    expect(committed.edges).toEqual([]);
    expect(committed.nodes).toEqual(before.nodes.filter((node) => node.id !== 'target'));
    expect(canvas.node('first')).toBeTruthy();
    expect(canvas.node('target')).toBeNull();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('cascades a still-editing continuation on its source edge scissors while keeping the source node', async () => {
    const canvas = await page(lockedSnapshot('editing'));
    const before = graph(read());
    await disconnect(canvas);
    flush();
    const committed = graph(read());
    expect(committed.nodes).toEqual(before.nodes.filter((node) => node.id !== 'target'));
    expect(committed.edges).toEqual([]);
    expect(canvas.node('first')).toBeTruthy();
    expect(canvas.node('target')).toBeNull();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('dissolves a parent left with one child, preserving the surviving child world position and removing its parent constraints', async () => {
    const value = snapshot();
    value.nodes[0] = {
      ...value.nodes[0],
      parentId: 'group',
      extent: 'parent',
      position: { x: 20, y: 30 },
    };
    value.nodes[1] = {
      ...value.nodes[1],
      parentId: 'group',
      extent: 'parent',
      position: { x: 430, y: 50 },
    };
    value.nodes.unshift({
      id: 'group',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 900,
      height: 500,
      data: { type: 'group', name: '删除一个成员后解散的父组', childNodeIds: ['first', 'second'] },
    });
    const canvas = await page(value);
    const before = graph(read());
    await deleteSelected(canvas, 'first');
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual([
      'second',
      'third',
      'target',
      'unrelated',
    ]);
    const { parentId: _parent, extent: _extent, ...second } = owner(before, 'second');
    expect(owner(read(), 'second')).toEqual({ ...second, position: { x: 530, y: 250 } });
    expect(owner().data.params.prompt).toBe('');
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['second', 'third']);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('recomputes a surviving ordinary group with two children using measured dimensions and the source zoom padding', async () => {
    const value = snapshot();
    value.nodes[0] = {
      ...value.nodes[0],
      parentId: 'group',
      position: { x: 20, y: 30 },
      measured: { width: 300, height: 200 },
    };
    value.nodes[1] = { ...value.nodes[1], parentId: 'group', position: { x: 450, y: 120 } };
    value.nodes[2] = {
      ...value.nodes[2],
      parentId: 'group',
      position: { x: 880, y: 10 },
      measured: { width: 400, height: 250 },
    };
    const group = {
      id: 'group',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 1500,
      height: 600,
      measured: { width: 1500, height: 600 },
      style: { width: 1500, height: 600 },
      data: {
        type: 'group',
        name: '重算父组',
        childNodeIds: ['first', 'second', 'third'],
        dataNodeWidth: 1500,
      },
    };
    value.nodes.unshift(group);
    const canvas = await page(value);
    const before = graph(read());
    await deleteSelected(canvas, 'second');
    const committed = graph(read());
    const padding = 20 + (20 * (Math.sqrt(0.8) - 0.8)) / 0.8;
    expect(owner(read(), 'group')).toEqual({
      ...group,
      position: { x: 120 - padding, y: 210 - padding },
      width: 1260 + 2 * padding,
      height: 250 + 2 * padding,
      measured: { width: 1260 + 2 * padding, height: 250 + 2 * padding },
    });
    expect(owner(read(), 'first').position).toEqual({ x: padding, y: 20 + padding });
    expect(owner(read(), 'third').position).toEqual({ x: 860 + padding, y: padding });
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['first', 'third']);
    expect(read().view).toEqual(value.view);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('resets picture-edit params when global node deletion removes its last video, preserving the rest of target data', async () => {
    const canvas = await page(lockedSnapshot());
    const before = graph(read());
    await deleteSelected(canvas, 'first');
    const committed = graph(read());
    expect(owner().data).toEqual({
      ...owner(before).data,
      params: {
        prompt: '',
        model: 'kling-v3-omni',
        modeType: '',
        count: 1,
        settings: {},
        textList: [],
        imageList: before.nodes
          .filter((node) => ['second', 'third'].includes(node.id))
          .map((node) => ({ nodeId: node.id, url: node.data.url[0], label: node.data.name })),
        videoList: [],
        audioList: [],
      },
    });
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('degrades a submitted continuation by removing its lock, draft and range tokens without a second whitespace cleanup', async () => {
    const value = lockedSnapshot('submitted');
    owner(value).data.params.prompt =
      '  prefix {{SegmentRange:segment-a}} {{SegmentRange:bad id}} suffix  ';
    const canvas = await page(value);
    const before = graph(read());
    await deleteSelected(canvas, 'first');
    const committed = graph(read());
    const {
      segmentRemakeLock: _lock,
      segmentRemakeDraft: _draft,
      ...retained
    } = owner(before).data.params;
    expect(owner().data.params).toEqual({
      ...retained,
      prompt: '  prefix  {{SegmentRange:bad id}} suffix  ',
      textList: [],
      imageList: before.nodes
        .filter((node) => ['second', 'third'].includes(node.id))
        .map((node) => ({ nodeId: node.id, url: node.data.url[0], label: node.data.name })),
      videoList: [],
      audioList: [],
    });
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('cascades an editing continuation target after its upstream node is deleted, then reconciles the next surviving target', async () => {
    const value = lockedSnapshot('editing');
    const next = {
      id: 'next-target',
      type: 'video',
      position: { x: 1900, y: 200 },
      width: 350,
      height: 230,
      data: {
        type: 'video',
        name: '继续下游目标',
        action: 'video_generate',
        params: {
          model: 'star-video2',
          modeType: 'videoEdit2video',
          prompt: '{{Video 1}} next',
          imageList: [],
          videoList: [{ nodeId: 'target', url: '/editing-output.webm' }],
          audioList: [],
          videoListOrder: ['target'],
        },
      },
    };
    owner(value).data.url = ['/editing-output.webm'];
    value.nodes.push(next);
    value.edges.push({ id: 'continuation-next', source: 'target', target: next.id });
    next.data.params = resolveNodeGenerator(next, value.nodes, value.edges, models).params;
    const canvas = await page(value);
    const before = graph(read());
    await deleteSelected(canvas, 'first');
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual([
      'second',
      'third',
      'unrelated',
      'next-target',
    ]);
    expect(committed.edges).toEqual([]);
    expect(owner(read(), 'next-target').data.params.prompt).toBe('next');
    expect(owner(read(), 'next-target').data.params.videoList).toEqual([]);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('does not let a detached input draft resurrect a deleted mention when cleanup returns the original raw prompt', async () => {
    const canvas = await page();
    const before = graph(read());
    const pending = '{{Image 1}} {{Image 2}}';
    pendingInput(canvas, pending);
    await deleteSelected(canvas, 'second');
    const committed = graph(read());
    expect(owner().data.params.prompt).toBe(rawPrompt);
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['first', 'third']);
    await oneHistory(canvas, before, { target: pending }, committed);
    vi.useRealTimers();
    const editor = await selectedPrompt(canvas);
    expect(readPromptDOM(editor)).toBe(rawPrompt);
    expect(
      [...editor.querySelectorAll('[data-prompt-token]')].map(
        (badge) => badge.dataset.mentionNodeId,
      ),
    ).toEqual(['first']);
  });

  it('reconciles every downstream target while preserving a separate unconnected sibling draft in the same history transaction', async () => {
    const value = snapshot();
    const extra = structuredClone(owner(value));
    extra.id = 'target-other';
    extra.position = { x: 1700, y: 300 };
    extra.data.name = '另一个下游目标';
    const sibling = structuredClone(extra);
    sibling.id = 'sibling';
    sibling.position = { x: 2200, y: 300 };
    sibling.data.params = {
      ...sibling.data.params,
      modeType: 'text2image',
      prompt: '兄弟原文',
      imageList: [],
      imageListOrder: [],
      mixedListOrder: [],
    };
    value.nodes.push(extra, sibling);
    value.edges.push(
      ...value.edges.map((edge) => ({ ...edge, id: `${edge.id}-other`, target: extra.id })),
    );
    const canvas = await page(value);
    const before = graph(read());
    const firstDraft = '{{Image 1}} {{Image 2}}';
    pendingInput(canvas, firstDraft);
    const otherEditor = await selectedPrompt(canvas, extra.id);
    const otherDraft = '{{Image 2}} {{Portrait 3}}';
    otherEditor.textContent = otherDraft;
    fireEvent.input(otherEditor, { inputType: 'insertText' });
    const siblingEditor = await selectedPrompt(canvas, sibling.id);
    siblingEditor.textContent = '兄弟最新草稿';
    fireEvent.input(siblingEditor, { inputType: 'insertText' });
    await deleteSelected(canvas, 'second');
    const committed = graph(read());
    expect(owner().data.params.prompt).toBe(rawPrompt);
    expect(owner(read(), extra.id).data.params.prompt).toBe('{{Portrait 2}}');
    expect(owner(read(), sibling.id).data.params.prompt).toBe('兄弟最新草稿');
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'second'));
    await oneHistory(
      canvas,
      before,
      { target: firstDraft, [extra.id]: otherDraft, [sibling.id]: '兄弟最新草稿' },
      committed,
    );
  });

  it('retains an accepted deletion on quota failure and retries the same cleaned graph without a second history step', async () => {
    const canvas = await page();
    const before = graph(read());
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (blocked && key === storageKey) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, key, value);
    });
    const pending = '{{Image 1}} {{Image 2}}';
    pendingInput(canvas, pending);
    await deleteSelected(canvas, 'second');
    expect(canvas.node('second')).toBeNull();
    expect(graph(read())).toEqual(before);
    await act(async () => vi.advanceTimersByTime(700));
    expect(graph(read())).toEqual(before);
    blocked = false;
    fireEvent.click(screen.getByRole('button', { name: '重试保存画布' }));
    flush();
    const committed = graph(read());
    expect(owner().data.params.prompt).toBe(rawPrompt);
    expect(committed.nodes.map((node) => node.id)).toEqual([
      'first',
      'third',
      'target',
      'unrelated',
    ]);
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'second'));
    await oneHistory(canvas, before, { target: pending }, committed);
  });

  it('removes an upstream node and its media mentions, then restores the latest pending input in one undo', async () => {
    const canvas = await page();
    const before = graph(read());
    const pending = '{{Image 1}} {{Image 2}} {{Image 2}} {{Portrait 3}}';
    pendingInput(canvas, pending);
    await deleteSelected(canvas, 'second');
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual([
      'first',
      'third',
      'target',
      'unrelated',
    ]);
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'second'));
    expect(owner().data.params.prompt).toBe('{{Image 1}} {{Portrait 2}}');
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['first', 'third']);
    expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
      before.nodes.filter((node) => !['target', 'second'].includes(node.id)),
    );
    await act(async () => vi.advanceTimersByTime(200));
    flush();
    expect(graph(read())).toEqual(committed);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual({
      ...before,
      nodes: before.nodes.map((node) =>
        node.id === 'target'
          ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: pending } } }
          : node,
      ),
    });
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('expands an ordinary group UI deletion to every parentId descendant and cleans its downstream references', async () => {
    const value = snapshot();
    value.nodes[0].parentId = 'group';
    value.nodes[1].parentId = 'nested';
    value.nodes = [
      {
        id: 'group',
        type: 'group',
        position: { x: 10, y: 500 },
        width: 1000,
        height: 600,
        data: { type: 'group', name: '普通父组' },
      },
      {
        id: 'nested',
        type: 'group',
        parentId: 'group',
        position: { x: 450, y: 10 },
        width: 400,
        height: 400,
        data: { type: 'group', name: '嵌套组' },
      },
      ...value.nodes,
    ];
    const canvas = await page(value);
    const before = graph(read());
    const pending = '{{Image 1}} {{Image 2}} {{Image 3}}';
    pendingInput(canvas, pending);
    await deleteSelected(canvas, 'group');
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual(['third', 'target', 'unrelated']);
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source === 'third'));
    expect(owner().data.params.prompt).toBe('{{Image 1}}');
    expect(owner().data.params.imageList.map((item) => item.nodeId)).toEqual(['third']);
    await act(async () => vi.advanceTimersByTime(200));
    flush();
    expect(graph(read())).toEqual(committed);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual({
      ...before,
      nodes: before.nodes.map((node) =>
        node.id === 'target'
          ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: pending } } }
          : node,
      ),
    });
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });
});
