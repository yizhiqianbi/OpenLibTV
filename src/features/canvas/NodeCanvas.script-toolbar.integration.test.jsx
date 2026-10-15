import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import support from '../../../public/data/video-model-support.json';
import imageSupport from '../../../public/data/image-model-support.json';
import NodeCanvas from './NodeCanvas.jsx';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import { download } from '../editor/browser.js';

const content = vi.hoisted(() => ({ error: null, reload: vi.fn() }));
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
            ? imageSupport
            : { items: [] },
    loading: false,
    error: name === 'video-model-support' ? content.error : null,
    reload: content.reload,
  }),
}));
vi.mock('../editor/browser.js', () => ({ download: vi.fn() }));
const projectId = 'script-floating-toolbar';
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
  await screen.findByRole('toolbar', { name: '脚本操作' });
  return { ...canvas, node, board: canvas.container.querySelector('.cv-board') };
}
const toolbar = () => screen.getByRole('toolbar', { name: '脚本操作' });
const action = (label) => within(toolbar()).getByRole('button', { name: label });
async function openVideo() {
  const trigger = action('批量生视频');
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole('dialog', { name: '批量生视频' }) };
}

describe('actual ScriptV2 floating toolbar entry', () => {
  it('opens video configuration directly on the canvas, keeps one toolbar and restores its opener through nested Escape', async () => {
    const canvas = await page();
    const bar = toolbar();
    expect(bar.parentElement).toBe(canvas.board);
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') || button.textContent),
    ).toEqual(['重新生成', '批量生成分镜', '批量生视频', '下载']);
    expect(canvas.container.querySelector('.cv-node-actions')).toBeNull();
    expect(canvas.container.querySelectorAll('[data-node-id]')).toHaveLength(2);
    const { trigger, dialog } = await openVideo();
    expect(screen.queryByRole('dialog', { name: '工具栏验收脚本' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '选择视频模型' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: '批量生视频' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });

  it('creates selected empty videos and references through the direct entry with one undo/redo', async () => {
    await page();
    const original = graph(read());
    const { dialog } = await openVideo();
    fireEvent.click(within(dialog).getByRole('button', { name: '选择视频模型' }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: '选择视频模型' })).getByRole('menuitem', {
        name: 'Vidu Q4 Preview',
      }),
    );
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '选择镜头 2' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建视频生成器组 (1)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const created = graph(read());
    const video = created.nodes.find((node) => node.type === 'video');
    expect(created.nodes).toHaveLength(4);
    expect(video.data).toMatchObject({
      name: '分镜视频-#10',
      url: [],
      action: 'video_generate',
      params: { model: 'vidu-q4', modeType: 'mixed2video', imageListOrder: ['asset'] },
    });
    expect(created.edges.map(({ source, target }) => [source, target])).toEqual([
      ['asset', video.id],
      ['script', video.parentId],
    ]);
    expect(created.nodes[0].data.rows).toEqual(snapshot().nodes[0].data.rows);
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '脚本操作' })).toBeNull());
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(original);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(created);
  });

  it('uses the source regeneration confirmation without clearing rows, closing on backdrop or pretending to generate', async () => {
    await page();
    const original = graph(read());
    const trigger = action('重新生成');
    trigger.focus();
    fireEvent.click(trigger);
    const confirm = await screen.findByRole('dialog', { name: '重新生成脚本' });
    expect(
      within(confirm).getByText('重新生成会覆盖当前脚本内容及最终提示词，是否继续？'),
    ).toBeTruthy();
    expect(within(confirm).queryByRole('button', { name: '关闭' })).toBeNull();
    expect(within(confirm).getByRole('button', { name: '开始生成' }).disabled).toBe(true);
    expect(within(confirm).getByRole('status').textContent).toContain('生成服务尚未连接');
    fireEvent.mouseDown(confirm.parentElement);
    fireEvent.click(confirm.parentElement);
    expect(screen.getByRole('dialog', { name: '重新生成脚本' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flush();
    expect(graph(read())).toEqual(original);
  });

  it('downloads all raw CSV rows without changing mirror numbers, selection or graph history', async () => {
    await page();
    fireEvent.click(action('下载'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [name, csv, type] = download.mock.calls[0];
    expect(name).toBe('工具栏验收脚本.csv');
    expect(type).toBe('text/csv;charset=utf-8;');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\n10,');
    expect(csv).toContain('\n30,');
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('preserves the last prompt input when closing the editor and immediately creating videos from the toolbar', async () => {
    await page();
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    const editor = screen.getByRole('dialog', { name: '工具栏验收脚本' });
    fireEvent.click(within(editor).getByRole('button', { name: '提示词 10' }));
    const prompt = screen.getByRole('dialog', { name: '镜头10最终提示词' });
    const input = within(prompt).getByRole('textbox', { name: '视频提示词' });
    input.textContent = '关闭前最后一次视频输入';
    fireEvent.input(input);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '镜头10最终提示词' })).toBeNull(),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const { dialog } = await openVideo();
    fireEvent.click(within(dialog).getByRole('button', { name: '选择视频模型' }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: '选择视频模型' })).getByRole('menuitem', {
        name: 'Vidu Q4 Preview',
      }),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '确认并创建视频生成器组 (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const saved = read();
    const first = saved.nodes.find((node) => node.data.name === '分镜视频-#10');
    expect(first.data.params.prompt).toBe('关闭前最后一次视频输入');
    expect(saved.nodes[0].data.rows[0].videoMotionPrompt).toBe('关闭前最后一次视频输入');
    expect(saved.nodes[0].data.rows.map((row) => row.shotNumber)).toEqual([10, 30]);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(read().nodes).toHaveLength(2);
    expect(read().nodes[0].data.rows[0].videoMotionPrompt).toBe('关闭前最后一次视频输入');
  });

  it('opens the source image configuration directly and cancels without changing the script', async () => {
    await page();
    const trigger = action('批量生成分镜');
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: '分镜批量生图' });
    expect(within(dialog).getByText('已选 2/2')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '工具栏验收脚本' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });

  it('keeps output entry usable for stale prompts while CSV remains disabled until all stages are synced', async () => {
    const value = snapshot();
    value.nodes[0].data.rows[0].imagePromptState = 'stale';
    await page(value);
    expect(action('批量生成分镜').disabled).toBe(false);
    expect(action('批量生视频').disabled).toBe(false);
    expect(action('下载').disabled).toBe(true);
    const { dialog } = await openVideo();
    expect(within(dialog).getByText('已选 2/2')).toBeTruthy();
  });

  it('offers a catalogue retry without treating failed content as a supported model or losing the script', async () => {
    content.error = new Error('目录读取失败');
    const canvas = await page();
    expect(action('批量生视频').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试加载视频模型' }));
    await waitFor(() => expect(content.reload).toHaveBeenCalledTimes(2));
    content.error = null;
    canvas.rerender(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    expect(action('批量生视频').disabled).toBe(false);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });

  it('does not begin dragging or panning from toolbar pointer input', async () => {
    const canvas = await page();
    const before = read();
    const trigger = action('重新生成');
    fireEvent.pointerDown(trigger, { button: 0, pointerId: 41, clientX: 400, clientY: 250 });
    fireEvent.pointerMove(canvas.board, { buttons: 1, pointerId: 41, clientX: 650, clientY: 450 });
    fireEvent.pointerUp(canvas.board, { button: 0, pointerId: 41, clientX: 650, clientY: 450 });
    flush();
    expect(graph(read())).toEqual(graph(before));
    expect(read().view).toEqual(before.view);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('does not expand the script from a double click on the portal toolbar', async () => {
    await page();
    fireEvent.doubleClick(toolbar());
    fireEvent.doubleClick(action('下载'));
    expect(screen.queryByRole('dialog')).toBeNull();
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });

  it('leaves native Space activation available on toolbar buttons without switching to the hand tool', async () => {
    await page();
    const trigger = action('批量生视频');
    trigger.focus();
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    act(() => trigger.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByTitle('抓手 H').classList.contains('active')).toBe(false);
    // jsdom does not implement keyboard button activation; click is the native
    // follow-up event whose default remains available above.
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: '批量生视频' })).toBeTruthy();
  });
});
