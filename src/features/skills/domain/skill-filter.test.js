import { describe, expect, it } from 'vitest';
import {
  filterSkills,
  resolveSkillDetail,
  skillMarkdown,
  toggleSkillFavorite,
} from './skill-filter.js';

const publicSkill = {
  skillUuid: 'public',
  templateUuid: 'template',
  name: '电影助手',
  description: 'FILM shots',
  tags: [{ tagLabel: '专业影视' }],
};
const draft = { skillUuid: 'draft', name: '我的草稿', description: '本地脚本', localDemo: true };

describe('Skill catalogue domain', () => {
  it('keeps untagged mine drafts visible after selecting a public category', () => {
    expect(
      filterSkills({
        catalogue: [publicSkill],
        drafts: [draft],
        tab: '我的',
        category: '专业影视',
      }),
    ).toEqual([draft]);
    expect(
      filterSkills({ drafts: [draft], tab: '我的', category: '专业影视', query: '脚本' }),
    ).toEqual([draft]);
    expect(
      filterSkills({ drafts: [draft], tab: '我的', category: '专业影视', query: '电影' }),
    ).toEqual([draft]);
  });
  it('preserves recommended order, public tag filtering, search, and favorites', () => {
    expect(
      filterSkills({ catalogue: [publicSkill], recommended: { list: [draft, publicSkill] } }),
    ).toEqual([draft, publicSkill]);
    expect(
      filterSkills({
        catalogue: [publicSkill],
        category: '专业影视',
        query: 'film',
        tab: '收藏',
        favorites: ['public'],
      }),
    ).toEqual([publicSkill]);
    expect(filterSkills({ catalogue: [publicSkill], category: '商业广告' })).toEqual([]);
  });
  it('resolves wrapped public details and falls back to the selected draft', () => {
    const detail = { ...publicSkill, description: '完整简介' };
    expect(resolveSkillDetail(publicSkill, { template: { skill: detail } })).toEqual(detail);
    expect(resolveSkillDetail(draft)).toBe(draft);
  });
  it('renders draft markdownContent and preserves legacy markdown visibility', () => {
    expect(skillMarkdown({ showMarkdown: true, markdownContent: '# 草稿正文' })).toBe('# 草稿正文');
    expect(skillMarkdown({ showMarkdown: true, markdown: '# 原始正文' })).toBe('# 原始正文');
    expect(skillMarkdown({ showMarkdown: false, markdownContent: '# 不公开' })).toBe('');
    expect(skillMarkdown({ snapshotData: JSON.stringify({ markdownContent: '# 快照正文' }) })).toBe(
      '# 快照正文',
    );
  });
  it('does not hide favorites outside recommendations or inherit a public category/search', () => {
    expect(
      filterSkills({
        catalogue: [publicSkill],
        recommended: { items: [draft] },
        tab: '收藏',
        category: '商业广告',
        query: '无匹配',
        favorites: ['template'],
      }),
    ).toEqual([publicSkill]);
    expect(toggleSkillFavorite(publicSkill, ['public', 'template'])).toEqual([]);
    expect(toggleSkillFavorite(publicSkill, [])).toEqual(['template']);
  });
  it('searches the full catalogue from the recommendation category', () => {
    expect(
      filterSkills({ catalogue: [publicSkill], recommended: { items: [draft] }, query: ' film ' }),
    ).toEqual([publicSkill]);
  });
});
