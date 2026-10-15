import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../services/content.ts';
import { fetchJson } from '../../services/json.ts';
import { createSkillHandoff } from '../../services/agent-handoff.js';
import { readStoredValue, writeStoredValue } from '../../services/storage.ts';
import NodeCanvas from './NodeCanvas.jsx';
import { agentContentFromJSON, agentPlainText } from '../../services/agent-content.js';

vi.mock('../../services/content.ts', () => ({ loadContent: vi.fn() }));
vi.mock('../../services/json.ts', () => ({ fetchJson: vi.fn() }));
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: { items: [] }, loading: false, error: null, reload: vi.fn() }),
}));
const promptLabel = '告诉 Agent 你的创作想法，输入 / 选择 Skill';
async function readyPrompt() {
  const prompt = await screen.findByRole('textbox', { name: promptLabel });
  await waitFor(() => expect(prompt.editor).toBeTruthy());
  return prompt;
}
const promptText = (prompt) => agentPlainText(agentContentFromJSON(prompt.editor.getJSON()));
const user = { name: 'local-fixture' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(loadContent).mockResolvedValue({ default: {} });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});

const fixture = (id) => {
  const draft = createSkillHandoff({
    prompt: '保留电影想法',
    model: { modelKey: 'wan', label: '已有模型', modality: 'video' },
    skill: { skillKey: 'film', namespace: 'director', name: '已有 Skill' },
    attachments: [
      {
        id: 'image',
        name: '已有参考.png',
        type: 'image',
        status: 'ready',
        source: { type: 'data', value: 'data:image/png;base64,cmVm' },
      },
    ],
  });
  writeStoredValue('libtv.canvas.' + id, {
    title: '已有项目',
    nodes: [
      {
        id: 'text-node',
        type: 'text',
        position: { x: 0, y: 0 },
        data: { name: '已有节点', text: '画布正文' },
      },
    ],
    edges: [],
    agentDraft: draft,
  });
  return draft;
};

describe('Skill dialogue creation inside Canvas', () => {
  it('consumes the entry, chooses the canvas source and restores the preserved request on refresh', async () => {
    const original = fixture('create-flow');
    const navigate = vi.fn();
    const path =
      '/canvas?projectId=create-flow&guideSource=skill&skillCreatorIntake=1&forceAgent=1';
    const page = render(<NodeCanvas path={path} user={user} navigate={navigate} />);
    const choice = await screen.findByRole('group', { name: '你想做什么？' });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(
      '/canvas?projectId=create-flow&guideSource=skill&forceAgent=1',
      { replace: true },
    );
    const prompt = await readyPrompt();
    expect(prompt.getAttribute('contenteditable')).toBe('false');
    expect(promptText(prompt)).toBe('保留电影想法');
    expect(screen.getByTitle('上传参考素材').disabled).toBe(true);
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(true);
    fireEvent.click(within(choice).getByRole('radio', { name: /基于当前画布创建 Skill/ }));
    fireEvent.click(within(choice).getByRole('button', { name: '提交' }));
    await screen.findByRole('region', { name: 'Skill 创建请求' });
    expect(prompt.getAttribute('contenteditable')).toBe('true');
    expect(screen.getByRole('button', { name: '预览 已有参考.png' })).toBeTruthy();
    expect(screen.getByTitle('已有模型')).toBeTruthy();
    expect(screen.getByTitle('已有 Skill')).toBeTruthy();
    // Leaving flushes the current draft synchronously; do not race the 600ms
    // background autosave against waitFor's wall clock under parallel workers.
    page.unmount();
    const snapshot = readStoredValue('libtv.canvas.create-flow', null);
    expect(snapshot.agentDraft.skillCreatorIntent?.status).toBe('blocked');
    expect(snapshot.agentDraft.skillCreatorIntent?.request.context.skillAssistant).toEqual({
      summarizeFromCanvas: true,
    });
    expect(snapshot.agentDraft.parts).toEqual(original.parts);
    expect(snapshot.nodes).toHaveLength(1);
    expect(readStoredValue('libtv-created-skills', [])).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
    render(
      <NodeCanvas
        path="/canvas?projectId=create-flow&guideSource=skill&forceAgent=1"
        user={user}
        navigate={navigate}
      />,
    );
    await screen.findByRole('region', { name: 'Skill 创建请求' });
    expect(screen.queryByRole('group', { name: '你想做什么？' })).toBeNull();
    expect(promptText(await readyPrompt())).toBe('保留电影想法');
    expect(screen.getByRole('button', { name: '预览 已有参考.png' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '忽略' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Skill 创建请求' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(false);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('auto-selects scratch for an empty project without inventing a generated result', async () => {
    const navigate = vi.fn();
    const page = render(
      <NodeCanvas
        path="/canvas?projectId=empty-create&skillCreatorIntake=1"
        user={user}
        navigate={navigate}
      />,
    );
    const request = await screen.findByRole('region', { name: 'Skill 创建请求' });
    expect(within(request).getByText('从零聊出一个 Skill')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(within(request).getByRole('link', { name: '手动创建' }).getAttribute('href')).toBe(
      '/skill/create',
    );
    fireEvent.click(within(request).getByRole('button', { name: '重试' }));
    page.unmount();
    const saved = readStoredValue('libtv.canvas.empty-create', null);
    expect(saved.nodes).toEqual([]);
    expect(saved.agentDraft.skillCreatorIntent).toMatchObject({
      status: 'blocked',
      action: 'create_from_scratch',
      attempts: 2,
    });
    expect(readStoredValue('libtv-created-skills', [])).toEqual([]);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
