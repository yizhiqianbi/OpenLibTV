import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
const projectId = 'general-group-controls-integration';
const key = `libtv.canvas.${projectId}`;
const image = (id, index) => ({
  id,
  type: 'image',
  parentId: 'g',
  extent: 'parent',
  position: { x: 36 + index * 236, y: 66 },
  width: 200,
  height: 120,
  measured: { width: 200, height: 120 },
  data: {
    name: `图 ${index + 1}`,
    type: 'image',
    action: 'image_resource',
    url: [`/${id}.webp`],
    params: { prompt: `保留-${id}`, settings: { ratio: '16:9', seed: 42 } },
  },
});
const snapshot = (data = {}) => ({
  title: '普通与关联分组',
  view: { x: 80, y: 180, z: 0.8 },
  edges: [{ id: 'edge', source: 'a', target: 'outside' }],
  nodes: [
    {
      id: 'g',
      type: 'group',
      position: { x: 100, y: 100 },
      width: 508,
      height: 222,
      measured: { width: 508, height: 222 },
      data: { name: '普通组', type: 'group', childNodeIds: ['b', 'a'], ...data },
    },
    image('a', 0),
    image('b', 1),
    {
      id: 'outside',
      type: 'text',
      position: { x: 1000, y: 1000 },
      data: { name: '外部', type: 'text', content: ['保持'] },
    },
  ],
});
const read = () => JSON.parse(localStorage.getItem(key));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
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
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});
afterEach(() => vi.unstubAllGlobals());
async function page(value) {
  if (value) localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => canvas.container.querySelector(`[data-node-id="${id}"]`);
  fireEvent.click(node('g'));
  return { ...canvas, node };
}

describe('actual ordinary and linked group controls', () => {
  it('shows General only for the sole selected group and excludes the dead context settings entry', async () => {
    const canvas = await page(snapshot());
    expect(screen.getByRole('toolbar', { name: '分组操作' }).parentElement).toBe(
      canvas.container.querySelector('.cv-board'),
    );
    fireEvent.click(canvas.node('a'));
    expect(screen.queryByRole('toolbar', { name: '分组操作' })).toBeNull();
    fireEvent.contextMenu(canvas.node('g'), { clientX: 300, clientY: 300 });
    const context = canvas.container.querySelector('.cv-context');
    expect(within(context).queryByRole('button', { name: '节点设置' })).toBeNull();
    expect(within(context).getByRole('button', { name: /创建副本/ })).toBeTruthy();
  });

  it('saves source color, clears the color and preserves a full single-step undo/redo', async () => {
    const canvas = await page(snapshot());
    flush();
    const original = graph(read());
    fireEvent.click(screen.getByRole('button', { name: '分组颜色' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '分组颜色 #E74C3C' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '分组颜色' }));
    flush();
    const colored = graph(read());
    expect(colored.nodes[0]).toMatchObject({
      data: { groupColor: '#E74C3C' },
      zIndex: -1001,
      style: { background: '#E74C3C1A', border: '1px solid #E74C3C33' },
    });
    expect(colored.edges).toEqual(original.edges);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(colored);
    fireEvent.click(screen.getByRole('button', { name: '分组颜色' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '分组颜色 #E74C3C' }));
    flush();
    expect(read().nodes[0]).toMatchObject({
      data: { groupColor: null },
      style: {
        background: 'var(--canvas-group-bg)',
        border: '1px solid var(--canvas-group-border)',
      },
    });
    expect(canvas.node('g').style.background).toContain('var(--canvas-group-bg)');
  });

  it('lays out complete preferred order and converts images with source params, undo and reload', async () => {
    const canvas = await page(snapshot());
    fireEvent.click(screen.getByRole('button', { name: '分组布局' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '垂直排列' }));
    flush();
    const vertical = graph(read());
    expect(vertical.nodes[0].data).toMatchObject({
      groupLayoutMode: 'vertical',
      nodeWidth: 272,
      nodeHeight: 378,
    });
    expect(vertical.nodes.find((node) => node.id === 'b').position).toEqual({ x: 36, y: 66 });
    expect(vertical.nodes.find((node) => node.id === 'a').position).toEqual({ x: 36, y: 222 });
    fireEvent.click(screen.getByRole('button', { name: '转分镜组' }));
    expect(screen.getByRole('toolbar', { name: '分镜组操作' })).toBeTruthy();
    flush();
    const converted = graph(read());
    expect(converted.nodes[0].data).toMatchObject({
      standaloneStoryboardImageGrid: true,
      storyboardGroupType: 'image',
      storyboardManualGridCols: 2,
      storyboardManualGridRows: 2,
      childNodeIds: ['b', 'a'],
    });
    expect(converted.nodes.find((node) => node.id === 'a').data.params).toEqual({
      prompt: '保留-a',
      settings: { ratio: '16:9', seed: 42 },
    });
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(read())).toEqual(vertical);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(read())).toEqual(converted);
    canvas.unmount();
    const restored = await page();
    expect(screen.getByRole('toolbar', { name: '分镜组操作' })).toBeTruthy();
    flush();
    expect(graph(read())).toEqual(converted);
    restored.unmount();
  });

  it.each(['v1', 'v2'])(
    'keeps mixed %s ratio locked, conversion hidden and generation explicitly blocked',
    async (version) => {
      const value = snapshot({
        sourceScriptNodeId: 'script',
        sourceScriptVersion: version,
        storyboardGroupType: 'image',
        standaloneStoryboardImageGrid: true,
        storyboardManualGridCols: 2,
      });
      const canvas = await page(value);
      const toolbar = screen.getByRole('toolbar', { name: '分镜组操作' });
      expect(within(toolbar).getByRole('button', { name: '16:9' }).disabled).toBe(true);
      expect(within(toolbar).queryByRole('button', { name: '转普通组' })).toBeNull();
      const run = within(toolbar).getByRole('button', { name: '重新生成' });
      run.focus();
      flush();
      const before = graph(read());
      fireEvent.click(run);
      const dialog = screen.getByRole('dialog', {
        name: version === 'v1' ? '生成分镜图' : '整组执行',
      });
      expect(within(dialog).getByRole('status').textContent).toContain('分镜生成服务尚未连接');
      expect(
        within(dialog).getByRole('button', { name: version === 'v1' ? '开始生成' : '开始执行' })
          .disabled,
      ).toBe(true);
      fireEvent.keyDown(document.activeElement, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(run);
      flush();
      expect(graph(read())).toEqual(before);
      expect(canvas.node('a')).toBeTruthy();
    },
  );
});
