import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const projectId = 'release-start-integration';
const storageKey = `libtv.canvas.${projectId}`;
const nodeFixture = (id, position, extra = {}) => ({
  id,
  type: 'text',
  position,
  width: 200,
  height: 150,
  data: { name: id, action: 'text_resource', text: `${id} 正文`, params: {} },
  ...extra,
});
const baseSnapshot = () => ({
  title: '节点抬手与起拖验收',
  nodes: [
    {
      id: 'group',
      type: 'group',
      position: { x: 400, y: 100 },
      width: 500,
      height: 500,
      data: { name: '目标分组', childNodeIds: ['child'] },
    },
    nodeFixture('child', { x: 40, y: 250 }, { parentId: 'group' }),
    nodeFixture('outside', { x: 80, y: 100 }),
    nodeFixture('other', { x: 80, y: 420 }),
  ],
  edges: [{ id: 'existing', source: 'outside', target: 'child' }],
  view: { x: 0, y: 0, z: 1 },
});
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const saved = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (snapshot) => ({ nodes: snapshot.nodes, edges: snapshot.edges });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify(baseSnapshot()));
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

function pointer(element, type, { x, y, altKey = false }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    altKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: 37 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function nativeClick(element) {
  // A pointer click has detail 1. A keyboard/synthetic detail-0 click bypasses
  // drag-tail suppression and would not exercise this regression.
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
  Object.defineProperty(event, 'pointerId', { value: 37 });
  fireEvent(element, event);
}

function capture(element) {
  let owner;
  element.setPointerCapture = vi.fn((id) => {
    owner = id;
  });
  element.hasPointerCapture = vi.fn((id) => owner === id);
  element.releasePointerCapture = vi.fn(() => {
    owner = undefined;
  });
}

async function pageCanvas() {
  const page = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  const node = (id) => page.container.querySelector(`[data-node-id="${id}"]`);
  await waitFor(() => expect(node('outside')).toBeTruthy());
  expect(screen.getByRole('button', { name: baseSnapshot().title }).disabled).toBe(false);
  expect(page.container.querySelector('.cv-loading')).toBeNull();
  const board = page.container.querySelector('.cv-board');
  for (const element of page.container.querySelectorAll('.cv-board,.cv-node')) capture(element);
  // Settle the actual document's initial canonical save before measuring writes
  // caused by the gesture; selection is deliberately absent from this snapshot.
  flush();
  const baselineRaw = localStorage.getItem(storageKey);
  const baseline = saved();
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  expect(screen.getByTitle('重做 ⇧⌘Z').disabled).toBe(true);
  return { ...page, node, board, baselineRaw, baseline, writes };
}

function expectUnchanged(page) {
  flush();
  expect(saved()).toEqual(page.baseline);
  expect(localStorage.getItem(storageKey)).toBe(page.baselineRaw);
  expect(page.writes.mock.calls.filter(([key]) => key === storageKey)).toEqual([]);
  expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  expect(screen.getByTitle('重做 ⇧⌘Z').disabled).toBe(true);
  fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
  flush();
  expect(localStorage.getItem(storageKey)).toBe(page.baselineRaw);
}

describe('actual NodeCanvas starts node movement before accepting a release projection', () => {
  it('selects on down/up without a move and preserves graph, storage, history and normal pointer clicks', async () => {
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 100, y: 110 });
    expect(page.node('outside').classList.contains('cv-selected')).toBe(true);
    expect(page.node('outside').hasPointerCapture(37)).toBe(true);
    pointer(page.board, 'pointerup', { x: 110, y: 110 });
    expect(page.node('outside').releasePointerCapture).toHaveBeenCalledTimes(1);
    expectUnchanged(page);

    nativeClick(page.node('other'));
    expect(page.node('other').classList.contains('cv-selected')).toBe(true);
    expect(page.node('outside').classList.contains('cv-selected')).toBe(false);
    expectUnchanged(page);
  });

  it('keeps a subthreshold move inert even when the release is far beyond the start threshold', async () => {
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 100, y: 110 });
    pointer(page.board, 'pointermove', { x: 101, y: 111 });
    pointer(page.board, 'pointerup', { x: 460, y: 210 });
    expect(page.node('outside').classList.contains('cv-selected')).toBe(true);
    expectUnchanged(page);
    expect(saved().nodes.find((node) => node.id === 'outside').parentId).toBeUndefined();
    expect(saved().nodes.find((node) => node.id === 'group').data.childNodeIds).toEqual(['child']);
  });

  it('does not execute an Alt copy request when no pointer move has started the drag', async () => {
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 100, y: 110, altKey: true });
    pointer(page.board, 'pointerup', { x: 110, y: 110, altKey: true });
    expect(page.node('outside').classList.contains('cv-selected')).toBe(true);
    expectUnchanged(page);
    expect(saved().nodes.map((node) => node.id)).toEqual(['group', 'child', 'outside', 'other']);
    expect(page.container.querySelectorAll('.cv-node')).toHaveLength(4);
  });

  it('persists the final release of an already moving node and restores the complete graph with one undo/redo', async () => {
    const page = await pageCanvas();
    pointer(page.node('outside'), 'pointerdown', { x: 100, y: 110 });
    pointer(page.board, 'pointermove', { x: 108, y: 114 });
    expect(page.node('outside').style.left).toBe('88px');
    expect(page.node('outside').style.top).toBe('104px');
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(false);
    pointer(page.board, 'pointerup', { x: 160, y: 160 });
    flush();
    const finalGraph = {
      nodes: page.baseline.nodes.map((node) =>
        node.id === 'outside' ? { ...node, position: { x: 140, y: 150 } } : node,
      ),
      edges: page.baseline.edges,
    };
    expect(graph(saved())).toEqual(finalGraph);
    expect(saved().view).toEqual(page.baseline.view);
    expect(page.writes.mock.calls.some(([key]) => key === storageKey)).toBe(true);
    expect(page.node('outside').releasePointerCapture).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('撤销 ⌘Z'));
    flush();
    expect(graph(saved())).toEqual(graph(page.baseline));
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
    expect(screen.getByTitle('重做 ⇧⌘Z').disabled).toBe(false);
    fireEvent.click(screen.getByTitle('重做 ⇧⌘Z'));
    flush();
    expect(graph(saved())).toEqual(finalGraph);
    expect(screen.getByTitle('重做 ⇧⌘Z').disabled).toBe(true);
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(false);
  });
});
