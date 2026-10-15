import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  decodeStoredState,
  emptyStorageSnapshot,
  storageRepository,
  StorageError,
  type StorageOptions,
} from '../services/storage.ts';

export type StoredSetter<T> = (value: T | ((previous: T) => T)) => boolean;

export function useStoredState<T>(key: string, initial: T, options: StorageOptions<T> = {}) {
  const configuration = useRef(options);
  configuration.current = options;
  const initialValue = useRef(initial);
  initialValue.current = initial;
  const scope = options.scope ?? 'local';
  const { version, migrate, strict, onError } = options;
  const subscribe = useCallback(
    (listener: () => void) => storageRepository.subscribeStoredValue(key, listener, { scope }),
    [key, scope],
  );
  const readSnapshot = useCallback(
    () => storageRepository.getSnapshot(key, { scope }),
    [key, scope],
  );
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => emptyStorageSnapshot);
  const state = useMemo(
    () =>
      decodeStoredState(snapshot, key, initialValue.current, {
        scope,
        version,
        migrate,
        strict,
        onError,
      }),
    [snapshot, key, version, migrate, strict, onError, scope],
  );
  const setValue = useCallback<StoredSetter<T>>(
    (value) => {
      try {
        const previous = storageRepository.readStoredValue(
          key,
          initialValue.current,
          configuration.current,
        );
        const next = typeof value === 'function' ? (value as (previous: T) => T)(previous) : value;
        storageRepository.writeStoredValue(key, next, configuration.current);
        return true;
      } catch (error) {
        if (!(error instanceof StorageError)) throw error;
        // The repository publishes the failure; useStoredState exposes it without crashing an event handler.
        return false;
      }
    },
    [key],
  );
  const remove = useCallback(() => {
    try {
      storageRepository.removeStoredValue(key, { scope });
      return true;
    } catch {
      return false;
    }
  }, [key, scope]);
  return { ...state, setValue, remove };
}

/** Existing tuple callers gain subscriptions while retaining their key and stored JSON shape. */
export function useLocalState<T>(key: string, initial: T): [T, StoredSetter<T>] {
  const { value, setValue } = useStoredState(key, initial);
  return [value, setValue];
}
