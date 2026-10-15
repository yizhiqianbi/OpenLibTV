// Source: 3eow8r60k2kpc.js resolveSkillMineActionState (823061),
// SkillPublishModal (266283), useEditSkillInChat (682335), uploadSkillFile (228229).
import { localSkillId } from '../../../services/local-skills.js';
export {
  LOCAL_SKILLS_KEY,
  localSkillId,
  validateLocalSkills,
} from '../../../services/local-skills.js';
export const MAX_SKILL_CASES = 4;
export const SKILL_CASE_ACCEPT = {
  1: '.md,text/markdown',
  2: 'image/*',
  3: 'video/*',
  4: 'audio/*,video/*',
};

export function resolveSkillMineActionState(
  skill,
  { isTeamUser = false, currentUserId = null } = {},
) {
  const isOwner =
    !isTeamUser ||
    skill.ownerId == null ||
    currentUserId == null ||
    skill.ownerId === currentUserId;
  const ready = skill.auditStatus !== 0;
  const snapshot = skill.currentSnapshotId;
  return {
    isOwner,
    hasPublishedSnapshot: snapshot != null && snapshot !== '' && String(snapshot) !== '0',
    editDisabled: !isOwner || !ready,
    publishDisabled: !isOwner || !ready,
    deleteDisabled: !isOwner,
    editReason: !isOwner ? '非本人创建Skill，无权限编辑' : !ready ? '审核中不可操作' : '',
    publishReason: !isOwner ? '非本人创建Skill，无权限发布' : !ready ? '审核中不可操作' : '',
    deleteReason: !isOwner ? '非本人创建Skill，无权限删除' : '',
  };
}

export function skillAuditLabel(skill) {
  if (skill.auditStatus === 1 && skill.hasPendingUpdate) return '已发布，有新版待更新';
  return (
    { 0: '发布审核中', 1: '已发布', 2: '发布审核不通过' }[skill.auditStatus] ||
    (skill.localDemo ? '本地草稿' : '')
  );
}

export function updateLocalSkill(skills, id, update) {
  const index = skills.findIndex((item) => localSkillId(item) === id);
  if (index < 0) throw new Error('Skill 已不存在，请重新加载');
  return skills.map((item, current) => (current === index ? update(item) : item));
}

export function deleteLocalSkill(skills, id, now = Date.now()) {
  return updateLocalSkill(skills, id, (item) => ({ ...item, localDeletedAt: now }));
}

export function restoreLocalSkill(skills, id) {
  return updateLocalSkill(skills, id, ({ localDeletedAt: _deletedAt, ...item }) => item);
}

export function skillPublishCategories(tags = []) {
  return tags.filter(
    (item) =>
      item.tagStatus !== 0 && ![4007, 4008].includes(item.id) && typeof item.id === 'number',
  );
}

export function skillPublishForm(skill) {
  const previous = skill.localPublishRequest?.form;
  if (previous) return previous;
  const cases = skill.caseItems?.length
    ? skill.caseItems
    : (skill.productionCaseUrls || []).map((url, index) => ({
        productionCaseUrl: url,
        canvasCaseUrl: index === 0 ? skill.canvasCaseUrl : undefined,
      }));
  return {
    caseItems: cases.map((item, index) => ({
      id: item.id || 'existing-' + index,
      url: item.productionCaseUrl || item.url || '',
      link: item.canvasCaseUrl || item.link || '',
      name: item.name || '案例 ' + (index + 1),
      status: 'ready',
    })),
    category:
      (skill.categoryTagIds || skill.tagIds || skill.tags?.map((tag) => tag.id) || []).find(
        (id) => typeof id === 'number',
      ) ?? null,
    showMarkdown: skill.showMarkdown !== false,
    agreement: true,
  };
}

export function validatePublishForm(form, categories) {
  const errors = {};
  if (!form.agreement) errors.agreement = '请先同意作者协议';
  if (!form.caseItems.length || !form.caseItems.some((item) => item.url))
    errors.caseItems = '请上传作品后再发布';
  if (form.caseItems.length > MAX_SKILL_CASES) errors.caseItems = '最多上传 4 个案例';
  if (form.caseItems.some((item) => item.status !== 'ready'))
    errors.caseItems = '请等待案例读取完成，重试或移除失败文件';
  if (
    form.category == null ||
    !skillPublishCategories(categories).some((item) => item.id === Number(form.category))
  )
    errors.category = '请选择 Skill 分类后再发布';
  const links = {};
  form.caseItems.forEach((item, index) => {
    if (!item.link?.trim()) return;
    try {
      const url = new URL(item.link.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid');
    } catch {
      links[index] = '无效作品链接';
    }
  });
  if (Object.keys(links).length) errors.links = links;
  return errors;
}

export function createLocalPublishRequest(skill, form, now = Date.now()) {
  const errors = validatePublishForm(form, [{ id: Number(form.category) }]);
  if (Object.keys(errors).length)
    throw new Error('发布表单未完成，请检查案例、分类、链接和作者协议');
  const caseItems = form.caseItems.map((item) => ({ ...item, status: 'ready' }));
  return {
    version: 1,
    status: 'blocked',
    createdAt: skill.localPublishRequest?.createdAt || now,
    updatedAt: now,
    attempts: (skill.localPublishRequest?.attempts || 0) + 1,
    form: { ...form, caseItems },
    payload: {
      skillUuid: localSkillId(skill),
      caseItems: caseItems
        .filter((item) => item.url)
        .map((item) => ({
          productionCaseUrl: item.url,
          ...(item.link?.trim() ? { canvasCaseUrl: item.link.trim() } : {}),
        })),
      showMarkdown: form.showMarkdown,
      tagIds: [Number(form.category)],
      ...(skill.templateUuid ? { templateUuid: skill.templateUuid } : {}),
    },
    linkValidation: caseItems.some((item) => item.link?.trim()) ? 'service-required' : 'not-needed',
  };
}

export function validateSkillCaseFile(file, resultType = 2) {
  const video =
    file.type.startsWith('video/') ||
    /\.(mp4|mov|m4v|webm|avi|mkv|flv|wmv|mpeg|mpg)$/i.test(file.name);
  const type = resultType === 4 && video ? 3 : resultType;
  if (type === 1 && !/\.md$/i.test(file.name))
    throw new Error('文本案例仅支持 Markdown (.md) 文件');
  const limit = { 1: 5, 2: 10, 3: 300, 4: 10 }[type] || 10;
  if (file.size > limit * 1024 * 1024) throw new Error(`单个文件大小不能超过 ${limit} MB`);
  return {
    type,
    mimeType:
      file.type || { 1: 'text/markdown', 2: 'image/png', 3: 'video/mp4', 4: 'audio/mpeg' }[type],
  };
}
