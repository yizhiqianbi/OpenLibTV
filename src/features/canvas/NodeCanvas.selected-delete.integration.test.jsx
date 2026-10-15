import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.jsx';
import models from '../../../public/data/models.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import gold from './test-fixtures/selected-delete-gold.json';

vi.mock('../../hooks/useContent', () => {
  const content = (name, fallback) =>
    ({
      models,
      'script-text-support': scriptSupport,
      'script-presets': presets,
      'image-model-support': imageSupport,
      'video-model-support': videoSupport,
    })[name] ??
    fallback ?? { items: [] };
  return {
    useContent: (name, fallback) => ({
      data: content(name, fallback),
      loading: false,
      error: null,
      reload: vi.fn(),
    }),
    useData: (name, fallback) => content(name, fallback),
  };
});

const projectId = 'actual-app-selected-mixed-delete';
const storageKey = `libtv.canvas.${projectId}`;
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const undo = () => screen.getByTitle('撤销 ⌘Z');
const redo = () => screen.getByTitle('重做 ⇧⌘Z');
let frames;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', `/canvas?projectId=${projectId}`);
  frames = new Map();
  let nextFrame = 1;
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
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

async function page({ seed = true, expected = gold.G0, initial = gold.G0 } = {}) {
  if (seed)
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        title: '实际App selected/mixed完整图验收',
        view: { x: 0, y: 0, z: 1 },
        agentDraft: null,
        messages: [],
        agentConfig: { mode: 'manual' },
        ...initial,
      }),
    );
  const app = render(<App />);
  const node = (id) => app.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false), {
    timeout: 10000,
  });
  await waitFor(() => expect(node(expected.nodes[0].id)).toBeTruthy(), { timeout: 10000 });
  const board = app.container.querySelector('.cv-board');
  expect(board).toBeTruthy();
  flush();
  expect(graph(read())).toEqual(expected);
  expect(undo().disabled).toBe(true);
  expect(redo().disabled).toBe(true);
  return { ...app, node, board, document: read(), keyTarget: board };
}

function hit(canvas, id) {
  // Deliberately no old visual-path fallback and no scissors. This is the
  // actual transparent interaction path in the live App/NodeCanvas layer.
  const element = canvas.container.querySelector(`path[data-edge-hit="${id}"]`);
  expect(element).toBeTruthy();
  expect(element.classList.contains('cv-real-edge-hit')).toBe(true);
  expect(element.getAttribute('stroke')).toBe('transparent');
  expect(element.getAttribute('stroke-width')).toBe('20');
  return element;
}
function edgeGroup(canvas, id) {
  return hit(canvas, id).closest('g[data-edge-id]');
}
function pointer(element, type, modifiers) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 490,
    clientY: 215,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...modifiers,
  });
  Object.defineProperties(event, {
    pointerId: { value: 137 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}
function selectEdge(canvas, id, modifiers = {}) {
  const element = hit(canvas, id);
  pointer(element, 'pointerdown', modifiers);
  pointer(element, 'pointerup', modifiers);
  fireEvent.click(element, { detail: 1, ...modifiers });
  const group = edgeGroup(canvas, id);
  expect(group.getAttribute('aria-pressed')).toBe('true');
  group.focus();
  canvas.keyTarget = group;
}
function selectNode(canvas, id) {
  const element = canvas.node(id);
  expect(element).toBeTruthy();
  fireEvent.click(element);
  expect(element.classList.contains('cv-selected')).toBe(true);
}
function selectOrdinaryAndAssociation(canvas, modifiers = { ctrlKey: true }) {
  selectEdge(canvas, 'ordinary-a');
  selectEdge(canvas, 'ordinary-b', modifiers);
  selectEdge(canvas, 'association-a', modifiers);
  selectEdge(canvas, 'association-b', modifiers);
  expect(edgeGroup(canvas, 'ordinary-a').getAttribute('aria-pressed')).toBe('true');
  expect(edgeGroup(canvas, 'ordinary-b').getAttribute('aria-pressed')).toBe('true');
  expect(edgeGroup(canvas, 'association-a').getAttribute('aria-pressed')).toBe('true');
}
async function deleteKey(canvas, key = 'Delete') {
  await act(async () => {
    fireEvent.keyDown(canvas.keyTarget, { key, code: key, bubbles: true });
    await Promise.resolve();
    // A complete press releases the window listener even when its selected SVG
    // target was removed by keyDown. Long-held/repeated keys are tested separately.
    fireEvent.keyUp(window, { key, code: key, bubbles: true });
    await Promise.resolve();
  });
}
function expectGraph(canvas, expected) {
  flush();
  const actual = read();
  expect(graph(actual)).toEqual(expected);
  expect(actual).toEqual({ ...canvas.document, ...expected, savedAt: expect.any(Number) });
}
function associationDialog() {
  const dialog = screen.getByRole('dialog', { name: '断开连线' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(
    within(dialog).getByText(
      '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
    ),
  ).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: '关闭' })).toBeNull();
  return dialog;
}
async function decide(dialog, buttonName) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: buttonName }));
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
}
function oneUndo(canvas, before, after) {
  expect(undo().disabled).toBe(false);
  fireEvent.click(undo());
  expectGraph(canvas, before);
  expect(undo().disabled).toBe(true);
  expect(redo().disabled).toBe(false);
  fireEvent.click(redo());
  expectGraph(canvas, after);
  expect(redo().disabled).toBe(true);
}

