import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../services/content.ts';
import { fetchJson } from '../../services/json.ts';
import NodeCanvas from './NodeCanvas.jsx';
import { agentContentFromJSON, agentPlainText } from '../../services/agent-content.js';
import {
  createSkillHandoff,
  writeSkillHandoff,
  readSkillHandoff,
} from '../../services/agent-handoff.js';

vi.mock('../../services/content.ts', () => ({ loadContent: vi.fn() }));
vi.mock('../../services/json.ts', () => ({ fetchJson: vi.fn() }));
vi.mock('../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? { default: {} } : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const promptLabel = '告诉 Agent 你的创作想法，输入 / 选择 Skill';
afterEach(() => vi.unstubAllGlobals());
async function readyPrompt() {
  const prompt = await screen.findByRole('textbox', { name: promptLabel });
  await waitFor(() => expect(prompt.editor).toBeTruthy());
  return prompt;
}
const promptText = (prompt) => agentPlainText(agentContentFromJSON(prompt.editor.getJSON()));
function editPrompt(prompt, text) {
  const editor = prompt.editor;
  const first = editor.state.doc.firstChild.firstChild;
  const references = agentContentFromJSON(editor.getJSON()).length > 1;
  act(() =>
    editor.commands.insertContentAt(
      { from: 1, to: 1 + (first?.isText ? first.text.length : 0) },
      text + (references ? ' ' : ''),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.mocked(loadContent).mockImplementation(async (name) =>
    name === 'models'
      ? { default: {} }
      : { detail: { name: '匹配作品', snapshotPath: '/matching.json.gz' } },
  );
  vi.mocked(fetchJson).mockResolvedValue({
    nodes: [
      {
        id: 'specific-node',
        type: 'image',
        width: 350,
        height: 230,
        position: { x: 0, y: 0 },
        data: { name: '作品图片', url: ['image.png'], params: { prompt: '' } },
      },
    ],
    edges: [],
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});

describe('canvas component boundaries', () => {
  it('cancels a pending node drag when the same document becomes readonly', async () => {
    const user = { name: 'local' };
    localStorage.setItem(
      'libtv.canvas.readonly-drag',
      JSON.stringify({
        nodes: [
          {
            id: 'same-node',
            type: 'text',
            position: { x: 100, y: 100 },
            data: { name: '节点', text: '节点' },
          },
        ],
        edges: [],
        view: { x: 0, y: 0, z: 1 },
      }),
    );
    const page = render(<NodeCanvas path="/canvas?projectId=readonly-drag" user={user} />);
    await readyPrompt();
    const board = page.container.querySelector('.cv-board');
    board.setPointerCapture = vi.fn();
    fireEvent(
      page.container.querySelector('[data-node-id="same-node"]'),
      new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 20 }),
    );
    page.rerender(<NodeCanvas path="/canvas/share?projectId=readonly-drag" user={user} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '只读模式信息' })).toBeTruthy());
    fireEvent(board, new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 50 }));
    expect(page.container.querySelector('[data-node-id="same-node"]').style.left).toBe('100px');
    page.unmount();
    expect(JSON.parse(localStorage.getItem('libtv.canvas.readonly-drag')).nodes[0].position.x).toBe(
      100,
    );
  });

  it('discards an unfinished drag when switching documents with the same node id', async () => {
    const user = { name: 'local' };
    for (const [id, x] of [
      ['drag-first', 10],
      ['drag-second', 800],
    ]) {
      localStorage.setItem(
        `libtv.canvas.${id}`,
        JSON.stringify({
          nodes: [
            {
              id: 'shared-drag',
              type: 'text',
              position: { x, y: 100 },
              data: { name: id, text: id },
            },
          ],
          edges: [],
          view: { x: 0, y: 0, z: 1 },
        }),
      );
    }
    const page = render(<NodeCanvas path="/canvas?projectId=drag-first" user={user} />);
    await readyPrompt();
    const board = page.container.querySelector('.cv-board');
    board.setPointerCapture = vi.fn();
    fireEvent(
      page.container.querySelector('[data-node-id="shared-drag"]'),
      new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 20 }),
    );
    page.rerender(<NodeCanvas path="/canvas?projectId=drag-second" user={user} />);
    await waitFor(() =>
      expect(page.container.querySelector('[data-node-id="shared-drag"]').style.left).toBe('800px'),
    );
    fireEvent(board, new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 50 }));
    expect(page.container.querySelector('[data-node-id="shared-drag"]').style.left).toBe('800px');
    page.unmount();
    expect(JSON.parse(localStorage.getItem('libtv.canvas.drag-second')).nodes[0].position.x).toBe(
      800,
    );
  });

  it('retains Shift toggles and moves the selected group without collapsing it on click', async () => {
    const initial = ['一', '二', '三'].map((name, index) => ({
      id: `select-${index}`,
      type: 'text',
      width: 350,
      height: 220,
      position: { x: index * 400, y: 100 },
      data: { name, text: name, params: {} },
    }));
    localStorage.setItem(
      'libtv.canvas.group-selection',
      JSON.stringify({ nodes: initial, edges: [], view: { x: 0, y: 0, z: 1 } }),
    );
    const page = render(
      <NodeCanvas path="/canvas?projectId=group-selection" user={{ name: 'local' }} />,
    );
    await readyPrompt();
    const board = page.container.querySelector('.cv-board');
    board.setPointerCapture = vi.fn();
    const node = (id) => page.container.querySelector(`[data-node-id="select-${id}"]`);
    const selectedIds = () =>
      [...page.container.querySelectorAll('.cv-node.cv-selected')].map(
        (item) => item.dataset.nodeId,
      );
    const toggle = (element) => {
      fireEvent(element, new MouseEvent('pointerdown', { bubbles: true, shiftKey: true }));
      fireEvent.click(element, { shiftKey: true });
    };
    fireEvent.click(node(0));
    toggle(node(1));
    expect(selectedIds()).toEqual(['select-0', 'select-1']);
    toggle(node(0));
    expect(selectedIds()).toEqual(['select-1']);
    toggle(node(0));
    fireEvent(node(0), new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 20 }));
    fireEvent(board, new MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 50 }));
    fireEvent(board, new MouseEvent('pointerup', { bubbles: true }));
    fireEvent.click(node(0));
    expect(selectedIds()).toEqual(['select-0', 'select-1']);
    expect(node(0).style.left).toBe('60px');
    expect(node(1).style.left).toBe('460px');
    expect(node(2).style.left).toBe('800px');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Delete' });
      fireEvent.keyUp(window, { key: 'Delete' });
      await Promise.resolve();
    });
    expect(node(0)).toBeNull();
    expect(node(1)).toBeNull();
    expect(node(2)).not.toBeNull();
    page.unmount();
    expect(JSON.parse(localStorage.getItem('libtv.canvas.group-selection')).nodes).toHaveLength(1);
  });

  it('keeps session generation mode separate from default preference, prompt parts and the next project', async () => {
    localStorage.setItem('libtv-agent-dry-run', 'false');
    const user = { name: 'local' };
    const page = render(<NodeCanvas path="/canvas?projectId=mode-first" user={user} />);
    const input = await readyPrompt();
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '自动生成', exact: true }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '生成模式' })).getByRole('button', {
        name: /手动生成/,
      }),
    );
    expect(localStorage.getItem('libtv-agent-dry-run')).toBe('false');
    editPrompt(input, '第一项目的想法');
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    page.rerender(<NodeCanvas path="/canvas?projectId=mode-second" user={user} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '自动生成', exact: true }).disabled).toBe(false),
    );
    const saved = JSON.parse(localStorage.getItem('libtv.canvas.mode-first'));
    expect(saved.agentConfig).toEqual({ dryRun: true });
    expect(saved.messages[0]).toMatchObject({
      metadata: { dryRunIntent: true },
      parts: [{ type: 'text', text: '第一项目的想法' }],
    });
    page.rerender(<NodeCanvas path="/canvas?projectId=mode-first" user={user} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '手动生成', exact: true }).disabled).toBe(false),
    );
    expect(page.container.querySelector('.cv-agent-message-content').textContent).toBe(
      '第一项目的想法',
    );
    page.unmount();
  });

  it('updates input and sent node labels from live nodes and marks deleted references without changing saved occurrences', async () => {
    const reference = {
      type: 'node',
      id: 'live-node',
      nodeKey: 'live-node',
      name: '原保存名称',
      projectId: 'live-project',
    };
    const parts = [{ type: 'text', text: '前{{ node:live-node }}后' }, reference];
    localStorage.setItem(
      'libtv.canvas.live-project',
      JSON.stringify({
        title: 'live',
        nodes: [
          {
            id: 'live-node',
            type: 'text',
            width: 350,
            height: 230,
            position: { x: 1000, y: 600 },
            data: { name: '实时名称', text: '内容', params: {} },
          },
        ],
        edges: [],
        agentDraft: { parts },
        messages: [{ role: 'user', parts }],
      }),
    );
    const page = render(
      <NodeCanvas path="/canvas?projectId=live-project" user={{ name: 'local' }} />,
    );
    const input = await readyPrompt();
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    const labels = await screen.findAllByRole('button', { name: '定位 实时名称' });
    expect(labels).toHaveLength(2);
    fireEvent.click(labels[0]);
    expect(page.container.querySelector('.cv-node.cv-selected')).toBeNull();
    expect(page.container.querySelector('.cv-world').style.transition).toContain('300ms');
    const node = page.container.querySelector('.cv-node');
    fireEvent.click(within(node).getByRole('button', { name: '节点设置' }));
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), {
      target: { value: '已改名节点' },
    });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '定位 已改名节点' })).toHaveLength(2),
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭节点设置' }));
    fireEvent.click(node);
    fireEvent.keyDown(window, { key: 'Delete' });
    fireEvent.keyUp(window, { key: 'Delete' });
    await waitFor(() => expect(screen.getAllByTitle('节点已删除')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /定位 已改名节点/ })).toBeNull();
    const restoredParts = agentContentFromJSON(input.editor.getJSON());
    expect(restoredParts[0].text).toBe('前{{ node:live-node }}后');
    expect(restoredParts[1].name).toBe('原保存名称');
    page.unmount();
  });
  it('retains the generated share link and reports clipboard denial without rejecting the action', async () => {
    const toast = vi.fn();
    const writeText = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    vi.stubGlobal(
      'navigator',
      new Proxy(navigator, {
        get: (target, property) =>
          property === 'clipboard' ? { writeText } : Reflect.get(target, property),
      }),
    );
    const page = render(
      <NodeCanvas path="/canvas?projectId=copy-denied" user={{ name: 'local' }} toast={toast} />,
    );
    const input = await readyPrompt();
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: '分享', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '开启分享并复制链接' }));
    const copy = await screen.findByRole('button', { name: '复制分享链接' });
    const dialog = screen.getByRole('dialog', { name: '分享项目' });
    const shareUrl = within(dialog).getByRole('textbox').value;
    expect(shareUrl).toContain('/canvas/share?shareId=');
    fireEvent.click(copy);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('复制失败，请手动复制分享链接'));
    expect(within(dialog).getByRole('textbox').value).toBe(shareUrl);
    page.unmount();
  });

  it('keeps public chat-share messages when copying into an editable Canvas and restoring it', async () => {
    const messages = [
      {
        role: 'user',
        content: JSON.stringify([
          { type: 'text', text: '开{{ skill:director/film }}尾' },
          { type: 'skill', id: 'director/film', name: '导演 Skill' },
        ]),
      },
      { role: 'assistant', text: '已保存的公开聊天说明' },
    ];
    vi.mocked(loadContent).mockImplementation(async (name) =>
      name === 'models'
        ? { default: {} }
        : {
            conversation: {
              title: '公开聊天画布',
              snapshot: {
                nodes: [
                  {
                    id: 'public-node',
                    type: 'text',
                    position: { x: 0, y: 0 },
                    data: { name: '公开节点', text: '已有画布内容' },
                  },
                ],
                edges: [],
              },
              messages,
            },
          },
    );
    const navigate = vi.fn();
    const first = render(
      <NodeCanvas
        path="/canvas/chat-share?shareId=conversation"
        user={{ name: 'local' }}
        navigate={navigate}
      />,
    );
    await screen.findByTitle('导演 Skill');
    fireEvent.click(screen.getByRole('button', { name: '查看结果' }));
    expect(screen.getByText('已保存的公开聊天说明')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '节点设置' }));
    fireEvent.click(screen.getByRole('button', { name: '复制画布开始创作' }));
    const path = navigate.mock.calls[0][0];
    const projectId = new URLSearchParams(path.split('?')[1]).get('projectId');
    const snapshot = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
    expect(snapshot.messages).toEqual(messages);
    expect(snapshot.nodes[0].id).toBe('public-node');
    first.unmount();
    render(<NodeCanvas path={path} user={{ name: 'local' }} />);
    await screen.findByTitle('导演 Skill');
    expect(screen.getByText('已保存的公开聊天说明')).toBeTruthy();
    expect(document.querySelector('.cv-agent-message-content').textContent).toBe('开导演 Skill尾');
  });

  it('preserves a corrupt document and blocks edits instead of autosaving an empty replacement', async () => {
    const key = 'libtv.canvas.corrupt-document';
    const original = '{damaged-canvas';
    localStorage.setItem(key, original);
    const { unmount } = render(
      <NodeCanvas path="/canvas?projectId=corrupt-document" user={{ name: 'local' }} />,
    );
    await screen.findByText('项目加载失败');
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(true);
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.queryByText('文本节点 1')).toBeNull();
    unmount();
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('flushes messages to their original document before a same-instance project change', async () => {
    const user = { name: 'local' };
    const page = render(<NodeCanvas path="/canvas?projectId=first-document" user={user} />);
    const input = await readyPrompt();
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    editPrompt(input, '只属于第一个项目的消息');
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    page.rerender(<NodeCanvas path="/canvas?projectId=second-document" user={user} />);
    await waitFor(() => {
      expect(input.getAttribute('contenteditable')).toBe('true');
      expect(promptText(input)).toBe('');
      expect(document.querySelector('.cv-message-user')).toBeNull();
    });
    page.unmount();
    const first = JSON.parse(localStorage.getItem('libtv.canvas.first-document'));
    const second = JSON.parse(localStorage.getItem('libtv.canvas.second-document'));
    expect(first.messages[0].parts[0].text).toBe('只属于第一个项目的消息');
    expect(first.agentDraft.plainText).toBe('只属于第一个项目的消息');
    expect(second.messages).toEqual([]);
    expect(second.agentDraft).toBeNull();
  });

  it('creates a Skill request from this Canvas without navigating or losing the current prompt', async () => {
    const navigate = vi.fn();
    render(
      <NodeCanvas
        path="/canvas?projectId=current-skill"
        user={{ name: 'local' }}
        navigate={navigate}
      />,
    );
    const input = await readyPrompt();
    await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
    editPrompt(input, '保留当前项目的创作想法');
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText('文本节点 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skill', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '创建', exact: true }));
    fireEvent.click(screen.getByRole('menuitem', { name: /创建新的Skill/ }));
    const intake = await screen.findByRole('group', { name: '你想做什么？' });
    expect(within(intake).getByRole('radio', { name: /基于当前画布创建 Skill/ })).toBeTruthy();
    expect(promptText(input)).toBe('保留当前项目的创作想法');
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(within(intake).getByRole('radio', { name: /基于当前画布创建 Skill/ }));
    fireEvent.click(within(intake).getByRole('button', { name: '提交' }));
    await screen.findByRole('region', { name: 'Skill 创建请求' });
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('libtv.canvas.current-skill'));
      expect(saved.agentDraft.skillCreatorIntent.entrySource).toBe('other');
      expect(saved.agentDraft.skillCreatorIntent.request.context.currentProjectId).toBe(
        'current-skill',
      );
      expect(
        saved.agentDraft.skillCreatorIntent.request.context.skillAssistant.summarizeFromCanvas,
      ).toBe(true);
      expect(saved.nodes).toHaveLength(1);
    });
  });

  it('shows the requested read-only work and closes its embedded overlay with Escape', async () => {
    const onClose = vi.fn();
    render(<NodeCanvas embedded templateUuid="matching" onClose={onClose} />);
    await screen.findByText('匹配作品');
    expect(screen.getByRole('img', { name: '作品图片' })).toBeTruthy();
    expect(loadContent).toHaveBeenCalledWith('gallery-details/matching');
    expect(screen.queryByText('PenStudio Agent')).toBeNull();
    expect(screen.getByText('10%')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('restores the saved local zoom instead of replacing it with automatic fit', async () => {
    localStorage.setItem(
      'libtv.canvas.saved-view',
      JSON.stringify({ title: '已保存视口', nodes: [], edges: [], view: { x: 12, y: 34, z: 0.5 } }),
    );
    render(<NodeCanvas path="/canvas?projectId=saved-view" user={{ name: 'local' }} />);
    await screen.findByText('已保存视口');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('does not run canvas shortcuts while an editor dialog has focus', async () => {
    render(<NodeCanvas path="/canvas?projectId=dialog-work" user={{ name: 'local' }} />);
    await waitFor(() => expect(screen.queryByText('项目加载中...')).toBeNull());
    fireEvent.keyDown(window, { key: '?' });
    const dialog = screen.getByRole('dialog', { name: '快捷键' });
    const close = screen.getByRole('button', { name: '关闭' });
    fireEvent.keyDown(close, { key: 't' });
    expect(screen.queryByText('文本节点 1')).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText('文本节点 1')).toBeTruthy();
  });

  it('keeps add, undo and redo keyboard interactions after moving them into hooks', async () => {
    render(<NodeCanvas path="/canvas?projectId=work" user={{ name: 'local' }} />);
    await waitFor(() => expect(screen.queryByText('项目加载中...')).toBeNull());
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText('文本节点 1')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.queryByText('文本节点 1')).toBeNull();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(screen.getByText('文本节点 1')).toBeTruthy();
  });

  it('blocks editing and Agent submission until the matching document finishes loading', async () => {
    let resolveSnapshot;
    vi.mocked(fetchJson).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    render(<NodeCanvas path="/canvas?templateUuid=delayed" user={{ name: 'local' }} />);
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    const prompt = await readyPrompt();
    expect(prompt.getAttribute('contenteditable')).toBe('false');
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(true);
    expect(screen.getByTitle('上传参考素材').disabled).toBe(true);
    fireEvent.keyDown(prompt, { key: 'a' });
    fireEvent.keyDown(prompt, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.queryByText('文本节点 1')).toBeNull();
    expect(localStorage.getItem('libtv.canvas.delayed')).toBeNull();
    await act(async () => resolveSnapshot({ nodes: [], edges: [] }));
    await waitFor(() => expect(prompt.getAttribute('contenteditable')).toBe('true'));
    expect(promptText(prompt)).toBe('');
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByText('文本节点 1')).toBeTruthy();
    editPrompt(prompt, '加载完成后可创作');
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    expect(screen.getByText(/你的创作想法、模型、Skill 和参考素材已保留/)).toBeTruthy();
  });

  it('does not copy an empty read-only snapshot before the source work finishes loading', async () => {
    let resolveSnapshot;
    const navigate = vi.fn();
    vi.mocked(fetchJson).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    render(
      <NodeCanvas
        embedded
        templateUuid="delayed-copy"
        user={{ name: 'local' }}
        navigate={navigate}
      />,
    );
    await waitFor(() => expect(fetchJson).toHaveBeenCalled());
    const copy = screen.getByRole('button', { name: '复制项目' });
    expect(copy.disabled).toBe(true);
    fireEvent.click(copy);
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    await act(async () =>
      resolveSnapshot({
        nodes: [
          {
            id: 'loaded',
            type: 'text',
            position: { x: 0, y: 0 },
            data: { name: '真实节点', text: '已加载内容' },
          },
        ],
        edges: [],
      }),
    );
    await waitFor(() => expect(copy.disabled).toBe(false));
    fireEvent.click(copy);
    const projectId = new URLSearchParams(navigate.mock.calls[0][0].split('?')[1]).get('projectId');
    const snapshot = JSON.parse(localStorage.getItem('libtv.canvas.' + projectId));
    expect(snapshot.nodes[0].id).toBe('loaded');
  });
});

