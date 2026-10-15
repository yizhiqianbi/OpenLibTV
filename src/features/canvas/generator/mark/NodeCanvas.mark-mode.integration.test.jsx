import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../../public/data/models.json';
import imageSupport from '../../../../../public/data/image-model-support.json';
import videoSupport from '../../../../../public/data/video-model-support.json';
import scriptSupport from '../../../../../public/data/script-text-support.json';
import presets from '../../../../../public/data/script-presets.json';
import App from '../../../../App.jsx';
import NodeCanvas from '../../NodeCanvas.jsx';
import { LOCAL_WORKSPACE_USER } from '../../../../services/workspace-access.ts';
import { createCanvasMarkSource } from '../../../../services/canvas-mark-source.js';

const contentState = vi.hoisted(() => ({ modelsAvailable: true }));
// Only read-only public catalogue loading is injected. App/router, NodeCanvas,
// lazy mark/generator, prompt, history and persistence implementations are real.
vi.mock('../../../../hooks/useContent.ts', () => ({
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

const projectId = 'mark-actual-canvas';
const key = `libtv.canvas.${projectId}`;
const sourceUrl = presets.characterToScript.characterImages[0];
const targetUrl = presets.characterToScript.characterImages[1];
// Original publicly archived focus tutorial is a representative video result.
const videoUrl =
  'https://libtv-res.liblib.art/upload-images/4e303b89c099425a93084d50cdcb10f4/e5d71224e151896d9ead9955953984aff3f293e4.mp4';
const rect = { left: 100, top: 100, width: 320, height: 240, right: 420, bottom: 340 };
const read = (storageKey = key) => JSON.parse(localStorage.getItem(storageKey));
const target = (value = read()) => value.nodes.find((node) => node.id === 'target');
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const frame = () => document.querySelector('.cv-inline-generator[aria-label="标记生成器"]');
const input = () => within(frame()).getByRole('textbox', { name: '提示词' });
const bar = () => screen.getByRole('region', { name: '元素选择模式', hidden: true });
const identity = (url) => url;
// Synthetic source responses and raw-base64 reader are legitimate injected test
// adapters. They never enter production defaults or represent actual recognition.
const suggestions = [
  { label: '人物', bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 } },
  { label: '外套', bbox: { x: 0.2, y: 0.3, width: 0.2, height: 0.3 } },
];
const response = (id = 'recognized') => ({ id, suggestions });
const rawBase64 = 'c3ludGhldGljLXRlc3QtcG5n';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const sourceFixture = (readResponse = async () => response()) => {
  const recognize = vi.fn(readResponse);
  return { source: createCanvasMarkSource({ markClickSuggest: recognize }), recognize };
};
const readerFixture = () => vi.fn(async () => rawBase64);

function pointer(element, type, x, y) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: 21 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function snapshot({ type = 'image', model, prompt = '原有文字', magicList } = {}) {
  const isVideo = type === 'video';
  return {
    title: '实际元素选择流程',
    view: { x: 20, y: 10, z: 0.8 },
    edges: [],
    nodes: [
      {
        id: 'target',
        type,
        position: { x: 650, y: 180 },
        width: 350,
        height: 230,
        data: {
          type,
          name: '标记生成器',
          action: isVideo ? 'video_generate' : 'image_generate',
          url: [isVideo ? videoUrl : targetUrl],
          params: {
            model: model || (isVideo ? 'motion-3-prime' : 'nebula-ultra'),
            modeType: isVideo ? 'singleImage2video' : 'image2image',
            count: 1,
            prompt,
            settings: isVideo
              ? { ratio: '16:9', resolution: '1080p', duration: 8 }
              : { quality: '2K', ratio: '16:9' },
            advancedSettings: isVideo ? {} : { searchable: 1 },
            ...(magicList ? { magicList } : {}),
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
              { kind: 'image', sourceUrl, width: 640, height: 480, byteSize: 12000, format: 'png' },
            ],
          },
        },
      },
      {
        id: 'unrelated',
        type: 'text',
        position: { x: 1000, y: 100 },
        width: 160,
        height: 100,
        data: { type: 'text', name: '无关文字', action: 'text_resource', content: ['不参与标记'] },
      },
    ],
  };
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
async function page(
  value = snapshot(),
  { app = true, source, reader, readonly = false, preserve = false } = {},
) {
  if (!preserve) localStorage.setItem(key, JSON.stringify(value));
  const path = `${readonly ? '/canvas/share' : '/canvas'}?projectId=${projectId}`;
  window.history.replaceState({}, '', path);
  const toast = vi.fn();
  const element = (nextPath = path, extra = {}) => (
    <NodeCanvas
      path={nextPath}
      user={LOCAL_WORKSPACE_USER}
      asset={identity}
      toast={toast}
      markSource={source}
      markImageReader={reader}
      {...extra}
    />
  );
  const mounted = render(app ? <App /> : element());
  const node = (id) => mounted.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(node('target')).not.toBeNull(), { timeout: 5000 });
  const board = mounted.container.querySelector('.cv-board');
  const captures = new Set();
  board.setPointerCapture = vi.fn((id) => captures.add(id));
  board.hasPointerCapture = vi.fn((id) => captures.has(id));
  board.releasePointerCapture = vi.fn((id) => captures.delete(id));
  fireEvent.click(node('target'));
  await waitFor(() => expect(frame()).not.toBeNull(), { timeout: 5000 });
  return {
    ...mounted,
    board,
    node,
    toast,
    element,
    surface: (id = 'source') => node(id).querySelector('[data-mark-surface]'),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}
async function enter() {
  fireEvent.click(within(frame()).getByRole('button', { name: '标记', exact: true }));
  await waitFor(() => expect(bar()).not.toBeNull(), { timeout: 5000 });
}
const pick = (canvas, id = 'source') =>
  fireEvent.click(canvas.surface(id), { clientX: 148, clientY: 148, button: 0, detail: 1 });
async function recognized(canvas, id = 'source', label = '人物') {
  pick(canvas, id);
  await waitFor(() =>
    expect(
      within(canvas.surface(id)).getByRole('button', { name: label, exact: true }),
    ).not.toBeNull(),
  );
}
const exit = () => fireEvent.click(within(bar()).getByRole('button', { name: '退出元素选择模式' }));
const badges = () => [...input().querySelectorAll('[data-magic-id]')];

function atomicBackspace() {
  const editor = input();
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.keyDown(editor, { key: 'Backspace', code: 'Backspace' });
  const event = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'deleteContentBackward',
  });
  fireEvent(editor, event);
  expect(event.defaultPrevented).toBe(true);
}