describe('actual App pointer selection → keyboard selected/mixed deletion', () => {
  it.each([
    { key: 'Delete', modifier: { ctrlKey: true } },
    { key: 'Backspace', modifier: { metaKey: true } },
  ])(
    'deletes both ordinary edges through $key and one complete undo/redo',
    async ({ key, modifier }) => {
      const canvas = await page();
      selectEdge(canvas, 'ordinary-a');
      selectEdge(canvas, 'ordinary-b', modifier);
      expect(edgeGroup(canvas, 'ordinary-a').getAttribute('aria-pressed')).toBe('true');
      await deleteKey(canvas, key);
      expect(screen.queryByRole('dialog')).toBeNull();
      expectGraph(canvas, gold.G1);
      oneUndo(canvas, gold.G0, gold.G1);
    },
    15000,
  );

  it('aggregates two shared-group associations into one warning and cancel preserves the full G0 and selection', async () => {
    const canvas = await page();
    selectEdge(canvas, 'association-a');
    selectEdge(canvas, 'association-b', { ctrlKey: true });
    await deleteKey(canvas);
    const dialog = associationDialog();
    expectGraph(canvas, gold.G0);
    expect(undo().disabled).toBe(true);
    await decide(dialog, '取消');
    expectGraph(canvas, gold.G0);
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
    expect(edgeGroup(canvas, 'association-a').getAttribute('aria-pressed')).toBe('true');
    expect(edgeGroup(canvas, 'association-b').getAttribute('aria-pressed')).toBe('true');
  }, 15000);

  it('accepts one aggregated warning for both shared-group edges with one binding-and-edge history', async () => {
    const canvas = await page();
    selectEdge(canvas, 'association-a');
    selectEdge(canvas, 'association-b', { metaKey: true });
    await deleteKey(canvas, 'Backspace');
    expectGraph(canvas, gold.G0);
    await decide(associationDialog(), '确定断开');
    expectGraph(canvas, gold.associationAccepted);
    expect(canvas.container.querySelector('path[data-edge-hit="association-a"]')).toBeNull();
    expect(canvas.container.querySelector('path[data-edge-hit="association-b"]')).toBeNull();
    oneUndo(canvas, gold.G0, gold.associationAccepted);
  }, 15000);

  it('cancel of the later association warning retains already deleted ordinary edges at literal G1', async () => {
    const canvas = await page();
    selectOrdinaryAndAssociation(canvas);
    await deleteKey(canvas);
    const dialog = associationDialog();
    expectGraph(canvas, gold.G1);
    await decide(dialog, '取消');
    expectGraph(canvas, gold.G1);
    expect(edgeGroup(canvas, 'association-a').getAttribute('aria-pressed')).toBe('true');
    expect(edgeGroup(canvas, 'association-b').getAttribute('aria-pressed')).toBe('true');
    oneUndo(canvas, gold.G0, gold.G1);
  }, 15000);

  it('delayed acceptance produces exact G0 → G1 → G2 and two ordered undo/redo stages', async () => {
    const canvas = await page();
    selectOrdinaryAndAssociation(canvas, { metaKey: true });
    await deleteKey(canvas);
    const dialog = associationDialog();
    expectGraph(canvas, gold.G1);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await decide(dialog, '确定断开');
    expectGraph(canvas, gold.G2);
    fireEvent.click(undo());
    expectGraph(canvas, gold.G1);
    expect(undo().disabled).toBe(false);
    fireEvent.click(undo());
    expectGraph(canvas, gold.G0);
    expect(undo().disabled).toBe(true);
    fireEvent.click(redo());
    expectGraph(canvas, gold.G1);
    fireEvent.click(redo());
    expectGraph(canvas, gold.G2);
    expect(redo().disabled).toBe(true);
  }, 15000);

  it('starts ordinary IMAGE node deletion while the independent association warning is still unanswered', async () => {
    const canvas = await page();
    selectNode(canvas, 'image-a');
    selectEdge(canvas, 'association-a', { ctrlKey: true });
    selectEdge(canvas, 'association-b', { ctrlKey: true });
    expect(canvas.node('image-a').classList.contains('cv-selected')).toBe(true);
    await deleteKey(canvas);
    const dialog = associationDialog();
    expect(canvas.node('image-a')).toBeNull();
    expectGraph(canvas, gold.imageDeletedWhileAssociationPending);
    await decide(dialog, '取消');
    expectGraph(canvas, gold.imageDeletedWhileAssociationPending);
    oneUndo(canvas, gold.G0, gold.imageDeletedWhileAssociationPending);
  }, 15000);

  it.each([
    { id: 'script', title: '确认删除' },
    { id: 'story-group', title: '删除分镜图组' },
    { id: 'opening', title: '确认删除该节点？' },
  ])(
    'initial $id node warning cancellation suppresses every edge and node phase',
    async ({ id, title }) => {
      const canvas = await page();
      selectNode(canvas, id);
      for (const edgeId of ['ordinary-a', 'ordinary-b', 'association-a', 'association-b'])
        selectEdge(canvas, edgeId, { ctrlKey: true });
      expect(canvas.node(id).classList.contains('cv-selected')).toBe(true);
      await deleteKey(canvas);
      const dialog = screen.getByRole('dialog', { name: title });
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
      expectGraph(canvas, gold.G0);
      expect(undo().disabled).toBe(true);
      await decide(dialog, '取消');
      expectGraph(canvas, gold.G0);
      expect(undo().disabled).toBe(true);
      expect(redo().disabled).toBe(true);
      expect(canvas.node(id).classList.contains('cv-selected')).toBe(true);
      expect(edgeGroup(canvas, 'association-a').getAttribute('aria-pressed')).toBe('true');
    },
    15000,
  );

  it.each([
    { id: 'script', title: '确认删除', expected: gold.scriptAccepted },
    { id: 'story-group', title: '删除分镜图组', expected: gold.oldGroupAccepted },
    { id: 'opening', title: '确认删除该节点？', expected: gold.openingAccepted },
  ])(
    'initial $id node acceptance bypasses the later association warning and coalesces its accepted before snapshot',
    async ({ id, title, expected }) => {
      const canvas = await page();
      selectNode(canvas, id);
      for (const edgeId of ['ordinary-a', 'ordinary-b', 'association-a', 'association-b'])
        selectEdge(canvas, edgeId, { metaKey: true });
      await deleteKey(canvas);
      const dialog = screen.getByRole('dialog', { name: title });
      expectGraph(canvas, gold.G0);
      await decide(dialog, '确定删除');
      expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
      expectGraph(canvas, expected);
      expect(canvas.node(id)).toBeNull();
      oneUndo(canvas, gold.G0, expected);
    },
    15000,
  );

  it('deletable=false node and real edge stay selected and produce no graph or history mutation', async () => {
    const canvas = await page();
    selectNode(canvas, 'protected');
    selectEdge(canvas, 'protected-edge', { ctrlKey: true });
    expect(canvas.node('protected').classList.contains('cv-selected')).toBe(true);
    await deleteKey(canvas, 'Backspace');
    expect(screen.queryByRole('dialog')).toBeNull();
    expectGraph(canvas, gold.G0);
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
    expect(canvas.node('protected').classList.contains('cv-selected')).toBe(true);
    expect(edgeGroup(canvas, 'protected-edge').getAttribute('aria-pressed')).toBe('true');
  }, 15000);

  it('initial SCRIPT acceptance sets both bypass flags: raw clip edge phase and association unlink, with unchanged clip timeline', async () => {
    const canvas = await page({ initial: gold.clipG0, expected: gold.clipG0 });
    selectNode(canvas, 'script');
    for (const edgeId of [
      'ordinary-a',
      'ordinary-b',
      'association-a',
      'association-b',
      'clip-edge',
    ])
      selectEdge(canvas, edgeId, { ctrlKey: true });
    await deleteKey(canvas);
    const dialog = screen.getByRole('dialog', { name: '确认删除' });
    expectGraph(canvas, gold.clipG0);
    await decide(dialog, '确定删除');
    expect(screen.queryByRole('dialog', { name: '断开连线' })).toBeNull();
    expect(canvas.container.querySelector('path[data-edge-hit="clip-edge"]')).toBeNull();
    expect(canvas.node('clip')).toBeTruthy();
    expectGraph(canvas, gold.scriptAcceptedClip);
    oneUndo(canvas, gold.clipG0, gold.scriptAcceptedClip);
  }, 15000);

  it('unconfirmed VIDEO/AUDIO selected edges run the real local clip port once, compact the literal timeline and restore it in one whole undo/redo plus refresh', async () => {
    const canvas = await page({
      initial: gold.unconfirmedClipBefore,
      expected: gold.unconfirmedClipBefore,
    });
    selectEdge(canvas, 'remove-video-edge');
    selectEdge(canvas, 'remove-audio-edge', { metaKey: true });
    expect(edgeGroup(canvas, 'remove-video-edge').getAttribute('aria-pressed')).toBe('true');
    await deleteKey(canvas);
    await waitFor(() => {
      expect(canvas.container.querySelector('path[data-edge-hit="remove-video-edge"]')).toBeNull();
      expect(canvas.container.querySelector('path[data-edge-hit="remove-audio-edge"]')).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expectGraph(canvas, gold.unconfirmedClipAfter);
    expect(canvas.node('video-delete')).toBeTruthy();
    expect(canvas.node('audio-delete')).toBeTruthy();
    expect(canvas.node('clip')).toBeTruthy();
    oneUndo(canvas, gold.unconfirmedClipBefore, gold.unconfirmedClipAfter);
    canvas.unmount();
    const refreshed = await page({ seed: false, expected: gold.unconfirmedClipAfter });
    expectGraph(refreshed, gold.unconfirmedClipAfter);
    expect(refreshed.container.querySelectorAll('path[data-edge-hit]')).toHaveLength(3);
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
  }, 15000);

  it('running clip busy gate retains both selected source edges, every timeline field and zero history', async () => {
    const canvas = await page({ initial: gold.busyClipBefore, expected: gold.busyClipBefore });
    selectEdge(canvas, 'remove-video-edge');
    selectEdge(canvas, 'remove-audio-edge', { ctrlKey: true });
    await deleteKey(canvas, 'Backspace');
    expect(screen.getByText('智能剪辑进行中，暂时无法断开素材连线')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectGraph(canvas, gold.busyClipBefore);
    expect(edgeGroup(canvas, 'remove-video-edge').getAttribute('aria-pressed')).toBe('true');
    expect(edgeGroup(canvas, 'remove-audio-edge').getAttribute('aria-pressed')).toBe('true');
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
  }, 15000);

  it('quota failure preserves accepted G2 live and retry only persists that graph without repeating its deletion history', async () => {
    const canvas = await page();
    selectOrdinaryAndAssociation(canvas);
    await deleteKey(canvas);
    const dialog = associationDialog();
    expectGraph(canvas, gold.G1);
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (blocked && key === storageKey) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, key, value);
    });
    await decide(dialog, '确定断开');
    flush();
    expect(canvas.container.querySelectorAll('path[data-edge-hit]')).toHaveLength(1);
    expect(hit(canvas, 'protected-edge')).toBeTruthy();
    expect(graph(read())).toEqual(gold.G1);
    const retry = screen.getByRole('button', { name: '重试保存画布' });
    blocked = false;
    fireEvent.click(retry);
    expectGraph(canvas, gold.G2);
    fireEvent.click(undo());
    expectGraph(canvas, gold.G1);
    fireEvent.click(undo());
    expectGraph(canvas, gold.G0);
    expect(undo().disabled).toBe(true);
    fireEvent.click(redo());
    expectGraph(canvas, gold.G1);
    fireEvent.click(redo());
    expectGraph(canvas, gold.G2);
    expect(redo().disabled).toBe(true);
  }, 15000);

  it('refresh of the actual routed App restores full G2 nodes/metadata/edges without resurrecting removed associations', async () => {
    const canvas = await page();
    selectOrdinaryAndAssociation(canvas);
    await deleteKey(canvas);
    expectGraph(canvas, gold.G1);
    await decide(associationDialog(), '确定断开');
    expectGraph(canvas, gold.G2);
    canvas.unmount();
    const refreshed = await page({ seed: false, expected: gold.G2 });
    expectGraph(refreshed, gold.G2);
    expect(refreshed.container.querySelectorAll('path[data-edge-hit]')).toHaveLength(1);
    expect(refreshed.node('shot')).toBeTruthy();
    expect(undo().disabled).toBe(true);
    expect(redo().disabled).toBe(true);
  }, 15000);
});
