import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const projectId = 'actual-storyboard-edge-unlink';
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
  const script = createCanvasScriptNode({
    type: 'script',
    id: 'script',
    label: '旧脚本关联断线',
    position: { x: 50, y: 200 },
    models,
  });
  script.data = {
    ...script.data,
    params: { ...script.data.params, prompt: '旧脚本原始普通提示词', settings: { retained: true } },
    linkedImageGroupId: 'story-group',
    linkedVideoGroupId: 'other-video-group',
    rows: [10, 30].map((shotNumber, index) => ({
      id: `row-${index}`,
      hiddenUuid: `hidden-${index}`,
      shotNumber,
      durationSeconds: 5,
      plotDescription: '保留原剧情',
      imageGenerationPrompt: '保留原图片提示词',
      videoMotionPrompt: '保留原视频提示词',
      characters: [],
      scenes: [],
      props: [],
    })),
  };
  const group = {
    id: 'story-group',
    type: 'group',
    position: { x: 1000, y: 400 },
    width: 980,
    height: 450,
    data: {
      type: 'group',
      name: '已关联分镜图组',
      sourceScriptNodeId: script.id,
      sourceScriptVersion: 'v1',
      storyboardTitle: '旧脚本关联分镜图',
      storyboardGroupType: 'image',
      storyboardSourceRowHiddenUuids: ['hidden-0', 'hidden-1'],
      childNodeIds: ['shot-0', 'shot-1'],
    },
  };
  const children = [0, 1].map((index) => ({
    id: `shot-${index}`,
    type: 'image',
    parentId: group.id,
    extent: 'parent',
    position: { x: 20 + index * 400, y: 30 },
    width: 350,
    height: 230,
    data: {
      type: 'image',
      name: `分镜图-#${index + 1}`,
      action: 'image_resource',
      url: ['/assets/16921729b1e11174.webp'],
      scriptRowHiddenUuid: `hidden-${index}`,
    },
  }));
  const unrelated = {
    id: 'unrelated',
    type: 'text',
    position: { x: 2200, y: 200 },
    width: 260,
    height: 160,
    data: {
      type: 'text',
      name: '保留无关文本',
      action: 'text_resource',
      content: ['不能改变无关数据'],
    },
  };
  return {
    title: '真实分镜断线专项',
    view: { x: -30, y: 17, z: 0.8 },
    nodes: [script, group, ...children, unrelated],
    edges: [{ id: 'story-link', source: script.id, target: group.id }],
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
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  fireEvent.click(node('story-group'));
  flush();
  expect(undo().disabled).toBe(true);
  return { ...canvas, node };
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

function unlinkExpected(
  before,
  {
    scripts = new Map([['script', 'linkedImageGroupId']]),
    groups = new Set(['story-group']),
    prompt,
  } = {},
) {
  return {
    nodes: before.nodes.map((node) => {
      let data = node.data;
      if (scripts.has(node.id)) {
        data = { ...data };
        delete data[scripts.get(node.id)];
      }
      if (groups.has(node.id)) {
        data = { ...data };
        delete data.sourceScriptNodeId;
        delete data.storyboardTitle;
      }
      if (node.id === 'draft-media' && prompt !== undefined)
        data = { ...data, params: { ...data.params, prompt } };
      return data === node.data ? node : { ...node, data };
    }),
    edges: before.edges.filter((edge) => edge.id !== 'story-link'),
  };
}

function exactHistory(before, expected) {
  fireEvent.click(undo());
  flush();
  expect(graph(read())).toEqual(before);
  expect(undo().disabled).toBe(true);
  fireEvent.click(redo());
  flush();
  expect(graph(read())).toEqual(expected);
  expect(redo().disabled).toBe(true);
}

function confirmDisconnect() {
  const dialog = screen.getByRole('dialog', { name: '断开连线' });
  fireEvent.click(within(dialog).getByRole('button', { name: '确定断开' }));
}

describe('actual legacy SCRIPT / GROUP edge unlink contract', () => {
  it('normalizes both endpoints old label aliases when unlinking, preserving unrelated stored data and old task info', async () => {
    const value = snapshot();
    value.nodes[0].data = {
      ...value.nodes[0].data,
      name: '',
      label: '旧label脚本标题',
      oldNullable: null,
      oldUndefined: undefined,
      unrelatedMetadata: { nested: 'script-kept' },
      taskInfo: { loading: false, taskId: 'historical-script-task', status: 2 },
    };
    value.nodes[1].data = {
      ...value.nodes[1].data,
      name: '',
      label: '旧label分镜图标题',
      oldNullable: null,
      oldUndefined: undefined,
      unrelatedMetadata: { nested: 'group-kept' },
      taskInfo: { loading: false, taskId: 'historical-group-task', status: 2 },
    };
    const canvas = await page(value),
      before = graph(read());
    // localStorage JSON cannot carry undefined own-properties. Pure model tests
    // cover that raw-store distinction; this App checks all stored-visible data.
    expect(before.nodes[0].data).not.toHaveProperty('oldUndefined');
    expect(before.nodes[1].data).not.toHaveProperty('oldUndefined');
    await disconnect(canvas);
    confirmDisconnect();
    flush();
    const expected = unlinkExpected(before);
    expected.nodes = expected.nodes.map((node) => {
      if (!['script', 'story-group'].includes(node.id)) return node;
      const { label, ...data } = node.data;
      return { ...node, data: { ...data, name: label } };
    });
    expect(graph(read())).toEqual(expected);
    expect(read().nodes[0].data.taskInfo).not.toHaveProperty('ownerUserId');
    expect(read().nodes[1].data.taskInfo).not.toHaveProperty('ownerUserId');
    exactHistory(before, expected);
  });

  it('gives editing-continuation target removal priority over an otherwise eligible legacy disconnect warning', async () => {
    const value = snapshot();
    value.nodes[1].data.params = {
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'script' },
      prompt: '保持原target普通提示词',
    };
    const canvas = await page(value),
      before = graph(read());
    await disconnect(canvas);
    flush();
    expect.soft(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    const expected = {
      nodes: before.nodes
        .filter((node) => node.id !== 'story-group')
        .map((node) => {
          if (node.id === 'script') {
            const { linkedImageGroupId: _link, ...data } = node.data;
            return { ...node, data };
          }
          if (node.parentId === 'story-group') {
            const { parentId: _parent, extent: _extent, ...retained } = node;
            return {
              ...retained,
              position: { x: 1000 + node.position.x, y: 400 + node.position.y },
            };
          }
          return node;
        }),
      edges: [],
    };
    expect.soft(graph(read())).toEqual(expected);
    expect.soft(canvas.node('story-group')).toBeNull();
    expect(canvas.node('shot-0')).toBeTruthy();
    expect(canvas.node('shot-1')).toBeTruthy();
    if (screen.queryByRole('dialog', { name: '断开连线' })) return;
    exactHistory(before, expected);
  });

  it('also confirms a reversed GROUP to SCRIPT edge and preserves the unmatched video link', async () => {
    const value = snapshot();
    value.edges[0] = { ...value.edges[0], source: 'story-group', target: 'script' };
    const canvas = await page(value),
      before = graph(read());
    await disconnect(canvas);
    expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    confirmDisconnect();
    flush();
    const expected = unlinkExpected(before);
    expect(graph(read())).toEqual(expected);
    exactHistory(before, expected);
  });

  it('direct infer clears only image when both script link fields point to this same group, irrespective of video metadata', async () => {
    const value = snapshot();
    value.nodes[0].data.linkedVideoGroupId = 'story-group';
    value.nodes[1].data.storyboardGroupType = 'video';
    const canvas = await page(value),
      before = graph(read());
    await disconnect(canvas);
    confirmDisconnect();
    flush();
    const expected = unlinkExpected(before);
    expect(graph(read())).toEqual(expected);
    expect(read().nodes[0].data.linkedVideoGroupId).toBe('story-group');
    exactHistory(before, expected);
  });

  it.each(['video', 'image'])(
    'GROUP to GROUP warning uses hidden-row eligibility while unlink cleans only each video group (%s target)',
    async (targetKind) => {
      const value = snapshot();
      const scriptA = value.nodes[0],
        sourceGroup = value.nodes[1];
      scriptA.data.linkedImageGroupId = 'preserved-image-a';
      scriptA.data.linkedVideoGroupId = sourceGroup.id;
      sourceGroup.data.storyboardGroupType = 'video';
      const scriptB = structuredClone(scriptA);
      scriptB.id = 'script-b';
      scriptB.position = { x: 50, y: 900 };
      scriptB.data.name = '第二个关联脚本';
      scriptB.data.linkedImageGroupId = 'preserved-image-b';
      scriptB.data.linkedVideoGroupId = 'target-group';
      const targetGroup = structuredClone(sourceGroup);
      targetGroup.id = 'target-group';
      targetGroup.position = { x: 2100, y: 700 };
      targetGroup.data = {
        ...targetGroup.data,
        name: '另一分镜组',
        sourceScriptNodeId: scriptB.id,
        storyboardTitle: '另一关联标题',
        storyboardGroupType: targetKind,
        childNodeIds: [],
        storyboardSourceRowHiddenUuids: ['another-hidden-row'],
      };
      value.nodes.push(scriptB, targetGroup);
      value.edges = [{ id: 'story-link', source: sourceGroup.id, target: targetGroup.id }];
      const canvas = await page(value),
        before = graph(read());
      await disconnect(canvas);
      expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
      flush();
      expect(graph(read())).toEqual(before);
      expect(undo().disabled).toBe(true);
      confirmDisconnect();
      flush();
      const expected = unlinkExpected(before, {
        scripts: new Map([
          ['script', 'linkedVideoGroupId'],
          ...(targetKind === 'video' ? [['script-b', 'linkedVideoGroupId']] : []),
        ]),
        groups: new Set(['story-group', ...(targetKind === 'video' ? ['target-group'] : [])]),
      });
      expect(graph(read())).toEqual(expected);
      exactHistory(before, expected);
    },
  );

  it('direct SCRIPT_V2 to GROUP stays ordinary without inventing source warning or unlink compatibility', async () => {
    const value = snapshot();
    value.nodes[0].type = 'script-v2';
    value.nodes[0].data.type = 'script-v2';
    value.nodes[1].data.sourceScriptVersion = 'v2';
    const canvas = await page(value),
      before = graph(read());
    await disconnect(canvas);
    flush();
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    const expected = { ...before, edges: [] };
    expect(graph(read())).toEqual(expected);
    exactHistory(before, expected);
  });

  it('projects a still-active sibling 150ms input and preserves all raw script rows in the same unlink history and save', async () => {
    const value = snapshot();
    const media = {
      id: 'draft-media',
      type: 'image',
      position: { x: 2200, y: 700 },
      width: 350,
      height: 230,
      data: {
        type: 'image',
        name: '正在输入的无关生成器',
        action: 'image_generate',
        generationError: '',
        params: {
          model: 'flux-2-pro',
          modeType: 'text2image',
          prompt: '原始 sibling 输入',
          count: 1,
          settings: { ratio: '16:9' },
        },
      },
    };
    value.nodes.push(media);
    media.data.params = resolveNodeGenerator(media, value.nodes, value.edges, models).params;
    const canvas = await page(value);
    fireEvent.click(canvas.node(media.id));
    const frame = () => canvas.node(media.id).querySelector('.cv-inline-generator');
    await waitFor(() =>
      expect(within(frame()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
    );
    const input = within(frame()).getByRole('textbox', { name: '提示词' });
    flush();
    const before = graph(read());
    const scissors = await armDisconnect(canvas);
    const pending = '确认断线之前最后一次 sibling 输入';
    input.textContent = pending;
    fireEvent.input(input, { inputType: 'insertText' });
    expect(readPromptDOM(input)).toBe(pending);
    expect(read().nodes.find((node) => node.id === media.id).data.params.prompt).toBe(
      '原始 sibling 输入',
    );
    fireEvent.click(scissors);
    confirmDisconnect();
    flush();
    const expected = unlinkExpected(before, { prompt: pending });
    expect(graph(read())).toEqual(expected);
    expect(canvas.node(media.id).classList.contains('cv-selected')).toBe(true);
    expect(within(frame()).getByRole('textbox', { name: '提示词' })).toBe(input);
    await act(async () => vi.advanceTimersByTime(200));
    flush();
    expect(graph(read())).toEqual(expected);
    const baseline = {
      ...before,
      nodes: before.nodes.map((node) =>
        node.id === media.id
          ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: pending } } }
          : node,
      ),
    };
    exactHistory(baseline, expected);
  });

  it('retains an accepted unlink graph during quota failure and retries only saving without another unlink/history', async () => {
    const canvas = await page(),
      before = graph(read());
    await disconnect(canvas);
    expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (blocked && key === storageKey) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, key, value);
    });
    confirmDisconnect();
    flush();
    expect(canvas.container.querySelectorAll('.cv-edge-hit')).toHaveLength(0);
    expect(graph(read())).toEqual(before);
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    blocked = false;
    fireEvent.click(screen.getByRole('button', { name: '重试保存画布' }));
    flush();
    const expected = unlinkExpected(before);
    expect(graph(read())).toEqual(expected);
    exactHistory(before, expected);
  });

  it('preserves fresh raw row edits from the actual legacy table and restores them on the first unlink undo', async () => {
    const canvas = await page(),
      original = graph(read());
    const rowInput = await screen.findByRole('textbox', { name: '画面描述 10' });
    const pending = '断线前最后修改的原始脚本剧情';
    fireEvent.change(rowInput, { target: { value: pending } });
    await act(async () => {
      fireEvent.blur(rowInput);
      await Promise.resolve();
    });
    flush();
    const before = graph(read());
    expect(before).toEqual({
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === 'script'
          ? {
              ...node,
              data: {
                ...node.data,
                rows: node.data.rows.map((row) =>
                  row.id === 'row-0' ? { ...row, plotDescription: pending } : row,
                ),
              },
            }
          : node,
      ),
    });
    await disconnect(canvas);
    expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
    confirmDisconnect();
    flush();
    const expected = unlinkExpected(before);
    expect(graph(read())).toEqual(expected);
    fireEvent.click(undo());
    flush();
    expect(graph(read())).toEqual(before);
    // This earlier table edit legitimately owns a separate history entry.
    fireEvent.click(undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(undo().disabled).toBe(true);
    fireEvent.click(redo());
    flush();
    expect(graph(read())).toEqual(before);
    fireEvent.click(redo());
    flush();
    expect(graph(read())).toEqual(expected);
    expect(redo().disabled).toBe(true);
  });

  it('asks the source disconnect warning before any mutation, and cancellation preserves the complete graph and history', async () => {
    const canvas = await page(),
      before = graph(read());
    canvas.node('story-group').focus();
    await disconnect(canvas);
    const dialog = screen.queryByRole('dialog', { name: '断开连线' });
    // Soft assertions retain both missing-confirmation and eager-write evidence
    // before production is fixed; a successful run still requires every assertion.
    expect.soft(dialog).toBeTruthy();
    if (dialog) {
      expect(
        within(dialog).getByText(
          '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
        ),
      ).toBeTruthy();
      expect(within(dialog).getByRole('button', { name: '确定断开' })).toBeTruthy();
      expect(within(dialog).queryByRole('button', { name: '关闭' })).toBeNull();
      fireEvent.mouseDown(dialog.closest('.cv-modal-overlay'));
      expect(screen.getByRole('dialog', { name: '断开连线' })).toBe(dialog);
    }
    flush();
    expect.soft(graph(read())).toEqual(before);
    expect.soft(undo().disabled).toBe(true);
    if (dialog) fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    flush();
    expect.soft(graph(read())).toEqual(before);
    expect.soft(undo().disabled).toBe(true);
    expect(canvas.node('story-group').classList.contains('cv-selected')).toBe(true);
    if (dialog) expect(document.activeElement).toBe(canvas.node('story-group'));
  });

  it('Escape cancels the disconnect modal and restores the selected group opener with zero history', async () => {
    const canvas = await page(),
      before = graph(read());
    canvas.node('story-group').focus();
    await disconnect(canvas);
    expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    flush();
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    expect(canvas.node('story-group').classList.contains('cv-selected')).toBe(true);
    expect(document.activeElement).toBe(canvas.node('story-group'));
  });

  it('retires a pending disconnect when the real route switches to another document with the same IDs', async () => {
    const canvas = await page(),
      before = graph(read());
    await disconnect(canvas);
    expect(screen.getByRole('dialog', { name: '断开连线' })).toBeTruthy();
    // Hover has finished and the modal owns the UI. The route loader and
    // waitFor retain their original real scheduler for this owner regression.
    vi.useRealTimers();
    const otherProject = `${projectId}-other`,
      otherKey = `libtv.canvas.${otherProject}`;
    const other = snapshot();
    other.title = '同ID的新文档';
    other.nodes[0].data.params.prompt = '新文档独立脚本输入';
    other.nodes[1].data.storyboardTitle = '新文档独立关联标题';
    localStorage.setItem(otherKey, JSON.stringify(other));
    await act(async () => {
      canvas.rerender(
        <NodeCanvas path={`/canvas?projectId=${otherProject}`} user={LOCAL_WORKSPACE_USER} />,
      );
    });
    await waitFor(() => expect(screen.getByRole('button', { name: '同ID的新文档' })).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    flush();
    expect(graph(JSON.parse(localStorage.getItem(otherKey)))).toEqual(graph(other));
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
  });

  it('clears only the matching script link and group source/title after confirmation, preserving rows and every node in one undo/redo', async () => {
    const canvas = await page(),
      before = graph(read());
    await disconnect(canvas);
    const dialog = screen.queryByRole('dialog', { name: '断开连线' });
    expect.soft(dialog).toBeTruthy();
    if (dialog) fireEvent.click(within(dialog).getByRole('button', { name: '确定断开' }));
    flush();
    const committed = graph(read());
    const expected = {
      nodes: before.nodes.map((node) => {
        if (node.id === 'script') {
          const { linkedImageGroupId: _linked, ...data } = node.data;
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
    expect.soft(committed).toEqual(expected);
    expect(committed.nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
    fireEvent.click(undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    fireEvent.click(redo());
    flush();
    expect.soft(graph(read())).toEqual(expected);
    expect(redo().disabled).toBe(true);
  });
});