describe('Skill to canvas handoff', () => {
  const user = { name: 'local-fixture' };
  function handoff() {
    const payload = createSkillHandoff({
      prompt: '雨夜城市追逐',
      model: { modelKey: 'video-model', label: '视频模型', modality: 'video' },
      skill: { skillKey: 'film', namespace: 'director', name: '电影导演' },
      attachments: [
        {
          id: 'ref-image',
          name: '角色参考.png',
          type: 'image',
          status: 'ready',
          source: { type: 'data', value: 'data:image/png;base64,aW1hZ2U=' },
        },
      ],
    });
    writeSkillHandoff(payload, 'incoming');
    return payload;
  }

  it('shows structured references and restores them from the project after the handoff is consumed', async () => {
    handoff();
    const path = '/canvas?draftPromptId=incoming&forceAgent=1';
    const first = render(<NodeCanvas path={path} user={user} />);
    const prompt = await readyPrompt();
    await waitFor(() => expect(promptText(prompt)).toBe('雨夜城市追逐'));
    expect(screen.getByTitle('电影导演')).toBeTruthy();
    expect(screen.getByRole('button', { name: '预览 角色参考.png' })).toBeTruthy();
    const previewButton = screen.getByRole('button', { name: '预览 角色参考.png' });
    act(() => previewButton.focus());
    fireEvent.click(previewButton);
    const preview = screen.getByRole('dialog', { name: '角色参考.png' });
    expect(within(preview).getByRole('img', { name: '角色参考.png' })).toBeTruthy();
    fireEvent.keyDown(preview, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(previewButton);
    expect(readSkillHandoff('incoming')).toBeNull();
    expect(JSON.parse(localStorage.getItem('libtv.canvas.incoming')).agentDraft.parts).toHaveLength(
      4,
    );
    first.unmount();

    render(<NodeCanvas path={path} user={user} />);
    const restored = await readyPrompt();
    await waitFor(() => expect(promptText(restored)).toBe('雨夜城市追逐'));
    expect(screen.getByTitle('视频模型')).toBeTruthy();
    expect(screen.getByTitle('电影导演')).toBeTruthy();
    expect(screen.getByRole('button', { name: '预览 角色参考.png' })).toBeTruthy();
    editPrompt(restored, '雨夜追逐，加入车灯');
    fireEvent.keyDown(restored, { key: 'Enter', isComposing: true });
    expect(screen.queryByText(/你的创作想法、模型、Skill 和参考素材已保留/)).toBeNull();
    fireEvent.keyDown(restored, { key: 'Enter' });
    expect(promptText(restored)).toBe('雨夜追逐，加入车灯');
    expect(screen.getByText(/你的创作想法、模型、Skill 和参考素材已保留/)).toBeTruthy();
    fireEvent.click(await screen.findByTitle('移除 视频模型'));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('libtv.canvas.incoming')).agentDraft;
      expect(saved.parts.some((part) => part.type === 'model')).toBe(false);
      expect(saved.parts.some((part) => part.type === 'skill')).toBe(true);
      expect(saved.plainText).toContain('雨夜追逐，加入车灯');
    });
  });

  it('flushes the most recent draft if the user leaves before the debounce completes', async () => {
    handoff();
    const { unmount } = render(<NodeCanvas path="/canvas?draftPromptId=incoming" user={user} />);
    const prompt = await readyPrompt();
    await waitFor(() => expect(promptText(prompt)).toBe('雨夜城市追逐'));
    editPrompt(prompt, '离开前最后一句');
    fireEvent.click(screen.getByTitle('移除 视频模型'));
    unmount();
    const saved = JSON.parse(localStorage.getItem('libtv.canvas.incoming')).agentDraft;
    expect(saved.plainText).toContain('离开前最后一句');
    expect(saved.parts.some((part) => part.type === 'model')).toBe(false);
    expect(saved.parts.some((part) => part.type === 'skill')).toBe(true);
  });

  it('persists an unsent prompt from an ordinary blank canvas', async () => {
    const { unmount } = render(<NodeCanvas path="/canvas?projectId=blank-prompt" user={user} />);
    await waitFor(() => expect(screen.queryByText('项目加载中...')).toBeNull());
    editPrompt(await readyPrompt(), '尚未发送的创作想法');
    unmount();
    expect(JSON.parse(localStorage.getItem('libtv.canvas.blank-prompt')).agentDraft.plainText).toBe(
      '尚未发送的创作想法',
    );
  });

  it('retains the tab handoff if durable storage cannot be written', async () => {
    handoff();
    const toast = vi.fn();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    render(<NodeCanvas path="/canvas?draftPromptId=incoming" user={user} toast={toast} />);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('本机存储空间不足，创作参考仍保留在当前标签页'),
    );
    expect(readSkillHandoff('incoming')).not.toBeNull();
    expect(screen.getByTitle('电影导演')).toBeTruthy();
  });

  it('uploads Agent references without creating canvas nodes and keeps them when sending and refreshing', async () => {
    handoff();
    const path = '/canvas?draftPromptId=incoming';
    const first = render(<NodeCanvas path={path} user={user} />);
    const prompt = await readyPrompt();
    await waitFor(() => expect(promptText(prompt)).toBe('雨夜城市追逐'));
    const agentInput = screen.getByLabelText('上传 Agent 参考素材');
    const canvasInput = screen.getByLabelText('上传画布素材');
    const agentClick = vi.spyOn(agentInput, 'click');
    const canvasClick = vi.spyOn(canvasInput, 'click');
    fireEvent.click(screen.getByTitle('上传参考素材'));
    fireEvent.click(screen.getByRole('menuitem', { name: '本地上传' }));
    expect(agentClick).toHaveBeenCalledOnce();
    expect(canvasClick).not.toHaveBeenCalled();
    fireEvent.change(agentInput, {
      target: { files: [new File(['new reference'], '新增参考.png', { type: 'image/png' })] },
    });
    await screen.findByRole('button', { name: '预览 新增参考.png' });
    expect(document.querySelectorAll('.cv-node')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    const message = document.querySelector('.cv-message-user');
    expect(within(message).getByRole('button', { name: '预览 新增参考.png' })).toBeTruthy();
    expect(within(message).getByTitle('视频模型')).toBeTruthy();
    expect(within(message).getByTitle('电影导演')).toBeTruthy();
    first.unmount();
    const snapshot = JSON.parse(localStorage.getItem('libtv.canvas.incoming'));
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.agentDraft.parts).toHaveLength(5);
    expect(snapshot.messages[0].parts[0].type).toBe('text');
    expect(snapshot.messages[0].parts.some((part) => part.name === '新增参考.png')).toBe(true);
    expect(
      snapshot.agentDraft.parts.find((part) => part.name === '新增参考.png').source.value,
    ).toMatch(/^data:image\/png;base64,/);
    render(<NodeCanvas path={path} user={user} />);
    const restoredInput = await readyPrompt();
    await within(restoredInput).findByRole('button', { name: '预览 新增参考.png' });
    expect(promptText(restoredInput)).toBe('雨夜城市追逐');
    expect(within(restoredInput).getByTitle('电影导演')).toBeTruthy();
    const restoredMessage = document.querySelector('.cv-message-user');
    expect(within(restoredMessage).getByRole('button', { name: '预览 新增参考.png' })).toBeTruthy();
  });

  it('blocks sends while reading, preserves earlier references on failure and allows selecting again', async () => {
    handoff();
    const reads = [];
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () {
      reads.push(this);
    });
    render(<NodeCanvas path="/canvas?draftPromptId=incoming" user={user} />);
    const prompt = await readyPrompt();
    await waitFor(() => expect(promptText(prompt)).toBe('雨夜城市追逐'));
    const input = screen.getByLabelText('上传 Agent 参考素材');
    const file = new File(['image'], '读取测试.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole('status').textContent).toContain('正在读取参考素材');
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(true);
    fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(document.querySelector('.cv-message-user')).toBeNull();
    await act(async () => reads[0].onerror(new Event('error')));
    expect(screen.getByRole('alert').textContent).toContain('重新选择文件');
    expect(screen.getByTitle('电影导演')).toBeTruthy();
    expect(promptText(prompt)).toBe('雨夜城市追逐');
    const choose = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: '重新选择参考素材' }));
    expect(choose).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { files: [file] } });
    Object.defineProperty(reads[1], 'result', { value: 'data:image/png;base64,c2FtcGxl' });
    await act(async () => reads[1].onload(new Event('load')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '预览 读取测试.png' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '发送创作想法' }).disabled).toBe(false);
  });

  it('merges a delayed canvas upload with current node edits and keeps file metadata', async () => {
    const readers = [];
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () {
      readers.push(this);
    });
    const projectId = 'upload-concurrent';
    const { unmount } = render(<NodeCanvas path={`/canvas?projectId=${projectId}`} user={user} />);
    await waitFor(() => expect(screen.queryByText('项目加载中...')).toBeNull());
    fireEvent.change(screen.getByLabelText('上传画布素材'), {
      target: { files: [new File(['video'], '真实后缀.MP4', { type: 'video/mp4' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '文本节点', exact: true }));
    fireEvent.change(screen.getByPlaceholderText('双击输入文本内容'), {
      target: { value: '读取期间的新正文' },
    });
    Object.defineProperty(readers[0], 'result', { value: 'data:video/mp4;base64,dmlkZW8=' });
    await act(async () => readers[0].onload(new Event('load')));
    await waitFor(() => expect(document.querySelectorAll('.cv-node')).toHaveLength(2));
    expect(screen.getByPlaceholderText('双击输入文本内容').value).toBe('读取期间的新正文');
    unmount();
    const saved = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
    expect(saved.nodes.find((n) => n.type === 'text').data.params.prompt).toBe('读取期间的新正文');
    expect(saved.nodes.find((n) => n.type === 'video').resourceMeta.items[0]).toMatchObject({
      extension: 'mp4',
      byteSize: 5,
      sourceUrl: 'data:video/mp4;base64,dmlkZW8=',
    });
  });

  it('keeps ordinary canvas uploads as nodes rather than Agent references', async () => {
    const { unmount } = render(<NodeCanvas path="/canvas?projectId=ordinary-upload" user={user} />);
    await waitFor(() => expect(screen.queryByText('项目加载中...')).toBeNull());
    const input = screen.getByLabelText('上传画布素材');
    const agentInput = screen.getByLabelText('上传 Agent 参考素材');
    const click = vi.spyOn(input, 'click');
    const agentClick = vi.spyOn(agentInput, 'click');
    fireEvent.click(screen.getByTitle('上传素材'));
    expect(click).toHaveBeenCalledOnce();
    expect(agentClick).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: { files: [new File(['canvas'], '画布图片.png', { type: 'image/png' })] },
    });
    await screen.findByRole('img', { name: '画布图片.png' });
    expect(document.querySelectorAll('.cv-node')).toHaveLength(1);
    expect(document.querySelector('.cv-agent-composer .cv-agent-references')).toBeNull();
    unmount();
    const saved = JSON.parse(localStorage.getItem('libtv.canvas.ordinary-upload'));
    expect(saved.nodes).toHaveLength(1);
    expect(saved.agentDraft).toBeNull();
  });

  it('keeps a caret upload between two model and Skill references after saving and refreshing', async () => {
    const original = [
      {
        type: 'text',
        text: '开{{ model:first }}段{{ skill:director/film }}中{{ model:second }}尾{{ skill:board/story }}终',
      },
      { type: 'model', id: 'first', name: '模型一', modality: 'image' },
      { type: 'skill', id: 'director/film', name: '导演 Skill' },
      { type: 'model', id: 'second', name: '模型二', modality: 'video' },
      { type: 'skill', id: 'board/story', name: '分镜 Skill' },
    ];
    writeSkillHandoff(createSkillHandoff({ parts: original }), 'ordered');
    const path = '/canvas?draftPromptId=ordered',
      page = render(<NodeCanvas path={path} user={user} />),
      prompt = await readyPrompt();
    await waitFor(() => expect(screen.getByTitle('分镜 Skill')).toBeTruthy());
    expect(prompt.editor.getText()).toContain('{{ model:first }}');
    act(() => prompt.editor.commands.setTextSelection(4));
    fireEvent.change(screen.getByLabelText('上传 Agent 参考素材'), {
      target: { files: [new File(['caret upload'], '中间引用.png', { type: 'image/png' })] },
    });
    await screen.findByRole('button', { name: '预览 中间引用.png' });
    const current = agentContentFromJSON(prompt.editor.getJSON());
    const uploaded = current.find((part) => part.name === '中间引用.png');
    expect(current.slice(1).map((part) => part.id)).toEqual([
      'first',
      uploaded.id,
      'director/film',
      'second',
      'board/story',
    ]);
    expect(current[0].text).toBe(
      `开{{ model:first }}段{{ image:${uploaded.id} }} {{ skill:director/film }}中{{ model:second }}尾{{ skill:board/story }}终`,
    );
    expect(uploaded.status).toBe('ready');
    page.unmount();
    const saved = JSON.parse(localStorage.getItem('libtv.canvas.ordered')).agentDraft;
    expect(saved.parts).toEqual(current);
    expect(JSON.parse(saved.serialized)).toEqual(current);
    render(<NodeCanvas path={path} user={user} />);
    const restored = await readyPrompt();
    await screen.findByRole('button', { name: '预览 中间引用.png' });
    expect(agentContentFromJSON(restored.editor.getJSON())).toEqual(current);
    expect(document.querySelectorAll('.cv-node')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '发送创作想法' }));
    const message = document.querySelector('.cv-message-user');
    expect(
      Array.from(message.querySelector('.cv-agent-message-content').children).map(
        (element) => element.textContent,
      ),
    ).toEqual([
      '开',
      '模型一',
      '段',
      '中间引用.png',
      ' ',
      '导演 Skill',
      '中',
      '模型二',
      '尾',
      '分镜 Skill',
      '终',
    ]);
    expect(within(message).getByTitle('模型一')).toBeTruthy();
    expect(within(message).getByTitle('模型二')).toBeTruthy();
    expect(within(message).getByTitle('导演 Skill')).toBeTruthy();
    expect(within(message).getByTitle('分镜 Skill')).toBeTruthy();
    expect(within(message).getByRole('button', { name: '预览 中间引用.png' })).toBeTruthy();
  });
});
