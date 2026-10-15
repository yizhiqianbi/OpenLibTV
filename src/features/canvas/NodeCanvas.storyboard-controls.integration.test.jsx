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
const projectId = 'storyboard-controls-integration';
const storageKey = `libtv.canvas.${projectId}`;
const initial = () => ({
  title: '分镜组操作',
  view: { x: 100, y: 180, z: 0.8 },
  edges: [{ id: 'edge', source: 'a', target: 'outside' }],
  nodes: [
    {
      id: 'g',
      type: 'group',
      position: { x: 0, y: 0 },
      width: 712,
      height: 358,
      measured: { width: 712, height: 358 },
      data: {
        name: '分镜图',
        type: 'group',
        storyboardGroupType: 'image',
        standaloneStoryboardImageGrid: true,
        storyboardManualGridCols: 2,
        childNodeIds: ['b', 'a'],
      },
    },
    ...['a', 'b'].map((id, index) => ({
      id,
      type: 'image',
      parentId: 'g',
      extent: 'parent',
      position: { x: 4 + index * 354, y: 4 },
      width: 350,
      height: 350,
      data: {
        name: id,
        type: 'image',
        action: 'image_resource',
        url: [`/${id}.png`],
        contentWidth: 350,
        contentHeight: 350,
        _explicitContentDims: true,
        params: { prompt: id, settings: { ratio: '1:1', seed: 42 } },
      },
    })),
    {
      id: 'outside',
      type: 'text',
      position: { x: 1800, y: 0 },
      width: 350,
      height: 230,
      data: { name: 'outside', type: 'text', action: 'text_resource', content: ['keep'] },
    },
  ],
});
const saved = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (snapshot) => ({ nodes: snapshot.nodes, edges: snapshot.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(initial()));
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
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());
async function page(extra = {}) {
  const mounted = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} {...extra} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => mounted.container.querySelector(`[data-node-id="${id}"]`);
  const select = (id) => fireEvent.click(node(id));
  select('g');
  const toolbar = await screen.findByRole('toolbar', { name: '分镜组操作' });
  return { ...mounted, node, select, toolbar };
}

describe('production storyboard control entry and persistence', () => {
  it('uses the source toolbar for a single group or direct image child and hides it on multiselection', async () => {
    const canvas = await page();
    expect(within(canvas.toolbar).queryByText('整组执行')).toBeNull();
    expect(canvas.toolbar.parentElement).toBe(canvas.container.querySelector('.cv-board'));
    canvas.select('a');
    expect(screen.getByRole('toolbar', { name: '分镜组操作' })).toBeTruthy();
    fireEvent.keyDown(canvas.container.querySelector('.cv-board'), { key: 'a', ctrlKey: true });
    expect(screen.queryByRole('toolbar', { name: '分镜组操作' })).toBeNull();
  });

  it('persists aspect and ordered shot badges, with one undo and restored input focus', async () => {
    const canvas = await page();
    flush();
    const original = graph(saved());
    fireEvent.click(within(canvas.toolbar).getByRole('button', { name: '1:1' }));
    const aspect = await screen.findByRole('menu', { name: '分镜比例' });
    fireEvent.click(within(aspect).getByRole('menuitem', { name: '9:16' }));
    expect(screen.queryByRole('menu', { name: '分镜比例' })).toBeNull();
    expect(document.activeElement).toBe(
      within(canvas.toolbar).getByRole('button', { name: '9:16' }),
    );
    flush();
    const updated = graph(saved());
    expect(updated.nodes.find((node) => node.id === 'a').data.params.settings).toEqual({
      ratio: '9:16',
      seed: 42,
    });
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(original);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(saved())).toEqual(updated);
    fireEvent.click(within(canvas.toolbar).getByRole('button', { name: '序号' }));
    expect(canvas.node('a').querySelector('.cv-storyboard-shot-number').textContent).toBe('02');
    expect(canvas.node('b').querySelector('.cv-storyboard-shot-number').textContent).toBe('01');
    expect(canvas.node('outside').querySelector('.cv-storyboard-shot-number')).toBeNull();
    flush();
    const numbered = graph(saved());
    canvas.unmount();
    const restored = await page();
    expect(restored.node('a').querySelector('.cv-storyboard-shot-number').textContent).toBe('02');
    flush();
    expect(graph(saved())).toEqual(numbered);
  });

  it('opens the fixed grid presets and preserves changes across undo, redo and reload', async () => {
    const canvas = await page();
    flush();
    const original = graph(saved());
    fireEvent.click(within(canvas.toolbar).getByRole('button', { name: '宫格 2×1' }));
    const menu = await screen.findByRole('menu', { name: '分镜宫格' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: '2×2' }));
    expect(within(canvas.toolbar).getByRole('button', { name: '宫格 2×2' })).toBeTruthy();
    expect(canvas.container.querySelectorAll('.cv-storyboard-grid-slot')).toHaveLength(2);
    flush();
    const updated = graph(saved());
    expect(updated.nodes[0].data).toMatchObject({
      storyboardManualGridCols: 2,
      storyboardManualGridRows: 2,
      childNodeIds: ['b', 'a'],
    });
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(original);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(saved())).toEqual(updated);
  });

  it('clears with confirmation, preserves unrelated nodes, restores opener focus, and undoes the full mutation', async () => {
    const canvas = await page();
    flush();
    const original = graph(saved());
    const trigger = within(canvas.toolbar).getByRole('button', { name: '清空' });
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = await screen.findByRole('dialog', { name: '清空分镜' });
    fireEvent.click(within(cancel).getByRole('button', { name: '取消' }));
    flush();
    expect(graph(saved())).toEqual(original);
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const confirm = await screen.findByRole('dialog', { name: '清空分镜' });
    fireEvent.click(within(confirm).getByRole('button', { name: '清空' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '清空分镜' })).toBeNull());
    flush();
    expect(saved().nodes.map((node) => node.id)).toEqual(['g', 'outside']);
    expect(saved().edges).toEqual([]);
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(original);
  });

  it('converts to an ordinary group with explicit dimension recovery and one undo', async () => {
    const canvas = await page();
    flush();
    const original = graph(saved());
    fireEvent.click(within(canvas.toolbar).getByRole('button', { name: '转普通组' }));
    const dialog = await screen.findByRole('dialog', { name: '转为普通组' });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '转为普通组' })).toBeNull());
    expect(screen.queryByRole('toolbar', { name: '分镜组操作' })).toBeNull();
    flush();
    expect(saved().nodes[0].data.standaloneStoryboardImageGrid).toBeUndefined();
    expect(saved().nodes.find((node) => node.id === 'b')).toMatchObject({
      position: { x: 36, y: 66 },
      width: 350,
      height: 350,
    });
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(original);
    expect(screen.getByRole('toolbar', { name: '分镜组操作' })).toBeTruthy();
  });

  it('renames through the actual inline title and stores the change with undo', async () => {
    const canvas = await page();
    fireEvent.doubleClick(within(canvas.node('g')).getByRole('button', { name: '重命名分镜组' }));
    const input = screen.getByRole('textbox', { name: '分镜组名称' });
    fireEvent.change(input, { target: { value: '  分镜改名  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    flush();
    expect(saved().nodes[0].data.name).toBe('分镜改名');
    await waitFor(() => expect(document.activeElement).toBe(canvas.node('g')));
    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(saved().nodes[0].data.name).toBe('分镜图');
  });
});
