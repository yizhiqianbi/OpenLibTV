import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeComments, updateCommentTree } from './comment-model.js';

export function useComments({ source, viewer, defaultSort = 'hottest', pageSize = 8 }) {
  const [sort, setSort] = useState(defaultSort);
  const [state, setState] = useState({
    comments: [],
    count: 0,
    page: 0,
    total: 0,
    loading: true,
    loadingMore: false,
    error: null,
  });
  const [closed, setClosed] = useState(false);
  const sequence = useRef(0),
    alive = useRef(true),
    replyPages = useRef(new Map());
  const viewerId = viewer?.uuid;
  const loadPage = useCallback(
    async (page, append = false) => {
      const request = ++sequence.current;
      if (!append) replyPages.current.clear();
      setState((previous) => ({ ...previous, loading: !append, loadingMore: append, error: null }));
      try {
        const result = await source.fetchPage({ page, pageSize, sort, viewer });
        if (!alive.current || request !== sequence.current) return false;
        setState((previous) => ({
          comments: append ? mergeComments(previous.comments, result.list) : result.list,
          count: result.commentCount,
          page: result.page,
          total: result.total,
          loading: false,
          loadingMore: false,
          error: null,
        }));
        return true;
      } catch (error) {
        if (alive.current && request === sequence.current)
          setState((previous) => ({
            ...previous,
            loading: false,
            loadingMore: false,
            error: { cause: error, append },
          }));
        return false;
      }
    },
    [source, sort, pageSize, viewer],
  );
  useEffect(() => {
    alive.current = true;
    setClosed(false);
    setState({
      comments: [],
      count: 0,
      page: 0,
      total: 0,
      loading: true,
      loadingMore: false,
      error: null,
    });
    void loadPage(1);
    return () => {
      alive.current = false;
      sequence.current += 1;
    };
  }, [loadPage, viewerId]);
  const reload = useCallback(() => loadPage(1), [loadPage]);
  const retry = () =>
    loadPage(state.error?.append ? state.page + 1 : 1, Boolean(state.error?.append));
  const publish = async (payload) => {
    const epoch = sequence.current;
    try {
      const item = await source.publish(payload, viewer);
      // The write succeeded even if a newer list request superseded this view.
      if (!alive.current || epoch !== sequence.current) return true;
      setState((previous) => ({
        ...previous,
        count: previous.count + 1,
        total: previous.total + (payload.replyToId ? 0 : 1),
        comments: payload.replyToId
          ? previous.comments.map((root) =>
              root.id === payload.rootId
                ? {
                    ...root,
                    replyCount: root.replyCount + 1,
                    replies: mergeComments(root.replies, [item]),
                  }
                : root,
            )
          : [item, ...previous.comments],
      }));
      return true;
    } catch (error) {
      if (error.code === 'closed' && alive.current && epoch === sequence.current) setClosed(true);
      throw error;
    }
  };
  const react = async (comment, type) => {
    const epoch = sequence.current;
    const update = await source[type === 'like' ? 'setLike' : 'setDislike'](
      comment.id,
      !comment[type === 'like' ? 'liked' : 'disliked'],
      viewer,
    );
    if (alive.current && epoch === sequence.current)
      setState((previous) => ({
        ...previous,
        comments: updateCommentTree(previous.comments, comment.id, (item) => ({
          ...item,
          ...update,
          replies: item.replies,
        })),
      }));
  };
  const remove = async (comment) => {
    const epoch = sequence.current;
    await source.remove(comment.id, viewer);
    if (alive.current && epoch === sequence.current) await reload();
  };
  const report = (comment, payload) => source.report(comment.id, payload, viewer);
  const toggleTop = async (comment) => {
    const epoch = sequence.current;
    await source.setTop(comment.id, !comment.isTop, viewer);
    if (alive.current && epoch === sequence.current) await reload();
  };
  const loadReplies = async (root) => {
    const epoch = sequence.current;
    const previousPage = replyPages.current.get(root.id) || 0;
    const result = await source.fetchReplies(root.id, {
      page: previousPage + 1,
      pageSize: 20,
      viewer,
    });
    if (!alive.current || epoch !== sequence.current) return false;
    replyPages.current.set(root.id, result.page);
    setState((previous) => ({
      ...previous,
      comments: previous.comments.map((item) =>
        item.id === root.id
          ? {
              ...item,
              replyCount: result.total,
              replies: mergeComments(item.replies, result.list),
            }
          : item,
      ),
    }));
    return true;
  };
  return {
    ...state,
    closed,
    sort,
    setSort,
    reload,
    retry,
    publish,
    remove,
    report,
    toggleTop,
    loadReplies,
    toggleLike: (comment) => react(comment, 'like'),
    toggleDislike: (comment) => react(comment, 'dislike'),
    hasMore: state.page * pageSize < state.total,
    loadMore: () => loadPage(state.page + 1, true),
    // Local writes already count in this repository's total; do not request them again forever.
    hasMoreReplies: (root) => root.replies.length < root.replyCount,
  };
}
