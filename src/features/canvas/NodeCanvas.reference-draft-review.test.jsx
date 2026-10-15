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

const projectId = 'ordinary-reference-draft-review';
const storageKey = `libtv.canvas.${projectId}`;
const rawPrompt = '{{Image 1}}';
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const target = (value = read()) => value.nodes.find((node) => node.id === 'target');
const frame = () => document.querySelector('.cv-inline-generator');
const editor = () => within(frame()).getByRole('textbox', { name: '提示词' });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));

function snapshot(type) {
  const sources = ['first', 'second'].map((id, index) => ({
    id,
    type: 'image',
    position: { x: 50 + index * 400, y: 600 },
    width: 350,
    height: 350,
    data: {
      type: 'image',
      name: `普通参考 ${index + 1}`,
      action: 'image_resource',
      url: [`https://ordinary-reference.example.test/${id}.png`],
    },
  }));
  const value = {
    title: '普通参考草稿事务复核',
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
          name: '普通生成目标',
          action: `${type}_generate`,
          generationError: '',
          params: {
            model: type === 'image' ? 'flux-2-pro' : 'star-video2',
            modeType: type === 'image' ? 'image2image' : 'image2video',
            prompt: rawPrompt,
            count: 1,
            settings: { ratio: '16:9' },
            imageListOrder: ['first', 'second'],
          },
        },
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
  const node = value.nodes.find((item) => item.id === 'target');
  // Start with a legitimate resolved schema, so a delayed prompt write cannot
  // masquerade as a reference bug by merely materializing display defaults.
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

async function page(type) {
  localStorage.setItem(storageKey, JSON.stringify(snapshot(type)));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  fireEvent.click(canvas.container.querySelector('article[data-node-id="target"]'));
  // The shell is eager, but the real generator/editor implementation is genuinely lazy.
  await waitFor(() =>
    expect(within(frame()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
  );
  expect(within(frame()).getByRole('button', { name: '删除参考素材 2' })).toBeTruthy();
  flush();
  expect(target().data.params.prompt).toBe(rawPrompt);
  expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  return {
    ...canvas,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}

function typePending(value) {
  // Freeze only the real editor's timeout/debounce after lazy mounting. Graph,
  // history, draft projection and persistence remain their production implementations.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  editor().textContent = value;
  fireEvent.input(editor(), { inputType: 'insertText' });
  expect(target().data.params.prompt).toBe(rawPrompt);
  expect(readPromptDOM(editor())).toBe(value);
}

async function settlePending() {
  await act(async () => vi.advanceTimersByTime(200));
  flush();
}

function withPrompt(before, prompt) {
  return {
    ...before,
    nodes: before.nodes.map((node) =>
      node.id === 'target'
        ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt } } }
        : node,
    ),
  };
}

describe('actual ordinary reference transactions versus the pending prompt baseline', () => {
  it.each(['image', 'video'])(
    '%s reference deletion consumes the latest prompt, removes its orphaned token, and records one history step',
    async (type) => {
      const canvas = await page(type);
      const before = graph(read());
      const draft = '{{Image 1}} {{Image 2}}';
      typePending(draft);
      fireEvent.click(within(frame()).getByRole('button', { name: '删除参考素材 2' }));
      flush();
      const committed = graph(read());
      expect(committed.edges).toEqual(before.edges.filter((edge) => edge.source === 'first'));
      expect(committed.nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
      expect(committed.nodes.slice(0, 2)).toEqual(before.nodes.slice(0, 2));
      // Complete store ig clears removed occurrences; a result equal to the raw
      // baseline must not let the pending timer restore the second token.
      expect(target().data.params.prompt).toBe(rawPrompt);
      expect(readPromptDOM(editor())).toBe(rawPrompt);
      expect(editor().querySelector('[data-prompt-token="{{Image 2}}"]')).toBeNull();
      await settlePending();
      expect(graph(read())).toEqual(committed);
      expect(readPromptDOM(editor())).toBe(rawPrompt);
      fireEvent.click(canvas.undo());
      flush();
      expect(graph(read())).toEqual(withPrompt(before, draft));
      expect(canvas.undo().disabled).toBe(true);
      fireEvent.click(canvas.redo());
      flush();
      expect(graph(read())).toEqual(committed);
      expect(canvas.redo().disabled).toBe(true);
    },
  );

  it.each(['image', 'video'])(
    '%s reorder follows its source prompt protocol through pending input, persisted order and one undo/redo step',
    async (type) => {
      const canvas = await page(type);
      const before = graph(read());
      const draft = '{{Image 2}}';
      const expectedPrompt = type === 'image' ? draft : rawPrompt;
      typePending(draft);
      const cards = [...frame().querySelectorAll('.cv-inline-reference')];
      expect(cards).toHaveLength(2);
      const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
      fireEvent.dragStart(cards[1], { dataTransfer });
      fireEvent.dragOver(cards[0], { dataTransfer });
      fireEvent.drop(cards[0], { dataTransfer });
      flush();
      const committed = graph(read());
      const expected = {
        edges: before.edges,
        nodes: before.nodes.map((node) =>
          node.id === 'target'
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: {
                    ...node.data.params,
                    prompt: expectedPrompt,
                    imageListOrder: ['second', 'first'],
                    ...(type === 'video'
                      ? {
                          videoListOrder: [],
                          audioListOrder: [],
                          mixedListOrder: ['second', 'first'],
                        }
                      : {}),
                  },
                },
              }
            : node,
        ),
      };
      expect(target().data.params.imageListOrder).toEqual(['second', 'first']);
      expect(committed.edges).toEqual(before.edges);
      expect(committed.nodes.slice(0, 2)).toEqual(before.nodes.slice(0, 2));
      // Source image eL keeps the literal typed token. Video r1 keeps stable
      // reference identity and produces the prior raw baseline on this reorder.
      expect.soft(target().data.params.prompt).toBe(expectedPrompt);
      expect.soft(readPromptDOM(editor())).toBe(expectedPrompt);
      expect.soft(committed).toEqual(expected);
      expect
        .soft(editor().querySelector('[data-prompt-token]')?.dataset.mentionNodeId)
        .toBe(type === 'image' ? 'first' : 'second');
      await settlePending();
      expect.soft(graph(read())).toEqual(expected);
      expect.soft(target().data.params.prompt).toBe(expectedPrompt);
      expect.soft(readPromptDOM(editor())).toBe(expectedPrompt);
      fireEvent.click(canvas.undo());
      flush();
      expect(graph(read())).toEqual(withPrompt(before, draft));
      expect(canvas.undo().disabled).toBe(true);
      expect(readPromptDOM(editor())).toBe(draft);
      fireEvent.click(canvas.redo());
      flush();
      expect.soft(graph(read())).toEqual(expected);
      expect(graph(read()).edges).toEqual(before.edges);
      expect(target().data.params.imageListOrder).toEqual(['second', 'first']);
      expect.soft(target().data.params.prompt).toBe(expectedPrompt);
      expect.soft(readPromptDOM(editor())).toBe(expectedPrompt);
      expect(canvas.redo().disabled).toBe(true);
    },
  );
});
