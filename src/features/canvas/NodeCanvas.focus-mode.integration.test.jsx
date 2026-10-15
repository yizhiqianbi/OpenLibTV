import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import App from '../../App.jsx';

const contentState = vi.hoisted(() => ({ modelsAvailable: true }));
// Only read-only public catalogue loading is injected. All App/router/Canvas,
// lazy generator, attachment, surfaces, controllers and storage/history are real.
vi.mock('../../hooks/useContent.ts', () => ({
  useData: (_name, fallback) => fallback,
  useContent: (name) => ({
    data:
      name === 'models'
        ? contentState.modelsAvailable
          ? models
          : null
        : name === 'image-model-support'
          ? imageSupport
          : name === 'video-model-support'
            ? videoSupport
            : name === 'script-text-support'
              ? scriptSupport
              : name === 'script-presets'
                ? presets
                : { items: [] },
    loading: name === 'models' && !contentState.modelsAvailable,
    error: null,
    reload: vi.fn(async () => {}),
  }),
}));

const projectId = 'focus-actual-app';
const key = `libtv.canvas.${projectId}`;
const sourceUrl = presets.characterToScript.characterImages[0];
const targetUrl = presets.characterToScript.characterImages[1];
const contentRect = { left: 100, top: 100, width: 320, height: 240, right: 420, bottom: 340 };
const read = (storageKey = key) => JSON.parse(localStorage.getItem(storageKey));
const target = (value = read()) => value.nodes.find((node) => node.id === 'target');
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const view = () =>
  document.querySelector('article[data-node-id="target"] .cv-inline-generator-body');
const generator = () => view().closest('.cv-inline-generator');
const input = () => within(view()).getByRole('textbox', { name: '提示词' });
const confirmBar = () => screen.getByRole('region', { name: '确认聚焦区域' });
const modeBar = () => screen.getByRole('region', { name: '聚焦编辑模式' });

function snapshot({
  saved = false,
  duplicateEdges = false,
  model = 'nebula-ultra',
  prompt = '',
} = {}) {
  const focusRegion = {
    nodeId: 'source',
    relX: 0.1,
    relY: 0.2,
    width: 0.4,
    height: 0.3,
    imageUrl: sourceUrl,
  };
  return {
    title: '实际聚焦流程验收',
    view: { x: 20, y: 10, z: 0.8 },
    nodes: [
      {
        id: 'target',
        type: 'image',
        position: { x: 650, y: 180 },
        width: 350,
        height: 230,
        data: {
          type: 'image',
          name: '聚焦生成器',
          action: 'image_generate',
          url: [targetUrl],
          params: {
            model,
            modeType: 'image2image',
            count: 1,
            prompt,
            settings: { quality: '2K', ratio: '16:9' },
            advancedSettings: { searchable: 1 },
            ...(saved ? { focusRegion, originImage: sourceUrl, scene: 'camera_focus' } : {}),
          },
        },
      },
      {
        id: 'source',
        type: 'image',
        position: { x: 80, y: 100 },
        width: 320,
        height: 240,
        data: {
          type: 'image',
          name: '参考图片',
          action: 'image_resource',
          url: [sourceUrl],
          resourceMeta: {
            items: [
              { kind: 'image', sourceUrl, width: 800, height: 600, byteSize: 12000, format: 'png' },
            ],
          },
        },
      },
      {
        id: 'text',
        type: 'text',
        position: { x: 1000, y: 100 },
        width: 160,
        height: 100,
        data: { type: 'text', name: '无关文字', action: 'text_resource', content: ['不参与聚焦'] },
      },
    ],
    edges: saved
      ? [
          { id: 'original-focus-edge', source: 'source', target: 'target' },
          ...(duplicateEdges
            ? [
                {
                  id: 'retained-duplicate',
                  source: 'source',
                  target: 'target',
                  data: { retained: true },
                },
              ]
            : []),
        ]
      : [],
  };
}

