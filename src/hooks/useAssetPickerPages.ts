import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssetPickerContext,
  AssetPickerFilters,
  AssetPickerSource,
  PickerRecord,
} from '../services/asset-picker/source.ts';
import { hydrateAssetPickerPage } from '../services/asset-picker/source.ts';
import {
  advanceAssetPage,
  assetPickerRequest,
  ASSET_SEARCH_DELAY,
  emptyAssetCursorState,
  mergeAssetRecords,
  readAssetPage,
  type AssetPickerType,
} from '../services/asset-picker/model.ts';

export type { AssetPickerSource } from '../services/asset-picker/source.ts';
interface PageRequest {
  cursor?: string;
  append: boolean;
}
interface PageState {
  records: PickerRecord[];
  total: number;
  hasMore: boolean;
  phase: 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error';
  error: Error | null;
}
const initialState: PageState = {
  records: [],
  total: 0,
  hasMore: false,
  phase: 'idle',
  error: null,
};

/** Each filter owns its pages and controller, even when an adapter ignores abort. */
export function useAssetPickerPages(
  source: AssetPickerSource | null,
  query: string,
  type: AssetPickerType,
  context?: AssetPickerContext,
) {
  const [state, setState] = useState<PageState>(() =>
    source ? { ...initialState, phase: 'loading' } : initialState,
  );
  const generation = useRef(0);
  const pending = useRef<{ controller: AbortController; generation: number } | null>(null);
  const feed = useRef(emptyAssetCursorState());
  const failed = useRef<PageRequest | null>(null);
  const previousQuery = useRef(query);
  const search = query.trim();
  const filterKey = JSON.stringify(assetPickerRequest(search, type, context));
  const filters = useMemo(() => JSON.parse(filterKey) as AssetPickerFilters, [filterKey]);
  const activeFilter = useRef({ source, filterKey });
  const enabled = useRef(false);

  const requestPage = useCallback(
    async (
      activeSource: AssetPickerSource,
      activeGeneration: number,
      activeFilters: AssetPickerFilters,
      request: PageRequest,
    ) => {
      if (pending.current || generation.current !== activeGeneration) return;
      const controller = new AbortController();
      const token = { controller, generation: activeGeneration };
      pending.current = token;
      failed.current = null;
      setState((previous) => ({
        ...previous,
        phase: request.append ? 'loadingMore' : 'loading',
        error: null,
      }));
      const isCurrent = () =>
        generation.current === activeGeneration &&
        pending.current === token &&
        !controller.signal.aborted;
      try {
        const response = await activeSource.list(
          {
            ...activeFilters,
            ...(request.cursor ? { cursor: request.cursor } : {}),
          },
          { signal: controller.signal },
        );
        if (!isCurrent()) return;
        const page = await hydrateAssetPickerPage(readAssetPage(response), activeSource, {
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        // Valid records survive protocol errors; retry uses the last successfully advanced cursor.
        setState((previous) => ({
          ...previous,
          records: mergeAssetRecords(previous.records, page.items),
        }));
        const next = advanceAssetPage(feed.current, page, request.cursor);
        feed.current = next;
        setState((previous) => ({
          records: mergeAssetRecords(previous.records, next.records),
          total: next.total,
          hasMore: next.hasMore,
          phase: 'ready',
          error: null,
        }));
      } catch (error) {
        if (!isCurrent()) return;
        failed.current = request;
        setState((previous) => ({
          ...previous,
          phase: 'error',
          error: error instanceof Error ? error : new Error('资产加载失败'),
        }));
      } finally {
        if (pending.current === token) pending.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const activeGeneration = ++generation.current;
    activeFilter.current = { source, filterKey };
    enabled.current = Boolean(source);
    pending.current?.controller.abort();
    pending.current = null;
    feed.current = emptyAssetCursorState();
    failed.current = null;
    setState(source ? { ...initialState, phase: 'loading' } : initialState);
    const delay = previousQuery.current.trim() !== search ? ASSET_SEARCH_DELAY : 0;
    previousQuery.current = search;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (source) {
      const start = () => {
        void requestPage(source, activeGeneration, filters, { append: false });
      };
      if (delay) timer = setTimeout(start, delay);
      else start();
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      enabled.current = false;
      generation.current = activeGeneration + 1;
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [source, search, filterKey, filters, requestPage]);

  const loadMore = useCallback(() => {
    const filter = activeFilter.current;
    if (!enabled.current) return;
    if (filter.source !== source || filter.filterKey !== filterKey) return;
    if (!source || pending.current || failed.current || !feed.current.hasMore) return;
    const cursor = feed.current.nextCursor;
    if (cursor) void requestPage(source, generation.current, filters, { cursor, append: true });
  }, [source, filterKey, filters, requestPage]);

  const retry = useCallback(() => {
    const filter = activeFilter.current;
    if (!enabled.current) return;
    if (filter.source !== source || filter.filterKey !== filterKey) return;
    if (!source || !failed.current || pending.current) return;
    void requestPage(source, generation.current, filters, failed.current);
  }, [source, filterKey, filters, requestPage]);

  return {
    ...state,
    loading: state.phase === 'loading',
    loadingMore: state.phase === 'loadingMore',
    loadMore,
    retry,
  };
}
