import { createRef, useImperativeHandle, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RichAgentInput from '../../../components/agent/RichAgentInput.jsx';
import { canSubmitSkill, createSkillHandoff } from '../../../services/agent-handoff.js';
import { useSkillAgentAttachments } from './useSkillAgentAttachments.js';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));

class ControlledReader {
  static instances = [];
  readyState = 0;
  result = null;
  aborted = false;
  constructor() {
    ControlledReader.instances.push(this);
  }
  readAsDataURL(file) {
    this.file = file;
    this.readyState = 1;
  }
  succeed(value = 'data:image/png;base64,cmVm') {
    this.result = value;
    this.readyState = 2;
    this.onload?.();
  }
  fail() {
    this.readyState = 2;
    this.onerror?.();
  }
  abort() {
    this.aborted = true;
    this.readyState = 2;
    this.onabort?.();
  }
}

const originalParts = () => [
  { type: 'text', text: '前后 {{ model:original-model }} {{ skill:director/film }}' },
  { type: 'model', id: 'original-model', name: '原模型', modality: 'image' },
  { type: 'skill', id: 'director/film', name: '原 Skill' },
];
function Harness({ controls, onSend = vi.fn(), user = { id: 'demo' }, login = vi.fn() }) {
  const [parts, setParts] = useState(originalParts);
  const input = useRef(null),
    live = useRef(parts);
  live.current = parts;
  const attachments = useSkillAgentAttachments({
    parts,
    input,
    user,
    login,
    toast: vi.fn(),
  });
  useImperativeHandle(controls, () => ({ ...attachments, parts, input }));
  const submit = () => {
    if (canSubmitSkill({ parts: live.current }))
      onSend(createSkillHandoff({ parts: live.current }));
  };
  return (
    <>
      <RichAgentInput
        ref={input}
        parts={parts}
        onChange={setParts}
        onSubmit={submit}
        placeholder="附件测试输入"
      />
      <input type="file" multiple aria-label="上传参考" onChange={attachments.uploadFiles} />
      {attachments.attached
        .filter((item) => item.status === 'error')
        .map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => attachments.uploadAttachment(item)}
            aria-label={'重试 ' + item.name}
          >
            重试
          </button>
        ))}
      <button type="button" disabled={!canSubmitSkill({ parts })} onClick={submit}>
        发送
      </button>
    </>
  );
}

beforeEach(() => {
  ControlledReader.instances = [];
  vi.stubGlobal('FileReader', ControlledReader);
});
afterEach(() => vi.unstubAllGlobals());
const image = (name = '参考.png') => new File(['image'], name, { type: 'image/png' });
async function mount(properties = {}) {
  const controls = createRef(),
    onSend = vi.fn();
  const view = render(<Harness controls={controls} onSend={onSend} {...properties} />);
  const input = await screen.findByRole('textbox', { name: '附件测试输入' });
  await waitFor(() => expect(controls.current?.input.current?.getEditor()).toBeTruthy());
  const editor = controls.current.input.current.getEditor();
  await act(async () => editor.commands.setTextSelection(2));
  return { ...view, controls, onSend, input, editor };
}
async function upload(files) {
  await act(async () => fireEvent.change(screen.getByLabelText('上传参考'), { target: { files } }));
}
const refs = (controls) => controls.current.input.current.getParts().slice(1);
function referencePosition(editor, id) {
  let found;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'agentReference' && node.attrs.reference.id === id) found = position;
  });
  return found;
}

