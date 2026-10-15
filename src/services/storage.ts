export type StorageScope = 'local' | 'session';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class StorageError extends Error {
  readonly key: string;
  readonly scope: StorageScope;
  readonly code:
    | 'UNAVAILABLE'
    | 'READ_FAILED'
    | 'WRITE_FAILED'
    | 'REMOVE_FAILED'
    | 'INVALID_DATA'
    | 'VERSION_MISMATCH';
  readonly cause?: unknown;
  constructor(
    message: string,
    {
      key,
      scope,
      code,
      cause,
    }: { key: string; scope: StorageScope; code: StorageError['code']; cause?: unknown },
  ) {
    super(message);
    this.name = 'StorageError';
    this.key = key;
    this.scope = scope;
    this.code = code;
    this.cause = cause;
  }
}
export interface StorageOptions<T = unknown> {
  scope?: StorageScope;
  version?: number;
  migrate?: (value: unknown, storedVersion: number) => T;
  strict?: boolean;
  onError?: (error: StorageError) => void;
}
export interface StoredState<T> {
  value: T;
  error: StorageError | null;
  version: number;
}
export interface StorageSnapshot {
  raw: string | null;
  metadata: string | null;
  error: StorageError | null;
}
const META_PREFIX = '__libtv_storage_meta__:';
export const emptyStorageSnapshot: StorageSnapshot = { raw: null, metadata: null, error: null };

function failure(error: unknown, key: string, scope: StorageScope, code: StorageError['code']) {
  return error instanceof StorageError
    ? error
    : new StorageError('浏览器存储操作失败', { key, scope, code, cause: error });
}

/** Decode raw legacy JSON. Versions live in a sidecar so old code can still JSON.parse the same key. */
export function decodeStoredState<T>(
  snapshot: StorageSnapshot,
  key: string,
  fallback: T,
  options: StorageOptions<T> = {},
): StoredState<T> {
  const scope = options.scope ?? 'local';
  let error = snapshot.error;
  let value = fallback;
  let version = 0;
  if (snapshot.raw !== null) {
    try {
      value = JSON.parse(snapshot.raw) as T;
      version = snapshot.metadata ? Number(JSON.parse(snapshot.metadata).version) : 0;
      if (!Number.isInteger(version) || version < 0) throw new Error('Invalid storage version');
      if (options.version !== undefined && version !== options.version) {
        if (version > options.version || !options.migrate) {
          throw new StorageError('存储数据版本不兼容', { key, scope, code: 'VERSION_MISMATCH' });
        }
        value = options.migrate(value, version);
        version = options.version;
      }
    } catch (cause) {
      value = fallback;
      error = failure(cause, key, scope, 'INVALID_DATA');
    }
  }
  if (error) {
    options.onError?.(error);
    if (options.strict) throw error;
  }
  return { value, error, version };
}

interface RepositoryOptions {
  getStorage: (scope: StorageScope) => StorageLike | null;
  listen?: (listener: (scope: StorageScope, key: string | null) => void) => () => void;
}

