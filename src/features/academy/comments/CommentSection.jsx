import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, MoreHorizontal, X } from 'lucide-react';
import Modal from '../../../components/Modal.jsx';
import { CommentAvatar, CommentComposer } from './CommentComposer.jsx';
import { CommentThread } from './CommentItem.jsx';
import { commentText, commentViewer } from './comment-model.js';
import { useComments } from './useComments.js';
import '../styles/comments.css';

export default function CommentSection({
  source,
  user,
  login,
  toast,
  asset,
  authorUuid = source.authorUuid,
  defaultSort = 'hottest',
  maxCommentLength = 500,
  pageSize = 8,
  showSortSwitch = false,
  showDislike = false,
  compactOnMobile = false,
  unavailablePublicComments = false,
}) {
  const viewer = useMemo(() => commentViewer(user), [user]);
  const operations = useComments({ source, viewer, defaultSort, pageSize });
  const [replyingId, setReplyingId] = useState(''),
    [replyDirty, setReplyDirty] = useState(false),
    [sheet, setSheet] = useState(false),
    [mobile, setMobile] = useState(false);
  const ensureLogin = useCallback(() => {
    if (viewer) return true;
    login?.({ entrySource: 'comment' });
    return false;
  }, [viewer, login]);
  useEffect(() => {
    if (!compactOnMobile || !window.matchMedia) return;
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [compactOnMobile]);
  useEffect(() => {
    setReplyingId('');
    setSheet(false);
  }, [source.key, operations.sort]);
  useEffect(() => {
    setReplyDirty(false);
  }, [replyingId]);
  useEffect(() => {
    if (!replyingId || replyDirty) return;
    const outside = (event) => {
      if (!event.target.closest?.('[data-comment-reply],[data-comment-reply-toggle]'))
        setReplyingId('');
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [replyingId, replyDirty]);
  const ready = !operations.loading && !operations.closed;
  const composer = (
    <CommentComposer
      key={source.key}
      viewer={viewer}
      asset={asset}
      ensureLogin={ensureLogin}
      maxLength={maxCommentLength}
      disabled={!ready}
      onSubmit={async (content) => {
        const result = await operations.publish({ content, rootId: '' });
        if (result) toast?.('评论已本地保存，未提交服务器');
        return result;
      }}
    />
  );
  const section = (bottom = false) => (
    <section
      className={'academy-comment-section' + (bottom ? ' academy-comment-section-bottom' : '')}
      aria-label="评论区"
    >
      {!bottom && (
        <header className="academy-comment-section-heading">
          <h2>评论{operations.count > 0 && <span> ({operations.count})</span>}</h2>
          {showSortSwitch && source.capabilities.sort && (
            <nav aria-label="评论排序">
              {[
                ['hottest', '最热'],
                ['latest', '最新'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={operations.sort === value}
                  onClick={() => operations.setSort(value)}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </header>
      )}
      {source.localOnly && (
        <p className="academy-comment-local-note">
          评论、回复及相关操作仅保存在本机，未提交服务器。
          {unavailablePublicComments && '原公开评论正文未收录，下面仅显示本地评论。'}
        </p>
      )}
      {operations.closed ? (
        <p role="status" className="academy-comment-empty">
          评论区已关闭
        </p>
      ) : (
        !bottom && composer
      )}
      <div
        className="academy-comment-list"
        aria-busy={operations.loading || operations.loadingMore}
      >
        {operations.loading && !operations.comments.length ? (
          <div role="status" className="academy-comment-skeleton" aria-label="评论加载中">
            {[0, 1, 2].map((number) => (
              <div key={number}>
                <i />
                <span>
                  <i />
                  <i />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={operations.loading ? 'academy-comment-list-loading' : ''}>
            {operations.comments.map((root) => (
              <CommentThread
                key={root.id}
                root={root}
                {...{
                  source,
                  viewer,
                  authorUuid,
                  showDislike,
                  replyingId,
                  setReplyingId,
                  ensureLogin,
                  operations,
                  asset,
                  toast,
                }}
                setReplyDirty={setReplyDirty}
                topCommentId={operations.comments.find((item) => item.isTop)?.id}
                maxLength={maxCommentLength}
              />
            ))}
          </div>
        )}
        {operations.error && (
          <button className="academy-comment-load" onClick={() => void operations.retry()}>
            评论加载失败，点击重试
          </button>
        )}
        {!operations.loading && !operations.error && !operations.comments.length && (
          <div className="academy-comment-empty">
            <Inbox size={32} />
            <span>
              {unavailablePublicComments ? '暂无本地评论，来说两句吧~' : '还没有评论，来说两句吧~'}
            </span>
          </div>
        )}
        {operations.hasMore && !operations.loading && !operations.error && (
          <button
            className="academy-comment-load"
            disabled={operations.loadingMore}
            onClick={() => void operations.loadMore()}
          >
            {operations.loadingMore ? '加载中…' : '查看更多评论'}
          </button>
        )}
        {!operations.hasMore &&
          !operations.loading &&
          !operations.error &&
          operations.comments.length > 0 && <p className="academy-comment-end">没有更多评论了</p>}
      </div>
      {bottom && !operations.closed && composer}
    </section>
  );
  if (!compactOnMobile || !mobile) return section();
  return (
    <>
      <button className="academy-comment-compact" onClick={() => setSheet(true)}>
        <strong>评论{operations.count > 0 && <span> ({operations.count})</span>}</strong>
        <MoreHorizontal size={16} />
        {operations.comments[0] && (
          <span className="academy-comment-compact-preview">
            <CommentAvatar
              viewer={{
                avatar: operations.comments[0].avatar,
                nickName: operations.comments[0].nickName,
              }}
              size={20}
              asset={asset}
            />
            <span>{commentText(operations.comments[0].content)}</span>
          </span>
        )}
      </button>
      {sheet && (
        <Modal
          title="评论"
          className="academy-comment-sheet"
          closeButton={false}
          onClose={() => setSheet(false)}
        >
          <header>
            <h2>评论{operations.count > 0 ? ` (${operations.count})` : ''}</h2>
            <button aria-label="关闭评论" onClick={() => setSheet(false)}>
              <X size={16} />
            </button>
          </header>
          {section(true)}
        </Modal>
      )}
    </>
  );
}
