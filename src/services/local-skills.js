// Read-only catalogue boundary shared by Skills and Canvas. Keep the existing stored array.
export const LOCAL_SKILLS_KEY = 'libtv-created-skills';

export function localSkillId(skill) {
  return skill?.skillUuid || skill?.id || '';
}

export function validateLocalSkills(value) {
  if (value === null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => !item || !localSkillId(item) || typeof (item.name ?? item.title) !== 'string',
    )
  )
    throw new Error('本地 Skill 数据格式错误，原数据未被覆盖');
  return value;
}
