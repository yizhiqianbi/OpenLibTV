import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import scriptSupport from '../../../public/data/script-text-support.json';
import presets from '../../../public/data/script-presets.json';
import imageSupport from '../../../public/data/image-model-support.json';
import videoSupport from '../../../public/data/video-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'script-text-support'
          ? scriptSupport
          : name === 'script-presets'
            ? presets
            : name === 'image-model-support'
              ? imageSupport
              : name === 'video-model-support'
                ? videoSupport
                : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'dedicated-script-generator';
const key = `libtv.canvas.${projectId}`;
const title = '专用脚本输入验收';
const read = (storageKey = key) => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const settlePrompt = () => act(() => new Promise((resolve) => setTimeout(resolve, 180)));
const view = () => screen.getByTestId('scriptv2-generator-view');
const input = () => within(view()).getByRole('textbox', { name: '提示词' });
const generate = () => within(view()).getByRole('button', { name: '生成分镜脚本' });
const script = (document = read()) => document.nodes.find((node) => node.id === 'script');

function snapshot() {
  const node = createCanvasScriptNode({
    id: 'script',
    label: title,
    position: { x: 420, y: 260 },
    models,
  });
  return {
    title,
    view: { x: -30, y: 17, z: 0.8 },
    edges: [],
    nodes: [
      {
        ...node,
        data: {
          ...node.data,
          params: {
            ...node.data.params,
            count: 3,
            settings: { retained: true },
            advancedSettings: { hidden: 'keep' },
          },
        },
      },
      {
        id: 'other',
        type: 'text',
        position: { x: 900, y: 100 },
        width: 260,
        height: 160,
        data: { type: 'text', name: '另一节点', action: 'text_resource', content: ['独立输入'] },
      },
    ],
  };
}

