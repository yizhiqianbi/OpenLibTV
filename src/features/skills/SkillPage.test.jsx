import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import SkillPage from './SkillPage.jsx';
import SkillDetailModal from './components/SkillDetailModal.jsx';
import SkillLibraryModal from './components/SkillLibraryModal.jsx';
import { readStoredValue, writeStoredValue } from '../../services/storage.ts';
import { readSkillHandoff, skillHandoffText } from './domain/handoff.js';
import { agentContentFromJSON, agentPlainText } from '../../services/agent-content.js';

const resources = vi.hoisted(() => ({}));
const resourceStates = vi.hoisted(() => ({}));
vi.mock('../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (name, fallback) => ({
    data: resources[name] || fallback,
    loading: false,
    error: null,
    reload: vi.fn(),
    ...resourceStates[name],
  }),
}));
vi.mock('../../components/VideoPlayer.jsx', () => ({
  default: ({ src, title }) => <video aria-label={title} src={src} />,
}));

const skill = {
  skillUuid: 'skill',
  templateUuid: 'template',
  name: '公开 Skill',
  description: '测试简介',
  skillKey: 'film',
  coverUrl: '/assets/skill.webp',
  ownerAvatar: '/assets/avatar.webp',
  tags: [{ tagLabel: '专业影视' }],
};
const draft = {
  skillUuid: 'draft',
  name: '我的草稿',
  skillKey: 'draft',
  coverUrl: '/assets/skill.webp',
  ownerAvatar: '/assets/avatar.webp',
  showMarkdown: true,
  markdownContent: '# 草稿正文\n\n可见内容',
  localDemo: true,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const name of Object.keys(resourceStates)) delete resourceStates[name];
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState({}, '', '/skill');
  resources.skills = { items: [{ ...skill }], tags: [], commonSkillTemplateUuids: ['template'] };
  resources['skills-recommended'] = { items: [resources.skills.items[0]] };
  resources['skill-details'] = { template: { skill: { ...skill, description: '完整详情介绍' } } };
});
afterEach(() => vi.restoreAllMocks());
const props = () => ({
  navigate: vi.fn(),
  login: vi.fn(),
  toast: vi.fn(),
  user: { name: '本地演示' },
});

const composerLabel = '请输入你的创作灵感，或从下方挑选一个 Skill 开始';
async function readyComposer() {
  const input = await screen.findByRole('textbox', { name: composerLabel });
  await waitFor(() => expect(input.editor).toBeTruthy());
  return input;
}
async function writeComposer(input, text) {
  await act(async () => {
    input.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    input.editor.commands.setTextSelection(input.editor.state.doc.content.size - 1);
  });
}
const composerParts = (input) => agentContentFromJSON(input.editor.getJSON());
const composerText = (input) => agentPlainText(composerParts(input));