function capture(element) {
  const ids = new Set();
  element.setPointerCapture = vi.fn((id) => ids.add(id));
  element.releasePointerCapture = vi.fn((id) => ids.delete(id));
  element.hasPointerCapture = vi.fn((id) => ids.has(id));
}
function pointer(element, type, x, y, pointerId = 11) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}
function editPrompt(value) {
  const editor = input();
  editor.textContent = value;
  fireEvent.input(editor, { inputType: 'insertText' });
}
function navigate(url) {
  act(() => {
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}
async function page(value = snapshot(), { readonly = false, preserve = false } = {}) {
  if (!preserve) localStorage.setItem(key, JSON.stringify(value));
  window.history.replaceState(
    {},
    '',
    `${readonly ? '/canvas/share' : '/canvas'}?projectId=${projectId}`,
  );
  const mounted = render(<App />);
  const node = (id) => mounted.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(node('target')).not.toBeNull(), { timeout: 5000 });
  const board = mounted.container.querySelector('.cv-board');
  capture(board);
  fireEvent.click(node('target'));
  // Await the genuine dynamically loaded implementation, not its entry fallback.
  await waitFor(() => expect(view()).not.toBeNull(), { timeout: 5000 });
  return {
    ...mounted,
    node,
    board,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}
async function enter(canvas, edit = false) {
  fireEvent.click(
    within(view()).getByRole('button', { name: edit ? '编辑聚焦区域' : '聚焦', exact: true }),
  );
  await waitFor(() => expect(modeBar()).not.toBeNull());
  expect(canvas.node('target').querySelector('[data-focus-mode-placeholder]')).not.toBeNull();
  return canvas.node('source').querySelector('[data-focus-surface]');
}
function draw(canvas, surface, { end = true } = {}) {
  pointer(surface, 'pointerdown', 132, 148);
  pointer(canvas.board, 'pointermove', 292, 268);
  if (end) pointer(canvas.board, 'pointerup', 292, 268);
}
async function chooseModel(modelKey) {
  fireEvent.click(within(generator()).getByRole('button', { name: '选择生成模型' }));
  const schema = models.imageModels[modelKey];
  const name = schema.aliasName || schema.modelName || modelKey;
  const option = within(await screen.findByRole('listbox', { name: '生成模型' }))
    .getAllByRole('option')
    .find((item) => item.textContent.includes(name));
  expect(option).toBeDefined();
  fireEvent.click(option);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  contentState.modelsAvailable = true;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.matches('[data-focus-surface]')) return contentRect;
    return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 };
  });
  // JS DOM media geometry/crop fixtures. They do not synthesize recognition or generation.
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 800;
      naturalHeight = 600;
      removeAttribute() {
        this.onload = null;
      }
      set src(value) {
        this.value = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() {
        return this.value;
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,cHJldmlldy1maXh0dXJl',
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('actual App focus mode, generator, history and local document', () => {
  // The real cold App and lazy generator each have a bounded 5s readiness wait.
  // Their combined startup must fit the case budget under concurrent full checks.
  it('opens the genuine supported entry, preserves owner input, and prevents focus on its own image or text', async () => {
    const canvas = await page();
    flush();
    const original = graph(read());
    const surface = await enter(canvas);
    expect(surface).not.toBeNull();
    expect(canvas.node('target').querySelector('[data-focus-surface]')).toBeNull();
    expect(canvas.node('text').querySelector('[data-focus-surface]')).toBeNull();
    expect(within(view()).getByRole('textbox', { name: '提示词' })).not.toBeNull();
    fireEvent.click(canvas.node('target'));
    fireEvent.click(canvas.node('text'));
    flush();
    expect(graph(read())).toEqual(original);
    expect(read().view).toEqual(snapshot().view);
    expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
    expect(canvas.node('source').classList.contains('cv-selected')).toBe(false);
  }, 15_000);

  it('confirms seven real ratios with the last150ms prompt in one graph history step, restores it with redo and refresh', async () => {
    const canvas = await page();
    const surface = await enter(canvas);
    draw(canvas, surface);
    const bar = await screen.findByRole('region', { name: '确认聚焦区域' }, { timeout: 5000 });
    // Start the draft race after the genuine lazy tool is ready, not during import.
    editPrompt('最后150ms尚未回调的提示词');
    const ratios = ['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'];
    for (const ratio of ratios)
      fireEvent.click(within(bar).getByRole('button', { name: ratio, exact: true }));
    fireEvent.click(within(bar).getByRole('button', { name: '确认', exact: true }));
    await waitFor(() => expect(screen.queryByRole('region', { name: '聚焦编辑模式' })).toBeNull());
    flush();
    const committed = read();
    const params = target(committed).data.params;
    expect(params.prompt).toBe('最后150ms尚未回调的提示词');
    expect(params.scene).toBe('camera_focus');
    expect(params.originImage).toBe(sourceUrl);
    expect(params.focusRegion.nodeId).toBe('source');
    expect(params.focusRegion.imageUrl).toBe(sourceUrl);
    expect(params.focusRegion.relX).toBeCloseTo(0.1);
    expect(params.focusRegion.relY).toBeCloseTo(0.2);
    expect((params.focusRegion.width / params.focusRegion.height) * (4 / 3)).toBeCloseTo(9 / 16);
    expect(params.settings.ratio).toBe('9:16');
    expect(params.advancedSettings.searchable).toBe(1);
    expect(committed.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'source', target: 'target' },
    ]);
    expect(target(committed).data.action).toBe('image_generate');
    expect(target(committed).data.url).toEqual([targetUrl]);
    expect(committed.view.z).toBe(0.8);
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.focusRegion).toBeUndefined();
    expect(target().data.params.prompt).toBe('最后150ms尚未回调的提示词');
    expect(read().edges).toEqual([]);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(target().data.params.focusRegion).toEqual(params.focusRegion);
    expect(read().edges).toEqual(committed.edges);
    canvas.unmount();
    const restored = await page(undefined, { preserve: true });
    expect(within(view()).getByRole('button', { name: '编辑聚焦区域' })).not.toBeNull();
    expect(input().textContent).toBe('最后150ms尚未回调的提示词');
    expect(target().data.params.focusRegion).toEqual(params.focusRegion);
    restored.unmount();
  });

  it('cancels a changed pending region and consumes Escape in two layers without clearing the saved region', async () => {
    const canvas = await page(snapshot({ saved: true }));
    flush();
    const before = graph(read());
    let surface = await enter(canvas, true);
    draw(canvas, surface);
    fireEvent.click(within(confirmBar()).getByRole('button', { name: '取消', exact: true }));
    expect(modeBar()).not.toBeNull();
    expect(screen.queryByRole('region', { name: '确认聚焦区域' })).toBeNull();
    flush();
    expect(graph(read())).toEqual(before);
    surface = canvas.node('source').querySelector('[data-focus-surface]');
    draw(canvas, surface, { end: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(modeBar()).not.toBeNull();
    pointer(canvas.board, 'pointerup', 380, 330);
    expect(screen.queryByRole('region', { name: '确认聚焦区域' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '聚焦编辑模式' })).toBeNull();
    flush();
    expect(graph(read())).toEqual(before);
  });

  it('edits the stored card and deletes only the first source edge in one undoable transaction', async () => {
    const canvas = await page(
      snapshot({ saved: true, duplicateEdges: true, prompt: '保存的文字' }),
    );
    flush();
    const before = read();
    await enter(canvas, true);
    fireEvent.click(within(modeBar()).getByRole('button', { name: '退出聚焦模式' }));
    fireEvent.click(within(view()).getByRole('button', { name: '删除聚焦区域' }));
    flush();
    expect(target().data.params.focusRegion).toBeUndefined();
    expect(target().data.params.originImage).toBeUndefined();
    expect(target().data.params.scene).toBeUndefined();
    expect(target().data.params.prompt).toBe('保存的文字');
    expect(read().edges).toEqual([before.edges[1]]);
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.focusRegion).toEqual(target(before).data.params.focusRegion);
    expect(read().edges).toEqual(before.edges);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('downgrades through the real model menu and clears focus fields/first edge once while retaining input', async () => {
    const canvas = await page(snapshot({ saved: true, prompt: '模型变更保留的提示词' }));
    flush();
    const before = read();
    await chooseModel('lib-image-2.5-s');
    flush();
    expect(target().data.params.model).toBe('lib-image-2.5-s');
    expect(target().data.params.focusRegion).toBeUndefined();
    expect(target().data.params.originImage).toBeUndefined();
    expect(target().data.params.scene).toBeUndefined();
    expect(target().data.params.prompt).toBe('模型变更保留的提示词');
    expect(read().edges).toEqual([]);
    expect(within(view()).queryByRole('button', { name: '聚焦', exact: true })).toBeNull();
    expect(within(view()).queryByRole('button', { name: '编辑聚焦区域' })).toBeNull();
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.model).toBe('nebula-ultra');
    expect(target().data.params.focusRegion).toEqual(target(before).data.params.focusRegion);
    expect(read().edges).toEqual(before.edges);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('allows an empty focus prompt but accurately blocks the unconnected generation service', async () => {
    await page(snapshot({ saved: true, prompt: '' }));
    expect(input().textContent).toBe('');
    const button = within(generator()).getByRole('button', { name: '生成', exact: true });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    flush();
    expect(target().data.generationError).toBe('生成服务未连接，提示词已保留。');
    expect(target().data.params.focusRegion).toBeDefined();
    expect(target().data.taskInfo).toBeUndefined();
    expect(screen.getByText('生成服务未连接，暂时无法生成')).not.toBeNull();
    expect(screen.queryByText(/请先输入提示词|请输入提示词或添加参考素材/)).toBeNull();
  });

  it.each(['readonly', 'no-schema', 'unsupported'])(
    'hides focus in the actual %s caller instead of exposing a fake mode',
    async (kind) => {
      if (kind === 'no-schema') contentState.modelsAvailable = false;
      const canvas = await page(
        snapshot({ model: kind === 'unsupported' ? 'lib-image-2.5-s' : 'nebula-ultra' }),
        { readonly: kind === 'readonly' },
      );
      expect(within(view()).queryByRole('button', { name: '聚焦', exact: true })).toBeNull();
      expect(within(view()).queryByRole('button', { name: '编辑聚焦区域' })).toBeNull();
      expect(screen.queryByRole('region', { name: '聚焦编辑模式' })).toBeNull();
      fireEvent.click(canvas.node('source'));
      flush();
      expect(read().edges).toEqual([]);
      expect(target().data.params.focusRegion).toBeUndefined();
    },
  );

  it.each([
    [
      'standalone image grid',
      { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true },
      false,
    ],
    ['ordinary group', {}, true],
    [
      'script-linked image grid',
      {
        storyboardGroupType: 'image',
        standaloneStoryboardImageGrid: true,
        sourceScriptNodeId: 'historical-script',
      },
      true,
    ],
  ])(
    'honors source parent eligibility for an actual %s owner',
    async (_kind, parentData, available) => {
      const value = snapshot();
      value.nodes[0].parentId = 'owner-group';
      value.nodes.unshift({
        id: 'owner-group',
        type: 'group',
        position: { x: 0, y: 0 },
        width: 1100,
        height: 600,
        data: { type: 'group', name: '生成器所在组', childNodeIds: ['target'], ...parentData },
      });
      const canvas = await page(value);
      flush();
      const before = graph(read());
      const button = within(view()).queryByRole('button', { name: '聚焦', exact: true });
      if (available) {
        expect(button).not.toBeNull();
        const surface = await enter(canvas);
        expect(surface).not.toBeNull();
        expect(canvas.node('target').querySelector('[data-focus-surface]')).toBeNull();
        fireEvent.click(within(modeBar()).getByRole('button', { name: '退出聚焦模式' }));
      } else {
        expect(button).toBeNull();
        expect(screen.queryByRole('region', { name: '聚焦编辑模式' })).toBeNull();
      }
      flush();
      expect(graph(read())).toEqual(before);
    },
  );

  it('retires a captured draw on actual route/document replacement and rejects late old pointerup writes', async () => {
    const canvas = await page();
    const oldSurface = await enter(canvas);
    draw(canvas, oldSurface, { end: false });
    const oldBoard = canvas.board;
    const otherId = 'focus-next-document';
    const otherKey = `libtv.canvas.${otherId}`;
    const replacement = snapshot({ model: 'nebula-2-flash', prompt: '新文档输入' });
    replacement.title = '新的聚焦文档';
    replacement.nodes[1].data.url = [targetUrl];
    localStorage.setItem(otherKey, JSON.stringify(replacement));
    navigate(`/canvas?projectId=${otherId}`);
    await waitFor(() => expect(screen.getByText('新的聚焦文档')).not.toBeNull());
    expect(screen.queryByRole('region', { name: '聚焦编辑模式' })).toBeNull();
    pointer(oldBoard, 'pointerup', 400, 330);
    pointer(oldSurface, 'pointermove', 400, 330);
    fireEvent.keyDown(document, { key: 'Enter' });
    flush();
    expect(read(otherKey).edges).toEqual([]);
    expect(target(read(otherKey)).data.params.prompt).toBe('新文档输入');
    expect(target(read(otherKey)).data.params.focusRegion).toBeUndefined();
    expect(target().data.params.focusRegion).toBeUndefined();
    expect(read().edges).toEqual([]);
  });
});
