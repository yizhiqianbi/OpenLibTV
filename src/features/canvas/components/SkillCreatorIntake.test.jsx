import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSkillHandoff, skillHandoffText } from '../../../services/agent-handoff.js';
import SkillCreatorIntake from './SkillCreatorIntake.jsx';
import { createSkillCreatorIntent } from '../domain/skill-creator.js';

const initialDraft = () =>
  createSkillHandoff({
    prompt: '保留的创作想法',
    model: { modelKey: 'video', label: '原有视频模型', modality: 'video' },
    skill: { namespace: 'director', skillKey: 'film', name: '原有 Skill' },
    attachments: [
      {
        id: 'ref',
        name: '参考.png',
        type: 'image',
        status: 'ready',
        source: { type: 'data', value: 'data:image/png;base64,cmVm' },
      },
    ],
  });

function Harness({
  documentKey = 'first',
  ready = true,
  readonly = false,
  query = 'skillCreatorIntake=1',
  nodes = [],
  messages = [],
  navigate,
  setAgentOpen,
}) {
  const [draft, setDraft] = useState(initialDraft);
  return (
    <>
      <SkillCreatorIntake
        path={'/canvas?' + query}
        route={{
          storageKey: documentKey,
          key: documentKey,
          readonly,
          query: new URLSearchParams(query),
        }}
        ready={ready}
        nodes={nodes}
        messages={messages}
        title="创作项目"
        prompt="保留的创作想法"
        draft={draft}
        setDraft={setDraft}
        navigate={navigate}
        setAgentOpen={setAgentOpen}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
});
const readDraft = () => JSON.parse(screen.getByTestId('draft').textContent);

describe('Skill creator intake interactions', () => {
  it('retains the chosen action when the same intent is rehydrated with new option objects', () => {
    const intent = createSkillCreatorIntent({ projectId: 'stable', hasCanvas: true }, 42);
    const draft = { ...initialDraft(), skillCreatorIntent: intent };
    const setDraft = vi.fn();
    const properties = {
      path: '/canvas?projectId=stable',
      route: { storageKey: 'stable', key: 'stable', readonly: false, query: new URLSearchParams() },
      ready: true,
      nodes: [{ id: 'node' }],
      messages: [],
      title: '项目',
      prompt: '保留的创作想法',
      draft,
      setDraft,
      navigate: vi.fn(),
      setAgentOpen: vi.fn(),
    };
    const view = render(<SkillCreatorIntake {...properties} />);
    const canvas = screen.getByRole('radio', { name: /基于当前画布创建 Skill/ });
    fireEvent.click(canvas);
    view.rerender(
      <SkillCreatorIntake
        {...properties}
        draft={{
          ...draft,
          skillCreatorIntent: {
            ...intent,
            options: intent.options.map((option) => ({ ...option })),
          },
        }}
      />,
    );
    expect(canvas.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    const next = setDraft.mock.calls[0][0](draft);
    expect(next.skillCreatorIntent.action).toBe('create_from_canvas');
    expect(next.skillCreatorIntent.request.context.skillAssistant).toEqual({
      summarizeFromCanvas: true,
    });
  });

  it('waits for the document, consumes the exact URL once and preserves references through retry and cancellation', async () => {
    const navigate = vi.fn(),
      setAgentOpen = vi.fn();
    const view = render(<Harness ready={false} navigate={navigate} setAgentOpen={setAgentOpen} />);
    expect(navigate).not.toHaveBeenCalled();
    expect(readDraft().skillCreatorIntent).toBeUndefined();
    view.rerender(<Harness navigate={navigate} setAgentOpen={setAgentOpen} />);
    await screen.findByRole('region', { name: 'Skill 创建请求' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/canvas', { replace: true });
    expect(setAgentOpen).toHaveBeenCalledExactlyOnceWith(true);
    const first = readDraft();
    expect(first.parts.map((part) => part.type)).toEqual(['text', 'model', 'skill', 'image']);
    expect(skillHandoffText(first)).toBe('保留的创作想法');
    expect(first.skillCreatorIntent).toMatchObject({
      status: 'blocked',
      action: 'create_from_scratch',
      attempts: 1,
    });
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(readDraft().skillCreatorIntent.attempts).toBe(2);
    expect(readDraft().parts).toEqual(first.parts);
    fireEvent.click(screen.getByRole('button', { name: '忽略' }));
    expect(screen.queryByRole('region', { name: 'Skill 创建请求' })).toBeNull();
    view.rerender(
      <Harness
        query="skillCreatorIntake=1&guideSource=skill"
        navigate={navigate}
        setAgentOpen={setAgentOpen}
      />,
    );
    expect(navigate).toHaveBeenCalledOnce();
    expect(readDraft().skillCreatorIntent.status).toBe('dismissed');
  });

  it('supports keyboard selection and confirms the canvas context without replacing the existing draft', async () => {
    render(
      <Harness
        nodes={[{ id: 'canvas-node' }]}
        messages={[{ role: 'user', text: '已存在对话' }]}
        navigate={vi.fn()}
        setAgentOpen={vi.fn()}
      />,
    );
    const group = await screen.findByRole('group', { name: '你想做什么？' });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(
      screen.getByRole('radio', { name: /基于当前画布创建 Skill/ }).getAttribute('aria-checked'),
    ).toBe('true');
    fireEvent.keyDown(group, { key: 'Enter', isComposing: true });
    expect(readDraft().skillCreatorIntent.status).toBe('choosing');
    fireEvent.keyDown(group, { key: 'Enter' });
    await screen.findByRole('region', { name: 'Skill 创建请求' });
    expect(readDraft().skillCreatorIntent.request.context).toEqual({
      currentProjectId: 'first',
      currentProjectName: '创作项目',
      skillAssistant: { summarizeFromCanvas: true },
    });
    expect(readDraft().parts).toHaveLength(4);
  });

  it('does not consume read-only or non-exact URL requests, and consumes each new document separately', async () => {
    const navigate = vi.fn(),
      setAgentOpen = vi.fn();
    const view = render(<Harness readonly navigate={navigate} setAgentOpen={setAgentOpen} />);
    view.rerender(
      <Harness query="skillCreatorIntake=true" navigate={navigate} setAgentOpen={setAgentOpen} />,
    );
    expect(navigate).not.toHaveBeenCalled();
    view.rerender(<Harness navigate={navigate} setAgentOpen={setAgentOpen} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    view.rerender(<Harness documentKey="second" navigate={navigate} setAgentOpen={setAgentOpen} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
  });
});
