import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import support from '../../../public/data/video-model-support.json';
import imageSupport from '../../../public/data/image-model-support.json';
import NodeCanvas from './NodeCanvas.jsx';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';

const content = vi.hoisted(() => ({ error: null, imageError: null, reload: vi.fn() }));
vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'video-model-support'
          ? content.error
            ? null
            : support
          : name === 'image-model-support'
            ? content.imageError
              ? null
              : imageSupport
            : { items: [] },
    loading: false,
    error:
      name === 'image-model-support'
        ? content.imageError
        : name === 'video-model-support'
          ? content.error
          : null,
    reload: content.reload,
  }),
}));
const projectId = 'script-v2-image-configuration';
const key = `libtv.canvas.${projectId}`;
function snapshot() {
  const node = createCanvasScriptNode({ id: 'script', position: { x: 400, y: 350 } });
  return {
    title: '脚本浮动工具栏',
    view: { x: 0, y: 0, z: 0.8 },
    edges: [],
    nodes: [
      {
        ...node,
        data: {
          ...node.data,
          name: '工具栏验收脚本',
          rows: [10, 30].map((shotNumber, index) => ({
            id: `row${index}`,
            hiddenUuid: `r${index}`,
            shotNumber,
            durationSeconds: 5,
            plotDescription: '清晨海岸行走',
            imageGenerationPrompt: '清晨海岸行走',
            videoMotionPrompt: `@主角 镜头${shotNumber}推进`,
            imagePromptState: 'synced',
            videoPromptState: 'synced',
            characters: [{ characterAssetId: 'character' }],
          })),
          assets: {
            characters: [{ id: 'character', name: '主角', linkedNodeId: 'asset' }],
            scenes: [],
            props: [],
          },
        },
      },
      {
        id: 'asset',
        type: 'image',
        position: { x: 0, y: 350 },
        width: 350,
        height: 200,
        data: {
          type: 'image',
          name: '主角图片',
          action: 'image_resource',
          url: ['/fixture-character.webp'],
          contentWidth: 1600,
          contentHeight: 900,
        },
      },
    ],
  };
}
const read = () => JSON.parse(localStorage.getItem(key));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  content.error = null;
  content.imageError = null;
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
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});
afterEach(() => vi.unstubAllGlobals());
async function page(value = snapshot(), extra = {}) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} {...extra} />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('上传画布素材').disabled).toBe(Boolean(extra.readonly)),
  );
  const node = canvas.container.querySelector('article[data-node-id="script"]');
  fireEvent.click(node);
  await act(async () => vi.dynamicImportSettled());
  await screen.findByRole('button', { name: '打开脚本节点 →' });
  return { ...canvas, node, board: canvas.container.querySelector('.cv-board') };
}
const toolbar = () => screen.getByRole('toolbar', { name: '脚本操作' });
const action = (label) => within(toolbar()).getByRole('button', { name: label });
async function openImage() {
  const trigger = action('批量生成分镜');
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole('dialog', { name: '分镜批量生图' }) };
}