function resource(value = snapshot()) {
  value.nodes[0].data.rows = [
    {
      id: 'row',
      hiddenUuid: 'raw-row',
      shotNumber: 10,
      durationSeconds: 5,
      plotDescription: '海岸晨光',
      imageGenerationPrompt: '海岸晨光',
      videoMotionPrompt: '推进镜头',
      characters: [],
      scenes: [],
      props: [],
    },
  ];
  return value;
}
function references(value = snapshot()) {
  for (const [index, id] of ['image-a', 'image-b'].entries()) {
    value.nodes.push({
      id,
      type: 'image',
      position: { x: index * 400, y: 800 },
      width: 350,
      height: 200,
      data: {
        type: 'image',
        name: `参考角色 ${index + 1}`,
        action: 'image_resource',
        url: [presets.characterToScript.characterImages[index]],
      },
    });
    value.edges.push({
      id: `edge-${id}`,
      source: id,
      sourceHandle: 'source',
      target: 'script',
      targetHandle: 'target',
    });
  }
  return value;
}
function editPrompt(text) {
  const element = input();
  element.textContent = text;
  fireEvent.input(element, { inputType: 'insertText' });
  return element;
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
afterEach(() => vi.unstubAllGlobals());

async function page(value = snapshot(), extra = {}) {
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} {...extra} />,
  );
  await waitFor(() =>
    expect(screen.getByLabelText('上传画布素材').disabled).toBe(Boolean(extra.embedded)),
  );
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(node('script')).toBeTruthy());
  fireEvent.click(node('script'));
  if (
    !extra.embedded &&
    !(value.nodes[0].data.taskInfo?.loading === true && value.nodes[0].data.taskInfo?.status === 1)
  )
    await screen.findByTestId('scriptv2-generator-view');
  return {
    ...canvas,
    node,
    board: canvas.container.querySelector('.cv-board'),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
    selectedIds: () =>
      [...canvas.container.querySelectorAll('article.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
  };
}
async function chooseModel(name) {
  fireEvent.click(within(view()).getByRole('button', { name: '选择生成模型' }));
  const list = screen.getByRole('listbox', { name: '生成模型' });
  fireEvent.click(within(list).getByRole('option', { name }));
}
function sourceImages() {
  return ['image-a', 'image-b'].map((id, index) => ({
    ref_id: `src_img_${index + 1}`,
    node_id: id,
    url: presets.characterToScript.characterImages[index],
    display_name: `参考角色 ${index + 1}`,
  }));
}

describe('actual dedicated ScriptV2 generator integration', () => {
  it('shows the dedicated workspace for empty, pending, resource and failed, hides full-generation/readonly, and never changes node bounds or view by mounting', async () => {
    const variants = [
      ['empty_generate', snapshot()],
      ['pending', references()],
      ['resource', resource()],
      ['failed', snapshot()],
      ['generating', snapshot()],
    ];
    variants[3][1].nodes[0].data.taskInfo = { loading: false, status: 3, taskId: 'failed' };
    variants[4][1].nodes[0].data.taskInfo = { loading: true, status: 1, taskId: 'running' };
    for (const [kind, value] of variants) {
      const canvas = await page(value);
      expect(canvas.node('script').dataset.scriptCardKind).toBe(kind);
      if (kind === 'generating') {
        expect(screen.queryByTestId('scriptv2-generator-view')).toBeNull();
      } else {
        expect(view().dataset.generatorType).toBe('script');
        const frame = view().closest('section');
        expect(frame.style.left).toBe('175px');
        expect(frame.style.top).toBe('366px');
        expect(frame.style.transform).toBe('scale(1.25) translateX(-50%)');
        expect(canvas.undo().disabled).toBe(true);
      }
      flush();
      expect(script().position).toEqual({ x: 420, y: 260 });
      expect(script().width).toBe(350);
      expect(script().height).toBe(350);
      expect(read().view).toEqual(value.view);
      canvas.unmount();
    }
    const locked = await page(resource(), { embedded: true });
    expect(screen.queryByTestId('scriptv2-generator-view')).toBeNull();
    expect(locked.node('script').style.left).toBe('420px');
  });

  it('offers only the three script catalogue models and commits the unsent prompt with a model choice once, preserving hidden settings', async () => {
    const canvas = await page();
    const original = graph(read());
    editPrompt('草稿剧情先于模型切换');
    fireEvent.click(within(view()).getByRole('button', { name: '选择生成模型' }));
    const list = screen.getByRole('listbox', { name: '生成模型' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.querySelector('strong').textContent),
    ).toEqual(['GVLM 3.1', 'CVLM 5.5', 'GVLM 3.1 Flash']);
    fireEvent.click(within(list).getByRole('option', { name: /CVLM 5\.5/ }));
    const committed = graph(read());
    expect(script().data.params).toMatchObject({
      model: 'cvlm-5.5',
      prompt: '草稿剧情先于模型切换',
      scene: 'script-generate-v2',
      count: 3,
      settings: { retained: true },
      advancedSettings: { hidden: 'keep' },
    });
    await settlePrompt();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual({
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === 'script'
          ? {
              ...node,
              data: {
                ...node.data,
                params: { ...node.data.params, prompt: '草稿剧情先于模型切换' },
              },
            }
          : node,
      ),
    });
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
    expect(canvas.selectedIds()).toEqual(['script']);
  });

  it('qualifies an empty script prompt through actual upstream text, saves current typed source images and reports the task service boundary without creating output', async () => {
    const value = references();
    value.nodes[1].data.content = [presets.textToScript.textPrompt];
    value.edges.push({
      id: 'text-edge',
      source: 'other',
      sourceHandle: 'source',
      target: 'script',
      targetHandle: 'target',
    });
    const canvas = await page(value);
    expect(input().textContent).toBe('');
    expect(screen.getByTestId('scriptv2-generator-text-reference').title).toBe(
      presets.textToScript.textPrompt.slice(0, 200),
    );
    expect(generate().disabled).toBe(false);
    const original = graph(read());
    fireEvent.click(generate());
    expect(script().data.params).toMatchObject({
      prompt: '',
      scene: 'script-generate-v2',
      textList: [{ nodeId: 'other', content: [presets.textToScript.textPrompt] }],
      scenePayload: { source_images: sourceImages() },
    });
    expect(script().data.rows).toEqual([]);
    expect(script().data).not.toHaveProperty('taskInfo');
    expect(read().nodes).toHaveLength(original.nodes.length);
    expect(read().edges).toEqual(original.edges);
    expect(within(view()).getByRole('alert').textContent).toContain('脚本生成服务尚未接入');
    expect(canvas.selectedIds()).toEqual(['script']);
  });

  it('persists the last 150ms prompt synchronously on pagehide and restores it after a real remount', async () => {
    const canvas = await page();
    editPrompt('尚未等到防抖的最后剧情');
    expect(script().data.params.prompt).toBe('');
    flush();
    expect(script().data.params.prompt).toBe('尚未等到防抖的最后剧情');
    expect(read().view).toEqual(snapshot().view);
    canvas.unmount();
    const restored = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
    fireEvent.click(restored.container.querySelector('article[data-node-id="script"]'));
    await screen.findByTestId('scriptv2-generator-view');
    expect(input().textContent).toBe('尚未等到防抖的最后剧情');
    expect(script().data.rows).toEqual([]);
  });

  it('retains an unsent prompt when another node is selected and does not lose it when the generator remounts', async () => {
    const canvas = await page();
    editPrompt('选择切换前的最后输入');
    fireEvent.click(canvas.node('other'));
    expect(screen.queryByTestId('scriptv2-generator-view')).toBeNull();
    expect(canvas.selectedIds()).toEqual(['other']);
    flush();
    expect(script().data.params.prompt).toBe('选择切换前的最后输入');
    expect(read().nodes[1].data.content).toEqual(['独立输入']);
    fireEvent.click(canvas.node('script'));
    await screen.findByTestId('scriptv2-generator-view');
    expect(input().textContent).toBe('选择切换前的最后输入');
    expect(read().view).toEqual(snapshot().view);
  });

  it('reorders only the requested typed key, keeps prompt tokens byte-for-byte and uses exactly one undo/redo', async () => {
    const value = references();
    value.nodes[0].data.params = {
      ...value.nodes[0].data.params,
      prompt: '主体 {{Image 1}} 对照 {{Image 2}}，未知 {{Video 9}}',
      imageListOrder: ['image-a', 'image-b'],
      videoListOrder: ['video-stays'],
      audioListOrder: ['audio-stays'],
      mixedListOrder: ['mixed-stays'],
    };
    const canvas = await page(value);
    const original = graph(read());
    const cards = view().querySelectorAll('.cv-inline-reference');
    const transfer = { effectAllowed: '', setData: vi.fn(), getData: () => '', types: [] };
    fireEvent.dragStart(cards[0], { dataTransfer: transfer });
    fireEvent.dragOver(cards[1], { dataTransfer: transfer });
    fireEvent.drop(cards[1], { dataTransfer: transfer });
    const committed = graph(read());
    expect(script().data.params.imageListOrder).toEqual(['image-b', 'image-a']);
    expect(script().data.params).toMatchObject({
      prompt: original.nodes[0].data.params.prompt,
      videoListOrder: ['video-stays'],
      audioListOrder: ['audio-stays'],
      mixedListOrder: ['mixed-stays'],
    });
    expect(input().textContent).toContain('未知');
    expect(read().edges).toEqual(original.edges);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('deletes the actual incoming edge while retaining the source node, other references and an unsent prompt in one transaction', async () => {
    const canvas = await page(references());
    const original = graph(read());
    editPrompt('删除输入边时保留的 {{Image 2}} 原编号');
    fireEvent.click(within(view()).getByRole('button', { name: '删除参考素材 1' }));
    const committed = graph(read());
    expect(committed.edges).toEqual(original.edges.filter((edge) => edge.id !== 'edge-image-a'));
    expect(committed.nodes.map((node) => node.id)).toEqual(original.nodes.map((node) => node.id));
    expect(committed.nodes.find((node) => node.id === 'image-a')).toEqual(
      original.nodes.find((node) => node.id === 'image-a'),
    );
    expect(script().data.params.prompt).toBe('删除输入边时保留的 {{Image 2}} 原编号');
    expect(view().querySelectorAll('.cv-inline-reference')).toHaveLength(1);
    fireEvent.click(canvas.undo());
    flush();
    expect(read().edges).toEqual(original.edges);
    expect(canvas.undo().disabled).toBe(true);
    expect(script().data.params.prompt).toBe('删除输入边时保留的 {{Image 2}} 原编号');
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it('keeps a model/prompt commit in memory after Quota failure and retries saving it without another graph or history mutation', async () => {
    const canvas = await page();
    const original = graph(read());
    const native = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (blocked && name === key) throw new DOMException('quota', 'QuotaExceededError');
      return native.call(this, name, value);
    });
    editPrompt('保存失败也保留的剧情');
    await chooseModel(/CVLM 5\.5/);
    expect(input().textContent).toBe('保存失败也保留的剧情');
    expect(within(view()).getByRole('alert').textContent).toContain('本机保存失败');
    expect(graph(read())).toEqual(original);
    const retry = within(view()).getByRole('button', { name: '重试保存脚本参数' });
    blocked = false;
    fireEvent.click(retry);
    const committed = graph(read());
    expect(script().data.params.model).toBe('cvlm-5.5');
    expect(script().data.params.prompt).toBe('保存失败也保留的剧情');
    expect(committed.nodes).toHaveLength(original.nodes.length);
    expect(committed.edges).toEqual(original.edges);
    expect(within(view()).queryByRole('button', { name: '重试保存脚本参数' })).toBeNull();
    await settlePrompt();
    fireEvent.click(canvas.undo());
    flush();
    expect(script().data.params.model).toBe(original.nodes[0].data.params.model);
    expect(script().data.params.prompt).toBe('保存失败也保留的剧情');
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
  });

  it.each(['selection', 'preview'])(
    'retains the document save retry after automatic Quota failure and a temporary %s transition, without another graph/history mutation',
    async (kind) => {
      const canvas = await page(references());
      const original = graph(read());
      const native = Storage.prototype.setItem;
      let blocked = true,
        failures = 0;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
        if (blocked && name === key) {
          failures += 1;
          throw new DOMException('quota', 'QuotaExceededError');
        }
        return native.call(this, name, value);
      });
      editPrompt('临时隐藏后仍可保存的剧情');
      await chooseModel(/CVLM 5\.5/);
      // Verify both the synchronous action flush and the real 600ms automatic
      // save have failed before hiding the inline owner. No fake autosave runs.
      const synchronousFailures = failures;
      expect(synchronousFailures).toBeGreaterThan(0);
      await act(() => new Promise((resolve) => setTimeout(resolve, 650)));
      expect(failures).toBeGreaterThan(synchronousFailures);
      expect(graph(read())).toEqual(original);
      expect(screen.getByRole('button', { name: '重试保存画布' })).toBeTruthy();
      if (kind === 'selection') {
        fireEvent.click(canvas.node('other'));
        expect(screen.queryByTestId('scriptv2-generator-view')).toBeNull();
        expect(canvas.selectedIds()).toEqual(['other']);
      } else {
        fireEvent.click(within(view()).getByRole('button', { name: '预览参考素材 1' }));
        expect(await screen.findByRole('dialog', { name: '参考角色 1' })).toBeTruthy();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        await screen.findByTestId('scriptv2-generator-view');
        expect(within(view()).queryByRole('button', { name: '重试保存脚本参数' })).toBeNull();
      }
      const beforeRetryIds = [...canvas.container.querySelectorAll('article[data-node-id]')].map(
        (node) => node.dataset.nodeId,
      );
      blocked = false;
      fireEvent.click(screen.getByRole('button', { name: '重试保存画布' }));
      const committed = graph(read());
      expect(screen.queryByRole('button', { name: '重试保存画布' })).toBeNull();
      expect(canvas.container.querySelector('.cv-save-state').textContent).toContain('已保存');
      expect(committed.nodes.map((node) => node.id)).toEqual(beforeRetryIds);
      expect(committed.nodes.map((node) => node.id)).toEqual(original.nodes.map((node) => node.id));
      expect(committed.edges).toEqual(original.edges);
      expect(script().data.params).toMatchObject({
        model: 'cvlm-5.5',
        prompt: '临时隐藏后仍可保存的剧情',
        scenePayload: { source_images: sourceImages() },
      });
      expect(read().view).toEqual(snapshot().view);
      if (kind === 'selection') {
        fireEvent.click(canvas.node('script'));
        await screen.findByTestId('scriptv2-generator-view');
        expect(input().textContent).toBe('临时隐藏后仍可保存的剧情');
      }
      fireEvent.click(canvas.undo());
      flush();
      expect(graph(read())).toEqual({
        ...original,
        nodes: original.nodes.map((node) =>
          node.id === 'script'
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: { ...node.data.params, prompt: '临时隐藏后仍可保存的剧情' },
                },
              }
            : node,
        ),
      });
      expect(canvas.undo().disabled).toBe(true);
      fireEvent.click(canvas.redo());
      flush();
      expect(graph(read())).toEqual(committed);
      expect(canvas.redo().disabled).toBe(true);
    },
  );

  it('rejects the previous document debounce when a new document reuses the same script ID', async () => {
    const canvas = await page();
    editPrompt('旧文档的未提交输入');
    const otherId = `${projectId}-next`,
      otherKey = `libtv.canvas.${otherId}`;
    const next = snapshot();
    next.title = '新文档';
    next.nodes[0].data.params.prompt = '同ID新文档剧情';
    localStorage.setItem(otherKey, JSON.stringify(next));
    canvas.rerender(
      <NodeCanvas path={`/canvas?projectId=${otherId}`} user={LOCAL_WORKSPACE_USER} />,
    );
    await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
    fireEvent.click(canvas.node('script'));
    await waitFor(() => expect(input().textContent).toBe('同ID新文档剧情'));
    await settlePrompt();
    flush();
    expect(script(read(otherKey)).data.params.prompt).toBe('同ID新文档剧情');
    expect(read(otherKey).edges).toEqual([]);
    expect(canvas.undo().disabled).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('isolates native button Space and frame double-click from the script card and preserves nested menu/expanded Escape focus', async () => {
    const canvas = await page(resource());
    const original = graph(read());
    const frame = view().closest('section');
    fireEvent.doubleClick(frame);
    fireEvent.doubleClick(within(view()).getByRole('button', { name: '选择生成模型' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const expand = screen.getByRole('button', { name: '展开生成器' });
    expand.focus();
    const space = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' ',
      code: 'Space',
    });
    fireEvent(expand, space);
    expect(space.defaultPrevented).toBe(false);
    fireEvent.keyUp(expand, { key: ' ', code: 'Space' });
    fireEvent.click(expand);
    const dialog = await screen.findByRole('dialog', { name: `展开${title}生成器` });
    expect(screen.queryByRole('dialog', { name: title })).toBeNull();
    const modelTrigger = within(dialog).getByRole('button', { name: '选择生成模型' });
    modelTrigger.focus();
    fireEvent.click(modelTrigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(modelTrigger);
    expect(screen.getByRole('dialog', { name: `展开${title}生成器` })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '展开生成器' })),
    );
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.node('script').style.left).toBe('420px');
    expect(read().view).toEqual(snapshot().view);
  });
});
