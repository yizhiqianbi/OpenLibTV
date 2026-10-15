import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { writeStoredValue } from '../../services/storage.ts';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'script-text-support'
          ? scriptSupport
          : name === 'script-presets'
            ? presets
            : name === 'image-model-support'
              ? imageSupport
              : name === 'video-model-support'
                ? videoSupport
                : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'script-reference-picking';
const key = `libtv.canvas.${projectId}`;
const read = (storageKey = key) => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const widget = () => screen.getByTestId('scriptv2-generator-view');
const script = (value = read()) => value.nodes.find((node) => node.id === 'script');

function image(id, position, url, parentId) {
  return {
    id,
    type: 'image',
    position,
    ...(parentId ? { parentId } : {}),
    width: 160,
    height: 120,
    data: { type: 'image', name: id, action: 'image_resource', url: [url] },
  };
}
function snapshot() {
  const node = createCanvasScriptNode({
    id: 'script',
    label: '参考选择脚本',
    position: { x: 700, y: 180 },
    models,
  });
  node.data.params.prompt = '讲述一个短故事';
  return {
    title: '参考选择验收',
    view: { x: 0, y: 0, z: 1 },
    edges: [],
    nodes: [
      node,
      image('image-a', { x: 80, y: 80 }, presets.characterToScript.characterImages[0]),
      image('image-b', { x: 330, y: 80 }, presets.characterToScript.characterImages[1]),
      {
        id: 'text',
        type: 'text',
        position: { x: 1050, y: 80 },
        width: 160,
        height: 100,
        data: {
          type: 'text',
          name: '文字资源',
          action: 'text_resource',
          content: ['不能当图片选择'],
        },
      },
      {
        id: 'group',
        type: 'group',
        position: { x: 80, y: 420 },
        width: 500,
        height: 220,
        data: { type: 'group', name: '混合组', childNodeIds: ['group-image', 'group-text'] },
      },
      image('group-image', { x: 20, y: 30 }, presets.characterToScript.characterImages[0], 'group'),
      {
        id: 'group-text',
        type: 'text',
        parentId: 'group',
        position: { x: 240, y: 30 },
        width: 160,
        height: 100,
        data: { type: 'text', name: '组内文本', action: 'text_resource', content: ['保持不接入'] },
      },
    ],
  };
}
const imageFile = (name = '本地角色.png') =>
  new File(
    [
      Uint8Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Kp0AAAAASUVORK5CYII=',
        ),
        (character) => character.charCodeAt(0),
      ),
    ],
    name,
    { type: 'image/png' },
  );

function capture(element) {
  const ids = new Set();
  element.setPointerCapture = vi.fn((id) => ids.add(id));
  element.hasPointerCapture = vi.fn((id) => ids.has(id));
  element.releasePointerCapture = vi.fn((id) => ids.delete(id));
}
function pointer(element, type, { x, y, pointerId = 8 }) {
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
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  });
});
afterEach(() => vi.unstubAllGlobals());

