import { describe, expect, it } from 'vitest';
import {
  resolveSkillMineActionState,
  skillAuditLabel,
  deleteLocalSkill,
  restoreLocalSkill,
  createLocalPublishRequest,
  validateLocalSkills,
  validatePublishForm,
  skillPublishCategories,
  skillPublishForm,
  validateSkillCaseFile,
} from './skill-mine-model.js';

describe('My Skill source permissions and local transitions', () => {
  it('blocks a known other team owner but permits personal records and an unknown team owner', () => {
    const item = { ownerId: 'other', auditStatus: 1, currentSnapshotId: 'published' };
    expect(
      resolveSkillMineActionState(item, { isTeamUser: true, currentUserId: 'me' }),
    ).toMatchObject({
      isOwner: false,
      editDisabled: true,
      publishDisabled: true,
      deleteDisabled: true,
      hasPublishedSnapshot: true,
    });
    expect(resolveSkillMineActionState(item).isOwner).toBe(true);
    expect(resolveSkillMineActionState(item, { isTeamUser: true }).isOwner).toBe(true);
    expect(
      resolveSkillMineActionState({ ...item, currentSnapshotId: '0' }).hasPublishedSnapshot,
    ).toBe(false);
  });
  it('allows owned pending deletion but not editing/publication, and permits rejected edits', () => {
    expect(resolveSkillMineActionState({ auditStatus: 0 })).toMatchObject({
      editDisabled: true,
      publishDisabled: true,
      deleteDisabled: false,
    });
    expect(resolveSkillMineActionState({ auditStatus: 2 }).editDisabled).toBe(false);
    expect(skillAuditLabel({ auditStatus: 1, hasPendingUpdate: true })).toBe(
      '已发布，有新版待更新',
    );
  });
  it('soft-deletes and restores the existing array record without losing files or audit metadata', () => {
    const original = {
      skillUuid: 'draft',
      name: '旧草稿',
      markdownContent: '# doc',
      skillFiles: [{ path: 'SKILL.md', content: '# doc' }],
      auditStatus: 2,
      rejectReason: '原审核说明',
    };
    const deleted = deleteLocalSkill([original], 'draft', 123);
    expect(deleted[0]).toMatchObject({
      localDeletedAt: 123,
      auditStatus: 2,
      rejectReason: '原审核说明',
    });
    expect(restoreLocalSkill(deleted, 'draft')).toEqual([original]);
    expect(() => validateLocalSkills({ drafts: [] })).toThrow();
    expect(validateLocalSkills(null)).toEqual([]);
    expect(() => deleteLocalSkill([original], 'missing')).toThrow('已不存在');
  });
  it('validates all publication fields and records a blocked request without an invented audit result', () => {
    const item = {
      skillUuid: 'skill',
      name: '旧记录',
      auditStatus: 2,
      currentSnapshotId: 'before',
      templateUuid: 'public',
      productionCaseUrls: ['https://sample.local/video.mp4'],
      categoryTagIds: [4000],
    };
    const categories = [
      { id: 4000, tagLabel: '影视', tagStatus: 1 },
      { id: 4007 },
      { id: 4008 },
      { id: 4009, tagStatus: 0 },
    ];
    expect(skillPublishCategories(categories)).toHaveLength(1);
    const form = skillPublishForm(item);
    expect(
      validatePublishForm({ ...form, agreement: false, category: null, caseItems: [] }, categories),
    ).toEqual({
      agreement: '请先同意作者协议',
      caseItems: '请上传作品后再发布',
      category: '请选择 Skill 分类后再发布',
    });
    const request = createLocalPublishRequest(
      item,
      { ...form, caseItems: [{ ...form.caseItems[0], link: 'https://sample.local/canvas' }] },
      99,
    );
    expect(request).toMatchObject({
      status: 'blocked',
      attempts: 1,
      createdAt: 99,
      linkValidation: 'service-required',
      payload: { skillUuid: 'skill', templateUuid: 'public', tagIds: [4000] },
    });
    expect(request.auditStatus).toBeUndefined();
    expect(item.auditStatus).toBe(2);
    expect(
      validatePublishForm(
        { ...form, caseItems: [{ ...form.caseItems[0], link: 'javascript:alert(1)' }] },
        categories,
      ).links,
    ).toEqual({ 0: '无效作品链接' });
  });
  it('uses distinct source file limits including a video uploaded as an audio case', () => {
    expect(
      validateSkillCaseFile({ name: 'sound.mp4', type: 'video/mp4', size: 300 * 1024 * 1024 }, 4)
        .type,
    ).toBe(3);
    expect(() =>
      validateSkillCaseFile(
        { name: 'sound.mp3', type: 'audio/mpeg', size: 10 * 1024 * 1024 + 1 },
        4,
      ),
    ).toThrow('10');
    expect(() =>
      validateSkillCaseFile({ name: 'text.txt', type: 'text/plain', size: 1 }, 1),
    ).toThrow('Markdown');
  });
});
