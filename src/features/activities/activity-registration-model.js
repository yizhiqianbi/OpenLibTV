/**
 * Pure activity registration rules. The UI keeps the draft fields in their
 * human-readable form, while an injected source receives the payload shape
 * used by the public activity registration endpoint.
 */

export function normalizeRegistrationWork(value = '') {
  const links = String(value)
    .split(/[\n,，]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return links.length ? links.join(',') : undefined;
}

export function buildActivityRegistrationPayload({
  item,
  user,
  contact,
  method = 'phone',
  social,
  work,
}) {
  const nickname = user?.nickname || user?.nickName || user?.name || '';
  const contactValue = String(contact || '').trim();
  const socialValue = String(social || '').trim();
  const workUrl = normalizeRegistrationWork(work);
  const description = [
    `社媒主页链接：${socialValue}`,
    workUrl ? `添加AI创作的视频作品：${workUrl}` : '',
    '信息真实性：已确认',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    activityId: Number(item?.activityId),
    ...(item?.tagId != null ? { tagId: item.tagId } : {}),
    name: nickname,
    contactInfo: `${method === 'wechat' ? 'wechat' : 'phone'}:${contactValue}`,
    personalHomepageUrl: socialValue,
    ...(workUrl ? { workUrl } : {}),
    description,
  };
}

export function localActivityRegistrationSource() {
  return {
    async submit(payload) {
      return { success: true, payload };
    },
  };
}
