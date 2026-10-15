import { describe, expect, it } from 'vitest';
import { filterPickerSkills, displaySkillKey, skillCreateCanvasHref } from './skill-picker.js';

const one = {
  templateUuid: 'one-template',
  skillUuid: 'one',
  skillKey: 'director',
  name: '导演',
  description: '电影创作',
};
const two = {
  templateUuid: 'two-template',
  skillUuid: 'two',
  skillKey: 'photo',
  name: '摄影',
  description: '写真',
};
describe('compact Skill picker model', () => {
  it('keeps common configuration order and searches the public directory regardless of private tab', () => {
    const input = { catalogue: [one, two], commonIds: ['two-template', 'one-template'] };
    expect(filterPickerSkills(input)).toEqual([two, one]);
    expect(
      filterPickerSkills({ ...input, tab: '收藏', favorites: ['one'], query: '摄影' }),
    ).toEqual([two]);
    expect(filterPickerSkills({ ...input, tab: '收藏', favorites: ['one'] })).toEqual([one]);
  });
  it('excludes pending and rejected drafts from inline selection but accepts approved/offline local drafts', () => {
    const drafts = [-1, 0, 1, 2].map((auditStatus) => ({ ...one, auditStatus }));
    expect(filterPickerSkills({ drafts, tab: '我的' }).map((item) => item.auditStatus)).toEqual([
      -1, 1,
    ]);
    expect(displaySkillKey({ skillKey: 'film-0123456789abcdef0123456789abcdef-more' })).toBe(
      '/film',
    );
  });
  it('creates a distinct Canvas target with the real intake parameter and preserves guide source', () => {
    const url = new URL(skillCreateCanvasHref('independent-project'), 'https://local.invalid');
    expect(url.searchParams.get('projectId')).toBe('independent-project');
    expect(url.searchParams.get('newProject')).toBe('true');
    expect(url.searchParams.get('skillCreatorIntake')).toBe('1');
    expect(url.searchParams.get('guideSource')).toBe('skill');
  });
});
