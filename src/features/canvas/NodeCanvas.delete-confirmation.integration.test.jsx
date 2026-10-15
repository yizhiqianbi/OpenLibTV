import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import { readPromptDOM } from './generator/node-prompt-dom.js';
import { resolveNodeGenerator } from './generator/node-generator.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: {
      models,
      'script-text-support': scriptSupport,
      'script-presets': presets,
      'image-model-support': imageSupport,
      'video-model-support': videoSupport,
    }[name] || { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'actual-delete-confirmation';
const key = `libtv.canvas.${projectId}`;
const read = () => JSON.parse(localStorage.getItem(key));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const undo = () => screen.getByTitle('撤销 ⌘Z');
const redo = () => screen.getByTitle('重做 ⇧⌘Z');
const snapshot = () => ({
  title: '真实删除确认验收',
  view: { x: -30, y: 17, z: 0.8 },
  nodes: [],
  edges: [],
});

function scriptSnapshot() {
  const value = snapshot();
  const script = createCanvasScriptNode({
    id: 'script',
    label: '确认删除的脚本',
    position: { x: 420, y: 260 },
    models,
  });
  script.data.params = {
    ...script.data.params,
    prompt: '原始脚本输入',
    count: 3,
    settings: { retained: true },
    advancedSettings: { hidden: 'keep' },
  };
  script.data.rows = [10, 30].map((shotNumber, index) => ({
    id: `row-${index}`,
    hiddenUuid: `raw-${index}`,
    shotNumber,
    durationSeconds: 5,
    plotDescription: '代表性脚本剧情',
    imageGenerationPrompt: '脚本图片原文',
    videoMotionPrompt: '脚本视频原文',
    imagePromptState: 'synced',
    videoPromptState: 'synced',
    characters: [],
    scenes: [],
    props: [],
  }));
  value.nodes = [
    script,
    {
      id: 'unrelated',
      type: 'text',
      position: { x: 900, y: 100 },
      width: 260,
      height: 160,
      data: { type: 'text', name: '其他文本', action: 'text_resource', content: ['保持无关内容'] },
    },
  ];
  return value;
}

function imageSnapshot() {
  const value = snapshot();
  value.nodes = ['first', 'second'].map((id, index) => ({
    id,
    type: 'image',
    position: { x: 100 + index * 450, y: 300 },
    width: 350,
    height: 230,
    data: {
      type: 'image',
      name: `已有生成内容 ${index + 1}`,
      action: 'image_resource',
      url: ['/assets/16921729b1e11174.webp'],
      params: {
        model: 'flux-2-pro',
        modeType: 'text2image',
        prompt: '图片原文',
        settings: { ratio: '16:9' },
        imageList: [],
        videoList: [],
        audioList: [],
      },
    },
  }));
  for (const node of value.nodes)
    node.data.params = resolveNodeGenerator(node, value.nodes, value.edges, models).params;
  return value;
}

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
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function page(value) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  flush();
  expect(undo().disabled).toBe(true);
  return { ...canvas, node };
}

async function keyboardDelete(canvas, id) {
  fireEvent.click(canvas.node(id));
  await act(async () => {
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyUp(window, { key: 'Delete' });
    await Promise.resolve();
  });
}

function menuDelete(canvas, id) {
  fireEvent.contextMenu(canvas.node(id), { clientX: 600, clientY: 320 });
  fireEvent.click(
    within(canvas.container.querySelector('.cv-context')).getByRole('button', { name: /删除/ }),
  );
}

function exactHistory(before, committed) {
  fireEvent.click(undo());
  flush();
  expect(graph(read())).toEqual(before);
  expect(undo().disabled).toBe(true);
  fireEvent.click(redo());
  flush();
  expect(graph(read())).toEqual(committed);
  expect(redo().disabled).toBe(true);
}

