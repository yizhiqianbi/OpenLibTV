import { readStoredState, writeStoredValue } from '../../../services/storage.ts';
import {
  COMMENT_CAPABILITIES,
  CommentUserFacingError,
  commentPermissions,
  validateReport,
} from './comment-model.js';

export function commentStorageKey(key) {
  return `libtv.academy-comments.${key}`;
}

/** Local interaction repository. It never requests or mutates original comments. */
export function createLocalCommentSource({
  key,
  authorUuid = '',
  baseCommentCount = 0,
  capabilities = COMMENT_CAPABILITIES,
  maxLength = 500,
  closed = false,
}) {
  const storageKey = commentStorageKey(key);
  function read() {
    const { value, error } = readStoredState(storageKey, { version: 1, comments: [], reports: [] });
    // A failed write preserves the previous valid value. Permit the next write to retry.
    if (error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(error.code))
      throw new CommentUserFacingError('本地评论读取失败，请检查浏览器存储后重试', 'storage', {
        cause: error,
      });
    if (
      value?.version !== 1 ||
      !Array.isArray(value.comments) ||
      !Array.isArray(value.reports) ||
      value.comments.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.content !== 'string' ||
          typeof item.userUuid !== 'string' ||
          !Array.isArray(item.reactions),
      )
    )
      throw new CommentUserFacingError('本地评论数据无法读取，请恢复存储后重试', 'storage');
    return value;
  }
  function write(value) {
    try {
      writeStoredValue(storageKey, value);
    } catch (cause) {
      throw new CommentUserFacingError('本地保存失败，请检查浏览器存储空间后重试', 'storage', {
        cause,
      });
    }
  }
  function requireViewer(viewer) {
    if (!viewer?.uuid) throw new CommentUserFacingError('登录后才能操作评论', 'login');
  }
  function requireComment(value, id) {
    const item = value.comments.find((comment) => comment.id === id);
    if (!item) throw new CommentUserFacingError('评论不存在', 'missing');
    return item;
  }
  function project(item, viewer) {
    const reaction = item.reactions.find((entry) => entry.userUuid === viewer?.uuid);
    return {
      ...item,
      liked: reaction?.type === 'like',
      disliked: reaction?.type === 'dislike',
      isMine: Boolean(viewer?.uuid && item.userUuid === viewer.uuid),
      isAuthor: Boolean(authorUuid && item.userUuid === authorUuid),
      localOnly: false,
      replies: [],
    };
  }
  async function react(id, enabled, type, viewer) {
    requireViewer(viewer);
    if (!capabilities[type]) throw new CommentUserFacingError('该操作暂不可用', 'permission');
    const value = read(),
      item = requireComment(value, id);
    const old = item.reactions.find((entry) => entry.userUuid === viewer.uuid)?.type;
    const reactions = item.reactions.filter((entry) => entry.userUuid !== viewer.uuid);
    if (enabled) reactions.push({ userUuid: viewer.uuid, type });
    const next = {
      ...item,
      reactions,
      likeCount: Math.max(
        0,
        item.likeCount + (enabled && type === 'like' ? 1 : 0) - (old === 'like' ? 1 : 0),
      ),
    };
    write({
      ...value,
      comments: value.comments.map((comment) => (comment.id === id ? next : comment)),
    });
    return project(next, viewer);
  }
  return {
    key,
    storageKey,
    authorUuid,
    capabilities,
    localOnly: true,
    async fetchPage({ page = 1, pageSize = 8, sort = 'hottest', viewer }) {
      const value = read();
      const roots = value.comments
        .filter((item) => !item.rootId)
        .sort(
          (a, b) =>
            Number(Boolean(b.isTop)) - Number(Boolean(a.isTop)) ||
            (capabilities.sort && sort === 'hottest' ? b.likeCount - a.likeCount : 0) ||
            new Date(b.createTime).valueOf() - new Date(a.createTime).valueOf() ||
            b.id.localeCompare(a.id),
        );
      return {
        list: roots.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
          ...project(item, viewer),
          replyCount: value.comments.filter((reply) => reply.rootId === item.id).length,
        })),
        page,
        pageSize,
        total: roots.length,
        commentCount: Math.max(0, baseCommentCount) + value.comments.length,
      };
    },
    async fetchReplies(rootId, { page = 1, pageSize = 20, viewer }) {
      const value = read();
      requireComment(value, rootId);
      const replies = value.comments
        .filter((item) => item.rootId === rootId)
        .sort(
          (a, b) =>
            new Date(a.createTime).valueOf() - new Date(b.createTime).valueOf() ||
            a.id.localeCompare(b.id),
        );
      return {
        list: replies
          .slice((page - 1) * pageSize, page * pageSize)
          .map((item) => project(item, viewer)),
        page,
        pageSize,
        total: replies.length,
      };
    },
    async publish({ content, rootId = '', replyToId = '' }, viewer) {
      requireViewer(viewer);
      if (closed) throw new CommentUserFacingError('评论区已关闭', 'closed');
      const text = content.trim();
      if (!text || text.length > maxLength)
        throw new CommentUserFacingError(`请输入 1 至 ${maxLength} 字的评论`, 'input');
      const value = read();
      let parent;
      if (replyToId) {
        parent = requireComment(value, replyToId);
        if (rootId !== (parent.rootId || parent.id))
          throw new CommentUserFacingError('回复对象已变化，请重试', 'missing');
      } else if (rootId) throw new CommentUserFacingError('回复对象不存在', 'missing');
      const item = {
        id: crypto.randomUUID(),
        rootId,
        replyToId,
        ...(parent ? { replyToUserName: parent.nickName } : {}),
        userUuid: viewer.uuid,
        nickName: viewer.nickName,
        avatar: viewer.avatar,
        content: text,
        createTime: new Date().toISOString(),
        likeCount: 0,
        reactions: [],
        isTop: false,
      };
      write({ ...value, comments: [...value.comments, item] });
      return { ...project(item, viewer), localOnly: true, replyCount: 0 };
    },
    async remove(id, viewer) {
      requireViewer(viewer);
      const value = read(),
        item = requireComment(value, id);
      if (!commentPermissions(item, viewer, authorUuid, capabilities).remove)
        throw new CommentUserFacingError('只能删除自己的评论', 'permission');
      const removed = new Set(
        value.comments
          .filter((comment) => comment.id === id || comment.rootId === id)
          .map((comment) => comment.id),
      );
      // Keep replies to a deleted reply readable under their existing root.
      write({
        ...value,
        comments: value.comments
          .filter((comment) => !removed.has(comment.id))
          .map((comment) =>
            removed.has(comment.replyToId)
              ? { ...comment, replyToId: comment.rootId, replyToUserName: '' }
              : comment,
          ),
        reports: value.reports.filter((report) => !removed.has(report.commentId)),
      });
    },
    async report(id, input, viewer) {
      requireViewer(viewer);
      const value = read(),
        item = requireComment(value, id);
      if (!commentPermissions(item, viewer, authorUuid, capabilities).report)
        throw new CommentUserFacingError('不能举报自己的评论', 'permission');
      const payload = validateReport(input);
      if (
        value.reports.some((report) => report.commentId === id && report.userUuid === viewer.uuid)
      )
        throw new CommentUserFacingError('你已举报过该评论', 'duplicate');
      write({
        ...value,
        reports: [
          ...value.reports,
          {
            ...payload,
            commentId: id,
            userUuid: viewer.uuid,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    },
    setLike: (id, enabled, viewer) => react(id, enabled, 'like', viewer),
    setDislike: (id, enabled, viewer) => react(id, enabled, 'dislike', viewer),
    async setTop(id, enabled, viewer) {
      requireViewer(viewer);
      const value = read(),
        item = requireComment(value, id);
      const topId = value.comments.find((comment) => comment.isTop)?.id;
      if (!commentPermissions(item, viewer, authorUuid, capabilities, topId).top)
        throw new CommentUserFacingError('当前没有置顶权限，或已有其他置顶评论', 'permission');
      write({
        ...value,
        comments: value.comments.map((comment) =>
          comment.id === id ? { ...comment, isTop: enabled } : comment,
        ),
      });
    },
  };
}