async function page(value = snapshot()) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => canvas.container.querySelector(`[data-node-id="${id}"]`);
  const board = canvas.container.querySelector('.cv-board');
  capture(board);
  for (const item of value.nodes) capture(node(item.id));
  fireEvent.click(node('script'));
  // These are genuine dynamic imports, not a mocked implementation or Suspense bypass.
  await screen.findByTestId('scriptv2-generator-view');
  return {
    ...canvas,
    node,
    board,
    selectedIds: () =>
      [...canvas.container.querySelectorAll('.cv-node.cv-selected,.cv-group-node.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}
async function addReference(kind) {
  fireEvent.click(within(widget()).getByRole('button', { name: '添加参考图' }));
  const menu = await screen.findByRole('menu', { name: '添加参考图方式' });
  fireEvent.click(within(menu).getByRole('menuitem', { name: kind }));
}
async function enter(canvas) {
  await addReference('在当前画布中添加参考');
  await waitFor(() => expect(canvas.node('script').dataset.refPickState).toBe('self'));
  expect(canvas.selectedIds()).toEqual(['script']);
  expect(widget()).toBeTruthy();
}
function exit() {
  fireEvent.keyDown(document, { key: 'Escape' });
}
function expectEdges(value, sourceIds) {
  expect(
    value.edges.map((edge) => ({
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle: edge.targetHandle,
    })),
  ).toEqual(
    sourceIds.map((source) => ({
      source,
      sourceHandle: 'source',
      target: 'script',
      targetHandle: 'target',
    })),
  );
}

describe('actual ScriptV2 reference selection and local import', () => {
  it('enters IMAGE-only picking without changing selection or widget, connects an image and leaves blocked text untouched', async () => {
    const canvas = await page();
    const original = graph(read());
    await enter(canvas);
    expect(canvas.node('image-a').dataset.refPickState).toBe('pickable');
    expect(canvas.node('text').dataset.refPickState).toBe('blocked');
    fireEvent.click(canvas.node('text'));
    expect(graph(read())).toEqual(original);
    fireEvent.click(canvas.node('image-a'));
    expectEdges(read(), ['image-a']);
    expect(canvas.node('image-a').dataset.refPickState).toBe('connected');
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(widget()).toBeTruthy();
    expect(read().nodes.filter((node) => node.id !== 'script')).toEqual(original.nodes.slice(1));
    expect(script().data.params.imageList.map((reference) => reference.nodeId)).toEqual([
      'image-a',
    ]);
    expect(read().view).toEqual(snapshot().view);
    exit();
    expect(canvas.node('script').dataset.refPickState).toBeUndefined();
    expect(canvas.selectedIds()).toEqual(['script']);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('keeps a connected body click as a no-op and disconnects only through its cancel-selection mask control', async () => {
    const value = snapshot();
    value.edges.push({
      id: 'incoming',
      source: 'image-a',
      sourceHandle: 'source',
      target: 'script',
      targetHandle: 'target',
    });
    const canvas = await page(value);
    const original = graph(read());
    await enter(canvas);
    fireEvent.click(canvas.node('image-a'));
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(within(canvas.node('image-a')).getByRole('button', { name: '取消选择' }));
    expect(read().edges).toEqual([]);
    expect(read().nodes.map((node) => node.id)).toEqual(original.nodes.map((node) => node.id));
    expect(canvas.node('image-a').dataset.refPickState).toBe('pickable');
    expect(canvas.selectedIds()).toEqual(['script']);
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('picks only a mixed group image, keeps parent-relative positions and records one group-click transaction', async () => {
    const canvas = await page();
    const original = graph(read());
    await enter(canvas);
    fireEvent.click(canvas.node('group'));
    expectEdges(read(), ['group-image']);
    expect(read().nodes.filter((node) => node.id !== 'script')).toEqual(original.nodes.slice(1));
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(widget()).toBeTruthy();
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expectEdges(read(), ['group-image']);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('uses the reference box threshold to connect overlapping images as one transaction and never moves nodes or ordinary selection', async () => {
    const canvas = await page();
    const original = graph(read());
    await enter(canvas);
    pointer(canvas.board, 'pointerdown', { x: 50, y: 50 });
    pointer(canvas.board, 'pointermove', { x: 55, y: 55 });
    pointer(canvas.board, 'pointerup', { x: 55, y: 55 });
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    pointer(canvas.board, 'pointerdown', { x: 50, y: 50 });
    pointer(canvas.board, 'pointermove', { x: 520, y: 240 });
    expect(canvas.container.querySelector('.cv-reference-pick-box')).toBeTruthy();
    pointer(canvas.board, 'pointerup', { x: 520, y: 240 });
    expectEdges(read(), ['image-a', 'image-b']);
    expect(read().nodes.map((node) => node.position)).toEqual(
      original.nodes.map((node) => node.position),
    );
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(widget()).toBeTruthy();
    exit();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('does not drag an image in reference mode and Escape cancels a pending box without deselecting the target or accepting its late release', async () => {
    const canvas = await page();
    const original = graph(read());
    await enter(canvas);
    pointer(canvas.node('image-a'), 'pointerdown', { x: 100, y: 100 });
    pointer(canvas.node('image-a'), 'pointermove', { x: 280, y: 300 });
    pointer(canvas.node('image-a'), 'pointerup', { x: 280, y: 300 });
    expect(canvas.node('image-a').setPointerCapture).not.toHaveBeenCalled();
    expect(graph(read())).toEqual(original);
    pointer(canvas.board, 'pointerdown', { x: 50, y: 50 });
    pointer(canvas.board, 'pointermove', { x: 520, y: 240 });
    exit();
    pointer(canvas.board, 'pointerup', { x: 520, y: 240 });
    expect(graph(read())).toEqual(original);
    expect(canvas.container.querySelector('.cv-reference-pick-box')).toBeNull();
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(canvas.undo().disabled).toBe(true);
    expect(widget()).toBeTruthy();
  });

  it('reads multiple real local PNG files, prepends resource nodes and their handle edges without changing target selection, with one undo/redo and storage recovery', async () => {
    const canvas = await page();
    const original = graph(read());
    const files = [imageFile('角色一.png'), imageFile('角色二.png')];
    await addReference('本地上传');
    fireEvent.change(screen.getByLabelText('上传脚本参考图'), { target: { files } });
    await waitFor(() => expect(read().nodes).toHaveLength(original.nodes.length + 2));
    const committed = graph(read());
    const added = committed.nodes.slice(0, 2);
    expect(added.map((node) => node.data.name)).toEqual(['角色二.png', '角色一.png']);
    expect(added.every((node) => node.type === 'image' && node.parentId === undefined)).toBe(true);
    expect(added.map((node) => node.position.x)).toEqual([270, 270]);
    for (const node of added) {
      expect(node.data).toMatchObject({
        type: 'image',
        action: 'image_resource',
        showGenerator: true,
        localMediaReady: true,
      });
      expect(node.data.url[0]).toMatch(/^data:image\/png;base64,/);
      expect(node.data.resourceMeta).toMatchObject({
        name: node.data.name,
        size: files[0].size,
        mimeType: 'image/png',
      });
      expect(node.data).not.toHaveProperty('taskInfo');
    }
    expectEdges(committed, [added[1].id, added[0].id]);
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(widget()).toBeTruthy();
    expect(read().view).toEqual(snapshot().view);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
    canvas.unmount();
    const restored = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() =>
      expect(restored.container.querySelectorAll('[data-node-id]')).toHaveLength(
        committed.nodes.length,
      ),
    );
    expect(graph(read())).toEqual(committed);
  });

  it('keeps an imported graph after Quota failure and saves the same resource IDs from the header without adding a second history entry', async () => {
    const canvas = await page();
    const original = graph(read());
    const native = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (blocked && name === key) throw new DOMException('quota', 'QuotaExceededError');
      return native.call(this, name, value);
    });
    await addReference('本地上传');
    fireEvent.change(screen.getByLabelText('上传脚本参考图'), { target: { files: [imageFile()] } });
    await waitFor(() =>
      expect(canvas.container.querySelectorAll('[data-node-id]')).toHaveLength(
        original.nodes.length + 1,
      ),
    );
    expect(graph(read())).toEqual(original);
    const ids = [...canvas.container.querySelectorAll('[data-node-id]')].map(
      (node) => node.dataset.nodeId,
    );
    const originalIds = original.nodes.map((node) => node.id);
    const addedIds = ids.filter((id) => !originalIds.includes(id));
    expect(addedIds).toHaveLength(1);
    expect(new Set(ids).size).toBe(originalIds.length + 1);
    const retry = await screen.findByRole('button', { name: '重试保存画布' });
    blocked = false;
    fireEvent.click(retry);
    const committed = graph(read());
    expect(committed.nodes.map((node) => node.id)).toEqual([...addedIds, ...originalIds]);
    expect(new Set(committed.nodes.map((node) => node.id))).toEqual(new Set(ids));
    expect(committed.nodes[0]).toMatchObject({
      id: addedIds[0],
      type: 'image',
      data: { name: '本地角色.png', localMediaReady: true },
    });
    expectEdges(committed, addedIds);
    expect(canvas.selectedIds()).toEqual(['script']);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('keeps the original upload target and its final unsent draft when another node is selected during the real reader lifecycle', async () => {
    const readers = [];
    class PendingReader {
      constructor() {
        readers.push(this);
      }
      readAsDataURL() {}
      abort = vi.fn(() => this.onabort?.());
    }
    vi.stubGlobal('FileReader', PendingReader);
    const canvas = await page();
    const original = graph(read());
    await addReference('本地上传');
    fireEvent.change(screen.getByLabelText('上传脚本参考图'), { target: { files: [imageFile()] } });
    await waitFor(() => expect(readers).toHaveLength(1));
    const prompt = within(widget()).getByRole('textbox', { name: '提示词' });
    prompt.textContent = '切换前尚未发送的最终剧情';
    fireEvent.input(prompt, { inputType: 'insertText' });
    fireEvent.click(canvas.node('text'));
    expect(screen.queryByTestId('scriptv2-generator-view')).toBeNull();
    expect(canvas.selectedIds()).toEqual(['text']);
    expect(readers[0].abort).not.toHaveBeenCalled();
    readers[0].result = 'data:image/png;base64,c2VsZWN0aW9u';
    await act(() => readers[0].onload());
    await waitFor(() => expect(read().nodes).toHaveLength(original.nodes.length + 1));
    const committed = graph(read());
    expectEdges(committed, [committed.nodes[0].id]);
    expect(script().data.params.prompt).toBe('切换前尚未发送的最终剧情');
    expect(canvas.selectedIds()).toEqual(['text']);
    expect(readers[0].abort).not.toHaveBeenCalled();
    expect(read().view).toEqual(snapshot().view);
    fireEvent.click(canvas.node('script'));
    await screen.findByTestId('scriptv2-generator-view');
    expect(within(widget()).getByRole('textbox', { name: '提示词' }).textContent).toBe(
      '切换前尚未发送的最终剧情',
    );
    fireEvent.click(canvas.undo());
    flush();
    expect(read().nodes.map((node) => node.id)).toEqual(original.nodes.map((node) => node.id));
    expect(read().edges).toEqual(original.edges);
    expect(script().data.params.prompt).toBe('切换前尚未发送的最终剧情');
    expect(canvas.undo().disabled).toBe(true);
  });

  it('uses the shared local asset picker, restores nested preview focus and imports the selected image in one transaction without closing the inline generator', async () => {
    const assetUrl = presets.characterToScript.characterImages[0];
    writeStoredValue(
      'libtv-asset-library',
      {
        assets: [
          {
            id: 'local-image',
            name: '本机人物资产',
            type: 'image',
            mimeType: 'image/png',
            url: assetUrl,
            folderId: null,
            tags: [],
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'local-video',
            name: '不能当图片的视频',
            type: 'video',
            mimeType: 'video/mp4',
            url: '/test-source.mp4',
            folderId: null,
            tags: [],
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        folders: [],
        tags: [],
      },
      { version: 1 },
    );
    const canvas = await page();
    const original = graph(read());
    const originalInput = within(widget()).getByRole('textbox', { name: '提示词' });
    const opener = within(widget()).getByRole('button', { name: '添加参考图' });
    act(() => opener.focus());
    await addReference('个人资产库');
    const selectImage = await screen.findByRole('checkbox', { name: '选择 本机人物资产' });
    const picker = screen.getByRole('dialog', { name: '个人资产库' });
    const previewOpener = within(picker).getByRole('button', { name: '预览 本机人物资产' });
    act(() => previewOpener.focus());
    fireEvent.click(previewOpener);
    const preview = screen.getByRole('dialog', { name: '本机人物资产' });
    expect(within(preview).getByRole('img', { name: '本机人物资产' }).getAttribute('src')).toBe(
      assetUrl,
    );
    fireEvent.keyDown(preview, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '本机人物资产' })).toBeNull();
    expect(document.activeElement).toBe(previewOpener);
    expect(screen.getByRole('dialog', { name: '个人资产库' })).toBe(picker);
    expect(selectImage.checked).toBe(false);
    expect(graph(read())).toEqual(original);
    const blocked = within(picker).getByRole('checkbox', { name: '选择 不能当图片的视频' });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(blocked);
    expect(blocked.checked).toBe(false);
    fireEvent.click(selectImage);
    fireEvent.click(within(picker).getByRole('button', { name: '添加 (1)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(originalInput));
    const committed = graph(read());
    expect(committed.nodes).toHaveLength(original.nodes.length + 1);
    expect(committed.nodes[0]).toMatchObject({
      type: 'image',
      data: {
        type: 'image',
        name: '本机人物资产',
        url: [assetUrl],
        action: 'image_resource',
        showGenerator: true,
      },
    });
    expect(committed.nodes[0].data).not.toHaveProperty('localMediaReady');
    expect(committed.nodes[0].data).not.toHaveProperty('taskInfo');
    expect(committed.nodes[0].position.x).toBe(270);
    expectEdges(committed, [committed.nodes[0].id]);
    expect(within(widget()).getByRole('textbox', { name: '提示词' })).toBe(originalInput);
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(read().view).toEqual(snapshot().view);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('retires a reference box when a new document reuses the same node IDs and rejects its late pointerup', async () => {
    const canvas = await page();
    await enter(canvas);
    pointer(canvas.board, 'pointerdown', { x: 50, y: 50 });
    pointer(canvas.board, 'pointermove', { x: 520, y: 240 });
    const nextId = `${projectId}-next`,
      nextKey = `libtv.canvas.${nextId}`;
    const next = snapshot();
    next.nodes[0].data.params.prompt = '新文档的剧情';
    localStorage.setItem(nextKey, JSON.stringify(next));
    canvas.rerender(
      <NodeCanvas path={`/canvas?projectId=${nextId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() => expect(canvas.node('script')?.dataset.refPickState).toBeUndefined());
    pointer(canvas.board, 'pointerup', { x: 520, y: 240 });
    fireEvent.click(canvas.node('script'));
    await screen.findByTestId('scriptv2-generator-view');
    flush();
    expect(graph(read(nextKey))).toEqual(graph(next));
    expect(canvas.undo().disabled).toBe(true);
    expect(canvas.container.querySelector('.cv-reference-pick-box')).toBeNull();
  });

  it('aborts a file read on document change and never inserts its captured late success into the new document', async () => {
    const readers = [];
    class PendingReader {
      constructor() {
        readers.push(this);
      }
      readAsDataURL() {}
      abort = vi.fn(() => this.onabort?.());
    }
    vi.stubGlobal('FileReader', PendingReader);
    const canvas = await page();
    await addReference('本地上传');
    fireEvent.change(screen.getByLabelText('上传脚本参考图'), { target: { files: [imageFile()] } });
    await waitFor(() => expect(readers).toHaveLength(1));
    const late = readers[0].onload;
    const nextId = `${projectId}-reader-next`,
      nextKey = `libtv.canvas.${nextId}`;
    const next = snapshot();
    next.nodes[0].data.params.prompt = '新文档不接收旧图片';
    localStorage.setItem(nextKey, JSON.stringify(next));
    canvas.rerender(
      <NodeCanvas path={`/canvas?projectId=${nextId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() => expect(readers[0].abort).toHaveBeenCalledTimes(1));
    readers[0].result = 'data:image/png;base64,old';
    await act(() => late());
    flush();
    expect(graph(read(nextKey))).toEqual(graph(next));
    expect(read(nextKey).nodes).toHaveLength(snapshot().nodes.length);
    expect(canvas.undo().disabled).toBe(true);
    expect(screen.queryByText('正在读取参考图…')).toBeNull();
  });
});
