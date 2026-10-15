import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RichAgentInput from './RichAgentInput.jsx';
import { buildCanvasMentionRows } from '../../services/agent-node-catalogue.js';
import {
  agentContentFromJSON,
  agentContentToJSON,
  agentReferenceNode,
} from '../../services/agent-content.js';

function Harness({ inputRef, onChange = () => {}, ...props }) {
  const [parts, setParts] = useState(props.parts || [{ type: 'text', text: '前后' }]);
  return (
    <RichAgentInput
      {...props}
      ref={inputRef}
      parts={parts}
      onChange={(next) => {
        setParts(next);
        onChange(next);
      }}
    />
  );
}

const canvasNodes = Array.from({ length: 8 }, (_, index) => ({
  id: `node-${index}`,
  type: 'image',
  position: { x: 0, y: 0 },
  data: { type: 'image', name: `图片节点${index}`, url: [`/node-${index}.png`] },
}));
function MentionHarness({ inputRef, submit }) {
  const [limit, setLimit] = useState(3);
  return (
    <Harness
      inputRef={inputRef}
      parts={[{ type: 'text', text: '' }]}
      onSubmit={submit}
      mentionSource={({ query, parts }) =>
        buildCanvasMentionRows({
          nodes: canvasNodes,
          projectId: 'actual-project',
          query,
          references: parts,
          nodeLimit: limit,
          models: [
            { type: 'model', id: 'disabled', name: '维护模型', disabled: true },
            { type: 'model', id: 'available', name: '可用模型' },
          ],
        })
      }
      mentionRefreshKey={limit}
      onMentionLoadMore={() => setLimit((value) => value + 3)}
    />
  );
}

async function ready(inputRef) {
  await waitFor(() => expect(inputRef.current?.getEditor()).toBeTruthy());
  return inputRef.current.getEditor();
}

