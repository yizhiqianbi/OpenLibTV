import React from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import secondarySnapshot from '../../../../public/data/secondary.json';
import AcademyPage from '../../academy/AcademyPage.jsx';
import ArticlePage from '../../academy/ArticlePage.jsx';
import ActivityPage from '../../activities/ActivityPage.jsx';
import SkillCreatePage from '../../skills/create/SkillCreatePage.jsx';
import SkillSharePage from '../../skills/share/SkillSharePage.jsx';
import * as storage from '../../../services/storage.ts';

const resources = vi.hoisted(() => ({}));
vi.mock('../../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (name, fallback) =>
    resources[name] || { data: fallback, loading: true, error: null, reload: vi.fn() },
}));

const content = {
  ...secondarySnapshot,
  articles: secondarySnapshot.articles.slice(0, 1),
  tutorials: secondarySnapshot.tutorials.slice(0, 1),
};
const t = content.commonLocale;
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  } else {
    delete HTMLElement.prototype.scrollIntoView;
  }
});
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  for (const name of Object.keys(resources)) delete resources[name];
  resources.secondary = { data: content, loading: false, error: null, reload: vi.fn() };
});

function pageProps(path) {
  return { path, navigate: vi.fn(), login: vi.fn(), toast: vi.fn(), asset: (url) => url };
}

async function fillSkill() {
  for (const [label, value] of [
    [t.createSkillFieldName, '测试创作助手'],
    [t.createSkillFieldDescription, '根据输入制作测试作品'],
    [t.createSkillFieldUseScenario, '验证本地创作流程'],
    [t.createSkillFieldHowToUse, '输入一个故事想法'],
    [t.createSkillFieldOutput, '输出分镜和脚本'],
  ]) {
    fireEvent.change(screen.getByRole('textbox', { name: new RegExp(`^${label}`) }), {
      target: { value },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
  let editor;
  await waitFor(() => {
    editor = EditorView.findFromDOM(screen.getByRole('textbox', { name: 'SKILL.md 内容' }));
    expect(editor).toBeTruthy();
  });
  act(() =>
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: '# 测试 Skill\n\n根据输入制作分镜。',
      },
    }),
  );
}

