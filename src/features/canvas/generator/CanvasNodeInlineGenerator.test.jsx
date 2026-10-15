import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import CanvasNodeInlineGenerator from './CanvasNodeInlineGenerator.jsx';
import { useCanvasGraphActions } from '../hooks/useCanvasGraphActions.js';
import { writeStoredValue } from '../../../services/storage.ts';
import { readPromptDOM } from './node-prompt-dom.js';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));

const asset = (url) => url;
const nodeWithPrompt = (prompt = '') => ({
  id: 'inline-video',
  type: 'video',
  width: 350,
  height: 230,
  position: { x: 100, y: 100 },
  data: { name: '视频生成器', params: { model: 'star-video2', modeType: 'text2video', prompt } },
});
function makeDocument(documentKey, prompt = '') {
  return { documentKey, ready: true, nodes: [nodeWithPrompt(prompt)], edges: [] };
}
function editPrompt(text) {
  const prompt = screen.getByRole('textbox', { name: '提示词' });
  prompt.textContent = text;
  prompt.focus();
  const range = document.createRange();
  range.selectNodeContents(prompt);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(prompt, { inputType: 'insertText' });
}
function mountInline(initial) {
  let current = initial;
  const update = vi.fn((id, patch) => {
    current = {
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    };
  });
  const props = () => ({
    node: current.nodes[0],
    nodes: current.nodes,
    edges: current.edges,
    models,
    asset,
    readonly: false,
    ready: true,
    update,
    generateNode: vi.fn(),
    position: current.nodes[0].position,
    zoom: 1,
    documentKey: current.documentKey,
    getDocument: () => current,
  });
  const page = render(<CanvasNodeInlineGenerator {...props()} />);
  return {
    page,
    update,
    getDocument: () => current,
    replaceDocument: (next) => {
      current = next;
      page.rerender(<CanvasNodeInlineGenerator {...props()} />);
    },
    deleteNode: () => {
      current = { ...current, nodes: [] };
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('mounted inline generator prompt lifecycle', () => {
  it('flushes a pending prompt before deselection/unmount rather than losing the last 150ms', () => {
    vi.useFakeTimers();
    const { page, update, getDocument } = mountInline(makeDocument('first'));
    editPrompt('尚未经过 debounce 的最后输入');
    act(() => vi.advanceTimersByTime(149));
    expect(update).not.toHaveBeenCalled();
    page.unmount();
    expect(getDocument().nodes[0].data.params).toMatchObject({
      model: 'star-video2',
      modeType: 'text2video',
      prompt: '尚未经过 debounce 的最后输入',
    });
    const writes = update.mock.calls.length;
    act(() => vi.advanceTimersByTime(150));
    expect(update).toHaveBeenCalledTimes(writes);
  });

  it('cancels the previous document draft and never writes it into another document with the same node id', () => {
    vi.useFakeTimers();
    const { page, update, replaceDocument, getDocument } = mountInline(
      makeDocument('first', '第一份'),
    );
    editPrompt('第一份 pending');
    replaceDocument(makeDocument('second', '第二份'));
    act(() => vi.advanceTimersByTime(150));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: '提示词' }).textContent).toBe('第二份');
    page.unmount();
    expect(getDocument().nodes[0].data.params.prompt).toBe('第二份');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not resurrect a deleted node from its pending prompt during cleanup', () => {
    vi.useFakeTimers();
    const { page, update, deleteNode, getDocument } = mountInline(makeDocument('first'));
    editPrompt('已删除节点的 pending');
    deleteNode();
    page.unmount();
    act(() => vi.advanceTimersByTime(150));
    expect(update).not.toHaveBeenCalled();
    expect(getDocument().nodes).toEqual([]);
  });
});

