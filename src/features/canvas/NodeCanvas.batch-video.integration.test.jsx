import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import support from '../../../public/data/storyboard-video-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

const content = vi.hoisted(() => ({ supportError: null, reload: vi.fn() }));
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'storyboard-video-support'
          ? content.supportError
            ? null
            : support
          : { items: [] },
    loading: false,
    error: name === 'storyboard-video-support' ? content.supportError : null,
    reload: content.reload,
  }),
}));
const projectId = 'batch-video-integration';
const key = `libtv.canvas.${projectId}`;
const snapshot = () => ({
  title: '分镜批量视频',
  view: { x: 0, y: 0, z: 0.8 },
  edges: [],
  nodes: [
    {
      id: 'script',
      type: 'screenplay',
      position: { x: 0, y: 0 },
      width: 600,
      data: {
        name: '原脚本',
        linkedImageGroupId: 'g',
        rows: [
          { hiddenUuid: 'r1', shotNumber: 1, videoMotionPrompt: '镜头一慢推' },
          { hiddenUuid: 'r2', shotNumber: 2, videoMotionPrompt: '镜头二抬升' },
        ],
        assets: { characters: [], scenes: [], props: [] },
      },
    },
    {
      id: 'g',
      type: 'group',
      position: { x: 800, y: 0 },
      width: 900,
      height: 310,
      data: {
        type: 'group',
        name: '图片分镜',
        sourceScriptNodeId: 'script',
        sourceScriptVersion: 'v1',
        storyboardGroupType: 'image',
        childNodeIds: ['i1', 'i2'],
      },
    },
    ...['r1', 'r2'].map((row, index) => ({
      id: `i${index + 1}`,
      type: 'image',
      parentId: 'g',
      position: { x: 40 + index * 420, y: 70 },
      width: 400,
      height: 200,
      data: {
        name: `分镜 #${index + 1}`,
        type: 'image',
        action: 'image_resource',
        scriptRowHiddenUuid: row,
        url: [`/actual-sample-${index}.webp`],
        contentWidth: 1600,
        contentHeight: 900,
        params: {
          prompt: '图片提示',
          model: 'lib-image-2.5-s',
          settings: { ratio: '16:9', seed: 42 },
        },
      },
    })),
  ],
});
const read = () => JSON.parse(localStorage.getItem(key));
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  content.supportError = null;
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
async function page(value = snapshot()) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => canvas.container.querySelector(`[data-node-id="${id}"]`);
  fireEvent.click(node('g'));
  const trigger = screen.getByRole('button', { name: '批量生成视频' });
  trigger.focus();
  fireEvent.click(trigger);
  return { ...canvas, node, trigger };
}

describe('actual batch video config/graph/history integration', () => {
  it('opens correct source config and returns through nested Escape without graph writes', async () => {
    const canvas = await page();
    const floating = screen.getByRole('toolbar', { name: '批量视频配置' });
    expect(floating.parentElement).toBe(document.body);
    expect(within(floating).getByText('全部 2 个分镜')).toBeTruthy();
    expect(within(floating).getByRole('button', { name: '选择生成模型' }).textContent).toContain(
      'Kling O3',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭批量视频配置' }));
    fireEvent.click(within(floating).getByRole('button', { name: '生成参数' }));
    const menu = await screen.findByRole('dialog', { name: '生成参数' });
    expect(within(menu).queryByText('生成数量')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '生成参数' })).toBeNull();
    expect(screen.getByRole('toolbar', { name: '批量视频配置' })).toBeTruthy();
    expect(document.activeElement).toBe(within(floating).getByRole('button', { name: '生成参数' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('toolbar', { name: '批量视频配置' })).toBeNull();
    expect(document.activeElement).toBe(canvas.trigger);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });
  it('creates two empty videos/refs, persists before fitting, undo/redo each once and restores reload', async () => {
    const canvas = await page();
    const original = graph(read());
    fireEvent.click(screen.getByRole('button', { name: '创建视频组' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '批量视频配置' })).toBeNull());
    const created = graph(read());
    const videoGroup = created.nodes.find(
      (node) => node.type === 'group' && node.data.storyboardGroupType === 'video',
    );
    expect(videoGroup).toMatchObject({
      data: { sourceImageGroupId: 'g', sourceScriptNodeId: 'script', sourceScriptVersion: 'v1' },
    });
    const videos = created.nodes.filter((node) => node.type === 'video');
    expect(videos).toHaveLength(2);
    expect(videos.map((node) => node.data.params.prompt)).toEqual(['镜头一慢推', '镜头二抬升']);
    expect(videos.every((node) => node.data.url.length === 0 && !node.data.taskId)).toBe(true);
    expect(videos.map((node) => node.data.params)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'kling-v3-omni',
          settings: expect.objectContaining({ ratio: '16:9', duration: 5 }),
        }),
      ]),
    );
    expect(created.nodes.find((node) => node.id === 'script').data.linkedVideoGroupId).toBe(
      videoGroup.id,
    );
    expect(created.edges.filter((edge) => edge.target === videoGroup.id)).toHaveLength(1);
    expect(
      created.edges.filter((edge) => videos.some((video) => video.id === edge.target)),
    ).toHaveLength(2);
    expect(created.nodes.find((node) => node.id === 'g')).toEqual(
      original.nodes.find((node) => node.id === 'g'),
    );
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(created);
    canvas.unmount();
    const reload = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
    expect(reload.container.querySelector(`[data-node-id="${videoGroup.id}"]`)).toBeTruthy();
    flush();
    expect(graph(read())).toEqual(created);
  });
  it('keeps added graph/config when persistence quota fails and only saves on retry', async () => {
    await page();
    const native = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (blocked && name === key) throw new DOMException('Full', 'QuotaExceededError');
      return native.call(this, name, value);
    });
    fireEvent.click(screen.getByRole('button', { name: '创建视频组' }));
    await screen.findByRole('button', { name: '重试保存' });
    expect(screen.getByRole('alert').textContent).toContain('保存失败');
    expect(screen.getByRole('button', { name: '选择生成模型' }).disabled).toBe(true);
    expect(document.querySelectorAll('.cv-node')).toHaveLength(7);
    blocked = false;
    fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '批量视频配置' })).toBeNull());
    expect(read().nodes.filter((node) => node.type === 'video')).toHaveLength(2);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });
  it('exposes independent catalogue failure/retry without creating graph or changing image params', async () => {
    content.supportError = new Error('failed');
    await page();
    expect(screen.getByRole('button', { name: '创建视频组' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试加载视频配置' }));
    await waitFor(() => expect(content.reload).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: '关闭批量视频配置' }));
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
  });
  it('does not offer this configuration on strict standalone, V2 or ordinary no-script group', async () => {
    for (const data of [
      { standaloneStoryboardImageGrid: true },
      { sourceScriptVersion: 'v2' },
      { sourceScriptNodeId: undefined },
    ]) {
      const value = snapshot();
      value.nodes[1].data = { ...value.nodes[1].data, ...data };
      localStorage.setItem(key, JSON.stringify(value));
      const canvas = render(
        <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
      );
      await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
      fireEvent.click(canvas.container.querySelector('[data-node-id="g"]'));
      const trigger = screen.queryByRole('button', { name: '批量生成视频' });
      expect(!trigger || trigger.disabled).toBe(true);
      expect(screen.queryByRole('toolbar', { name: '批量视频配置' })).toBeNull();
      canvas.unmount();
    }
  });
});