describe('secondary route flows after domain extraction', () => {
  it('keeps loading and retry states on the unified content boundary', async () => {
    const props = pageProps('/academy');
    resources.secondary = { data: null, loading: true, error: null, reload: vi.fn() };
    const view = render(<AcademyPage {...props} />);
    expect(screen.getByLabelText('加载中')).toBeTruthy();

    const reload = vi.fn().mockRejectedValue(new Error('offline'));
    resources.secondary = { data: null, loading: false, error: new Error('offline'), reload };
    view.rerender(<AcademyPage {...props} />);
    expect(screen.getByRole('alert').textContent).toContain('内容加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());

    resources.secondary = { data: content, loading: false, error: null, reload };
    view.rerender(<AcademyPage {...props} />);
    expect(screen.getByRole('heading', { name: '学习广场' })).toBeTruthy();
  });

  it('preserves academy tab selection, the login gate, and tutorial navigation', () => {
    const props = pageProps('/academy');
    const view = render(<AcademyPage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(content.articles[0].title) }));
    expect(props.login).toHaveBeenCalledOnce();

    view.rerender(<AcademyPage {...props} user={{ name: '本地测试' }} />);
    fireEvent.click(screen.getByRole('tab', { name: '亮点功能' }));
    expect(screen.getByRole('tab', { name: '亮点功能' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(content.tutorials[0].title) }));
    expect(props.navigate).toHaveBeenCalledWith(
      `/academy/tutorial/${content.tutorials[0].tutorialUuid}`,
    );
  });

  it('opens article canvas practice in a new attributed tab', () => {
    const item = content.details.articles[content.articles[0].articleUuid];
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const props = pageProps(`/academy/article/${item.articleUuid}`);
    render(<ArticlePage {...props} user={{ name: '本地测试' }} />);

    fireEvent.click(
      screen.getAllByRole('button', {
        name: '专注创作 尽情创意 · 预制画布已为你准备',
      })[0],
    );
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('source=academy_tutorial'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(open.mock.calls[0][0]).toContain(`itemKey=${item.articleUuid}`);
    open.mockRestore();
  });

  it('preserves activity registration and persists through the storage boundary', () => {
    const activity = {
      activityId: 900,
      name: '本地挑战赛',
      status: 2,
      startAt: Date.now(),
      endAt: Date.now() + 86400000,
      description: '## 活动规则\n\n完成一条作品。',
    };
    resources.secondary.data = { ...content, activities: [activity] };
    const props = pageProps('/activity/900');
    render(<ActivityPage {...props} user={{ name: '本地测试' }} />);
    fireEvent.click(screen.getByRole('button', { name: '立即报名' }));
    fireEvent.change(screen.getByPlaceholderText('请输入手机号或微信号'), {
      target: { value: 'local-test' },
    });
    fireEvent.change(screen.getByPlaceholderText('填写您的社媒主页链接，如，小红书、B站、抖音等'), {
      target: { value: 'https://example.test/profile' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '提交报名' }));

    expect(storage.readStoredValue('libtv-activity-registration-900', null)).toMatchObject({
      activityId: 900,
      contact: 'local-test',
      social: 'https://example.test/profile',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: '已报名' }).disabled).toBe(true);
  });

  it('preserves Skill editing and saves a local draft before navigating to mine', async () => {
    storage.writeStoredValue('libtv-created-skills', null);
    const props = pageProps('/skill/create');
    render(<SkillCreatePage {...props} user={{ name: '本地测试' }} />);
    await fillSkill();
    fireEvent.click(screen.getByRole('button', { name: t.save }));

    const [draft] = storage.readStoredValue('libtv-created-skills', []);
    expect(draft).toMatchObject({
      name: '测试创作助手',
      ownerName: '本地测试',
      markdownContent: '# 测试 Skill\n\n根据输入制作分镜。',
      localDemo: true,
    });
    expect(draft.skillFiles[0].path).toBe('SKILL.md');
    expect(props.navigate).toHaveBeenCalledWith('/skill?tab=mine');
  });

  it('keeps an unsaved Skill on screen when storage rejects the draft', async () => {
    vi.spyOn(storage, 'writeStoredValue').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const props = pageProps('/skill/create');
    render(<SkillCreatePage {...props} user={{ name: '本地测试' }} />);
    await fillSkill();
    fireEvent.click(screen.getByRole('button', { name: t.save }));

    expect(props.navigate).not.toHaveBeenCalled();
    expect(props.toast).toHaveBeenCalledWith('本地保存失败，请检查浏览器存储空间');
    expect(storage.readStoredValue('libtv-created-skills', [])).toEqual([]);
    expect(screen.getByRole('textbox', { name: /^Skill 名称/ }).value).toBe('测试创作助手');
  });

  it('preserves shared Skill favorites with legacy null storage', () => {
    storage.writeStoredValue('libtv-skill-favorites', null);
    window.history.replaceState({}, '', '/skill/share?uuid=shared-skill');
    resources['skill-details'] = {
      data: {
        'shared-skill': {
          skill: { skillUuid: 'shared-skill', name: '分享的 Skill', ownerName: '本地创作者' },
        },
      },
      loading: false,
      error: null,
      reload: vi.fn(),
    };
    render(<SkillSharePage {...pageProps('/skill/share')} user={{ name: '本地测试' }} />);
    fireEvent.click(screen.getByRole('button', { name: t.favorite }));
    expect(storage.readStoredValue('libtv-skill-favorites', [])).toEqual(['shared-skill']);
    expect(screen.getByRole('button', { name: t.skillFavorited })).toBeTruthy();
  });
});
