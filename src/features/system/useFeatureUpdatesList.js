import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  appendUniqueFeatureUpdates,
  normalizeFeatureUpdatesPage,
} from './feature-updates-model.js';

function initialState(source, initialPage, pageSize) {
  const initial = initialPage ? normalizeFeatureUpdatesPage(initialPage, 1, pageSize) : null;
  return {
    source,
    initialPage,
    pageSize,
    items: initial?.items ?? [],
    hasMore: initial?.hasMore ?? true,
    isLoaded: !!initialPage,
    isLoading: false,
    error: false,
  };
}

/** A cancellable, deduplicating page loader for the version timeline. */
export function useFeatureUpdatesList({ source, pageSize = 20 }) {
  const initialPage = useMemo(() => source?.initialPage?.(pageSize) ?? null, [pageSize, source]);
  const [state, setState] = useState(() => initialState(source, initialPage, pageSize));
  const pageRef = useRef(initialPage ? 2 : 1);
  const requestRef = useRef(null);
  const hasMoreRef = useRef(state.hasMore);

  const loadMore = useCallback(async () => {
    if (!source || requestRef.current || !hasMoreRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const page = pageRef.current;
    setState((current) => ({ ...current, isLoading: true, error: false }));
    try {
      const payload = await source.list({ page, pageSize, signal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const next = normalizeFeatureUpdatesPage(payload, page, pageSize);
      pageRef.current = page + 1;
      hasMoreRef.current = next.hasMore;
      setState((current) => ({
        ...current,
        items: appendUniqueFeatureUpdates(current.items, next.items),
        hasMore: next.hasMore,
        isLoaded: true,
        isLoading: false,
        error: false,
      }));
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setState((current) => ({ ...current, isLoaded: true, isLoading: false, error: true }));
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [pageSize, source]);

  useEffect(() => {
    const next = initialState(source, initialPage, pageSize);
    pageRef.current = initialPage ? 2 : 1;
    hasMoreRef.current = next.hasMore;
    setState(next);
    if (!initialPage) void loadMore();
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [initialPage, loadMore, pageSize, source]);

  const visible =
    state.source === source && state.initialPage === initialPage && state.pageSize === pageSize
      ? state
      : initialState(source, initialPage, pageSize);
  return { ...visible, loadMore };
}