function AssetImportHarness({ observe, recordSnapshot }) {
  const [nodes, setNodes] = useState(() => {
    const node = nodeWithPrompt('@');
    return [{ ...node, data: { ...node.data, type: 'video', action: 'video_generate' } }];
  });
  const [edges, setEdges] = useState([]);
  const currentDocument = useRef(null);
  currentDocument.current = {
    documentKey: 'asset-doc',
    ready: true,
    readonly: false,
    nodes,
    edges,
    models,
  };
  observe.current = currentDocument;
  const graphActions = useCanvasGraphActions({
    documentKey: 'asset-doc',
    currentDocument,
    setNodes,
    setEdges,
    recordSnapshot,
  });
  const update = (id, patch) =>
    setNodes((current) =>
      current.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  return (
    <CanvasNodeInlineGenerator
      node={nodes[0]}
      nodes={nodes}
      edges={edges}
      models={models}
      asset={asset}
      readonly={false}
      ready
      update={update}
      generateNode={vi.fn()}
      position={nodes[0].position}
      zoom={1}
      documentKey="asset-doc"
      getDocument={() => currentDocument.current}
      graphActions={graphActions}
    />
  );
}

describe('actual inline asset import and current graph mode', () => {
  it.each([
    ['a legacy local URL', null, ['/first-image.png']],
    [
      'the first v2 payload with an empty first URL',
      JSON.stringify({
        version: 2,
        items: [
          { data: { type: 'image', action: 'image_resource', url: ['', '/first-image.png'] } },
          { data: { type: 'video', action: 'video_resource', url: ['/second-item.mp4'] } },
        ],
      }),
      ['', '/first-image.png'],
    ],
  ])(
    'imports %s using the final mixed token and one graph undo snapshot',
    async (_label, assetData, savedUrls) => {
      localStorage.clear();
      writeStoredValue(
        'libtv-asset-library',
        {
          assets: [
            {
              id: 'first-image',
              name: '首次引用图片',
              type: 'image',
              mimeType: 'image/png',
              url: '/first-image.png',
              folderId: null,
              tags: [],
              createdAt: 1,
              ...(assetData ? { assetData } : {}),
            },
          ],
          folders: [],
          tags: [],
        },
        { version: 1 },
      );
      const user = userEvent.setup();
      const observe = { current: null };
      const recordSnapshot = vi.fn();
      render(<AssetImportHarness observe={observe} recordSnapshot={recordSnapshot} />);
      expect(screen.getByRole('combobox', { name: '生成模式' }).value).toBe('text2video');
      editPrompt('@');
      await user.click(await screen.findByRole('button', { name: '资产' }));
      const picker = await screen.findByRole('dialog', { name: '引用资产' });
      expect(picker.parentElement.parentElement).toBe(document.body);
      await user.click(await within(picker).findByRole('checkbox', { name: '选择 首次引用图片' }));
      await user.click(within(picker).getByRole('button', { name: '确定引用' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '引用资产' })).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: '生成模式' }).value).toBe('mixed2video'),
      );
      const current = observe.current.current;
      expect(current.nodes[0].data.params).toMatchObject({
        modeType: 'mixed2video',
        prompt: '{{Mixed 1}} ',
      });
      expect(readPromptDOM(screen.getByRole('textbox', { name: '提示词' }))).toBe('{{Mixed 1}} ');
      expect(
        screen.getByRole('textbox', { name: '提示词' }).querySelector('[data-prompt-token]')
          ?.dataset.promptToken,
      ).toBe('{{Mixed 1}}');
      expect(current.nodes).toHaveLength(2);
      expect(current.nodes[1].data.url).toEqual(savedUrls);
      expect(current.edges).toHaveLength(1);
      expect(recordSnapshot).toHaveBeenCalledOnce();
      expect(recordSnapshot.mock.lastCall[0]).toMatchObject({
        edges: [],
        nodes: [{ data: { params: { modeType: 'text2video', prompt: '@' } } }],
      });
    },
  );
  it('keeps the asset dialog outside the expanded frame and dismisses only its top layer', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<AssetImportHarness observe={{ current: null }} recordSnapshot={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '展开生成器' }));
    expect(screen.getByRole('dialog', { name: '展开视频生成器' })).toBeTruthy();
    editPrompt('@');
    await user.click(await screen.findByRole('button', { name: '资产' }));
    const picker = await screen.findByRole('dialog', { name: '引用资产' });
    expect(picker.parentElement.parentElement).toBe(document.body);
    expect(screen.queryByRole('dialog', { name: '展开视频生成器' })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '引用资产' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '展开视频生成器' })).toBeTruthy();
    expect(readPromptDOM(screen.getByRole('textbox', { name: '提示词' }))).toBe('@');
  });
});
