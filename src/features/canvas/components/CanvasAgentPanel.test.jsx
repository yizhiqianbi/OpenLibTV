import React, { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasAgentPanel } from './CanvasAgentPanel.jsx';
import { agentDraftFromParts, agentPlainText } from '../../../services/agent-content.js';

const resources = vi.hoisted(() => ({}));
vi.mock('../../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: resources[name],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
const promptLabel = '告诉 Agent 你的创作想法，输入 / 选择 Skill';
beforeEach(() => {
  resources.skills = {
    commonSkillTemplateUuids: ['public-film'],
    items: [
      {
        templateUuid: 'public-film',
        name: '公开导演',
        namespace: 'director',
        skillKey: 'film',
        auditStatus: 1,
      },
      {
        templateUuid: 'pending-film',
        name: '待审核导演',
        namespace: 'director',
        skillKey: 'pending',
        auditStatus: 0,
      },
    ],
  };
  resources['skills-recommended'] = {
    items: [
      {
        templateUuid: 'recommended-board',
        name: '推荐分镜',
        namespace: 'board',
        skillKey: 'story',
        auditStatus: 1,
      },
    ],
  };
  resources['skill-details'] = {};
  localStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
});

function Harness({
  inputRef,
  send,
  readOnly = false,
  pending = [],
  navigate = vi.fn(),
  user = { uuid: 'canvas-user' },
  onCreateSkill = vi.fn(() => true),
}) {
  const [draft, setDraft] = useState(null),
    [prompt, setPrompt] = useState(''),
    [menu, setMenu] = useState(null);
  return (
    <CanvasAgentPanel
      agentMode="全能创作"
      agentDraft={draft}
      inputRef={inputRef}
      onPartsChange={(parts) => {
        setDraft((previous) => agentDraftFromParts(previous, parts));
        setPrompt(agentPlainText(parts));
      }}
      onFiles={vi.fn()}
      fileInput={createRef()}
      menu={menu}
      messages={[]}
      navigate={navigate}
      user={user}
      login={vi.fn()}
      onCreateSkill={onCreateSkill}
      prompt={prompt}
      send={() => send(inputRef.current.getParts())}
      setAgentMode={vi.fn()}
      setAgentOpen={vi.fn()}
      setMenu={setMenu}
      setPrompt={setPrompt}
      readOnly={readOnly}
      attachmentPending={pending}
    />
  );
}
async function ready(inputRef) {
  await screen.findByRole('textbox', { name: promptLabel });
  await waitFor(() => expect(inputRef.current?.getEditor()).toBeTruthy());
  return inputRef.current.getEditor();
}
async function selectSuggestion(editor, query, name) {
  act(() => editor.commands.insertContent(query));
  const option = await screen.findByRole('option', { name });
  fireEvent.click(option);
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

describe('Canvas Agent catalogue and submission integration', () => {
  it('inserts multiple model selections at the saved caret without changing generation mode', async () => {
    const inputRef = createRef(),
      send = vi.fn();
    render(<Harness inputRef={inputRef} send={send} />);
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('开场结尾'));
    act(() => editor.commands.setTextSelection(3));
    fireEvent.click(screen.getByRole('button', { name: '选择模型', exact: true }));
    const picker = screen.getByRole('dialog', { name: '选择模型' });
    fireEvent.click(within(picker).getByRole('button', { name: '添加模型 Lib Image 2.5 Pro' }));
    expect(inputRef.current.getParts()[0].text).toBe('开场{{ model:lib-image-2.5-s }} 结尾');
    expect(screen.getByRole('button', { name: '手动生成', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '选择模型', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '添加模型 Lib Image 2.5 Fast' }));
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    expect(send.mock.calls[0][0].slice(1).map((part) => part.id)).toEqual([
      'lib-image-2.5-s',
      'lib-image-2.5-f',
    ]);
  });
  it('opens the compact and full Skill selectors in place, preserves the caret, and inserts duplicate occurrences', async () => {
    const inputRef = createRef(),
      send = vi.fn(),
      navigate = vi.fn();
    render(<Harness inputRef={inputRef} send={send} navigate={navigate} />);
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('开场结尾'));
    act(() => editor.commands.setTextSelection(3));
    fireEvent.click(screen.getByRole('button', { name: 'Skill', exact: true }));
    const compact = await screen.findByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(compact).getByRole('button', { name: '添加 公开导演' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(inputRef.current.getParts()[0].text).toBe('开场{{ skill:director/film }} 结尾');
    fireEvent.click(screen.getByRole('button', { name: '选择 Skill 开始创作' }));
    fireEvent.click(screen.getByRole('button', { name: '全部', exact: true }));
    const full = await screen.findByRole('dialog', { name: '全部 Skill' });
    fireEvent.click(within(full).getByRole('button', { name: '推荐分镜', exact: true }));
    const detail = await screen.findByRole('dialog', { name: '推荐分镜' });
    fireEvent.keyDown(detail, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '推荐分镜' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '全部 Skill' })).toBeTruthy();
    fireEvent.keyDown(full, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Skill', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Skill', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '添加 公开导演' }));
    const parts = inputRef.current.getParts();
    expect(parts.filter((part) => part.type === 'skill')).toHaveLength(2);
    expect(new Set(parts.slice(1).map((part) => part.referenceKey)).size).toBe(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows only usable live Mine entries and reports damaged local data without replacing it', async () => {
    localStorage.setItem(
      'libtv-created-skills',
      JSON.stringify([
        { skillUuid: 'mine', skillKey: 'mine', name: '我的导演', auditStatus: 1 },
        { skillUuid: 'pending', name: '待审核草稿', auditStatus: 0 },
        { skillUuid: 'deleted', name: '已删除草稿', auditStatus: 1, localDeletedAt: 1 },
      ]),
    );
    const inputRef = createRef();
    const view = render(<Harness inputRef={inputRef} send={vi.fn()} />);
    await ready(inputRef);
    fireEvent.click(screen.getByRole('button', { name: 'Skill', exact: true }));
    fireEvent.click(screen.getByRole('tab', { name: '我的', exact: true }));
    expect(screen.getByRole('button', { name: '添加 我的导演' })).toBeTruthy();
    expect(screen.queryByText('待审核草稿')).toBeNull();
    expect(screen.queryByText('已删除草稿')).toBeNull();
    view.unmount();
    localStorage.setItem('libtv-created-skills', '{"broken":true}');
    render(<Harness inputRef={createRef()} send={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skill', exact: true }));
    fireEvent.click(screen.getByRole('tab', { name: '我的', exact: true }));
    expect(screen.getByRole('alert').textContent).toContain('原数据已保留');
    expect(localStorage.getItem('libtv-created-skills')).toBe('{"broken":true}');
  });

  it('resolves public and recommended Skills with catalogue model IDs into the submitted parts', async () => {
    const inputRef = createRef(),
      send = vi.fn();
    render(<Harness inputRef={inputRef} send={send} />);
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('/导演'));
    const publicSkill = await screen.findByRole('option', { name: /公开导演/ });
    expect(screen.queryByRole('option', { name: /待审核导演/ })).toBeNull();
    fireEvent.click(publicSkill);
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await selectSuggestion(editor, '/分镜', /推荐分镜/);
    await selectSuggestion(editor, '@lib-image-2.5-s', /Lib Image 2.5 Pro/);
    await selectSuggestion(editor, '@lib-image-2.5-f', /Lib Image 2.5 Fast/);
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    expect(send).toHaveBeenCalledOnce();
    const [parts] = send.mock.calls[0];
    expect(
      parts
        .slice(1)
        .map(({ type, id, modality }) => ({ type, id, ...(modality ? { modality } : {}) })),
    ).toEqual([
      { type: 'skill', id: 'director/film' },
      { type: 'skill', id: 'board/story' },
      { type: 'model', id: 'lib-image-2.5-s', modality: 'image' },
      { type: 'model', id: 'lib-image-2.5-f', modality: 'image' },
    ]);
    expect(parts[0].text).toBe(
      '{{ skill:director/film }} {{ skill:board/story }} {{ model:lib-image-2.5-s }} {{ model:lib-image-2.5-f }} ',
    );
  });

  it('gates Enter and button submission while reading and while the document is read-only', async () => {
    const inputRef = createRef(),
      send = vi.fn();
    const page = render(
      <Harness inputRef={inputRef} send={send} pending={[{ id: 'pending', name: '读取中.png' }]} />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('已有创作想法'));
    const input = screen.getByRole('textbox', { name: promptLabel });
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    page.rerender(<Harness inputRef={inputRef} send={send} readOnly />);
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('false'));
    expect(screen.getByTitle('上传参考素材').disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Skill', exact: true }).disabled).toBe(true);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
    page.rerender(<Harness inputRef={inputRef} send={send} />);
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0][0].text).toBe('已有创作想法');
  });
});
