import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { readPromptDOM } from './generator/node-prompt-dom.js';
import { resolveNodeGenerator } from './generator/node-generator.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'ordinary-reference-delete-integration';
const storageKey = `libtv.canvas.${projectId}`;
const rawPrompt = '{{Image 1}}';
const read = (key = storageKey) => JSON.parse(localStorage.getItem(key));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const target = (value = read()) => value.nodes.find((node) => node.id === 'target');
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const url = (id) => `https://ordinary-delete.example.test/${id}.png`;

function snapshot(type = 'video') {
  const sources = ['first', 'second', 'third'].map((id, index) => ({
    id,
    type: 'image',
    position: { x: 50 + index * 400, y: 650 },
    width: 350,
    height: 350,
    data: {
      type: 'image',
      name: `普通参考 ${index + 1}`,
      action: 'image_resource',
      url: [url(id)],
    },
  }));
  const value = {
    title: '普通参考删除实际图验收',
    view: { x: -40, y: 20, z: 0.8 },
    nodes: [
      ...sources,
      {
        id: 'target',
        type,
        position: { x: 1200, y: 200 },
        width: 350,
        height: 230,
        data: {
          type,
          name: '生成目标',
          action: `${type}_generate`,
          generationError: '',
          params: {
            model: type === 'image' ? 'flux-2-pro' : 'star-video2',
            modeType: type === 'image' ? 'image2image' : 'image2video',
            prompt: rawPrompt,
            count: 1,
            settings: { ratio: '16:9' },
            imageList: sources.map((source) => ({
              nodeId: source.id,
              url: source.data.url[0],
              label: source.data.name,
            })),
            videoList: [],
            audioList: [],
            imageListOrder: sources.map((source) => source.id),
            videoListOrder: [],
            audioListOrder: [],
            mixedListOrder: sources.map((source) => source.id),
          },
        },
      },
      {
        id: 'unrelated',
        type: 'text',
        position: { x: 2000, y: 100 },
        width: 260,
        height: 160,
        data: { type: 'text', name: '无关资源', action: 'text_resource', content: ['原文不改'] },
      },
    ],
    edges: sources.map((source, index) => ({
      id: `edge-${index}`,
      source: source.id,
      sourceHandle: 'source',
      target: 'target',
      targetHandle: 'target',
    })),
  };
  const node = target(value);
  // Canonical public-schema fixture avoids treating materialized display defaults
  // as a graph transaction change. No production graph/model/history is mocked.
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

async function page(type = 'video', value = snapshot(type)) {
  localStorage.setItem(storageKey, JSON.stringify(value));
  const props = { path: `/canvas?projectId=${projectId}`, user: LOCAL_WORKSPACE_USER };
  const canvas = render(<NodeCanvas {...props} />);
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  fireEvent.click(node('target'));
  const frame = () => node('target').querySelector('.cv-inline-generator');
  await waitFor(() =>
    expect(within(frame()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
  );
  const editor = () => within(frame()).getByRole('textbox', { name: '提示词' });
  flush();
  expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  return {
    ...canvas,
    props,
    node,
    frame,
    editor,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}

function pendingInput(canvas, value) {
  // Only timeout/debounce is frozen, after the genuinely lazy editor has mounted.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  canvas.editor().textContent = value;
  fireEvent.input(canvas.editor(), { inputType: 'insertText' });
  expect(target().data.params.prompt).toBe(rawPrompt);
  expect(readPromptDOM(canvas.editor())).toBe(value);
}

const baseline = (before, prompt) => ({
  ...before,
  nodes: before.nodes.map((node) =>
    node.id === 'target'
      ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt } } }
      : node,
  ),
});

async function confirmOneHistory(canvas, before, pending, committed) {
  await act(async () => vi.advanceTimersByTime(200));
  flush();
  expect.soft(graph(read())).toEqual(committed);
  fireEvent.click(canvas.undo());
  flush();
  expect(graph(read())).toEqual(baseline(before, pending));
  expect(readPromptDOM(canvas.editor())).toBe(pending);
  expect(canvas.undo().disabled).toBe(true);
  fireEvent.click(canvas.redo());
  flush();
  expect.soft(graph(read())).toEqual(committed);
  expect(canvas.redo().disabled).toBe(true);
}

const typedCases = [
  { name: 'first', index: 1, removed: 'first', expected: '{{Image 1}} {{Image 1}} {{Portrait 2}}' },
  { name: 'middle', index: 2, removed: 'second', expected: '{{Image 1}} {{Portrait 2}}' },
  { name: 'last', index: 3, removed: 'third', expected: '{{Image 1}} {{Image 2}} {{Image 2}}' },
];

describe('actual ordinary reference deletion with source-confirmed token cleanup', () => {
  it('removes an audio occurrence from a reordered Mixed list and converts surviving typed mentions using the old mode', async () => {
    const value = snapshot('video');
    value.nodes[1] = {
      ...value.nodes[1],
      type: 'video',
      data: { ...value.nodes[1].data, type: 'video', url: ['/video.webm'] },
    };
    value.nodes[2] = {
      ...value.nodes[2],
      type: 'audio',
      data: { ...value.nodes[2].data, type: 'audio', url: ['/audio.wav'] },
    };
    const owner = target(value);
    owner.data.params = {
      ...owner.data.params,
      model: 'star-video2.5',
      modeType: 'mixed2video',
      imageList: [{ nodeId: 'first', url: url('first') }],
      videoList: [{ nodeId: 'second', url: '/video.webm' }],
      audioList: [{ nodeId: 'third', url: '/audio.wav' }],
      imageListOrder: ['first'],
      videoListOrder: ['second'],
      audioListOrder: ['third'],
      mixedListOrder: ['third', 'first', 'second'],
    };
    owner.data.params = resolveNodeGenerator(owner, value.nodes, value.edges, models).params;
    const canvas = await page('video', value),
      before = graph(read());
    const pending = '{{Mixed 1}} {{Image 1}} {{Video 1}} {{Audio 1}} {{Mixed 3}}';
    pendingInput(canvas, pending);
    fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 1' }));
    flush();
    const committed = graph(read());
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'third'));
    expect(target().data.params.prompt).toBe('{{Mixed 1}} {{Mixed 2}} {{Mixed 2}}');
    expect(readPromptDOM(canvas.editor())).toBe(target().data.params.prompt);
    expect(
      [...canvas.editor().querySelectorAll('[data-prompt-token]')].map(
        (badge) => badge.dataset.mentionNodeId,
      ),
    ).toEqual(['first', 'second', 'second']);
    expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
      before.nodes.filter((node) => node.id !== 'target'),
    );
    await confirmOneHistory(canvas, before, pending, committed);
  });

  it('keeps the group edge when its only image is removed but an ignored reference leaf remains', async () => {
    const value = snapshot('video');
    const owner = target(value),
      picture = value.nodes[0];
    picture.parentId = 'group';
    value.nodes = [
      {
        id: 'group',
        type: 'group',
        position: { x: 50, y: 500 },
        width: 600,
        height: 350,
        data: { type: 'group', name: '包含非媒体叶节点的组' },
      },
      picture,
      {
        id: 'ignored-leaf',
        type: 'reference',
        parentId: 'group',
        position: { x: 400, y: 0 },
        width: 150,
        height: 150,
        data: { type: 'reference', text: '保留组连线的参考说明' },
      },
      owner,
    ];
    owner.data.params = {
      ...owner.data.params,
      imageList: [{ nodeId: picture.id, url: url(picture.id) }],
      imageListOrder: [picture.id],
      mixedListOrder: [picture.id],
    };
    owner.data.params = resolveNodeGenerator(
      owner,
      value.nodes,
      [{ id: 'group-edge', source: 'group', target: owner.id }],
      models,
    ).params;
    value.edges = [{ id: 'group-edge', source: 'group', target: owner.id }];
    const canvas = await page('video', value),
      before = graph(read());
    const pending = '{{Image 1}} 保留这段文本';
    pendingInput(canvas, pending);
    fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 1' }));
    flush();
    const committed = graph(read());
    expect(committed.edges).toEqual(before.edges);
    expect(target().data.groupRefExcludedNodeIds).toEqual(['first']);
    expect(target().data.params.prompt).toBe('保留这段文本');
    expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
      before.nodes.filter((node) => node.id !== 'target'),
    );
    expect(canvas.frame().querySelector('.cv-inline-references')).toBeNull();
    await confirmOneHistory(canvas, before, pending, committed);
  });

  it('retains the accepted cleaned graph on quota failure and retries saving it without repeating deletion or history', async () => {
    const canvas = await page(),
      before = graph(read());
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (blocked && key === storageKey) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, key, value);
    });
    const pending = '{{Image 1}} {{Image 2}}';
    pendingInput(canvas, pending);
    fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 2' }));
    flush();
    expect(graph(read())).toEqual(before);
    expect(readPromptDOM(canvas.editor())).toBe(rawPrompt);
    expect(canvas.frame().querySelectorAll('.cv-inline-reference')).toHaveLength(2);
    await act(async () => vi.advanceTimersByTime(700));
    expect(graph(read())).toEqual(before);
    expect(readPromptDOM(canvas.editor())).toBe(rawPrompt);
    blocked = false;
    fireEvent.click(screen.getByRole('button', { name: '重试保存画布' }));
    flush();
    const committed = graph(read());
    expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'second'));
    expect(target().data.params.prompt).toBe(rawPrompt);
    await confirmOneHistory(canvas, before, pending, committed);
  });

  describe.each(['image', 'video'])('%s typed references', (type) => {
    it.each(typedCases)(
      'deletes the $name reference, removes every occurrence of that source and renumbers remaining typed tokens from the latest 150ms input',
      async ({ index, removed, expected }) => {
        const canvas = await page(type);
        const before = graph(read());
        const beforeView = read().view;
        const editor = canvas.editor();
        const pending = '{{Image 1}} {{Image 2}} {{Image 2}} {{Portrait 3}}';
        pendingInput(canvas, pending);
        fireEvent.click(
          within(canvas.frame()).getByRole('button', { name: `删除参考素材 ${index}` }),
        );
        flush();
        const committed = graph(read());
        expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== removed));
        expect(committed.nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
        expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
          before.nodes.filter((node) => node.id !== 'target'),
        );
        expect(target().position).toEqual(target(before).position);
        expect(read().view).toEqual(beforeView);
        expect(canvas.node('target').classList.contains('cv-selected')).toBe(true);
        expect(canvas.editor()).toBe(editor);
        expect.soft(target().data.params.prompt).toBe(expected);
        expect.soft(readPromptDOM(editor)).toBe(expected);
        expect(target().data.params.imageList.map((reference) => reference.nodeId)).toEqual(
          ['first', 'second', 'third'].filter((id) => id !== removed),
        );
        await confirmOneHistory(canvas, before, pending, committed);
        expect.soft(target().data.params.prompt).toBe(expected);
        expect.soft(readPromptDOM(canvas.editor())).toBe(expected);
      },
    );

    it('consumes the input draft when removal maps back to the original raw prompt, so 200ms, pagehide and redo cannot resurrect the deleted token', async () => {
      const canvas = await page(type);
      const before = graph(read());
      const pending = '{{Image 1}} {{Image 2}}';
      pendingInput(canvas, pending);
      fireEvent.click(within(canvas.frame()).getByRole('button', { name: '删除参考素材 2' }));
      flush();
      const committed = graph(read());
      expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source !== 'second'));
      expect(committed.nodes.filter((node) => node.id !== 'target')).toEqual(
        before.nodes.filter((node) => node.id !== 'target'),
      );
      expect.soft(target().data.params.prompt).toBe(rawPrompt);
      expect.soft(readPromptDOM(canvas.editor())).toBe(rawPrompt);
      expect.soft(canvas.editor().querySelectorAll('[data-prompt-token]')).toHaveLength(1);
      expect(canvas.editor().querySelector('[data-prompt-token]')?.dataset.mentionNodeId).toBe(
        'first',
      );
      await confirmOneHistory(canvas, before, pending, committed);
      expect.soft(target().data.params.prompt).toBe(rawPrompt);
      expect.soft(readPromptDOM(canvas.editor())).toBe(rawPrompt);
    });
  });
});
