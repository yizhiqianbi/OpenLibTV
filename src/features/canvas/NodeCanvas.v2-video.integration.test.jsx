import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import support from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

const content = vi.hoisted(() => ({ error: null, reload: vi.fn() }));
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'video-model-support'
          ? content.error
            ? null
            : support
          : { items: [] },
    loading: false,
    error: name === 'video-model-support' ? content.error : null,
    reload: content.reload,
  }),
}));
const projectId = 'script-v2-video-integration';
const key = `libtv.canvas.${projectId}`;
const snapshot = () => {
  const script = createCanvasScriptNode({ id: 'script', position: { x: 0, y: 0 } });
  return {
    title: '新版脚本视频配置',
    view: { x: 0, y: 0, z: 0.8 },
    edges: [],
    nodes: [
      {
        ...script,
        data: {
          ...script.data,
          name: 'V2验收脚本',
          rows: ['r1', 'r2'].map((hiddenUuid, index) => ({
            id: `row${index}`,
            hiddenUuid,
            shotNumber: index + 1,
            durationSeconds: 5,
            plotDescription: '主角在清晨海岸行走',
            imageGenerationPrompt: '主角在清晨海岸行走',
            videoMotionPrompt: `@主角 镜头${index + 1}缓慢推进`,
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
        position: { x: -500, y: 0 },
        width: 350,
        height: 200,
        data: {
          type: 'image',
          name: '主角图片',
          action: 'image_resource',
          url: ['/representative-character.webp'],
          contentWidth: 1600,
          contentHeight: 900,
        },
      },
    ],
  };
};
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
async function page(extra = {}, value = snapshot()) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} {...extra} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  fireEvent.click(canvas.container.querySelector('[data-node-id="script"]'));
  fireEvent.click(await screen.findByRole('button', { name: '打开脚本节点 →' }));
  const editor = screen.getByRole('dialog', { name: 'V2验收脚本' });
  fireEvent.click(
    within(within(editor).getByRole('navigation')).getByRole('button', { name: /合成提示词/ }),
  );
  const trigger = within(editor).getByRole('button', { name: '生成分镜视频' });
  expect(trigger.disabled).toBe(false);
  trigger.focus();
  fireEvent.click(trigger);
  const configuration = await screen.findByRole('dialog', { name: '批量生视频' });
  return { ...canvas, editor, configuration, trigger };
}
async function model(configuration, label = 'Vidu Q4 Preview') {
  fireEvent.click(within(configuration).getByRole('button', { name: '选择视频模型' }));
  const menu = screen.getByRole('menu', { name: '选择视频模型' });
  fireEvent.click(within(menu).getByRole('menuitem', { name: label }));
}

describe('actual ScriptV2 video configuration entry', () => {
  it('renumbers displayed resource shots while retaining raw script numbers in persisted nodes and rows', async () => {
    const original = snapshot();
    original.nodes[0].data.rows[0].shotNumber = 10;
    original.nodes[0].data.rows[1].shotNumber = 30;
    const value = await page({}, original);
    expect(within(value.configuration).getByRole('checkbox', { name: '选择镜头 1' })).toBeTruthy();
    expect(within(value.configuration).getByRole('checkbox', { name: '选择镜头 2' })).toBeTruthy();
    expect(within(value.configuration).queryByRole('checkbox', { name: '选择镜头 10' })).toBeNull();
    await model(value.configuration);
    fireEvent.click(
      within(value.configuration).getByRole('button', { name: '确认并创建视频生成器组 (2)' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '批量生视频' })).toBeNull());
    expect(read().nodes.find((node) => node.id === 'script').data.rows).toEqual(
      original.nodes[0].data.rows,
    );
    expect(
      read()
        .nodes.filter((node) => node.type === 'video')
        .map((node) => node.data.name),
    ).toEqual(['分镜视频-#10', '分镜视频-#30']);
  });
  it('opens from a script without linked image group, selects all shots and preserves the parent editor through nested Escape', async () => {
    const value = await page();
    expect(within(value.configuration).getByText('已选 2/2')).toBeTruthy();
    expect(within(value.configuration).queryByText(/费用|积分/)).toBeNull();
    fireEvent.click(within(value.configuration).getByRole('button', { name: '展开镜头 1 提示词' }));
    const prompt = within(value.configuration).getByRole('textbox', { name: '镜头 1 视频提示词' });
    expect(prompt.readOnly).toBe(true);
    expect(prompt.value).toContain('主角');
    fireEvent.click(within(value.configuration).getByRole('button', { name: '选择视频模型' }));
    const menu = screen.getByRole('menu', { name: '选择视频模型' });
    expect(value.configuration.contains(menu)).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: '批量生视频' })).toBeTruthy();
    expect(document.activeElement).toBe(
      within(value.configuration).getByRole('button', { name: '选择视频模型' }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '批量生视频' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'V2验收脚本' })).toBeTruthy();
    expect(document.activeElement).toBe(value.trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });
  it('creates selected empty video nodes with temporary durations, closes back to the canvas and restores one undo/redo after reload', async () => {
    const value = await page();
    const original = graph(read());
    await model(value.configuration);
    fireEvent.click(within(value.configuration).getByRole('checkbox', { name: '选择镜头 2' }));
    fireEvent.change(within(value.configuration).getByRole('textbox', { name: '镜头 1 时长' }), {
      target: { value: '7' },
    });
    fireEvent.click(
      within(value.configuration).getByRole('button', { name: '确认并创建视频生成器组 (1)' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '批量生视频' })).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'V2验收脚本' })).toBeNull();
    const created = graph(read());
    const video = created.nodes.find((node) => node.type === 'video');
    const group = created.nodes.find((node) => node.type === 'group');
    expect(created.nodes).toHaveLength(4);
    expect(video.data).toMatchObject({
      url: [],
      action: 'video_generate',
      params: { model: 'vidu-q4', modeType: 'mixed2video', image: '', settings: { duration: 7 } },
    });
    expect(video.data.params.prompt).toContain('镜头1缓慢推进');
    expect(video.data.params.imageList).toEqual([
      { nodeId: 'asset', url: '/representative-character.webp' },
    ]);
    expect(video.data.params.imageListOrder).toEqual(['asset']);
    expect(group.data).toMatchObject({
      sourceScriptVersion: 'v2',
      sourceScriptNodeId: 'script',
      storyboardGroupType: 'video',
    });
    expect(group.data.sourceImageGroupId).toBeUndefined();
    const script = created.nodes.find((node) => node.id === 'script');
    expect(script.data.linkedVideoGroupId).toBe(group.id);
    expect(script.data.videoGenConfig).toBeUndefined();
    expect(script.data.rows).toEqual(snapshot().nodes[0].data.rows);
    expect(created.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['asset', video.id],
      ['script', group.id],
    ]);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(original);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(created);
    value.unmount();
    const restored = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() =>
      expect(restored.container.querySelector(`[data-node-id="${video.id}"]`)).toBeTruthy(),
    );
    expect(graph(read())).toEqual(created);
  });
  it('preserves configuration and creates no graph when the selected Seedance model needs an unavailable asset audit', async () => {
    const value = await page();
    fireEvent.click(
      within(value.configuration).getByRole('button', { name: '确认并创建视频生成器组 (2)' }),
    );
    await waitFor(() =>
      expect(within(value.configuration).getByRole('alert').textContent).toContain(
        '审核服务未连接',
      ),
    );
    expect(within(value.configuration).getByText('已选 2/2')).toBeTruthy();
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    expect(graph(read())).toEqual(graph(snapshot()));
  });
  it('leaves a failed local save open, locks configuration and retries only the existing graph', async () => {
    const value = await page();
    await model(value.configuration);
    const write = Storage.prototype.setItem;
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (entryKey, entryValue) {
        if (entryKey === key) throw new DOMException('quota', 'QuotaExceededError');
        return write.call(this, entryKey, entryValue);
      });
    fireEvent.click(
      within(value.configuration).getByRole('button', { name: '确认并创建视频生成器组 (2)' }),
    );
    await waitFor(() =>
      expect(
        within(value.configuration).getByRole('button', { name: '重试保存视频组' }),
      ).toBeTruthy(),
    );
    expect(within(value.configuration).getByRole('button', { name: '选择视频模型' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole('dialog', { name: 'V2验收脚本', hidden: true })).toBeTruthy();
    storage.mockRestore();
    fireEvent.click(within(value.configuration).getByRole('button', { name: '重试保存视频组' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '批量生视频' })).toBeNull());
    expect(read().nodes.filter((node) => node.type === 'video')).toHaveLength(2);
    expect(read().nodes.filter((node) => node.type === 'group')).toHaveLength(1);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });
  it('shows a retryable independent catalogue error without replacing script content', async () => {
    content.error = 'offline';
    const value = await page();
    expect(within(value.configuration).getByRole('alert').textContent).toContain(
      '视频模型加载失败',
    );
    expect(
      within(value.configuration).getByRole('button', { name: /确认并创建视频生成器组/ }).disabled,
    ).toBe(true);
    fireEvent.click(within(value.configuration).getByRole('button', { name: '重试加载视频模型' }));
    await waitFor(() => expect(content.reload).toHaveBeenCalledTimes(2));
    fireEvent.click(within(value.configuration).getByRole('button', { name: '关闭批量生视频' }));
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });
});
