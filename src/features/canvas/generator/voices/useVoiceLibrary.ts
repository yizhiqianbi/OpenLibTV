import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emptyVoiceFilters,
  validateVoicePage,
  voiceRequest,
  type VoiceFilters,
  type VoicePage,
  type VoiceTab,
} from './model.ts';
import type { VoiceSource } from './source.ts';

interface TabConfiguration {
  filters: VoiceFilters;
  draft: string;
  query: string;
  page: number;
  pageSize: number;
}
const tabConfiguration = (): TabConfiguration => ({
  filters: emptyVoiceFilters(),
  draft: '',
  query: '',
  page: 1,
  pageSize: 20,
});
const initial = () => ({
  library: tabConfiguration(),
  my: tabConfiguration(),
  favorite: tabConfiguration(),
});
export function useVoiceLibrary(source: VoiceSource) {
  const [tab, setTab] = useState<VoiceTab>('library');
  const [configuration, setConfiguration] = useState(initial);
  const [pages, setPages] = useState<Record<VoiceTab, VoicePage>>({
    library: { list: [], total: 0 },
    my: { list: [], total: 0 },
    favorite: { list: [], total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [favoriteError, setFavoriteError] = useState<Error | null>(null);
  const [favoritePending, setFavoritePending] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [composing, setComposing] = useState(false);
  const generation = useRef(0);
  const mutation = useRef<AbortController | null>(null);
  const active = configuration[tab];
  const data = pages[tab];
  const update = useCallback(
    (change: Partial<TabConfiguration>) =>
      setConfiguration((old) => ({ ...old, [tab]: { ...old[tab], ...change } })),
    [tab],
  );
  useEffect(() => {
    setConfiguration(initial());
    setPages({
      library: { list: [], total: 0 },
      my: { list: [], total: 0 },
      favorite: { list: [], total: 0 },
    });
    setFavoriteError(null);
    setFavoritePending(null);
    return () => {
      mutation.current?.abort();
      mutation.current = null;
    };
  }, [source]);
  useEffect(() => {
    if (composing || active.draft === active.query) return;
    const timer = setTimeout(() => update({ query: active.draft, page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [active.draft, active.query, composing, tab, update]);
  const requestKey = JSON.stringify(
    voiceRequest(tab, active.filters, active.query, active.page, active.pageSize),
  );
  useEffect(() => {
    const controller = new AbortController();
    const token = ++generation.current;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => source.list(JSON.parse(requestKey), { signal: controller.signal }))
      .then(validateVoicePage)
      .then((page) => {
        if (controller.signal.aborted || token !== generation.current) return;
        setPages((old) => ({ ...old, [tab]: page }));
        setLoading(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted || token !== generation.current) return;
        setLoading(false);
        setError(cause instanceof Error ? cause : new Error('音色列表读取失败'));
      });
    return () => controller.abort();
  }, [source, requestKey, revision, tab]);
  const toggleFavorite = useCallback(
    async (voiceId: string, next: boolean) => {
      if (!source.setFavorite || mutation.current) return;
      const controller = new AbortController();
      mutation.current = controller;
      setFavoriteError(null);
      setFavoritePending(voiceId);
      try {
        await source.setFavorite(voiceId, next, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPages(
          (old) =>
            Object.fromEntries(
              Object.entries(old).map(([key, page]) => [
                key,
                {
                  ...page,
                  list: page.list.map((v) =>
                    v.voiceId === voiceId ? { ...v, isFavorited: next } : v,
                  ),
                },
              ]),
            ) as Record<VoiceTab, VoicePage>,
        );
        setRevision((n) => n + 1);
      } catch (cause) {
        if (!controller.signal.aborted)
          setFavoriteError(cause instanceof Error ? cause : new Error('音色收藏失败，请重试'));
      } finally {
        if (mutation.current === controller) mutation.current = null;
        if (!controller.signal.aborted) setFavoritePending(null);
      }
    },
    [source],
  );
  return {
    ...data,
    loading,
    error,
    favoriteError,
    favoritePending,
    tab,
    filters: active.filters,
    query: active.draft,
    page: active.page,
    pageSize: active.pageSize,
    changeTab: (next: VoiceTab) => {
      setComposing(false);
      setTab(next);
    },
    changeQuery: (draft: string) => update({ draft }),
    setComposing,
    applyFilters: (filters: VoiceFilters) => update({ filters, page: 1 }),
    changePage: (page: number) => update({ page }),
    changePageSize: (pageSize: number) => update({ pageSize, page: 1 }),
    reload: () => setRevision((n) => n + 1),
    toggleFavorite,
  };
}
