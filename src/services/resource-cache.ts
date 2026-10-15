export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';
export interface ResourceSnapshot<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  status: ResourceStatus;
  updatedAt: number | null;
}
export interface ResourceLoadOptions {
  force?: boolean;
}
export interface ResourceCache<T> {
  load(key: string, options?: ResourceLoadOptions): Promise<T>;
  getSnapshot(key: string): ResourceSnapshot<T>;
  subscribe(key: string, listener: () => void): () => void;
  invalidate(key?: string): void;
  clear(): void;
}

interface Entry<T> {
  snapshot: ResourceSnapshot<T>;
  promise?: Promise<T>;
  controller?: AbortController;
  generation: number;
  listeners: Set<() => void>;
}
const idle = <T>(): ResourceSnapshot<T> => ({
  data: undefined,
  error: null,
  loading: false,
  status: 'idle',
  updatedAt: null,
});

/** In-flight reads are shared; errors are observable and never treated as successful cached data. */
export function createResourceCache<T>(
  loader: (key: string, signal?: AbortSignal) => Promise<T>,
  { ttlMs = 5 * 60_000, now = Date.now }: { ttlMs?: number; now?: () => number } = {},
): ResourceCache<T> {
  const entries = new Map<string, Entry<T>>();
  const get = (key: string) => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { snapshot: idle<T>(), generation: 0, listeners: new Set() };
      entries.set(key, entry);
    }
    return entry;
  };
  const publish = (entry: Entry<T>, snapshot: ResourceSnapshot<T>) => {
    entry.snapshot = snapshot;
    entry.listeners.forEach((listener) => listener());
  };
  const invalidateOne = (entry: Entry<T>) => {
    entry.generation += 1;
    entry.controller?.abort();
    entry.controller = undefined;
    entry.promise = undefined;
    publish(entry, idle<T>());
  };
  return {
    getSnapshot: (key) => get(key).snapshot,
    subscribe(key, listener) {
      const entry = get(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    load(key, options = {}) {
      const entry = get(key);
      if (entry.promise) return entry.promise;
      const previous = entry.snapshot;
      if (
        !options.force &&
        previous.status === 'success' &&
        previous.updatedAt !== null &&
        now() - previous.updatedAt < ttlMs
      ) {
        return Promise.resolve(previous.data as T);
      }
      const generation = ++entry.generation;
      const controller = typeof AbortController === 'undefined' ? undefined : new AbortController();
      entry.controller = controller;
      const pending = Promise.resolve()
        .then(() => loader(key, controller?.signal))
        .then(
          (data) => {
            if (entry.generation === generation) {
              entry.promise = undefined;
              entry.controller = undefined;
              publish(entry, {
                data,
                error: null,
                loading: false,
                status: 'success',
                updatedAt: now(),
              });
            }
            return data;
          },
          (reason) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            if (entry.generation === generation) {
              entry.promise = undefined;
              entry.controller = undefined;
              publish(entry, { ...previous, error, loading: false, status: 'error' });
            }
            throw error;
          },
        );
      entry.promise = pending;
      publish(entry, { ...previous, error: null, loading: true, status: 'loading' });
      return pending;
    },
    invalidate(key) {
      if (key !== undefined) invalidateOne(get(key));
      else entries.forEach(invalidateOne);
    },
    clear() {
      entries.forEach(invalidateOne);
      for (const [key, entry] of entries) if (!entry.listeners.size) entries.delete(key);
    },
  };
}
