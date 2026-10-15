export const COMMENT_CAPABILITIES = Object.freeze({
  sort: true,
  like: true,
  dislike: true,
  remove: true,
  top: true,
});

export const MASTERCLASS_COMMENT_CAPABILITIES = Object.freeze({
  sort: false,
  like: true,
  dislike: true,
  remove: true,
  top: false,
});

export const REPORT_REASONS = [
  ['illegal', '违法违规'],
  ['vulgar', '色情低俗'],
  ['ad', '广告引流'],
  ['abuse', '人身攻击'],
  ['other', '其他'],
];

export class CommentUserFacingError extends Error {
  constructor(message, code = 'operation', options = {}) {
    super(message, options);
    this.name = 'CommentUserFacingError';
    this.code = code;
    this.commentMissing = code === 'missing';
  }
}

export function commentViewer(user) {
  if (!user) return null;
  // Local demo sessions historically store a phone instead of an operator UUID.
  const uuid = String(user.uuid || user.id || user.userUuid || user.phone || 'local-demo');
  return {
    uuid,
    nickName: user.nickname || user.nickName || user.name || '本地用户',
    avatar: user.avatarUrl || user.avatar || '',
  };
}

export function commentText(content = '') {
  if (!/^<p>[\s\S]*<\/p>$/.test(content.trim())) return content;
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };
  return content
    .replace(/<\/p>\s*<p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (entity) => entities[entity.toLowerCase()] ?? entity)
    .trim();
}

export function commentTime(value, now = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return value;
  const age = Math.max(0, now - date.valueOf());
  if (age < 60_000) return '刚刚';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}分钟前`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}小时前`;
  if (age < 604_800_000) return `${Math.floor(age / 86_400_000)}天前`;
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function commentPermissions(comment, viewer, authorUuid, capabilities, topCommentId) {
  const mine = Boolean(viewer?.uuid && viewer.uuid === comment.userUuid);
  return {
    mine,
    remove: Boolean(capabilities.remove && mine),
    report: !mine,
    top: Boolean(
      capabilities.top &&
      authorUuid &&
      viewer?.uuid === authorUuid &&
      !comment.rootId &&
      (!topCommentId || topCommentId === comment.id),
    ),
  };
}

export function validateReport({ reason, detail = '', phone = '' }) {
  if (!REPORT_REASONS.some(([value]) => value === reason))
    throw new CommentUserFacingError('请选择投诉原因', 'input');
  if (detail.length > 100) throw new CommentUserFacingError('举报具体信息最多 100 字', 'input');
  if (phone.trim() && !/^1[3-9]\d{9}$/.test(phone.trim()))
    throw new CommentUserFacingError('请输入正确的手机号', 'phone');
  return {
    reason,
    ...(reason === 'other' && detail.trim() ? { detail: detail.trim() } : {}),
    ...(phone.trim() ? { phone: phone.trim() } : {}),
  };
}

export function updateCommentTree(comments, id, update) {
  return comments.map((root) =>
    root.id === id
      ? update(root)
      : {
          ...root,
          replies: root.replies.map((reply) => (reply.id === id ? update(reply) : reply)),
        },
  );
}

export function mergeComments(previous, incoming) {
  const ids = new Set(previous.map((item) => item.id));
  const fresh = new Map(incoming.map((item) => [item.id, item]));
  return [
    ...previous.map((item) =>
      fresh.has(item.id)
        ? {
            ...item,
            ...fresh.get(item.id),
            replies: item.replies?.length ? item.replies : fresh.get(item.id).replies,
          }
        : item,
    ),
    ...incoming.filter((item) => !ids.has(item.id)),
  ];
}
