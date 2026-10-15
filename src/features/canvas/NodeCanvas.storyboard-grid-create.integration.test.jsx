import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access.ts';
import NodeCanvas from './NodeCanvas.jsx';

// Exercise the production page, menu, pure plan, graph history and local persistence.
// The captured catalogue only replaces unrelated public-content network requests.
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'storyboard-grid-creation-integration';
const storageKey = `libtv.canvas.${projectId}`;
const image = (id, x) => ({
  id,
  type: 'image',
  position: { x, y: 0 },
  width: 100,
  height: 100,
  data: {
    type: 'image',
    name: `画面 ${id}`,
    action: 'image_resource',
    url: [`/assets/${id}.webp`],
    params: { prompt: `保留 ${id}`, settings: { ratio: '1:1', seed: 42 } },
  },
});
const snapshot = (nodes = [image('a', 60), image('b', 0)]) => ({
  title: '图片分镜组创建验收',
  nodes,
  edges: nodes.length === 2 ? [{ id: 'edge', source: 'a', target: 'b' }] : [],
  view: { x: 100, y: 100, z: 1 },
});
const saved = () => JSON.parse(localStorage.getItem(storageKey));
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const graph = (document) => ({ nodes: document.nodes, edges: document.edges });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(snapshot()));
  let nextFrame = 1;
  const frames = new Map();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
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

async function page() {
  const mounted = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(mounted.container.querySelector('[data-node-id="a"]')).toBeTruthy());
  // A restored standalone child intentionally has no connection handle. Loading the
  // actual node, plus the page's enabled import input, verifies the writable boundary.
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  return {
    ...mounted,
    board: mounted.container.querySelector('.cv-board'),
    node: (id) => mounted.container.querySelector(`[data-node-id="${id}"]`),
    selected: () =>
      [...mounted.container.querySelectorAll('.cv-node.cv-selected')].map(
        (node) => node.dataset.nodeId,
      ),
  };
}

async function storyboardMenu(canvas) {
  fireEvent.keyDown(canvas.board, { key: 'a', ctrlKey: true });
  const toolbar = await screen.findByRole('toolbar', { name: '多选节点操作' });
  fireEvent.click(within(toolbar).getByRole('button', { name: '分组菜单' }));
  const menu = await screen.findByRole('menu', { name: '分组' });
  return within(menu).getByRole('menuitem', { name: '合并分镜组' });
}

describe('production standalone grid creation entry', () => {
  it('reaches the real menu and atomically creates source-ordered images, one undo/redo and a reloadable group', async () => {
    const canvas = await page();
    flush();
    const original = graph(saved());
    const create = await storyboardMenu(canvas);
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    await waitFor(() =>
      expect(canvas.container.querySelectorAll('.cv-group-node')).toHaveLength(1),
    );
    expect(screen.queryByRole('menu', { name: '分组' })).toBeNull();
    flush();
    const created = graph(saved());
    const group = created.nodes.find((node) => node.type === 'group');
    expect(group).toMatchObject({
      position: { x: -20, y: -56 },
      width: 1256,
      height: 358,
      measured: { width: 1256, height: 358 },
      style: {
        background: 'var(--storyboard-group-shell-bg, #212121)',
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        type: 'group',
        name: '分镜组 2 个节点',
        standaloneStoryboardImageGrid: true,
        storyboardGroupType: 'image',
        storyboardManualGridCols: 2,
        groupLayoutMode: 'grid',
        childNodeIds: ['b', 'a'],
        nodeWidth: 1256,
        nodeHeight: 358,
      },
    });
    expect(group.data).not.toHaveProperty('storyboardManualGridRows');
    expect(canvas.selected()).toEqual([group.id]);
    for (const [id, x] of [
      ['b', 4],
      ['a', 630],
    ]) {
      const node = created.nodes.find((value) => value.id === id);
      expect(node).toMatchObject({
        parentId: group.id,
        position: { x, y: 4 },
        width: 622,
        height: 350,
        measured: { width: 622, height: 350 },
      });
      expect(node.data).toMatchObject({
        url: [`/assets/${id}.webp`],
        contentWidth: 622,
        contentHeight: 350,
        _explicitContentDims: true,
        params: { prompt: `保留 ${id}`, settings: { ratio: '16:9', seed: 42 } },
      });
    }
    expect(created.edges).toEqual(original.edges);

    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(original);
    expect(canvas.container.querySelector('.cv-group-node')).toBeNull();
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(saved())).toEqual(created);
    canvas.unmount();

    const reloaded = await page();
    await waitFor(() => expect(reloaded.node(group.id)).toBeTruthy());
    flush();
    expect(graph(saved())).toEqual(created);
    expect(reloaded.node('b').style.left).toBe('-16px');
    expect(reloaded.node('a').style.left).toBe('610px');
  });

  it.each(['mixed', '26 images'])(
    'keeps the production storyboard menu visible but disabled for %s',
    async (kind) => {
      const nodes =
        kind === 'mixed'
          ? [
              image('a', 0),
              image('b', 500),
              {
                id: 'text',
                type: 'text',
                position: { x: 1000, y: 0 },
                width: 350,
                height: 230,
                data: {
                  type: 'text',
                  name: '文本节点',
                  action: 'text_resource',
                  content: ['保留正文'],
                },
              },
            ]
          : Array.from({ length: 26 }, (_, index) =>
              image(index === 0 ? 'a' : `i${index}`, index * 120),
            );
      localStorage.setItem(storageKey, JSON.stringify(snapshot(nodes)));
      const canvas = await page();
      flush();
      const original = graph(saved());
      const create = await storyboardMenu(canvas);
      expect(create.disabled).toBe(true);
      expect(create.title).toBe('分镜组仅支持图片节点，且组内节点数量不可超过25个');
      fireEvent.click(create);
      flush();
      expect(graph(saved())).toEqual(original);
      expect(canvas.container.querySelector('.cv-group-node')).toBeNull();
      expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    },
  );
});
