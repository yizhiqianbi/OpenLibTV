import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import secondarySnapshot from '../../../../public/data/secondary.json';
import FeatureUpdatesPage from '../../system/FeatureUpdatesPage.jsx';
import AcademyPage from '../../academy/AcademyPage.jsx';
import SkillSharePage from '../../skills/share/SkillSharePage.jsx';
import SkillFileEditor from '../../skills/create/components/SkillFileEditor.jsx';
import { normalizeSkillCases, skillCaseLink } from '../../skills/share/skill-share-model.js';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';

const resources = vi.hoisted(() => ({}));
vi.mock('../../../data.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: (name, fallback) =>
    resources[name] || { data: fallback, loading: true, error: null, reload: vi.fn() },
}));

const t = secondarySnapshot.commonLocale;
const identityAsset = (url) => url;
const props = () => ({ login: vi.fn(), navigate: vi.fn(), toast: vi.fn(), asset: identityAsset });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  for (const name of Object.keys(resources)) delete resources[name];
  resources.secondary = {
    data: secondarySnapshot,
    loading: false,
    error: null,
    reload: vi.fn(),
  };
});

function sharedSkill(skill) {
  window.history.replaceState({}, '', '/skill/share?uuid=public-template');
  resources['skill-details'] = {
    data: { 'public-template': { skill } },
    loading: false,
    error: null,
    reload: vi.fn(),
  };
}

function FileEditorHarness({ initialFiles, toast }) {
  const [files, setFiles] = useState(initialFiles),
    [dirs, setDirs] = useState([]),
    [selected, setSelected] = useState('SKILL.md'),
    [mode, setMode] = useState('code');
  return (
    <>
      <output aria-label="文件路径">{files.map((file) => file.path).join(',')}</output>
      <SkillFileEditor
        files={files}
        setFiles={setFiles}
        dirs={dirs}
        setDirs={setDirs}
        selected={selected}
        setSelected={setSelected}
        mode={mode}
        setMode={setMode}
        toast={toast}
        t={t}
        asset={identityAsset}
      />
    </>
  );
}