describe('actual ScriptV2 source image configuration', () => {
  it('opens a separate all-shot selection, keeps details and restores the toolbar through two Escape presses', async () => {
    await page();
    const { dialog, trigger } = await openImage();
    expect(within(dialog).getByText('已选 2/2')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择镜头 10' }));
    expect(within(dialog).getByText('已选 1/2')).toBeTruthy();
    expect(within(dialog).getByRole('checkbox', { name: '全选镜头' }).indeterminate).toBe(true);
    const detail = within(dialog).getByRole('button', { name: '镜头 30 详情' });
    fireEvent.click(detail);
    expect(detail.getAttribute('aria-expanded')).toBe('true');
    const model = within(dialog).getByRole('button', { name: '选择图片模型' });
    fireEvent.click(model);
    const menu = screen.getByRole('menu', { name: '选择图片模型' });
    expect(dialog.contains(menu)).toBe(true);
    expect(within(menu).getAllByRole('menuitem').length).toBeGreaterThan(7);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: '分镜批量生图' })).toBeTruthy();
    expect(document.activeElement).toBe(model);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    const reopened = await openImage();
    expect(within(reopened.dialog).getByText('已选 2/2')).toBeTruthy();
    expect(
      within(reopened.dialog)
        .getByRole('button', { name: '镜头 30 详情' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('creates the chosen raw shot with real references and one undo/redo while retaining the viewport and script rows', async () => {
    await page();
    const original = read();
    const { dialog } = await openImage();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择镜头 10' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建生成器组 (1)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = read();
    const group = saved.nodes.find((node) => node.type === 'group');
    const image = saved.nodes.find((node) => node.parentId === group.id);
    expect(group.data).toMatchObject({
      name: '分镜图 · 工具栏验收脚本',
      groupLayoutMode: 'vertical',
      storyboardSourceRowHiddenUuids: ['r1'],
      sourceScriptVersion: 'v2',
    });
    expect(image.data).toMatchObject({
      name: '镜头 30',
      scriptRowHiddenUuid: 'r1',
      url: [],
      action: 'image_generate',
      params: {
        modeType: 'image2image',
        imageList: [{ nodeId: 'asset', url: '/fixture-character.webp' }],
      },
    });
    expect(image.position).toEqual({ x: 36, y: 66 });
    expect(saved.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'asset', target: image.id },
      { source: 'script', target: group.id },
    ]);
    expect(saved.nodes[0].data).toEqual({
      ...original.nodes[0].data,
      linkedImageGroupId: group.id,
    });
    expect(saved.view).toEqual(original.view);
    expect(toolbar()).toBeTruthy();
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(graph(original));
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(graph(saved));
  });

  it('keeps the fullscreen script open after confirming images and restores the same parent controls', async () => {
    await page();
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    const parent = screen.getByRole('dialog', { name: '工具栏验收脚本' });
    fireEvent.click(
      within(within(parent).getByRole('navigation')).getByRole('button', { name: /合成提示词/ }),
    );
    const opener = within(parent).getByRole('button', { name: '生成分镜图' });
    opener.focus();
    await act(async () => fireEvent.click(opener));
    const dialog = screen.getByRole('dialog', { name: '分镜批量生图' });
    expect(screen.getByRole('dialog', { name: '工具栏验收脚本', hidden: true })).toBe(parent);
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建生成器组 (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '分镜批量生图' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '工具栏验收脚本' })).toBe(parent);
    expect(document.activeElement).toBe(opener);
    const saved = read();
    const group = saved.nodes.find((node) => node.type === 'group');
    const images = saved.nodes.filter((node) => node.parentId === group.id);
    expect(
      images.map((image) => ({
        name: image.data.name,
        position: image.position,
        width: image.width,
        height: image.height,
      })),
    ).toEqual([
      { name: '镜头 10', position: { x: 36, y: 66 }, width: 622, height: 350 },
      { name: '镜头 30', position: { x: 36, y: 452 }, width: 622, height: 350 },
    ]);
    expect(group).toMatchObject({
      width: 702,
      height: 840,
      data: { groupLayoutMode: 'vertical', nodeWidth: 702, nodeHeight: 840 },
    });
    expect(saved.nodes[0].data.rows).toEqual(snapshot().nodes[0].data.rows);
    expect(saved.nodes[0].data.imageGenConfig).toBeUndefined();
    expect(group.data.storyboardSourceRowHiddenUuids).toBeUndefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('preserves the final rich image prompt through immediate close, toolbar creation and undo', async () => {
    await page();
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    const editor = screen.getByRole('dialog', { name: '工具栏验收脚本' });
    fireEvent.click(within(editor).getByRole('button', { name: '提示词 10' }));
    const prompt = screen.getByRole('dialog', { name: '镜头10最终提示词' });
    const input = within(prompt).getByRole('textbox', { name: '分镜提示词' });
    input.textContent = '关闭前最后一次图片输入';
    fireEvent.input(input);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '镜头10最终提示词' })).toBeNull(),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const { dialog } = await openImage();
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建生成器组 (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(read().nodes.find((node) => node.data.name === '镜头 10').data.params.prompt).toBe(
      '关闭前最后一次图片输入',
    );
    expect(read().nodes[0].data.rows[0].imageGenerationPrompt).toBe('关闭前最后一次图片输入');
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(read().nodes).toHaveLength(2);
    expect(read().nodes[0].data.rows[0].imageGenerationPrompt).toBe('关闭前最后一次图片输入');
  });

  it('retries a failed local save without making another group or history entry', async () => {
    await page();
    const original = read();
    const { dialog } = await openImage();
    const native = Storage.prototype.setItem;
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (name, value) {
        if (name === key) throw new DOMException('quota', 'QuotaExceededError');
        return native.call(this, name, value);
      });
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建生成器组 (2)' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: '重试保存分镜图组' })).toBeTruthy(),
    );
    expect(within(dialog).getByRole('button', { name: '选择图片模型' }).disabled).toBe(true);
    expect(within(dialog).getByRole('checkbox', { name: '选择镜头 10' }).disabled).toBe(true);
    expect(within(dialog).getByRole('alert').textContent).toContain('保存失败');
    expect(graph(read())).toEqual(graph(original));
    storage.mockRestore();
    fireEvent.click(within(dialog).getByRole('button', { name: '重试保存分镜图组' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(read().nodes.filter((node) => node.type === 'group')).toHaveLength(1);
    expect(read().nodes.filter((node) => node.data.action === 'image_generate')).toHaveLength(2);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(graph(original));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('shows an independent failed catalogue and retries without silently saving empty parameters', async () => {
    content.imageError = new Error('image catalogue offline');
    const canvas = await page();
    const { dialog } = await openImage();
    expect(within(dialog).getByRole('alert').textContent).toContain('图片模型加载失败');
    expect(within(dialog).getByRole('button', { name: '确认并创建生成器组 (0)' }).disabled).toBe(
      true,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '重试加载图片模型' }));
    await waitFor(() => expect(content.reload).toHaveBeenCalledTimes(2));
    content.imageError = null;
    canvas.rerender(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    expect(within(dialog).getByRole('button', { name: '确认并创建生成器组 (2)' }).disabled).toBe(
      false,
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭分镜批量生图' }));
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });

  it('keeps portals from expanding or dragging the script and closes only on the backdrop', async () => {
    const canvas = await page();
    const { dialog, trigger } = await openImage();
    fireEvent.doubleClick(dialog);
    expect(screen.queryByRole('dialog', { name: '工具栏验收脚本' })).toBeNull();
    fireEvent.pointerDown(dialog, { button: 0, pointerId: 42, clientX: 400, clientY: 250 });
    fireEvent.pointerMove(canvas.board, { buttons: 1, pointerId: 42, clientX: 800, clientY: 500 });
    fireEvent.pointerUp(canvas.board, { button: 0, pointerId: 42, clientX: 800, clientY: 500 });
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog', { name: '分镜批量生图' })).toBe(dialog);
    fireEvent.click(dialog.parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });
});
