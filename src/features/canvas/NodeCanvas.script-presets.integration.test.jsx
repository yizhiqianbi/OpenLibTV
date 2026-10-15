import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import presets from '../../../public/data/script-presets.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

const content = vi.hoisted(() => ({ loading: false, error: null, reload: vi.fn() }));
vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'script-presets'
          ? content.loading || content.error
            ? null
            : presets
          : name === 'script-text-support'
            ? scriptSupport
            : name === 'image-model-support'
              ? imageSupport
              : name === 'video-model-support'
                ? videoSupport
                : { items: [] },
    loading: name === 'script-presets' && content.loading,
    error: name === 'script-presets' ? content.error : null,
    reload: content.reload,
  }),
}));

const projectId = 'script-source-presets';
const key = `libtv.canvas.${projectId}`;
const title = '预设引用验收脚本';
const read = () => JSON.parse(localStorage.getItem(key));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const action = (label) => screen.getByRole('button', { name: label });
const textAction = () => action('剧本生成分镜脚本');
const characterAction = () => action('角色生成分镜脚本');
const manualAction = () => action('自己编写分镜脚本');

function snapshot() {
  const script = createCanvasScriptNode({
    id: 'script',
    label: title,
    position: { x: 450, y: 320 },
    models,
  });
  return {
    title,
    view: { x: -27, y: 19, z: 0.8 },
    nodes: [
      {
        ...script,
        data: {
          ...script.data,
          params: {
            ...script.data.params,
            prompt: '保留这段旧脚本提示词',
            count: 3,
            settings: { retained: 'text preset keeps this' },
          },
          sourceNote: '非参数脚本字段保留',
        },
      },
    ],
    edges: [],
  };
}

function installCapture(element) {
  const captured = new Set();
  element.setPointerCapture = vi.fn((id) => captured.add(id));
  element.hasPointerCapture = vi.fn((id) => captured.has(id));
  element.releasePointerCapture = vi.fn((id) => captured.delete(id));
}
function pointer(element, type, { x, y, pointerId = 9 }) {
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
    isPrimary: { value: true },
  });
  fireEvent(element, event);
  return event;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  content.loading = false;
  content.error = null;
  content.reload.mockClear();
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

