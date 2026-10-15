import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import NodeCanvas from '../NodeCanvas.jsx';
import models from '../../../../public/data/models.json';
vi.mock('../../../services/content.ts', () => ({ loadContent: vi.fn() }));
vi.mock('../../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
function seed(id) {
  const nodes = ['a', 'b'].map((nodeId, index) => ({
    id: nodeId,
    type: 'video',
    position: { x: 100 + index * 400, y: 100 },
    width: 350,
    height: 230,
    data: {
      name: `视频 ${index + 1}`,
      action: 'video_generate',
      params: { model: 'star-video2', prompt: '原提示词', modeType: 'text2video' },
    },
  }));
  localStorage.setItem(
    `libtv.canvas.${id}`,
    JSON.stringify({
      title: '分组回归',
      nodes,
      edges: [{ id: 'ab', source: 'a', target: 'b' }],
      view: { x: 0, y: 0, z: 1 },
    }),
  );
}
async function groupSelected(page) {
  await waitFor(() => expect(page.container.querySelectorAll('.cv-node')).toHaveLength(2));
  fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
  const toolbar = screen.getByRole('toolbar', { name: '多选节点操作' });
  expect(within(toolbar).queryByRole('button', { name: /生成/ })).toBeNull();
  fireEvent.click(within(toolbar).getByRole('button', { name: '分组菜单' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '打组', exact: true }));
  await screen.findByRole('button', { name: '整组执行' });
}
it('creates, lays out, confirms a group run and ungroups through the mounted canvas while preserving prompts and edges', async () => {
  seed('groups-ui');
  const page = render(<NodeCanvas path="/canvas?projectId=groups-ui" user={{ name: '本地' }} />);
  await groupSelected(page);
  const first = page.container.querySelector('[data-node-id="a"]');
  expect(first.style.left).toBe('100px');
  expect(first.style.top).toBe('100px');
  fireEvent.click(screen.getByRole('button', { name: '分组布局' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '垂直排列' }));
  expect(page.container.querySelector('[data-node-id="b"]').style.left).toBe(first.style.left);
  fireEvent.click(screen.getByRole('button', { name: '整组执行' }));
  const dialog = screen.getByRole('dialog', { name: '整组执行' });
  expect(within(dialog).getByRole('list', { name: '组内生成节点' }).children).toHaveLength(2);
  fireEvent.click(within(dialog).getByRole('button', { name: '开始执行' }));
  expect(await within(dialog).findByRole('alert')).toBeTruthy();
  expect(within(dialog).getAllByText(/批量生成服务尚未连接/).length).toBeGreaterThan(0);
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  fireEvent.click(screen.getByRole('button', { name: '解组' }));
  expect(page.container.querySelectorAll('.cv-node')).toHaveLength(2);
  page.unmount();
  const saved = JSON.parse(localStorage.getItem('libtv.canvas.groups-ui'));
  expect(saved.edges).toEqual([{ id: 'ab', source: 'a', target: 'b' }]);
  expect(
    saved.nodes.every((node) => !node.parentId && node.data.params.prompt === '原提示词'),
  ).toBe(true);
});
it('duplicates a mounted group and deletes only that group and its descendants in one reversible transaction', async () => {
  seed('groups-copy');
  const page = render(<NodeCanvas path="/canvas?projectId=groups-copy" user={{ name: '本地' }} />);
  await groupSelected(page);
  fireEvent.keyDown(document.body, { key: 'd', metaKey: true });
  expect(page.container.querySelectorAll('.cv-group-node')).toHaveLength(2);
  const selected = page.container.querySelector('.cv-group-node.cv-selected');
  const groupId = selected.dataset.nodeId;
  const readGraph = () => {
    act(() => window.dispatchEvent(new Event('pagehide')));
    const saved = JSON.parse(localStorage.getItem('libtv.canvas.groups-copy'));
    return { nodes: saved.nodes, edges: saved.edges };
  };
  const before = readGraph();
  expect(before.nodes).toHaveLength(6);
  expect(before.edges).toHaveLength(2);
  const copies = before.nodes.filter((node) => node.parentId === groupId);
  expect(copies).toHaveLength(2);
  expect(copies.map((node) => node.data.name)).toEqual(['视频 1', '视频 2']);
  const removedIds = new Set([groupId, ...copies.map((node) => node.id)]);
  const expected = {
    nodes: before.nodes.filter((node) => !removedIds.has(node.id)),
    edges: before.edges.filter(
      (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
    ),
  };
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Delete' });
    fireEvent.keyUp(document.body, { key: 'Delete' });
    await Promise.resolve();
  });
  expect(page.container.querySelectorAll('.cv-group-node')).toHaveLength(1);
  expect(page.container.querySelectorAll('.cv-node')).toHaveLength(3);
  expect(readGraph()).toEqual(expected);
  expect(expected.edges).toEqual([{ id: 'ab', source: 'a', target: 'b' }]);
  expect(expected.nodes.filter((node) => node.type === 'video').map((node) => node.id)).toEqual([
    'a',
    'b',
  ]);
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
  expect(page.container.querySelectorAll('.cv-node')).toHaveLength(6);
  expect(readGraph()).toEqual(before);
  fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
  expect(page.container.querySelectorAll('.cv-node')).toHaveLength(3);
  expect(readGraph()).toEqual(expected);
  page.unmount();
  const saved = JSON.parse(localStorage.getItem('libtv.canvas.groups-copy'));
  expect({ nodes: saved.nodes, edges: saved.edges }).toEqual(expected);
});