/** A synchronous storage boundary with explicit failures and same-tab/cross-tab notifications. */
export function createStorageRepository({ getStorage, listen }: RepositoryOptions) {
  const snapshots = new Map<string, StorageSnapshot>();
  const listeners = new Map<string, Set<() => void>>();
  let stopListening: (() => void) | undefined;
  const id = (key: string, scope: StorageScope) => scope + ':' + key;
  const obtain = (key: string, scope: StorageScope) => {
    const storage = getStorage(scope);
    if (!storage)
      throw new StorageError('当前环境无法使用浏览器存储', { key, scope, code: 'UNAVAILABLE' });
    return storage;
  };
  const getSnapshot = (key: string, options: Pick<StorageOptions, 'scope'> = {}) => {
    const scope = options.scope ?? 'local';
    const cacheKey = id(key, scope);
    let next: StorageSnapshot;
    try {
      const storage = obtain(key, scope);
      next = {
        raw: storage.getItem(key),
        metadata: storage.getItem(META_PREFIX + key),
        error: null,
      };
    } catch (cause) {
      const previous = snapshots.get(cacheKey);
      next = {
        raw: previous?.raw ?? null,
        metadata: previous?.metadata ?? null,
        error: failure(cause, key, scope, 'READ_FAILED'),
      };
    }
    const previous = snapshots.get(cacheKey);
    if (
      previous?.error &&
      !next.error &&
      previous.raw === next.raw &&
      previous.metadata === next.metadata &&
      ['WRITE_FAILED', 'REMOVE_FAILED', 'INVALID_DATA'].includes(previous.error.code)
    ) {
      next.error = previous.error;
    }
    if (
      previous &&
      previous.raw === next.raw &&
      previous.metadata === next.metadata &&
      previous.error?.code === next.error?.code &&
      Boolean(previous.error) === Boolean(next.error)
    )
      return previous;
    snapshots.set(cacheKey, next);
    return next;
  };
  const notify = (key: string, scope: StorageScope) =>
    listeners.get(id(key, scope))?.forEach((listener) => listener());
  const recordFailure = (key: string, scope: StorageScope, error: StorageError) => {
    const current = snapshots.get(id(key, scope)) ?? emptyStorageSnapshot;
    snapshots.set(id(key, scope), { ...current, error });
    notify(key, scope);
  };
  const commit = (
    key: string,
    raw: string | null,
    options: Pick<StorageOptions, 'scope' | 'version'> = {},
  ) => {
    const scope = options.scope ?? 'local';
    const operation = raw === null ? 'REMOVE_FAILED' : 'WRITE_FAILED';
    try {
      const storage = obtain(key, scope);
      const previousRaw = storage.getItem(key);
      const previousMetadata = storage.getItem(META_PREFIX + key);
      if (
        options.version !== undefined &&
        (!Number.isInteger(options.version) || options.version < 0)
      )
        throw new Error('Invalid storage version');
      try {
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
        if (raw !== null && options.version !== undefined && options.version > 0)
          storage.setItem(META_PREFIX + key, JSON.stringify({ version: options.version }));
        else if (previousMetadata !== null && (raw === null || options.version === 0))
          storage.removeItem(META_PREFIX + key);
      } catch (cause) {
        // A quota failure while writing metadata must not leave a partially committed version.
        try {
          if (previousRaw === null) storage.removeItem(key);
          else storage.setItem(key, previousRaw);
          if (previousMetadata === null) storage.removeItem(META_PREFIX + key);
          else storage.setItem(META_PREFIX + key, previousMetadata);
        } catch {
          /* The original failure remains available to the caller. */
        }
        throw cause;
      }
      snapshots.delete(id(key, scope));
      getSnapshot(key, { scope });
      notify(key, scope);
    } catch (cause) {
      const error = failure(cause, key, scope, operation);
      recordFailure(key, scope, error);
      throw error;
    }
  };
  return {
    getSnapshot,
    readStoredState<T>(key: string, fallback: T, options: StorageOptions<T> = {}) {
      return decodeStoredState(getSnapshot(key, options), key, fallback, options);
    },
    readStoredValue<T>(key: string, fallback: T, options: StorageOptions<T> = {}) {
      return decodeStoredState(getSnapshot(key, options), key, fallback, options).value;
    },
    writeStoredValue<T>(key: string, value: T, options: StorageOptions<T> = {}) {
      let serialized: string;
      try {
        const result = JSON.stringify(value);
        if (result === undefined) throw new Error('Value is not JSON serializable');
        serialized = result;
      } catch (cause) {
        const error = failure(cause, key, options.scope ?? 'local', 'INVALID_DATA');
        recordFailure(key, options.scope ?? 'local', error);
        throw error;
      }
      commit(key, serialized, options);
      return value;
    },
    removeStoredValue(key: string, options: Pick<StorageOptions, 'scope'> = {}) {
      commit(key, null, options);
    },
    readStoredString(
      key: string,
      fallback = '',
      options: Pick<StorageOptions, 'scope' | 'strict' | 'onError'> = {},
    ) {
      const snapshot = getSnapshot(key, options);
      if (snapshot.error) {
        options.onError?.(snapshot.error);
        if (options.strict) throw snapshot.error;
        return fallback;
      }
      return snapshot.raw ?? fallback;
    },
    writeStoredString(key: string, value: string, options: Pick<StorageOptions, 'scope'> = {}) {
      commit(key, value, options);
      return value;
    },
    subscribeStoredValue(
      key: string,
      listener: () => void,
      options: Pick<StorageOptions, 'scope'> = {},
    ) {
      const scope = options.scope ?? 'local';
      const cacheKey = id(key, scope);
      let group = listeners.get(cacheKey);
      if (!group) {
        group = new Set();
        listeners.set(cacheKey, group);
      }
      group.add(listener);
      if (!stopListening && listen)
        stopListening = listen((changedScope, changedKey) => {
          if (changedKey !== null) {
            const actual = changedKey.startsWith(META_PREFIX)
              ? changedKey.slice(META_PREFIX.length)
              : changedKey;
            snapshots.delete(id(actual, changedScope));
            notify(actual, changedScope);
          } else {
            for (const record of listeners.keys())
              if (record.startsWith(changedScope + ':')) {
                snapshots.delete(record);
                notify(record.slice(changedScope.length + 1), changedScope);
              }
          }
        });
      return () => {
        group.delete(listener);
        if (!group.size) listeners.delete(cacheKey);
        if (!listeners.size) {
          stopListening?.();
          stopListening = undefined;
        }
      };
    },
  };
}

export const storageRepository = createStorageRepository({
  getStorage: (scope) => {
    if (typeof window === 'undefined') return null;
    return scope === 'session' ? window.sessionStorage : window.localStorage;
  },
  listen: (listener) => {
    if (typeof window === 'undefined') return () => {};
    const changed = (event: StorageEvent) => {
      try {
        if (event.storageArea === window.localStorage) listener('local', event.key);
        else if (event.storageArea === window.sessionStorage) listener('session', event.key);
      } catch {
        /* A storage-denied context is reported by synchronous reads/writes. */
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  },
});

export const readStoredState = <T>(key: string, fallback: T, options?: StorageOptions<T>) =>
  storageRepository.readStoredState(key, fallback, options);
export const readStoredValue = <T>(key: string, fallback: T, options?: StorageOptions<T>) =>
  storageRepository.readStoredValue(key, fallback, options);
export const writeStoredValue = <T>(key: string, value: T, options?: StorageOptions<T>) =>
  storageRepository.writeStoredValue(key, value, options);
export const removeStoredValue = (key: string, options?: Pick<StorageOptions, 'scope'>) =>
  storageRepository.removeStoredValue(key, options);
export const readStoredString = (
  key: string,
  fallback = '',
  options?: Pick<StorageOptions, 'scope' | 'strict' | 'onError'>,
) => storageRepository.readStoredString(key, fallback, options);
export const writeStoredString = (
  key: string,
  value: string,
  options?: Pick<StorageOptions, 'scope'>,
) => storageRepository.writeStoredString(key, value, options);
export const subscribeStoredValue = (
  key: string,
  listener: () => void,
  options?: Pick<StorageOptions, 'scope'>,
) => storageRepository.subscribeStoredValue(key, listener, options);