async function mount() {
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  await waitFor(() =>
    expect(
      canvas.container.querySelector(
        '[data-testid="scriptv2-empty-card-hints"], [data-testid="scriptv2-pending-card-surface"], [data-testid="scriptv2-resource-card-surface"]',
      ),
    ).toBeTruthy(),
  );
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  const board = canvas.container.querySelector('.cv-board');
  installCapture(board);
  installCapture(node('script'));
  return {
    ...canvas,
    node,
    board,
    selectedIds: () =>
      [...canvas.container.querySelectorAll('article.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}
async function page(value = snapshot()) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = await mount();
  fireEvent.click(canvas.node('script'));
  expect(canvas.selectedIds()).toEqual(['script']);
  return canvas;
}

function expectReferenceEdges(value, references) {
  expect(value.edges).toHaveLength(references.length);
  expect(new Set(value.edges.map((edge) => edge.id)).size).toBe(references.length);
  expect(
    value.edges.map(({ source, sourceHandle, target, targetHandle }) => ({
      source,
      sourceHandle,
      target,
      targetHandle,
    })),
  ).toEqual(
    references.map((node) => ({
      source: node.id,
      sourceHandle: 'source',
      target: 'script',
      targetHandle: 'target',
    })),
  );
}
function expectPending(canvas) {
  expect(screen.getByTestId('scriptv2-pending-card-surface')).toBeTruthy();
  expect(screen.getByText('脚本生成服务尚未接入，未提交任务')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('scriptv2-empty-card-hints')).toBeNull();
  expect(canvas.selectedIds()).toEqual(['script']);
  expect(read().view).toEqual(snapshot().view);
}

describe('actual ScriptV2 source preset graph transactions', () => {
  it('creates the complete original text reference and handles, keeps script params and selection, and restores one history entry after reload', async () => {
    const canvas = await page();
    const original = graph(read());
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(textAction());
    const created = graph(read());
    const reference = created.nodes[0];
    expect(created.nodes).toHaveLength(2);
    expect(reference).toEqual({
      id: expect.any(String),
      type: 'text',
      data: {
        type: 'text',
        name: '文本',
        content: [presets.textToScript.textPrompt],
        action: 'text_resource',
      },
      position: { x: 0, y: 320 },
      sourcePosition: 'right',
      targetPosition: 'left',
    });
    expect(reference.data.content[0]).toHaveLength(544);
    expect(reference.data.content[0]).not.toBe(presets.textToScript.scriptPrompt);
    expect(created.nodes[1]).toEqual(original.nodes[0]);
    expectReferenceEdges(created, [reference]);
    expectPending(canvas);

    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    expect(textAction().disabled).toBe(false);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(created);
    expect(canvas.redo().disabled).toBe(true);
    canvas.unmount();
    const restored = await mount();
    expect(graph(read())).toEqual(created);
    expect(restored.node(reference.id)).toBeTruthy();
    expect(screen.getByTestId('scriptv2-pending-card-surface')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(read().view).toEqual(snapshot().view);
  });

  it('prepends two original character resources, resolves their source placement and replaces only the script params block in one undo/redo', async () => {
    const canvas = await page();
    const original = graph(read());
    fireEvent.click(characterAction());
    const created = graph(read());
    const references = created.nodes.slice(0, 2);
    expect(created.nodes).toHaveLength(3);
    expect(references.map((node) => node.position)).toEqual([
      { x: 0, y: 212 },
      { x: 0, y: 612 },
    ]);
    expect(references.map((node, index) => ({ ...node, id: `reference-${index}` }))).toEqual(
      [0, 1].map((index) => ({
        id: `reference-${index}`,
        type: 'image',
        data: {
          type: 'image',
          name: `角色 ${index + 1}`,
          url: [presets.characterToScript.characterImages[index]],
          alt: `角色参考图 ${index + 1}`,
          action: 'image_resource',
        },
        position: { x: 0, y: index === 0 ? 212 : 612 },
        sourcePosition: 'right',
        targetPosition: 'left',
      })),
    );
    expectReferenceEdges(created, references);
    expect(created.nodes[2]).toEqual({
      ...original.nodes[0],
      data: {
        ...original.nodes[0].data,
        params: { prompt: presets.characterToScript.prompt },
        action: 'script_generate',
      },
    });
    expect(created.nodes[2].data).not.toHaveProperty('taskInfo');
    expectPending(canvas);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(created);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('moves a new reference below an existing measured obstacle with the source 50px margin without moving that obstacle', async () => {
    const value = snapshot();
    value.nodes.push({
      id: 'obstacle',
      type: 'text',
      position: { x: 0, y: 320 },
      width: 80,
      height: 20,
      measured: { width: 200, height: 100 },
      data: { type: 'text', name: '已有资源', action: 'text_resource', content: ['保留资源'] },
    });
    const canvas = await page(value);
    const original = graph(read());
    fireEvent.click(textAction());
    expect(read().nodes[0].position).toEqual({ x: 0, y: 470 });
    expect(read().nodes.slice(1)).toEqual(original.nodes);
    expectReferenceEdges(read(), [read().nodes[0]]);
    expectPending(canvas);
  });

  it('keeps the committed graph on Quota failure and retries only the save, retaining the same IDs and one undo entry', async () => {
    const canvas = await page();
    const original = graph(read());
    const native = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (blocked && name === key) throw new DOMException('quota', 'QuotaExceededError');
      return native.call(this, name, value);
    });
    fireEvent.click(characterAction());
    expect(screen.getByRole('alert').textContent).toContain('参考节点已添加，但本机保存失败');
    const retry = action('重试保存参考节点');
    expect(retry.disabled).toBe(false);
    expect(graph(read())).toEqual(original);
    const committedIds = [...canvas.container.querySelectorAll('article[data-node-id]')].map(
      (node) => node.dataset.nodeId,
    );
    expect(committedIds).toHaveLength(3);
    expect(canvas.undo().disabled).toBe(false);
    expect(screen.getByTestId('scriptv2-pending-card-surface')).toBeTruthy();
    blocked = false;
    fireEvent.click(retry);
    expect(screen.queryByRole('button', { name: '重试保存参考节点' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    const saved = graph(read());
    expect(saved.nodes.map((node) => node.id)).toEqual(committedIds);
    expectReferenceEdges(saved, saved.nodes.slice(0, 2));
    expectPending(canvas);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(saved);
    expect(canvas.redo().disabled).toBe(true);
  });

  it.each(['loading', 'error'])(
    'keeps manual writing reachable when the preset catalogue is %s and creates no reference graph',
    async (status) => {
      content.loading = status === 'loading';
      content.error = status === 'error' ? new Error('preset catalogue offline') : null;
      const canvas = await page();
      const original = graph(read());
      expect(textAction().disabled).toBe(true);
      expect(characterAction().disabled).toBe(true);
      expect(manualAction().disabled).toBe(false);
      fireEvent.click(textAction());
      fireEvent.click(characterAction());
      expect(graph(read())).toEqual(original);
      if (status === 'loading') {
        expect(screen.getByText('正在加载参考示例…')).toBeTruthy();
      } else {
        expect(screen.getByRole('alert').textContent).toContain('参考示例加载失败');
        fireEvent.click(action('重试加载参考示例'));
        await waitFor(() => expect(content.reload).toHaveBeenCalledTimes(1));
      }
      fireEvent.click(manualAction());
      const dialog = await screen.findByRole('dialog', { name: title });
      expect(within(dialog).getByRole('navigation', { name: '分镜脚本阶段' })).toBeTruthy();
      flush();
      expect(read().nodes).toHaveLength(1);
      expect(read().nodes[0].data.rows).toHaveLength(1);
      expect(read().edges).toEqual([]);
      expect(read().view).toEqual(snapshot().view);
      expect(canvas.selectedIds()).toEqual(['script']);
    },
  );

  it('isolates a preset button pointer and Space without capturing, dragging or creating a task', async () => {
    const canvas = await page();
    const trigger = textAction();
    trigger.focus();
    const original = graph(read());
    pointer(trigger, 'pointerdown', { x: 400, y: 340 });
    pointer(trigger, 'pointermove', { x: 480, y: 390 });
    pointer(trigger, 'pointerup', { x: 480, y: 390 });
    expect(canvas.node('script').setPointerCapture).not.toHaveBeenCalled();
    expect(canvas.board.setPointerCapture).not.toHaveBeenCalled();
    const space = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' ',
      code: 'Space',
    });
    fireEvent(trigger, space);
    expect(space.defaultPrevented).toBe(false);
    expect(canvas.board.classList.contains('cv-space-pan')).toBe(false);
    fireEvent.keyUp(trigger, { key: ' ', code: 'Space' });
    flush();
    expect(graph(read())).toEqual(original);
    fireEvent.click(trigger);
    expectPending(canvas);
    expect(read().nodes.find((node) => node.id === 'script').data).not.toHaveProperty('taskInfo');
  });
});