describe('Skill list and detail flow', () => {
  it('shows a draft on mine despite a previously selected public category and renders its markdown', async () => {
    writeStoredValue('libtv-created-skills', [draft]);
    const page = props();
    render(<SkillPage {...page} />);
    await readyComposer();
    fireEvent.click(screen.getByRole('button', { name: '专业影视' }));
    fireEvent.click(screen.getByRole('button', { name: '我的' }));
    fireEvent.click(screen.getByRole('button', { name: '我的草稿' }));
    const dialog = screen.getByRole('dialog', { name: '我的草稿' });
    expect(within(dialog).getByRole('heading', { name: '草稿正文' })).toBeTruthy();
    expect(within(dialog).getByText('可见内容')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑', exact: true }));
    expect(page.navigate).toHaveBeenCalledWith('/skill/create?skillUuid=draft');
  });
  it('opens public details from the title and preserves favorite writes', async () => {
    const page = props();
    render(<SkillPage {...page} />);
    await readyComposer();
    fireEvent.click(screen.getByRole('button', { name: '公开 Skill' }));
    const dialog = screen.getByRole('dialog', { name: '公开 Skill' });
    expect(within(dialog).getByText('完整详情介绍')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '收藏' }));
    expect(readStoredValue('libtv-skill-favorites', [])).toEqual(['template']);
    expect(within(dialog).getByRole('button', { name: '取消收藏' })).toBeTruthy();
  });
  it('preserves the favorite login gate and modal case navigation', async () => {
    const page = props();
    render(<SkillPage {...page} user={null} />);
    await readyComposer();
    const card = document.querySelector('.skill-card');
    fireEvent.click(within(card).getByRole('button', { name: '收藏' }));
    expect(page.login).toHaveBeenCalledOnce();
    expect(readStoredValue('libtv-skill-favorites', [])).toEqual([]);
  });
  it('switches cases within the extracted detail modal and keeps the endpoints disabled', () => {
    render(
      <SkillDetailModal
        detail={{
          ...skill,
          caseItems: [{ productionCaseUrl: '/case-1.mp4' }, { productionCaseUrl: '/case-2.mp4' }],
        }}
        onClose={vi.fn()}
        onUse={vi.fn()}
        onFavorite={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '上一个' }).disabled).toBe(true);
    expect(screen.getByLabelText('公开 Skill', { selector: 'video' }).getAttribute('src')).toBe(
      '/case-1.mp4',
    );
    fireEvent.click(screen.getByRole('button', { name: '下一个' }));
    expect(screen.getByLabelText('公开 Skill', { selector: 'video' }).getAttribute('src')).toBe(
      '/case-2.mp4',
    );
    expect(screen.getByRole('button', { name: '下一个' }).disabled).toBe(true);
  });
  it('opens details from the description and keeps use/favorite clicks independent', async () => {
    const page = props();
    render(<SkillPage {...page} />);
    await readyComposer();
    fireEvent.click(screen.getByText('测试简介'));
    expect(screen.getByRole('dialog', { name: '公开 Skill' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '使用' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('button', { name: '移除 Skill' })).toBeTruthy();
    fireEvent.click(
      within(document.querySelector('.skill-card')).getByRole('button', { name: '收藏' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('requires login for the favorites tab and retains old favorite keys across public filters', async () => {
    const page = props();
    const view = render(<SkillPage {...page} user={null} />);
    await readyComposer();
    fireEvent.click(
      within(document.querySelector('.skill-main-tabs')).getByRole('button', {
        name: '收藏',
        exact: true,
      }),
    );
    expect(page.login).toHaveBeenCalledOnce();
    writeStoredValue('libtv-skill-favorites', ['skill']);
    view.rerender(<SkillPage {...page} />);
    fireEvent.click(screen.getByRole('button', { name: '商业广告' }));
    fireEvent.click(
      within(document.querySelector('.skill-main-tabs')).getByRole('button', {
        name: '收藏',
        exact: true,
      }),
    );
    expect(screen.getByRole('button', { name: '公开 Skill' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '搜索 Skill' })).toBeNull();
  });
  it('submits search on Enter, searches beyond recommendations, and restores recommendations on clear', async () => {
    const other = {
      ...skill,
      name: '目录独有',
      skillUuid: 'other',
      templateUuid: 'other-template',
    };
    resources.skills.items.push(other);
    render(<SkillPage {...props()} />);
    await readyComposer();
    const search = screen.getByRole('textbox', { name: '搜索 Skill' });
    fireEvent.change(search, { target: { value: ' 目录独有 ' } });
    expect(screen.queryByRole('button', { name: '目录独有' })).toBeNull();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByRole('button', { name: '目录独有' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '全部' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清除搜索' }));
    expect(screen.getByRole('button', { name: '推荐' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '公开 Skill' })).toBeTruthy();
    expect(document.activeElement).toBe(search);
  });
  it('preserves text and selected model/Skill in a session handoff when Enter sends', async () => {
    const page = props();
    render(<SkillPage {...page} />);
    const input = await readyComposer();
    await writeComposer(input, '保留剧本');
    fireEvent.click(screen.getByRole('button', { name: '使用' }));
    expect(composerText(input)).toBe('保留剧本');
    fireEvent.click(screen.getByTitle('选择模型'));
    fireEvent.click(screen.getByRole('button', { name: '添加 Lib Image 2.5 Pro' }));
    await screen.findByRole('button', { name: '移除 模型' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(page.navigate).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    const query = new URLSearchParams(page.navigate.mock.calls[0][0].split('?')[1]);
    const payload = readSkillHandoff(query.get('draftPromptId'));
    expect(skillHandoffText(payload)).toBe('保留剧本');
    expect(payload.parts).toContainEqual(
      expect.objectContaining({
        type: 'model',
        id: 'lib-image-2.5-s',
        name: 'Lib Image 2.5 Pro',
        modality: 'image',
      }),
    );
    expect(payload.parts).toContainEqual(
      expect.objectContaining({
        type: 'skill',
        id: 'libtv-user-generated/film',
        name: '公开 Skill',
      }),
    );
    expect(payload.dryRunIntent).toBe(true);
  });
  it('restores a share selection without requiring login and rejects pending Skills', async () => {
    window.history.replaceState(
      {},
      '',
      '/skill?useSkillKey=film&useSkillNs=studio&useSkillName=分享的Skill',
    );
    const page = props();
    render(<SkillPage {...page} user={null} />);
    await readyComposer();
    expect(await screen.findByText('分享的Skill')).toBeTruthy();
    expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(false);
    expect(page.login).not.toHaveBeenCalled();
    resources.skills.items[0].auditStatus = 0;
    fireEvent.click(screen.getByRole('button', { name: '使用' }));
    expect(page.toast).toHaveBeenCalledWith('该 Skill 尚未审核通过，暂不可使用');
    expect(screen.getByText('分享的Skill')).toBeTruthy();
  });
  it('shows recoverable loading/error instead of a false empty list', async () => {
    resourceStates.skills = { data: null, loading: true };
    resourceStates['skills-recommended'] = { data: null, loading: true };
    const view = render(<SkillPage {...props()} />);
    await readyComposer();
    expect(screen.getByRole('status').textContent).toContain('加载 Skill');
    expect(screen.queryByText('未找到相关 Skill')).toBeNull();
    const reload = vi.fn().mockRejectedValue(new Error('offline'));
    resourceStates.skills = { data: null, loading: false, error: new Error('offline'), reload };
    resourceStates['skills-recommended'] = { data: null, loading: false };
    view.rerender(<SkillPage {...props()} />);
    expect(screen.getByRole('alert').textContent).toContain('Skill 加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
  it('keeps the uploaded file source through an attachment-only handoff', async () => {
    const page = props();
    render(<SkillPage {...page} />);
    const composer = await readyComposer();
    const file = new File(['small image'], 'portrait.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [file] } });
    await waitFor(() => {
      expect(composerParts(composer).find((part) => part.type === 'image')).toMatchObject({
        status: 'ready',
      });
      expect(screen.getByRole('button', { name: '发送' }).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const query = new URLSearchParams(page.navigate.mock.calls[0][0].split('?')[1]);
    const attachment = readSkillHandoff(query.get('draftPromptId')).parts.find(
      (part) => part.type === 'image',
    );
    expect(attachment.name).toBe('portrait.png');
    expect(attachment.source.value).toMatch(/^data:image\/png;base64,/);
  });

  it('inserts from the compact picker without losing text, selected model or attachments', async () => {
    const page = props();
    render(<SkillPage {...page} />);
    const composer = await readyComposer();
    await writeComposer(composer, '保留完整创作意图');
    fireEvent.click(screen.getByTitle('选择模型'));
    fireEvent.click(screen.getByRole('button', { name: '添加 Lib Image 2.5 Pro' }));
    fireEvent.change(document.querySelector('input[type=file]'), {
      target: { files: [new File(['ref'], '完整参考.png', { type: 'image/png' })] },
    });
    await waitFor(() =>
      expect(composerParts(composer).find((part) => part.type === 'image')).toMatchObject({
        status: 'ready',
      }),
    );
    fireEvent.click(screen.getByTitle('Skill'));
    const picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('button', { name: '添加 公开 Skill' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(composerText(composer)).toBe('保留完整创作意图');
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const query = new URLSearchParams(page.navigate.mock.calls[0][0].split('?')[1]);
    const handoff = readSkillHandoff(query.get('draftPromptId'));
    expect(handoff.parts.map((part) => part.type)).toEqual(['text', 'model', 'image', 'skill']);
  });

  it('keeps private tabs gated and performs debounced public search even from the favorites tab', async () => {
    const page = props();
    const extra = { ...skill, name: '目录深处', templateUuid: 'deep-template', skillUuid: 'deep' };
    resources.skills.items.push(extra);
    const view = render(<SkillPage {...page} user={null} />);
    await readyComposer();
    fireEvent.click(screen.getByTitle('Skill'));
    let picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('tab', { name: '收藏' }));
    expect(page.login).toHaveBeenCalledOnce();
    expect(within(picker).getByRole('tab', { name: '通用' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    writeStoredValue('libtv-skill-favorites', ['skill']);
    view.rerender(<SkillPage {...page} />);
    picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('tab', { name: '收藏' }));
    expect(within(picker).getByRole('button', { name: '添加 公开 Skill' })).toBeTruthy();
    fireEvent.change(within(picker).getByRole('textbox', { name: '选择器搜索 Skill' }), {
      target: { value: '目录深处' },
    });
    expect(within(picker).queryByRole('button', { name: '添加 目录深处' })).toBeNull();
    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: '添加 目录深处' })).toBeTruthy(),
    );
    fireEvent.click(within(picker).getByRole('button', { name: '清除选择器搜索' }));
    expect(within(picker).queryByRole('button', { name: '添加 目录深处' })).toBeNull();
    expect(within(picker).getByRole('button', { name: '添加 公开 Skill' })).toBeTruthy();
  });

  it('shows only usable drafts in the compact picker and opens details independently from insertion', async () => {
    writeStoredValue('libtv-created-skills', [
      draft,
      { ...draft, skillUuid: 'pending', name: '审核中草稿', auditStatus: 0 },
    ]);
    render(<SkillPage {...props()} />);
    await readyComposer();
    const trigger = screen.getByTitle('Skill');
    fireEvent.click(trigger);
    const picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('tab', { name: '我的' }));
    expect(within(picker).queryByRole('button', { name: '添加 审核中草稿' })).toBeNull();
    fireEvent.click(within(picker).getByRole('button', { name: '查看 我的草稿 详情' }));
    expect(screen.queryByRole('dialog', { name: 'Skill 选择器' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '我的草稿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '移除 Skill' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('restores the compact picker trigger on Escape without stealing outside focus', async () => {
    render(<SkillPage {...props()} />);
    const editor = await readyComposer();
    await writeComposer(editor, '保留正文');
    const trigger = screen.getByTitle('Skill');
    fireEvent.click(trigger);
    const search = within(screen.getByRole('dialog', { name: 'Skill 选择器' })).getByRole(
      'textbox',
      { name: '选择器搜索 Skill' },
    );
    act(() => search.focus());
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Skill 选择器' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(composerText(editor)).toBe('保留正文');

    fireEvent.click(trigger);
    const listSearch = screen.getByRole('textbox', { name: '搜索 Skill', exact: true });
    act(() => listSearch.focus());
    expect(screen.queryByRole('dialog', { name: 'Skill 选择器' })).toBeNull();
    expect(document.activeElement).toBe(listSearch);
  });

  it('opens the full picker, supports nested details and restores its lifecycle on Escape', async () => {
    render(<SkillPage {...props()} />);
    await readyComposer();
    const trigger = screen.getByTitle('Skill');
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Skill 选择器' })).getByRole('button', {
        name: '全部',
        exact: true,
      }),
    );
    const all = screen.getByRole('dialog', { name: '全部 Skill' });
    const title = within(all).getByRole('button', { name: '公开 Skill', exact: true });
    title.focus();
    fireEvent.click(title);
    const detail = screen.getByRole('dialog', { name: '公开 Skill' });
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '全部 Skill' })).toBeTruthy();
    expect(document.activeElement).toBe(title);
    fireEvent.click(within(all).getByRole('tab', { name: '收藏' }));
    expect(within(all).getByText('暂无 Skill')).toBeTruthy();
    fireEvent.keyDown(all, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('uses public filters and explicit load-more in the full picker, then selects a draft from Mine', () => {
    const recommended = {
      items: Array.from({ length: 22 }, (_, i) => ({
        ...skill,
        name: '精选' + i,
        skillUuid: 'item' + i,
        templateUuid: 'template' + i,
      })),
    };
    const onSelect = vi.fn();
    render(
      <SkillLibraryModal
        catalogue={[skill]}
        recommended={recommended}
        drafts={[draft]}
        favorites={[]}
        user={props().user}
        onSelect={onSelect}
        onDetail={vi.fn()}
        onFavorite={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const all = screen.getByRole('dialog', { name: '全部 Skill' });
    expect(within(all).queryByText('精选21', { selector: 'button.skill-name' })).toBeNull();
    fireEvent.click(within(all).getByText('加载更多', { selector: 'button' }));
    expect(within(all).getByText('精选21', { selector: 'button.skill-name' })).toBeTruthy();
    fireEvent.click(within(all).getByText('商业广告', { selector: 'button' }));
    expect(within(all).getByText('暂无 Skill')).toBeTruthy();
    fireEvent.click(within(all).getByRole('tab', { name: '我的' }));
    fireEvent.click(within(all).getByRole('button', { name: '使用' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(draft);
  });

  it('closes the full picker after inserting a Mine draft without clearing the composer', async () => {
    writeStoredValue('libtv-created-skills', [draft]);
    render(<SkillPage {...props()} />);
    const composer = await readyComposer();
    await writeComposer(composer, '原有的灵感');
    fireEvent.click(screen.getByTitle('Skill'));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Skill 选择器' })).getByRole('button', {
        name: '全部',
        exact: true,
      }),
    );
    const all = screen.getByRole('dialog', { name: '全部 Skill' });
    fireEvent.click(within(all).getByRole('tab', { name: '我的' }));
    fireEvent.click(within(all).getByRole('button', { name: '使用' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('我的草稿')).toBeTruthy();
    expect(composerText(composer)).toBe('原有的灵感');
  });

  it('opens both source-backed creation entries in new tabs and retains the composer', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    const page = props();
    render(<SkillPage {...page} />);
    const composer = await readyComposer();
    await writeComposer(composer, '不清空的灵感');
    fireEvent.click(screen.getByTitle('Skill'));
    let picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('button', { name: '创建' }));
    fireEvent.click(within(picker).getByRole('menuitem', { name: /导入已有Skill/ }));
    expect(open).toHaveBeenCalledWith('/skill/create', '_blank');
    expect(composerText(composer)).toBe('不清空的灵感');
    fireEvent.click(screen.getByTitle('Skill'));
    picker = screen.getByRole('dialog', { name: 'Skill 选择器' });
    fireEvent.click(within(picker).getByRole('button', { name: '创建' }));
    fireEvent.click(within(picker).getByRole('menuitem', { name: /创建新的Skill/ }));
    const url = new URL(open.mock.calls[1][0], location.origin);
    expect(url.pathname).toBe('/canvas');
    expect(url.searchParams.get('skillCreatorIntake')).toBe('1');
    expect(url.searchParams.get('guideSource')).toBe('skill');
    expect(url.searchParams.get('projectId')).toBeTruthy();
    expect(composerText(composer)).toBe('不清空的灵感');
    expect(page.navigate).not.toHaveBeenCalled();
  });
  it('retains multiple Skills and models in caret order through individual removal, undo and session handoff', async () => {
    const second = {
      ...skill,
      skillUuid: 'second',
      templateUuid: 'second-template',
      name: '第二个 Skill',
      skillKey: 'second-film',
    };
    resources.skills.items.push(second);
    resources['skills-recommended'].items.push(second);
    const page = props();
    render(<SkillPage {...page} />);
    const composer = await readyComposer();
    await writeComposer(composer, '前后');
    await act(async () => composer.editor.commands.setTextSelection(2));
    const useCard = (name) => {
      const card = screen.getByRole('button', { name, exact: true }).closest('.skill-card');
      fireEvent.click(within(card).getByRole('button', { name: '使用' }));
    };
    useCard('公开 Skill');
    await screen.findByRole('button', { name: '移除 Skill' });
    fireEvent.click(screen.getByTitle('选择模型'));
    fireEvent.click(screen.getByRole('button', { name: '添加 Lib Image 2.5 Pro' }));
    await screen.findByRole('button', { name: '移除 模型' });
    useCard('第二个 Skill');
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '移除 Skill' })).toHaveLength(2),
    );
    fireEvent.click(screen.getByTitle('选择模型'));
    fireEvent.click(screen.getByRole('button', { name: '添加 Lib Image 2.5 Fast' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '移除 模型' })).toHaveLength(2),
    );
    const ids = [
      'libtv-user-generated/film',
      'lib-image-2.5-s',
      'libtv-user-generated/second-film',
      'lib-image-2.5-f',
    ];
    const before = composerParts(composer);
    expect(before.slice(1).map((part) => part.id)).toEqual(ids);
    expect(before[0].text).toBe(
      '前{{ skill:libtv-user-generated/film }} {{ model:lib-image-2.5-s }} {{ skill:libtv-user-generated/second-film }} {{ model:lib-image-2.5-f }} 后',
    );
    expect(new Set(before.slice(1).map((part) => part.referenceKey)).size).toBe(4);
    fireEvent.click(screen.getAllByRole('button', { name: '移除 Skill' })[0]);
    expect(
      composerParts(composer)
        .slice(1)
        .map((part) => part.id),
    ).toEqual(ids.slice(1));
    await act(async () => composer.editor.commands.undo());
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '移除 Skill' })).toHaveLength(2),
    );
    expect(
      composerParts(composer)
        .slice(1)
        .map((part) => part.id),
    ).toEqual(ids);
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    const query = new URLSearchParams(page.navigate.mock.calls[0][0].split('?')[1]);
    const saved = readSkillHandoff(query.get('draftPromptId'));
    expect(saved.parts.slice(1).map((part) => part.id)).toEqual(ids);
    expect(saved.parts[0].text).toBe(before[0].text);
    expect(saved.serialized).toBe(JSON.stringify(saved.parts));
    expect(skillHandoffText(saved)).toBe('前    后');
  });
});
