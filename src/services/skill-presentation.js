export function skillCaseType(url = '') {
  const path = url.split('?')[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(path)) return 'video';
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(path)) return 'audio';
  if (/\.(pdf|doc|docx|ppt|pptx|txt|md)$/.test(path)) return 'document';
  return 'image';
}

export function skillPublicContent(skill) {
  let snapshot = {};
  try {
    const parsed = JSON.parse(skill.snapshotData || '{}');
    snapshot = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    /* Legacy public records may omit a valid snapshot. */
  }
  return {
    markdown: skill.markdownContent?.trim()
      ? skill.markdownContent
      : snapshot.markdownContent || skill.markdown || '',
    files:
      Array.isArray(skill.skillFiles) && skill.skillFiles.length
        ? skill.skillFiles
        : Array.isArray(snapshot.skillFiles)
          ? snapshot.skillFiles
          : [],
    primaryPath: skill.primarySkillFilePath || snapshot.primarySkillFilePath || 'SKILL.md',
    visible: skill.showMarkdown !== false,
  };
}

export function normalizeSkillCases(skill) {
  const items = skill.caseItems?.filter((item) => item.productionCaseUrl);
  return items?.length
    ? items
    : (skill.productionCaseUrls || []).map((productionCaseUrl, index) => ({
        productionCaseUrl,
        canvasCaseUrl: index === 0 ? skill.canvasCaseUrl : undefined,
        canvasCasePower: skill.canvasCasePowers?.[index],
      }));
}

// The original shared Skill case link carries its public template UUID only
// for agent/session shares; project shares with a spaceId remain unchanged.
export function skillCaseLink(value, templateUuid) {
  if (!templateUuid?.trim()) return value;
  try {
    const relative = value.startsWith('/') && !value.startsWith('//'),
      url = new URL(value, 'https://www.liblib.tv');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      ![
        'liblib.tv',
        'www.liblib.tv',
        'kol.liblib.tv',
        'newtake.ai',
        'www.newtake.ai',
        'localhost',
        '127.0.0.1',
      ].includes(url.hostname) ||
      (relative && url.origin !== 'https://www.liblib.tv') ||
      !/^\/(?:zh\/|en\/|ko\/)?canvas\/(?:chat-share|share)\/?$/.test(url.pathname) ||
      url.searchParams.has('spaceId') ||
      !(url.searchParams.get('shareId') || url.searchParams.get('templateUuid'))
    )
      return value;
    url.searchParams.set('sourceSkillTemplateUuid', templateUuid);
    return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch {
    return value;
  }
}

import { isSkillUsable, mergeSkillCatalogue } from './agent-catalogue.js';
export { isSkillUsable, mergeSkillCatalogue };
export const SKILL_CATEGORIES = [
  '推荐',
  '专业影视',
  '商业广告',
  '短剧漫剧',
  '动漫游戏',
  '音乐MV',
  '自媒体创作',
  '通用技能',
  '发现',
];

export function filterSkills({
  catalogue = [],
  recommended,
  drafts = [],
  tab = 'Skill',
  category = '推荐',
  query = '',
  favorites = [],
}) {
  // The original hides public search/categories on Mine and Favorites, so their state must not
  // leak into either private list. A saved item may only exist in the recommendation snapshot.
  if (tab === '我的') return drafts;
  const recommendations = recommended?.items || recommended?.list || catalogue;
  const all = mergeSkillCatalogue(catalogue, recommendations);
  if (tab === '收藏') return all.filter((skill) => isSkillFavorite(skill, favorites));
  const search = query.trim().toLowerCase();
  const source = category === '推荐' && !search ? recommendations : all;
  return source.filter(
    (skill) =>
      (!search ||
        [skill.name, skill.description, skill.skillKey]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search)) &&
      (category === '推荐' || skill.tags?.some((tag) => (tag.tagLabel || tag.name) === category)),
  );
}

export function isSkillFavorite(skill, favorites) {
  return [skill.skillUuid, skill.templateUuid].some((uuid) => uuid && favorites.includes(uuid));
}

export function toggleSkillFavorite(skill, favorites) {
  const ids = [skill.skillUuid, skill.templateUuid].filter(Boolean);
  return isSkillFavorite(skill, favorites)
    ? favorites.filter((uuid) => !ids.includes(uuid))
    : [...favorites, skill.templateUuid || skill.skillUuid];
}

export function skillTypeLabel(resultType) {
  return { 1: '文本', 2: '图片', 3: '视频', 4: '音频' }[resultType] || '图片';
}

export function resolveSkillDetail(skill, details = {}) {
  const detail = details[skill.templateUuid]?.skill;
  return detail ? { ...skill, ...detail } : skill;
}

export function skillMarkdown(skill) {
  const content = skillPublicContent(skill);
  return content.visible ? content.markdown : '';
}

import { agentSkillCatalogue as pickerCatalogue } from './agent-catalogue.js';
export { pickerCatalogue };

// Ordered public skillPanelCommon configuration 262, read 2026-10-11.
export const COMMON_SKILL_TEMPLATE_IDS = [
  '00357d85c34c445eac9f0c8735017807',
  '8a9e8bac7b0146f3a770749838f94495',
  'caa124f3972044b8925b9308e96411c0',
  '473f446619d643acac34272fa434b2ad',
  '4a2899016c374656ab016803f6a20087',
  '9662f7b185a84ff7a86790b1cb640b6d',
  '50c4d60990ed4b39b5e5c40adfc942b8',
  '74b462f926b149f2ac1693995191e4c2',
  '9df8a2399c7244358c419c0b833f1abd',
  '0e61a57cebde4bc7ac962cf743c1ef00',
  'dd04bed176c74d198c13a81db200403a',
  '7ecc6d146dc5465e90deb2cdb6586128',
  'fed2a4a8c9114769bf3cb9c242cd1ab7',
  'b6b90be9122b4ce98530e0adb707ec07',
  'd474c84673f544adafd7d3060087b098',
];

export function filterPickerSkills({
  catalogue = [],
  recommended,
  drafts = [],
  favorites = [],
  tab = '通用',
  query = '',
  commonIds = COMMON_SKILL_TEMPLATE_IDS,
}) {
  const all = pickerCatalogue(catalogue, recommended);
  const search = query.trim().toLowerCase();
  if (search)
    return all.filter((skill) =>
      [skill.name, skill.description, skill.skillKey]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  if (tab === '我的') return drafts.filter(isSkillUsable);
  if (tab === '收藏') return all.filter((skill) => isSkillFavorite(skill, favorites));
  return commonIds
    .map((id) => all.find((skill) => skill.templateUuid === id || skill.skillUuid === id))
    .filter(Boolean);
}

export function displaySkillKey(skill) {
  return (
    '/' +
    (skill.skillKey || skill.skillUuid || skill.templateUuid || '')
      .replace(/^\/+/, '')
      .replace(/-[a-f\d]{32}.*$/, '')
  );
}
