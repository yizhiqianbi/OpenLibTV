import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { contentRepository, loadContent } from '../services/content.ts';
import type { ResourceSnapshot } from '../services/resource-cache.ts';

export interface ContentState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<T>;
}
const serverSnapshot: ResourceSnapshot<unknown> = {
  data: undefined,
  error: null,
  loading: false,
  status: 'idle',
  updatedAt: null,
};

export function useContent<T>(name: string, fallback: T): ContentState<T> {
  const subscribe = useCallback(
    (listener: () => void) => contentRepository.subscribe(name, listener),
    [name],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => contentRepository.getSnapshot(name),
    () => serverSnapshot,
  );
  useEffect(() => {
    void loadContent(name).catch(() => undefined);
  }, [name]);
  useEffect(() => {
    if (snapshot.status === 'idle') void loadContent(name).catch(() => undefined);
  }, [name, snapshot.status]);
  const reload = useCallback(() => loadContent<T>(name, { force: true }), [name]);
  return {
    data: snapshot.data === undefined ? fallback : (snapshot.data as T),
    loading: snapshot.status === 'idle' || snapshot.loading,
    error: snapshot.error,
    reload,
  };
}

/** Value-only compatibility wrapper. New screens should use useContent for loading/error/retry UI. */
export function useData<T = null>(name: string, fallback: T = null as T): T {
  return useContent(name, fallback).data;
}