describe('Skill file tasks with the real inline composer', () => {
  it('cancels pending readers on logout and gates retry without discarding failed rows', async () => {
    const login = vi.fn();
    const view = await mount({ login });
    await upload([image('失败.png'), image('读取中.png')]);
    await act(async () => ControlledReader.instances[0].fail());
    view.rerender(
      <Harness controls={view.controls} onSend={view.onSend} user={null} login={login} />,
    );
    await waitFor(() => expect(ControlledReader.instances[1].aborted).toBe(true));
    await screen.findByRole('button', { name: '重试 失败.png' });
    fireEvent.click(screen.getByRole('button', { name: '重试 失败.png' }));
    expect(login).toHaveBeenCalledOnce();
    expect(ControlledReader.instances).toHaveLength(2);
    expect(view.controls.current.attached).toHaveLength(2);
    await act(async () => ControlledReader.instances[1].succeed());
    expect(refs(view.controls).find((part) => part.name === '读取中.png').status).toBe('error');
  });
  it('uploads one mixed batch without losing rows or prior references, and blocks send until every file is ready', async () => {
    const { controls, onSend, input } = await mount();
    await upload([
      image(),
      new File(['notes'], '笔记.md', { type: 'text/markdown' }),
      new File(['audio'], '声音.mp3', { type: 'audio/mpeg' }),
    ]);
    expect(controls.current.attached.map((item) => item.name)).toEqual([
      '参考.png',
      '笔记.md',
      '声音.mp3',
    ]);
    expect(ControlledReader.instances).toHaveLength(3);
    expect(refs(controls).map((part) => part.type)).toEqual([
      'image',
      'document',
      'audio',
      'model',
      'skill',
    ]);
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      ControlledReader.instances[2].succeed('data:audio/mpeg;base64,YXVkaW8=');
      ControlledReader.instances[0].succeed();
    });
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(true);
    await act(async () =>
      ControlledReader.instances[1].succeed('data:text/markdown;base64,bm90ZXM='),
    );
    expect(controls.current.attached.every((item) => item.status === 'ready')).toBe(true);
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0][0].parts.slice(1).map((part) => part.name)).toEqual([
      '参考.png',
      '笔记.md',
      '声音.mp3',
      '原模型',
      '原 Skill',
    ]);
    expect(onSend.mock.calls[0][0].parts[0].text).toMatch(
      /^前\{\{ image:.*\}\} \{\{ document:.*\}\} \{\{ audio:.*\}\} 后 /,
    );
  });

  it('retries a failed file in the same chip, rejects a malformed reader result and preserves the current text', async () => {
    const { controls, editor, onSend, input } = await mount();
    await upload([image()]);
    const original = refs(controls)[0];
    await act(async () => ControlledReader.instances[0].fail());
    expect(refs(controls)[0]).toMatchObject({
      id: original.id,
      referenceKey: original.referenceKey,
      status: 'error',
      error: '文件读取失败',
    });
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      editor.commands.setTextSelection(1);
      editor.commands.insertContent('新');
    });
    const text = controls.current.input.current.getParts()[0].text;
    fireEvent.click(screen.getByRole('button', { name: '重试 参考.png' }));
    await act(async () => ControlledReader.instances[1].succeed('invalid-result'));
    expect(refs(controls)[0].status).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: '重试 参考.png' }));
    expect(ControlledReader.instances[2].file).toBe(ControlledReader.instances[0].file);
    await act(async () => ControlledReader.instances[2].succeed());
    expect(refs(controls)[0]).toMatchObject({
      id: original.id,
      referenceKey: original.referenceKey,
      status: 'ready',
      source: { type: 'data', value: 'data:image/png;base64,cmVm' },
    });
    expect(controls.current.input.current.getParts()[0].text).toBe(text);
    expect(refs(controls)).toHaveLength(3);
    expect(screen.queryByRole('button', { name: '重试 参考.png' })).toBeNull();
  });

  it('aborts a removed inline chip while allowing the remaining file to finish, ignoring late removed-file completion', async () => {
    const { controls } = await mount();
    await upload([image('移除.png'), image('保留.png')]);
    const removed = refs(controls)[0].id;
    const buttons = await screen.findAllByRole('button', { name: '移除 参考素材' });
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(ControlledReader.instances[0].aborted).toBe(true));
    expect(controls.current.attached.map((item) => item.name)).toEqual(['保留.png']);
    await act(async () => {
      ControlledReader.instances[0].succeed('data:image/png;base64,bGF0ZQ==');
      ControlledReader.instances[1].succeed('data:image/png;base64,a2VlcA==');
    });
    expect(refs(controls).some((part) => part.id === removed)).toBe(false);
    expect(refs(controls).find((part) => part.name === '保留.png').source.value).toBe(
      'data:image/png;base64,a2VlcA==',
    );
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(false);
  });

  it('aborts on unmount and prevents late readers from adding data to a newly mounted composer', async () => {
    const first = await mount();
    await upload([image('旧文档.png')]);
    const oldReader = ControlledReader.instances[0];
    first.unmount();
    expect(oldReader.aborted).toBe(true);
    const second = await mount();
    await act(async () => oldReader.succeed('data:image/png;base64,b2xk'));
    expect(second.controls.current.attached).toEqual([]);
    expect(refs(second.controls).map((part) => part.name)).toEqual(['原模型', '原 Skill']);
  });

  it('updates the original caret insertion in place after subsequent typing without changing reference identity or selection', async () => {
    const { controls, editor } = await mount();
    await upload([image()]);
    const original = refs(controls)[0];
    await act(async () => {
      editor.commands.setTextSelection(1);
      editor.commands.insertContent('改');
    });
    const text = controls.current.input.current.getParts()[0].text;
    const position = referencePosition(editor, original.id);
    const selection = editor.state.selection.from;
    await act(async () => ControlledReader.instances[0].succeed());
    expect(controls.current.input.current.getParts()[0].text).toBe(text);
    expect(referencePosition(editor, original.id)).toBe(position);
    expect(editor.state.selection.from).toBe(selection);
    expect(refs(controls)[0]).toMatchObject({
      referenceKey: original.referenceKey,
      id: original.id,
      status: 'ready',
    });
  });
});
