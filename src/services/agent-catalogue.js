// Shared source-backed Agent choices; no feature imports or UI dependencies.
export function mergeSkillCatalogue(...lists) {
  const seen = new Set();
  return lists.flat().filter((skill) => {
    const key = skill.templateUuid || skill.skillUuid || skill.skillKey;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isSkillUsable(skill) {
  // Captured SkillAuditStatus: Offline=-1, Pending=0, Approved=1, Rejected=2.
  return skill.auditStatus !== 0 && skill.auditStatus !== 2;
}

// These three common entries are absent from the representative directory snapshot.
const commonFallback = [
  {
    templateUuid: '00357d85c34c445eac9f0c8735017807',
    skillKey: 'pixar-animated-ad-creator-5de625e86d1143e6a4fd948ca25ec34b',
    name: '皮克斯动画广告',
    description: '从角色立绘、分镜草图到最终合成带广告歌的完整成片',
    resultType: 3,
    coverUrl:
      'https://libtv-res.liblib.art/upload-images/5de625e86d1143e6a4fd948ca25ec34b/16c4f89b3083f4fff4bfb4e35dae218df05a4077.png',
  },
  {
    templateUuid: '4a2899016c374656ab016803f6a20087',
    skillKey: 'gameplay-pv-builder-020b92eb952140af9a99e594358a115b',
    name: '游戏实机PV',
    description: '自制多类游戏PV，UI 像素锚定不形变，打造3A级游戏效果',
    resultType: 3,
    coverUrl:
      'https://libtv-res.liblib.art/upload-images/020b92eb952140af9a99e594358a115b/397f6891109295ce11c7f17037b241640e5c7812.png',
  },
  {
    templateUuid: '0e61a57cebde4bc7ac962cf743c1ef00',
    skillKey: 'eastwood-western-style-71a5fc5f6ae546d58b0b8d75abc87608',
    name: '伊斯特伍德西部片',
    description: '极静对峙瞬间爆发的枪战大片',
    resultType: 3,
    coverUrl:
      'https://libtv-res.liblib.art/upload-images/71a5fc5f6ae546d58b0b8d75abc87608/327035f8cfd86f99a15d86a45891cfd577f30353.png',
  },
];

export function agentSkillCatalogue(catalogue = [], recommended) {
  return mergeSkillCatalogue(
    catalogue,
    recommended?.items || recommended?.list || [],
    commonFallback,
  );
}

export function searchAgentSkills(catalogue, recommended, query = '') {
  const search = query.trim().toLowerCase();
  return agentSkillCatalogue(catalogue, recommended).filter(
    (skill) =>
      isSkillUsable(skill) &&
      [skill.name, skill.skillKey, skill.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search),
  );
}