describe('actual Canvas delete confirmation routing', () => {
  it('keyboard ScriptV2 opens the source warning and cancel leaves the entire graph and history unchanged', async () => {
    const canvas = await page(scriptSnapshot());
    const before = graph(read());
    await keyboardDelete(canvas, 'script');
    const dialog = screen.getByRole('dialog', { name: '确认删除' });
    expect(
      within(dialog).getByText(
        /删除当前节点后，数据可能会丢失，也可通过 (⌘Z|Ctrl\+Z) 撤销。确定要删除吗？/,
      ),
    ).toBeTruthy();
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    flush();
    expect(graph(read())).toEqual(before);
    expect(screen.queryByRole('dialog', { name: '确认删除' })).toBeNull();
    expect(undo().disabled).toBe(true);
    expect(canvas.node('script').classList.contains('cv-selected')).toBe(true);
  });

  it(
    'confirmed ScriptV2 deletion protects the last ordinary 150ms input and every raw row through one undo/redo',
    { timeout: 15_000 },
    async () => {
      const canvas = await page(scriptSnapshot());
      fireEvent.click(canvas.node('script'));
      const generator = await screen.findByTestId('scriptv2-generator-view');
      // The card and generator are independently lazy. Finish both real imports
      // before freezing the 150ms input clock; otherwise a cold card can mount
      // inside the later async act with its initialization timers frozen.
      await screen.findByRole('button', { name: '打开脚本节点 →' });
      const input = within(generator).getByRole('textbox', { name: '提示词' });
      expect(input.getAttribute('contenteditable')).toBe('true');
      flush();
      const before = graph(read());
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const pending = '确认前最后一次普通脚本输入';
      input.textContent = pending;
      fireEvent.input(input, { inputType: 'insertText' });
      expect(read().nodes[0].data.params.prompt).toBe('原始脚本输入');
      expect(readPromptDOM(input)).toBe(pending);
      fireEvent.keyDown(window, { key: 'Delete' });
      const dialog = screen.getByRole('dialog', { name: '确认删除' });
      expect(undo().disabled).toBe(true);
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: '确定删除' }));
        await Promise.resolve();
      });
      flush();
      const committed = graph(read());
      expect(committed).toEqual({
        nodes: before.nodes.filter((node) => node.id !== 'script'),
        edges: before.edges,
      });
      expect(canvas.node('script')).toBeNull();
      await act(async () => vi.advanceTimersByTime(200));
      flush();
      expect(graph(read())).toEqual(committed);
      const baseline = {
        ...before,
        nodes: before.nodes.map((node) =>
          node.id === 'script'
            ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: pending } } }
            : node,
        ),
      };
      exactHistory(baseline, committed);
      expect(screen.queryByRole('dialog', { name: '确认删除' })).toBeNull();
    },
  );

  it('menu generated image warns, cancels without history, and confirms only the context target', async () => {
    const canvas = await page(imageSnapshot());
    const before = graph(read());
    fireEvent.click(canvas.node('second'));
    menuDelete(canvas, 'first');
    let dialog = screen.getByRole('dialog', { name: '删除节点' });
    expect(
      within(dialog).getByText(
        /该节点包含已生成的内容，删除后可通过 (⌘Z|Ctrl\+Z) 撤销。确定删除？/,
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    menuDelete(canvas, 'first');
    dialog = screen.getByRole('dialog', { name: '删除节点' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '确定删除' }));
      await Promise.resolve();
    });
    flush();
    const committed = graph(read());
    expect(committed).toEqual({
      nodes: before.nodes.filter((node) => node.id !== 'first'),
      edges: before.edges,
    });
    expect(canvas.node('first')).toBeNull();
    expect(canvas.node('second')).toBeTruthy();
    exactHistory(before, committed);
  });

  it('preserves a last row prompt edited through the actual nested script dialogs when confirming deletion and undoing it', async () => {
    const canvas = await page(scriptSnapshot());
    fireEvent.click(canvas.node('script'));
    await screen.findByTestId('scriptv2-generator-view');
    flush();
    const original = graph(read());
    // Card renderer and generator are independently lazy; wait for the genuine
    // card action before starting the row-edit flow or freezing any timeout.
    fireEvent.click(await screen.findByRole('button', { name: '打开脚本节点 →' }));
    const scriptDialog = await screen.findByRole('dialog', { name: '确认删除的脚本' });
    fireEvent.click(within(scriptDialog).getByRole('button', { name: '提示词 10' }));
    const rowDialog = await screen.findByRole('dialog', { name: '镜头10最终提示词' });
    const rowInput = within(rowDialog).getByRole('textbox', { name: '视频提示词' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = '删除前最后一次镜头视频输入';
    rowInput.textContent = pending;
    fireEvent.input(rowInput);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', { name: '镜头10最终提示词' })).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', { name: '确认删除的脚本' })).toBeNull();
    flush();
    const beforeDelete = graph(read());
    expect(beforeDelete).toEqual({
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === 'script'
          ? {
              ...node,
              data: {
                ...node.data,
                rows: node.data.rows.map((row) =>
                  row.id === 'row-0' ? { ...row, videoMotionPrompt: pending } : row,
                ),
              },
            }
          : node,
      ),
    });
    // Closing the row editor legitimately saved an earlier edit/history entry.
    // The next undo must restore the latest complete script, not the pre-edit row.
    fireEvent.keyDown(window, { key: 'Delete' });
    const dialog = screen.getByRole('dialog', { name: '确认删除' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '确定删除' }));
      await Promise.resolve();
    });
    flush();
    const committed = graph(read());
    expect(committed).toEqual({
      nodes: beforeDelete.nodes.filter((node) => node.id !== 'script'),
      edges: beforeDelete.edges,
    });
    await act(async () => vi.advanceTimersByTime(700));
    flush();
    expect(graph(read())).toEqual(committed);
    fireEvent.click(undo());
    flush();
    expect(graph(read())).toEqual(beforeDelete);
    fireEvent.click(redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(redo().disabled).toBe(true);
  });

  it('keyboard generated image directly deletes without a confirmation dialog', async () => {
    const canvas = await page(imageSnapshot());
    const before = graph(read());
    await keyboardDelete(canvas, 'first');
    flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    const committed = graph(read());
    expect(committed).toEqual({
      nodes: before.nodes.filter((node) => node.id !== 'first'),
      edges: before.edges,
    });
    exactHistory(before, committed);
  });

  it('old linked storyboard group warns with its source wording and deletes descendants only after confirmation', async () => {
    const value = imageSnapshot();
    for (const [index, node] of value.nodes.entries()) {
      node.parentId = 'old-group';
      node.position = { x: 20 + index * 400, y: 30 };
    }
    value.nodes.unshift({
      id: 'old-group',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 1000,
      height: 450,
      data: {
        type: 'group',
        name: '旧关联分镜组',
        sourceScriptNodeId: 'historical-script',
        sourceScriptVersion: 'v1',
        storyboardGroupType: 'image',
        childNodeIds: ['first', 'second'],
      },
    });
    const canvas = await page(value);
    const before = graph(read());
    await keyboardDelete(canvas, 'old-group');
    const dialog = screen.getByRole('dialog', { name: '删除分镜图组' });
    expect(
      within(dialog).getByText(
        '删除分镜图组后，组内所有分镜图及其与脚本的关联关系将消失。确定要删除吗？',
      ),
    ).toBeTruthy();
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '确定删除' }));
      await Promise.resolve();
    });
    flush();
    const committed = graph(read());
    expect(committed).toEqual({ nodes: [], edges: [] });
    exactHistory(before, committed);
  });

  it('opening-used video keyboard warning cancels without deleting or taking a history snapshot', async () => {
    const value = imageSnapshot();
    value.nodes[0] = {
      ...value.nodes[0],
      type: 'video',
      data: {
        ...value.nodes[0].data,
        type: 'video',
        action: 'video_resource',
        url: ['/assets/sample.webm'],
        openingUsed: true,
        params: { model: 'star-video2', modeType: 'text2video', prompt: 'video' },
      },
    };
    value.nodes[0].data.params = resolveNodeGenerator(
      value.nodes[0],
      value.nodes,
      value.edges,
      models,
    ).params;
    const canvas = await page(value),
      before = graph(read());
    await keyboardDelete(canvas, 'first');
    const dialog = screen.getByRole('dialog', { name: '确认删除该节点？' });
    expect(
      within(dialog).getByText(
        '删除该视频节点后，与「创意片头」相关的生成内容也将被永久删除，已发送到画布的内容不受影响',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    flush();
    expect(graph(read())).toEqual(before);
    expect(undo().disabled).toBe(true);
  });
});