function blobText(blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
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
    return this.matches('[data-mark-surface]')
      ? rect
      : { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 };
  });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(480);
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('real App and NodeCanvas mark integration', () => {
  it('opens the real IMAGE entry at its own anchor, allows its result as source, and blocks the default service without graph/storage fiction', async () => {
    const canvas = await page();
    flush();
    const before = read();
    const position = {
      left: frame().style.left,
      top: frame().style.top,
      transform: frame().style.transform,
    };
    await enter();
    expect(canvas.surface('target')).not.toBeNull();
    expect(canvas.surface()).not.toBeNull();
    expect(canvas.node('target').querySelector('[data-focus-mode-placeholder]')).toBeNull();
    expect(canvas.surface('unrelated')).toBeNull();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    pick(canvas);
    await waitFor(() =>
      expect(
        screen.getAllByText('元素识别服务未连接，暂时无法选择局部元素').length,
      ).toBeGreaterThan(0),
    );
    expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([]);
    expect(graph(read())).toEqual(graph(before));
    expect(screen.queryByText('分析中...')).toBeNull();
    expect(badges()).toHaveLength(0);
    expect({
      left: frame().style.left,
      top: frame().style.top,
      transform: frame().style.transform,
    }).toEqual(position);
    expect(target().data.params.magicList).toBeUndefined();
    expect(read().edges).toEqual([]);
    writes.mockRestore();
    exit();
    flush();
    expect(graph(read())).toEqual(graph(before));
  });

  it('exposes the actual VIDEO magic caller while only IMAGE content receives a point surface', async () => {
    const canvas = await page(snapshot({ type: 'video' }));
    expect(models.videoModels['motion-3-prime'].properties.magic).toBe(true);
    await enter();
    expect(canvas.surface('target')).toBeNull();
    expect(canvas.surface()).not.toBeNull();
    expect(
      within(frame()).getByRole('textbox', { name: '提示词' }).getAttribute('aria-readonly'),
    ).toBe('false');
    expect(within(frame()).getByRole('button', { name: '标记' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    exit();
    flush();
    expect(target().type).toBe('video');
    expect(target().data.params.magicList).toBeUndefined();
  });

  it('keeps the real expanded generator through mark entry and lets the first modal Escape collapse before exiting mode', async () => {
    await page();
    fireEvent.click(within(frame()).getByRole('button', { name: '展开生成器' }));
    const expanded = screen.getByRole('dialog', { name: '展开标记生成器' });
    await enter();
    expect(expanded.isConnected).toBe(true);
    expect(screen.getByRole('dialog', { name: '展开标记生成器' })).toBe(expanded);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '展开标记生成器' })).toBeNull();
    expect(bar()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: '元素选择模式' })).toBeNull();
  });

  it.each(['readonly', 'no-schema', 'unsupported'])('hides the actual %s entry', async (kind) => {
    if (kind === 'no-schema') contentState.modelsAvailable = false;
    await page(snapshot({ model: kind === 'unsupported' ? 'flux-2-pro' : undefined }), {
      readonly: kind === 'readonly',
    });
    expect(within(frame()).queryByRole('button', { name: '标记', exact: true })).toBeNull();
    expect(screen.queryByRole('region', { name: '元素选择模式' })).toBeNull();
  });

  it('pans the actual source image while Space is held and consumes its trailing click without recognition or node movement', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(undefined, { app: false, source, reader });
    flush();
    await enter();
    const before = graph(read());
    fireEvent.keyDown(document, { key: ' ', code: 'Space' });
    pointer(canvas.surface(), 'pointerdown', 148, 148);
    pointer(canvas.board, 'pointermove', 200, 190);
    pointer(canvas.board, 'pointerup', 200, 190);
    fireEvent.keyUp(document, { key: ' ', code: 'Space' });
    fireEvent.click(canvas.surface(), { clientX: 200, clientY: 190, button: 0, detail: 1 });
    await waitFor(() => expect(read().view).toEqual({ x: 72, y: 52, z: 0.8 }), { timeout: 2000 });
    expect(graph(read())).toEqual(before);
    expect(reader).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();
    expect(canvas.board.releasePointerCapture).toHaveBeenCalledWith(21);
  });

  it('uses a legitimate injected adapter payload and commits the latest draft plus result in one undoable graph step, then restores after refresh', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(undefined, { app: false, source, reader });
    await enter();
    editPrompt('最后150ms的输入');
    await recognized(canvas);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(reader.mock.calls[0][0]).toBe(canvas.node('source').querySelector('img'));
    expect(reader.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(recognize).toHaveBeenCalledTimes(1);
    expect(recognize.mock.calls[0][0]).toEqual({
      id: 'source',
      image_base64: rawBase64,
      point: [0.15, 0.2],
      lang: 'zh',
    });
    expect(target().data.params.prompt).toBe('最后150ms的输入 {{magic:recognized_1:0}}');
    expect(target().data.params.magicList).toEqual({
      recognized_1: { suggestions, imageUrl: sourceUrl },
    });
    expect(target().data.params.advancedSettings.searchable).toBe(1);
    expect(read().edges).toEqual([]);
    expect(badges().map((badge) => badge.dataset.magicIndex)).toEqual(['0']);
    const accepted = graph(read());
    exit();
    flush();
    expect(graph(read())).toEqual(accepted);
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.prompt).toBe('最后150ms的输入');
    expect(target().data.params.magicList).toBeUndefined();
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(accepted);
    canvas.unmount();
    const restored = await page(undefined, { app: false, source, reader, preserve: true });
    expect(badges().map((badge) => badge.dataset.magicId)).toEqual(['recognized_1']);
    expect(graph(read())).toEqual(accepted);
    expect(recognize).toHaveBeenCalledTimes(1);
    restored.unmount();
  });

  it('permits the IMAGE owner result itself as a recognition source without creating a self edge', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(undefined, { app: false, source, reader });
    await enter();
    await recognized(canvas, 'target');
    flush();
    expect(recognize.mock.calls[0][0].id).toBe('target');
    expect(target().data.params.magicList.recognized_1.imageUrl).toBe(targetUrl);
    expect(read().edges).toEqual([]);
    expect(target().data.url).toEqual([targetUrl]);
  });

  it('synchronizes all same-ID prompt badges with the surface, preserves first-only surface changes and undoable point deletion', async () => {
    const metadata = { recognized_1: { suggestions, imageUrl: sourceUrl } };
    const { source } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(
      snapshot({
        prompt: '{{magic:recognized_1:0}} {{magic:recognized_1:0}}',
        magicList: metadata,
      }),
      { app: false, source, reader },
    );
    await enter();
    await recognized(canvas);
    expect(badges()).toHaveLength(3);
    fireEvent.click(badges()[0]);
    fireEvent.click(
      within(screen.getByRole('menu', { name: '元素建议' })).getByRole('menuitemradio', {
        name: '外套',
      }),
    );
    await waitFor(
      () =>
        expect(target().data.params.prompt).toBe(
          '{{magic:recognized_1:1}} {{magic:recognized_1:1}} {{magic:recognized_1:1}}',
        ),
      { timeout: 2000 },
    );
    expect(
      within(canvas.surface()).getByRole('button', { name: '外套', exact: true }),
    ).not.toBeNull();
    expect(badges().map((badge) => badge.dataset.magicIndex)).toEqual(['1', '1', '1']);
    fireEvent.click(within(canvas.surface()).getByRole('button', { name: '外套', exact: true }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: '标记候选' })).getByRole('menuitemradio', {
        name: '人物',
      }),
    );
    expect(target().data.params.prompt).toBe(
      '{{magic:recognized_1:0}} {{magic:recognized_1:1}} {{magic:recognized_1:1}}',
    );
    const beforeDelete = graph(read());
    fireEvent.click(within(canvas.surface()).getByRole('button', { name: '删除标记：人物' }));
    expect(target().data.params.prompt).toBe('{{magic:recognized_1:1}} {{magic:recognized_1:1}}');
    expect(target().data.params.magicList).toBeUndefined();
    expect(badges()).toHaveLength(0);
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(beforeDelete);
    expect(badges()).toHaveLength(3);
  });

  it('counts twenty token occurrences rather than unique IDs and stops before image reading or recognition', async () => {
    const prompt = Array(20).fill('{{magic:retained:0}}').join(' ');
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(
      snapshot({ prompt, magicList: { retained: { suggestions, imageUrl: sourceUrl } } }),
      { app: false, source, reader },
    );
    await enter();
    pick(canvas);
    await waitFor(() => expect(screen.getByText('最多可选择20个元素')).not.toBeNull());
    expect(reader).not.toHaveBeenCalled();
    expect(recognize).not.toHaveBeenCalled();
    expect(badges()).toHaveLength(20);
    flush();
    expect(target().data.params.prompt).toBe(prompt);
    expect(read().edges).toEqual([]);
  });

  it('retries only persistence after quota failure without recognizing twice or recording another history step', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(undefined, { app: false, source, reader });
    flush();
    await enter();
    const originalWrite = Storage.prototype.setItem;
    const fail = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (writtenKey, value) {
        if (writtenKey === key && value.includes('{{magic:recognized_1:0}}'))
          throw new DOMException('quota', 'QuotaExceededError');
        return originalWrite.call(this, writtenKey, value);
      });
    await recognized(canvas);
    await waitFor(() => expect(screen.getByRole('button', { name: '重试保存' })).not.toBeNull());
    expect(target().data.params.magicList).toBeUndefined();
    expect(badges()).toHaveLength(1);
    expect(
      within(canvas.surface()).getByRole('button', { name: '人物', exact: true }).disabled,
    ).toBe(true);
    pick(canvas);
    expect(recognize).toHaveBeenCalledTimes(1);
    fail.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '重试保存' })).toBeNull());
    expect(target().data.params.prompt).toBe('原有文字 {{magic:recognized_1:0}}');
    expect(recognize).toHaveBeenCalledTimes(1);
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.magicList).toBeUndefined();
    expect(canvas.undo().disabled).toBe(true);
  });

  it('atomically deletes the last stored magic token with native Backspace, prunes Core metadata and keeps local undo as raw text', async () => {
    const initialPrompt = '原有文字 {{magic:stored:0}}';
    await page(
      snapshot({
        prompt: initialPrompt,
        magicList: { stored: { suggestions, imageUrl: sourceUrl } },
      }),
    );
    expect(badges()).toHaveLength(1);
    atomicBackspace();
    expect(input().textContent).toBe('原有文字 ');
    expect(badges()).toHaveLength(0);
    await waitFor(
      () => {
        expect(target().data.params.prompt).toBe('原有文字 ');
        expect(target().data.params.magicList).toBeUndefined();
      },
      { timeout: 2000 },
    );
    fireEvent.keyDown(input(), { key: 'z', ctrlKey: true });
    expect(input().textContent).toBe(initialPrompt);
    expect(badges()).toHaveLength(0);
    // Source Core cannot reconstruct pruned recognition metadata from a token.
    await waitFor(
      () => {
        expect(target().data.params.prompt).toBe(initialPrompt);
        expect(target().data.params.magicList).toBeUndefined();
      },
      { timeout: 2000 },
    );
  });

  it('keeps a confirmed temporary point selectable and deletable after its final prompt token was removed, without resurrecting metadata or recording another graph step', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const canvas = await page(undefined, { app: false, source, reader });
    await enter();
    await recognized(canvas);
    atomicBackspace();
    await waitFor(
      () => {
        expect(target().data.params.prompt).toBe('原有文字 ');
        expect(target().data.params.magicList).toBeUndefined();
      },
      { timeout: 2000 },
    );
    const before = graph(read());
    fireEvent.click(within(canvas.surface()).getByRole('button', { name: '人物', exact: true }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: '标记候选' })).getByRole('menuitemradio', {
        name: '外套',
      }),
    );
    expect(
      within(canvas.surface()).getByRole('button', { name: '外套', exact: true }),
    ).not.toBeNull();
    expect(graph(read())).toEqual(before);
    expect(badges()).toHaveLength(0);
    fireEvent.click(within(canvas.surface()).getByRole('button', { name: '删除标记：外套' }));
    expect(
      within(canvas.surface()).queryByRole('button', { name: '外套', exact: true }),
    ).toBeNull();
    expect(graph(read())).toEqual(before);
    expect(recognize).toHaveBeenCalledTimes(1);
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.prompt).toBe('原有文字');
    expect(target().data.params.magicList).toBeUndefined();
    expect(canvas.undo().disabled).toBe(true);
  });

  it('exports the immediate pending draft with pruned metadata before150ms and preserves that projected baseline in one real mark transaction undo', async () => {
    const { source, recognize } = sourceFixture(),
      reader = readerFixture();
    const originalPrompt = '旧文字 {{magic:stored:0}}';
    const canvas = await page(
      snapshot({
        prompt: originalPrompt,
        magicList: { stored: { suggestions, imageUrl: sourceUrl } },
      }),
      { app: false, source, reader },
    );
    flush();
    const captured = [];
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL(blob) {
          captured.push(blob);
          return 'blob:mark-snapshot-test';
        }
        static revokeObjectURL() {}
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    editPrompt('未150ms的新文字');
    expect(target().data.params.prompt).toBe(originalPrompt);
    expect(target().data.params.magicList.stored).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '导出', exact: true }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '导出画布' })).getByRole('button', {
        name: /画布文件/,
      }),
    );
    expect(captured).toHaveLength(1);
    expect(target().data.params.prompt).toBe(originalPrompt);
    expect(target().data.params.magicList.stored).toBeDefined();
    const exported = JSON.parse(await blobText(captured[0]));
    expect(target(exported).data.params.prompt).toBe('未150ms的新文字');
    expect(target(exported).data.params.magicList).toBeUndefined();
    expect(target(exported).data.params.advancedSettings.searchable).toBe(1);
    expect(exported.edges).toEqual([]);
    await enter();
    await recognized(canvas);
    expect(target().data.params.prompt).toBe('未150ms的新文字 {{magic:recognized_1:0}}');
    expect(Object.keys(target().data.params.magicList)).toEqual(['recognized_1']);
    expect(recognize).toHaveBeenCalledTimes(1);
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(target().data.params.prompt).toBe('未150ms的新文字');
    expect(target().data.params.magicList).toBeUndefined();
    expect(canvas.undo().disabled).toBe(true);
  });

  it.each(['reader', 'response'])(
    'retires a late %s on document replacement and does not let it unlock the next operation',
    async (stage) => {
      const oldReader = deferred(),
        oldResponse = deferred(),
        newResponse = deferred();
      let responseCount = 0,
        readerCount = 0;
      const { source, recognize } = sourceFixture(() =>
        ++responseCount === 1 && stage === 'response' ? oldResponse.promise : newResponse.promise,
      );
      const reader = vi.fn(() =>
        ++readerCount === 1 && stage === 'reader' ? oldReader.promise : Promise.resolve(rawBase64),
      );
      const canvas = await page(undefined, { app: false, source, reader });
      await enter();
      pick(canvas);
      await waitFor(() => expect(screen.getByText('分析中...')).not.toBeNull());
      if (stage === 'response') await waitFor(() => expect(recognize).toHaveBeenCalledTimes(1));
      const otherId = 'mark-next-document',
        otherKey = `libtv.canvas.${otherId}`;
      const replacement = snapshot({ prompt: '新文档' });
      replacement.title = '新的标记文档';
      replacement.nodes[1].data.url = [targetUrl];
      localStorage.setItem(otherKey, JSON.stringify(replacement));
      const path = `/canvas?projectId=${otherId}`;
      navigate(path);
      canvas.rerender(canvas.element(path));
      await waitFor(() => expect(screen.getByText('新的标记文档')).not.toBeNull());
      fireEvent.click(canvas.node('target'));
      await waitFor(() => expect(frame()).not.toBeNull());
      await enter();
      pick(canvas);
      await waitFor(() => expect(recognize).toHaveBeenCalledTimes(stage === 'reader' ? 1 : 2));
      await act(async () => {
        oldReader.resolve(rawBase64);
        oldResponse.resolve(response('old'));
        await Promise.resolve();
      });
      expect(canvas.surface().getAttribute('aria-busy')).toBe('true');
      expect(screen.getByText('分析中...')).not.toBeNull();
      await act(async () => {
        newResponse.resolve(response('new'));
      });
      await waitFor(() =>
        expect(
          within(canvas.surface()).getByRole('button', { name: '人物', exact: true }),
        ).not.toBeNull(),
      );
      flush();
      expect(target(read(otherKey)).data.params.prompt).toBe('新文档 {{magic:new_1:0}}');
      expect(target(read(otherKey)).data.params.magicList).toEqual({
        new_1: { suggestions, imageUrl: targetUrl },
      });
      expect(target().data.params.magicList).toBeUndefined();
      expect(read().edges).toEqual([]);
    },
  );
});
