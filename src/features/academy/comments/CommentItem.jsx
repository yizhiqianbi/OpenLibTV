import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  MessageCircle,
  MoreHorizontal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Flag,
} from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import { CommentAvatar, CommentComposer } from './CommentComposer.jsx';
import { DeleteCommentDialog, ReportCommentDialog } from './CommentDialogs.jsx';
import { commentPermissions, commentText, commentTime } from './comment-model.js';

function CommentMenu({ items, onClose }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose, initialFocus: 'first' });
  useEffect(() => {
    const outside = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);
  return (
    <div
      className="academy-comment-menu"
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label="评论操作"
      onKeyDown={(event) => {
        const fields = Array.from(ref.current.querySelectorAll('[role=menuitem]'));
        const index = fields.indexOf(document.activeElement);
        const next =
          event.key === 'ArrowDown'
            ? (index + 1) % fields.length
            : event.key === 'ArrowUp'
              ? (index - 1 + fields.length) % fields.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? fields.length - 1
                  : -1;
        if (next !== -1) {
          event.preventDefault();
          fields[next]?.focus();
        }
      }}
    >
      {items.map(({ label, icon: Icon, action }) => (
        <button
          role="menuitem"
          type="button"
          key={label}
          onClick={() => {
            onClose();
            action();
          }}
        >
          {Icon && <Icon size={15} />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function CommentItem({
  comment,
  depth = 0,
  viewer,
  source,
  authorUuid,
  topCommentId,
  showDislike,
  replyingId,
  setReplyingId,
  setReplyDirty,
  ensureLogin,
  operations,
  maxLength,
  asset,
  toast,
  children,
}) {
  const [menu, setMenu] = useState(false),
    [dialog, setDialog] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  const permissions = commentPermissions(
    comment,
    viewer,
    authorUuid,
    source.capabilities,
    topCommentId,
  );
  const replying = replyingId === comment.id;
  const perform = async (operation, success) => {
    if (locked.current || !ensureLogin()) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
      if (success) toast?.(success);
    } catch (failure) {
      setError(failure.message || '操作失败，请重试');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const choices = [
    ...(permissions.top
      ? [
          {
            label: comment.isTop ? '取消置顶' : '置顶',
            action: () =>
              void perform(
                () => operations.toggleTop(comment),
                comment.isTop ? '已在本机取消置顶' : '评论已在本机置顶',
              ),
          },
        ]
      : []),
    ...(permissions.remove
      ? [{ label: '删除', icon: Trash2, action: () => setDialog('delete') }]
      : []),
    ...(permissions.report
      ? [
          {
            label: '举报',
            icon: Flag,
            action: () => {
              if (ensureLogin()) setDialog('report');
            },
          },
        ]
      : []),
  ];
  return (
    <article
      className={'academy-comment-item ' + (depth ? 'academy-comment-reply-item' : '')}
      aria-label={`${comment.nickName}的${depth ? '回复' : '评论'}`}
    >
      <CommentAvatar
        viewer={{ avatar: comment.avatar, nickName: comment.nickName }}
        size={depth ? 24 : 32}
        asset={asset}
      />
      <div className="academy-comment-item-body">
        <header>
          <strong>{comment.nickName}</strong>
          {comment.isAuthor && <span className="academy-comment-author-tag">作者</span>}
          {comment.isTop && <span className="academy-comment-top-tag">置顶</span>}
          <time dateTime={comment.createTime}>{commentTime(comment.createTime)}</time>
          {choices.length > 0 && (
            <div className="academy-comment-menu-anchor">
              <button
                aria-label="更多操作"
                aria-haspopup="menu"
                aria-expanded={menu}
                disabled={busy}
                onClick={() => setMenu((value) => !value)}
              >
                <MoreHorizontal size={16} />
              </button>
              {menu && <CommentMenu items={choices} onClose={() => setMenu(false)} />}
            </div>
          )}
        </header>
        <p className="academy-comment-content">
          {depth === 1 && comment.replyToUserName && (
            <span className="academy-comment-reply-to">
              回复 <span>@{comment.replyToUserName} </span>
            </span>
          )}
          {commentText(comment.content)}
          {comment.violation && (
            <span role="img" title={comment.violation} aria-label={comment.violation}>
              {' '}
              ⚠
            </span>
          )}
        </p>
        <div className="academy-comment-actions">
          {source.capabilities.like && (
            <button
              aria-label="点赞"
              aria-pressed={comment.liked}
              disabled={busy}
              onClick={() => void perform(() => operations.toggleLike(comment))}
            >
              <ThumbsUp size={14} fill={comment.liked ? 'currentColor' : 'none'} />
              {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
            </button>
          )}
          {showDislike && source.capabilities.dislike && (
            <button
              aria-label="点踩"
              aria-pressed={comment.disliked}
              disabled={busy}
              onClick={() => void perform(() => operations.toggleDislike(comment))}
            >
              <ThumbsDown size={14} fill={comment.disliked ? 'currentColor' : 'none'} />
            </button>
          )}
          <button
            aria-label="回复"
            aria-expanded={replying}
            data-comment-reply-toggle=""
            disabled={busy || operations.closed}
            onClick={() => {
              if (ensureLogin()) setReplyingId(replying ? '' : comment.id);
            }}
          >
            <MessageCircle size={14} />
          </button>
        </div>
        {error && (
          <p role="alert" className="academy-comment-error">
            {error}
          </p>
        )}
        {replying && (
          <CommentComposer
            key={comment.id}
            reply
            viewer={viewer}
            asset={asset}
            ensureLogin={ensureLogin}
            maxLength={maxLength}
            placeholder={`回复 @${comment.nickName}`}
            onCancel={() => setReplyingId('')}
            onDirtyChange={setReplyDirty}
            disabled={operations.closed}
            onSubmit={async (content) => {
              const result = await operations.publish({
                content,
                rootId: comment.rootId || comment.id,
                replyToId: comment.id,
              });
              if (result) {
                setReplyingId('');
                toast?.('回复已本地保存，未提交服务器');
              }
              return result;
            }}
          />
        )}
        {children}
      </div>
      {dialog === 'delete' && (
        <DeleteCommentDialog
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await operations.remove(comment);
            toast?.('评论已在本机删除');
          }}
        />
      )}
      {dialog === 'report' && (
        <ReportCommentDialog
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => {
            await operations.report(comment, payload);
            toast?.('举报信息已本地保存，未提交审核');
          }}
        />
      )}
    </article>
  );
}

export function CommentThread({ root, ...props }) {
  const [expanded, setExpanded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false);
  const lazy = Boolean(props.source.fetchReplies);
  let previewCount = 3;
  while (root.replies[previewCount]?.localOnly) previewCount += 1;
  const visible = expanded
    ? root.replies
    : lazy
      ? root.replies.filter((reply) => reply.localOnly)
      : root.replies.slice(0, previewCount);
  const load = async () => {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setError('');
    try {
      if (await props.operations.loadReplies(root)) setExpanded(true);
    } catch (failure) {
      setError(failure.message || '回复加载失败，请重试');
    } finally {
      locked.current = false;
      setLoading(false);
    }
  };
  return (
    <CommentItem {...props} comment={root}>
      {(visible.length > 0 || root.replyCount > 0) && (
        <div className="academy-comment-thread">
          {visible.map((reply) => (
            <CommentItem {...props} comment={reply} depth={1} topCommentId={null} key={reply.id} />
          ))}
          {error && (
            <button
              className="academy-comment-thread-toggle academy-comment-error"
              onClick={() => void load()}
            >
              回复加载失败，点击重试
            </button>
          )}
          {!expanded && root.replyCount > 0 && (lazy || root.replies.length > previewCount) && (
            <button
              className="academy-comment-thread-toggle"
              disabled={loading}
              onClick={() => {
                if (!lazy || root.replies.some((reply) => !reply.localOnly)) setExpanded(true);
                else void load();
              }}
            >
              {loading ? '加载中…' : `共 ${root.replyCount} 条回复，点击查看`}
              <ChevronDown size={13} />
            </button>
          )}
          {expanded && (
            <div className="academy-comment-thread-controls">
              {lazy && props.operations.hasMoreReplies(root) && (
                <button
                  className="academy-comment-thread-toggle"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  {loading ? '加载中…' : '展开更多回复'}
                  <ChevronDown size={13} />
                </button>
              )}
              <button className="academy-comment-thread-toggle" onClick={() => setExpanded(false)}>
                收起回复
                <ChevronDown size={13} className="academy-comment-chevron-up" />
              </button>
            </div>
          )}
        </div>
      )}
    </CommentItem>
  );
}