describe('real TipTap Agent input', () => {
  it('gives repeated and copied references stable independent identities and exposes preview only when supported', async () => {
    const inputRef = createRef();
    const reference = {
      type: 'image',
      id: 'same',
      name: '相同图片',
      source: { type: 'data', value: 'data:image/png;base64,YQ==' },
    };
    render(<Harness inputRef={inputRef} />);
    const editor = await ready(inputRef);
    await act(async () => {
      inputRef.current.insertReference(reference);
      const copied = inputRef.current.getParts()[1];
      inputRef.current.insertReference(copied);
      // Clipboard HTML preserves node attributes. Repair the copied key once
      // in the document, so consecutive reads retain the same identity.
      editor.commands.insertContent(agentReferenceNode(copied));
    });
    const keys = inputRef.current
      .getParts()
      .slice(1)
      .map((part) => part.referenceKey);
    expect(new Set(keys).size).toBe(3);
    expect(
      inputRef.current
        .getParts()
        .slice(1)
        .map((part) => part.referenceKey),
    ).toEqual(keys);
    expect(screen.queryByRole('button', { name: '预览 相同图片' })).toBeNull();
  });
  it('inserts two models and two Skills at the caret and retains individual deletion and undo', async () => {
    const inputRef = createRef();
    render(<Harness inputRef={inputRef} />);
    const editor = await ready(inputRef);
    act(() => {
      editor.commands.setTextSelection(2);
      inputRef.current.insertReference({ type: 'skill', id: 's/one', name: '第一个' });
      inputRef.current.insertReference({ type: 'skill', id: 's/two', name: '第二个' });
      inputRef.current.insertReference({ type: 'model', id: 'm1', name: '模型一' });
      inputRef.current.insertReference({ type: 'model', id: 'm2', name: '模型二' });
    });
    const parts = inputRef.current.getParts();
    expect(parts[0].text).toBe(
      '前{{ skill:s/one }} {{ skill:s/two }} {{ model:m1 }} {{ model:m2 }} 后',
    );
    expect(parts.slice(1).map((part) => part.id)).toEqual(['s/one', 's/two', 'm1', 'm2']);
    fireEvent.click((await screen.findAllByRole('button', { name: '移除 Skill' }))[0]);
    expect(
      inputRef.current
        .getParts()
        .slice(1)
        .map((part) => part.id),
    ).toEqual(['s/two', 'm1', 'm2']);
    act(() => editor.commands.undo());
    expect(inputRef.current.getParts().some((part) => part.id === 's/one')).toBe(true);
  });
  it('updates a pending upload in place without recreating a reference that was removed', async () => {
    const inputRef = createRef();
    render(<Harness inputRef={inputRef} />);
    const editor = await ready(inputRef);
    act(() => {
      editor.commands.setTextSelection(2);
      inputRef.current.insertReference({
        type: 'image',
        id: 'upload',
        name: '参考图',
        status: 'uploading',
      });
      inputRef.current.upsertReference('upload', {
        source: { type: 'data', value: 'data:image/png;base64,YQ==' },
        status: 'ready',
      });
    });
    expect(inputRef.current.getParts()[0].text).toBe('前{{ image:upload }} 后');
    expect(inputRef.current.getParts()[1].source.value).toBe('data:image/png;base64,YQ==');
    fireEvent.click(await screen.findByRole('button', { name: '移除 参考素材' }));
    act(() => inputRef.current.upsertReference('upload', { status: 'ready' }));
    expect(inputRef.current.hasReference('upload')).toBe(false);
  });
  it('keeps external reload references ordered and does not send during IME or Shift+Enter', async () => {
    const inputRef = createRef();
    const submit = vi.fn();
    const original = [
      { type: 'text', text: '开{{ skill:s }}终' },
      { type: 'skill', id: 's', name: '参考' },
    ];
    const view = render(<RichAgentInput ref={inputRef} parts={original} onSubmit={submit} />);
    const editor = await ready(inputRef);
    expect(agentContentFromJSON(editor.getJSON())[0].text).toBe(original[0].text);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).toHaveBeenCalledOnce();
    const changed = [{ type: 'text', text: '新{{ skill:s }}文' }, original[1]];
    view.rerender(<RichAgentInput ref={inputRef} parts={changed} onSubmit={submit} />);
    await waitFor(() => expect(inputRef.current.getParts()[0].text).toBe(changed[0].text));
    view.unmount();
  });
  it('selects slash suggestions with arrows/Enter rather than submitting and supports Escape', async () => {
    const inputRef = createRef();
    const submit = vi.fn();
    const search = vi.fn().mockResolvedValue([
      { type: 'skill', id: 'one', name: '建议一' },
      { type: 'skill', id: 'two', name: '建议二' },
    ]);
    render(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '' }]}
        onSubmit={submit}
        searchSkills={search}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('/建议'));
    await waitFor(() => expect(screen.getByRole('option', { name: /建议二/ })).toBeTruthy());
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();
    expect(inputRef.current.getParts()[1].id).toBe('two');
    act(() => editor.commands.setContent(agentContentToJSON([{ type: 'text', text: '/' }])));
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
  it('keeps legacy @model filtering/keyboard insertion while custom Canvas sources are optional', async () => {
    const inputRef = createRef();
    const submit = vi.fn();
    render(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '' }]}
        onSubmit={submit}
        mentionItems={[
          { type: 'model', id: 'lib-image', name: '图片模型' },
          { type: 'model', id: 'seedance', name: '视频模型', modality: 'video' },
        ]}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('@视频'));
    await screen.findByRole('option', { name: /视频模型/ });
    expect(screen.queryByRole('option', { name: /图片模型/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(inputRef.current.getParts()[1]).toMatchObject({
      type: 'model',
      id: 'seedance',
      modality: 'video',
    });
    expect(submit).not.toHaveBeenCalled();
  });
  it('navigates grouped nodes/load-more without selecting headers or disabled models, preserving actual identity per occurrence', async () => {
    const inputRef = createRef();
    const submit = vi.fn();
    render(<MentionHarness inputRef={inputRef} submit={submit} />);
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('@'));
    await screen.findByRole('option', { name: '图片节点2' });
    expect(screen.getByText('节点')).toBeTruthy();
    expect(screen.getByRole('option', { name: '维护模型' }).disabled).toBe(true);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '加载更多' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('option', { name: '图片节点5' });
    expect(inputRef.current.getParts()).toEqual([{ type: 'text', text: '@' }]);
    // Load-more remains active; ArrowDown skips the disabled model and header.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: '可用模型' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('option', { name: '图片节点4' }));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    act(() => editor.commands.insertContent('@节点4'));
    fireEvent.click(await screen.findByRole('option', { name: '图片节点4' }));
    const refs = inputRef.current.getParts().slice(1);
    expect(refs.map((part) => part.id)).toEqual(['node-4', 'node-4']);
    expect(refs[0]).toMatchObject({
      nodeKey: 'node-4',
      projectId: 'actual-project',
      url: '/node-4.png',
      mediaType: 'image',
    });
    expect(refs[0].referenceKey).not.toBe(refs[1].referenceKey);
    expect(screen.queryByRole('button', { name: /预览 图片节点4/ })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
  it('refreshes current Canvas candidates after rename/delete without remounting the editor or moving the draft', async () => {
    const inputRef = createRef();
    const source =
      (nodes) =>
      ({ query }) =>
        buildCanvasMentionRows({ nodes, query });
    const view = render(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '保留 ' }]}
        mentionSource={source(canvasNodes)}
        mentionRefreshKey={canvasNodes}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.setTextSelection(4));
    act(() => editor.commands.insertContent('@'));
    await screen.findByRole('option', { name: '图片节点0' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'ArrowDown' });
    const selection = editor.state.selection.from;
    const next = canvasNodes
      .slice(1)
      .map((node) =>
        node.id === 'node-1' ? { ...node, data: { ...node.data, name: '新名称' } } : node,
      );
    view.rerender(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '保留 ' }]}
        mentionSource={source(next)}
        mentionRefreshKey={next}
      />,
    );
    await screen.findByRole('option', { name: '新名称' });
    expect(screen.queryByRole('option', { name: '图片节点0' })).toBeNull();
    expect(screen.getByRole('option', { name: '新名称' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(inputRef.current.getEditor()).toBe(editor);
    expect(inputRef.current.getParts()[0].text).toBe('保留 @');
    expect(editor.state.selection.from).toBe(selection);
    view.unmount();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('discards superseded asynchronous @ sources and never binds unknown placeholder rows', async () => {
    const inputRef = createRef();
    const pending = new Map();
    const source = vi.fn(
      ({ query, signal }) => new Promise((resolve) => pending.set(query, { resolve, signal })),
    );
    const view = render(
      <Harness inputRef={inputRef} parts={[{ type: 'text', text: '' }]} mentionSource={source} />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('@old'));
    await waitFor(() => expect(pending.has('old')).toBe(true));
    act(() => editor.commands.setContent(agentContentToJSON([{ type: 'text', text: '@new' }])));
    await waitFor(() => expect(pending.has('new')).toBe(true));
    expect(pending.get('old').signal.aborted).toBe(true);
    await act(async () =>
      pending.get('new').resolve([
        {
          rowKind: 'item',
          id: 'fake',
          label: '未知占位',
          reference: { type: 'node', id: 'unknown' },
        },
        { type: 'model', id: 'real', name: '新模型' },
      ]),
    );
    await screen.findByRole('option', { name: '新模型' });
    expect(screen.queryByText('未知占位')).toBeNull();
    await act(async () =>
      pending.get('old').resolve([{ type: 'model', id: 'old', name: '旧模型' }]),
    );
    expect(screen.queryByText('旧模型')).toBeNull();
    view.unmount();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('keeps a refreshed @ catalogue when an older same-query async source resolves late', async () => {
    const inputRef = createRef();
    let resolveOld, resolveFresh;
    const old = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const fresh = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFresh = resolve;
        }),
    );
    const view = render(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '' }]}
        mentionSource={old}
        mentionRefreshKey={0}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('@'));
    await waitFor(() => expect(old).toHaveBeenCalled());
    view.rerender(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '' }]}
        mentionSource={fresh}
        mentionRefreshKey={1}
      />,
    );
    await waitFor(() => expect(fresh).toHaveBeenCalled());
    await act(async () => resolveFresh([{ type: 'model', id: 'fresh', name: '最新目录' }]));
    await screen.findByRole('option', { name: '最新目录' });
    await act(async () => resolveOld([{ type: 'model', id: 'stale', name: '旧目录' }]));
    expect(screen.getByRole('option', { name: '最新目录' })).toBeTruthy();
    expect(screen.queryByText('旧目录')).toBeNull();
    act(() => editor.commands.insertContent('a'));
    await waitFor(() => expect(fresh).toHaveBeenCalledTimes(2));
    const signal = fresh.mock.calls.at(-1)[0].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => resolveFresh([{ type: 'model', id: 'late', name: '卸载后' }]));
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('starts a new @ session on the first enabled item after Escape, while hover can select another row', async () => {
    const inputRef = createRef();
    render(<MentionHarness inputRef={inputRef} submit={vi.fn()} />);
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('@'));
    await screen.findByRole('option', { name: '图片节点0' });
    expect(screen.getByRole('option', { name: '图片节点0' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.mouseEnter(screen.getByRole('option', { name: '可用模型' }));
    expect(screen.getByRole('option', { name: '可用模型' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    act(() => editor.commands.setContent(agentContentToJSON([{ type: 'text', text: '' }])));
    act(() => editor.commands.insertContent('@'));
    await screen.findByRole('option', { name: '图片节点0' });
    expect(screen.getByRole('option', { name: '图片节点0' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
  it('treats moving between two same-query @ ranges as a new source session', async () => {
    const inputRef = createRef();
    const open = vi.fn();
    render(
      <Harness
        inputRef={inputRef}
        parts={[{ type: 'text', text: '@ 中 @' }]}
        onMentionOpen={open}
        mentionSource={({ query }) =>
          buildCanvasMentionRows({
            nodes: canvasNodes,
            query,
            models: [{ type: 'model', id: 'model', name: '模型' }],
          })
        }
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.setTextSelection(2));
    await screen.findByRole('option', { name: '图片节点0' });
    fireEvent.mouseEnter(screen.getByRole('option', { name: '模型' }));
    expect(screen.getByRole('option', { name: '模型' }).getAttribute('aria-selected')).toBe('true');
    act(() => editor.commands.setTextSelection(6));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: '图片节点0' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    expect(inputRef.current.getParts()).toEqual([{ type: 'text', text: '@ 中 @' }]);
  });
});