describe('secondary source-confirmed interactions', () => {
  it('keeps the learning plaza usable when no masterclass is configured', () => {
    resources.secondary.data = { ...secondarySnapshot, masterclasses: [] };
    render(<AcademyPage {...props()} />);
    expect(screen.getByRole('heading', { name: '学习广场' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'AI 大师公开课' })).toBeNull();
  });

  it('keeps feature destinations and their parameters across login and signed-in actions', () => {
    const actions = [
      {
        id: 'canvas',
        name: '创作功能',
        buttonText: '体验画布',
        linkUrl: 'https://www.liblib.tv/canvas?sourceSpaceId=12&sourceProjectUuid=sample#guide',
      },
      {
        id: 'blender',
        name: 'Blender 功能',
        buttonText: '体验 Blender',
        linkUrl: 'https://www.liblib.tv/blender?entrySource=homepage_feature&entryItemKey=blender',
      },
      { id: 'read-only', name: '仅说明的更新', buttonText: '没有目标的按钮' },
    ];
    resources.secondary.data = {
      ...secondarySnapshot,
      versions: [
        {
          id: 'v',
          versionNo: '1.5',
          releaseDate: '2026-09-20',
          features: actions,
          otherOptimizations: [],
        },
      ],
    };
    const page = props(),
      open = vi.spyOn(window, 'open').mockImplementation(() => null),
      view = render(<FeatureUpdatesPage {...page} />);
    fireEvent.click(screen.getByRole('button', { name: '体验画布' }));
    expect(page.login).toHaveBeenCalledWith({
      redirectUrl: '/canvas?sourceSpaceId=12&sourceProjectUuid=sample#guide',
      entrySource: 'feature_updates',
      buttonName: '体验画布',
    });
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '没有目标的按钮' })).toBeNull();

    view.rerender(<FeatureUpdatesPage {...page} user={{ name: '本地演示' }} />);
    fireEvent.click(screen.getByRole('button', { name: '体验 Blender' }));
    expect(open).toHaveBeenCalledWith(
      '/blender?entrySource=homepage_feature&entryItemKey=blender',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('uses public template IDs for favorites while accepting legacy internal Skill IDs', () => {
    sharedSkill({
      skillUuid: 'internal-skill',
      templateUuid: 'public-template',
      name: '公开 Skill',
      auditStatus: 1,
    });
    writeStoredValue('libtv-skill-favorites', ['internal-skill', 'public-template']);
    render(<SkillSharePage {...props()} user={{ name: '本地演示' }} />);
    fireEvent.click(screen.getByRole('button', { name: t.skillFavorited }));
    expect(readStoredValue('libtv-skill-favorites', [])).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: t.favorite }));
    expect(readStoredValue('libtv-skill-favorites', [])).toEqual(['public-template']);
  });

  it('preserves public use parameters and blocks a Skill awaiting review', () => {
    const skill = {
      templateUuid: 'public-template',
      name: '视频助手',
      skillKey: 'video-agent',
      namespace: 'libtv-user-generated',
      auditStatus: 1,
    };
    sharedSkill(skill);
    const page = props(),
      view = render(<SkillSharePage {...page} />);
    fireEvent.click(screen.getByRole('button', { name: t.skillAddSkill }));
    expect(page.navigate).toHaveBeenCalledWith(
      '/skill?useSkillKey=video-agent&useSkillNs=libtv-user-generated&useSkillName=%E8%A7%86%E9%A2%91%E5%8A%A9%E6%89%8B',
    );
    expect(page.login).not.toHaveBeenCalled();

    sharedSkill({ ...skill, auditStatus: 0 });
    view.rerender(<SkillSharePage {...page} />);
    page.navigate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: t.skillAddSkill }));
    expect(page.navigate).not.toHaveBeenCalled();
    expect(page.toast).toHaveBeenCalledWith(t.skillNotApprovedYet);
    expect(screen.queryByRole('button', { name: t.skillShareAction })).toBeNull();
  });

  it('closes the file menu by Escape and outside click, expands folders and resets file preview', () => {
    sharedSkill({
      templateUuid: 'public-template',
      name: '多文件 Skill',
      skillFiles: [
        { path: 'SKILL.md', content: '# 主文件' },
        { path: 'guide/README.md', content: '# 子文件' },
      ],
    });
    render(<SkillSharePage {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: '源代码' }));
    const trigger = screen.getByRole('button', { name: '选择 Skill 文件' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'SKILL.md' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'guide' }));
    expect(screen.queryByRole('menuitem', { name: 'README.md' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'guide' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'README.md' }));
    expect(screen.getByRole('heading', { name: '子文件' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('checks merged upload count and UTF-8 size before changing an existing folder', async () => {
    const toast = vi.fn(),
      files = Array.from({ length: 49 }, (_, index) => ({
        path: index ? `file-${index}.md` : 'SKILL.md',
        content: '中文'.repeat(2000),
      })),
      view = render(<FileEditorHarness initialFiles={files} toast={toast} />),
      input = view.container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: {
        files: [
          { name: 'new-1.md', size: 1, text: async () => 'a' },
          { name: 'new-2.md', size: 1, text: async () => 'b' },
        ],
      },
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('文件夹内 .md 文件不能超过 50 个'));
    expect(screen.getByLabelText('文件路径').textContent).not.toContain('new-1.md');
    fireEvent.change(input, {
      target: {
        files: [{ name: 'large.md', size: 600000, text: async () => '中'.repeat(200000) }],
      },
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith('文件夹内 .md 文件总大小不能超过 1MB'));
    expect(screen.getByLabelText('文件路径').textContent).not.toContain('large.md');
  });

  it('creates a new file inside an imported implicit folder', () => {
    render(
      <FileEditorHarness
        initialFiles={[
          { path: 'SKILL.md', content: '# 主文件' },
          { path: 'guide/notes.md', content: '# 说明' },
        ]}
        toast={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^guide/ }));
    fireEvent.click(screen.getByRole('button', { name: t.createSkillNewMdFile }));
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: 'extra' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: '名称' }), { key: 'Enter' });
    expect(screen.getByLabelText('文件路径').textContent).toContain('guide/extra.md');
  });

  it('normalizes legacy cases and attributes only supported public agent shares', () => {
    expect(
      normalizeSkillCases({
        productionCaseUrls: ['/assets/example.png', '/assets/example.mp4'],
        canvasCaseUrl: '/canvas/chat-share?shareId=sample',
        canvasCasePowers: [30, 40],
      }),
    ).toMatchObject([
      {
        productionCaseUrl: '/assets/example.png',
        canvasCasePower: 30,
        canvasCaseUrl: '/canvas/chat-share?shareId=sample',
      },
      { productionCaseUrl: '/assets/example.mp4', canvasCasePower: 40 },
    ]);
    expect(skillCaseLink('/canvas/chat-share?shareId=sample#media', 'public-template')).toBe(
      '/canvas/chat-share?shareId=sample&sourceSkillTemplateUuid=public-template#media',
    );
    const projectShare = '/canvas/share?spaceId=12&projectId=sample';
    expect(skillCaseLink(projectShare, 'public-template')).toBe(projectShare);
    const external = 'https://example.test/canvas/chat-share?shareId=sample';
    expect(skillCaseLink(external, 'public-template')).toBe(external);
  });
});
