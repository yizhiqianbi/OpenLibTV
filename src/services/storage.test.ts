// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createStorageRepository, StorageError, type StorageLike } from './storage.ts';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('storage repository', () => {
  it('reads legacy keys and preserves the original raw JSON format', () => {
    const storage = memoryStorage();
    storage.setItem('libtv.canvas.a', '{"nodes":[]}');
    const repository = createStorageRepository({ getStorage: () => storage });
    expect(repository.readStoredValue('libtv.canvas.a', {})).toEqual({ nodes: [] });
    repository.writeStoredValue('libtv-projects', [{ id: 'a' }]);
    expect(JSON.parse(storage.getItem('libtv-projects')!)).toEqual([{ id: 'a' }]);
  });
  it('shares writes/removes synchronously within the same tab and unsubscribes', () => {
    const storage = memoryStorage();
    const repository = createStorageRepository({ getStorage: () => storage });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = repository.subscribeStoredValue('liked', first);
    repository.subscribeStoredValue('liked', second);
    repository.writeStoredValue('liked', ['a']);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    unsubscribe();
    repository.removeStoredValue('liked');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
    expect(repository.readStoredValue('liked', [])).toEqual([]);
  });
  it('isolates session scope and supports historical raw strings', () => {
    const local = memoryStorage();
    const session = memoryStorage();
    const repository = createStorageRepository({
      getStorage: (scope) => (scope === 'local' ? local : session),
    });
    repository.writeStoredString('promo', '1', { scope: 'session' });
    repository.writeStoredString('guide', 'Sat Oct 10 2026');
    expect(repository.readStoredString('promo', '', { scope: 'session' })).toBe('1');
    expect(repository.readStoredString('promo', 'missing')).toBe('missing');
    expect(local.getItem('guide')).toBe('Sat Oct 10 2026');
  });
  it('returns a structured read error for corrupted data and can throw in strict mode', () => {
    const storage = memoryStorage();
    storage.setItem('bad', 'broken JSON');
    const repository = createStorageRepository({ getStorage: () => storage });
    expect(repository.readStoredState('bad', [])).toMatchObject({
      value: [],
      error: { code: 'INVALID_DATA' },
    });
    expect(() => repository.readStoredValue('bad', [], { strict: true })).toThrow(StorageError);
  });
  it('records quota failure, retains last stored value, and clears error after retry', () => {
    const storage = memoryStorage();
    const repository = createStorageRepository({ getStorage: () => storage });
    repository.writeStoredValue('projects', [1]);
    const original = storage.setItem;
    storage.setItem = () => {
      throw new Error('quota exceeded');
    };
    expect(() => repository.writeStoredValue('projects', [2])).toThrow(StorageError);
    expect(repository.readStoredState('projects', [])).toMatchObject({
      value: [1],
      error: { code: 'WRITE_FAILED' },
    });
    storage.setItem = original;
    repository.writeStoredValue('projects', [2]);
    expect(repository.readStoredState('projects', [])).toEqual({
      value: [2],
      error: null,
      version: 0,
    });
  });
  it('supports explicit versions without breaking legacy JSON consumers', () => {
    const storage = memoryStorage();
    const repository = createStorageRepository({ getStorage: () => storage });
    repository.writeStoredValue('settings', { enabled: true }, { version: 2 });
    expect(JSON.parse(storage.getItem('settings')!)).toEqual({ enabled: true });
    expect(repository.readStoredState('settings', {}, { version: 2 }).version).toBe(2);
    expect(repository.readStoredState('settings', {}, { version: 1 }).error?.code).toBe(
      'VERSION_MISMATCH',
    );
    storage.setItem('old', '[1]');
    expect(
      repository.readStoredValue(
        'old',
        { items: [] },
        { version: 1, migrate: (value) => ({ items: value }) },
      ),
    ).toEqual({ items: [1] });
  });
  it('rolls back the payload if version metadata fails to commit', () => {
    const storage = memoryStorage();
    storage.setItem('settings', '{"old":true}');
    const original = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.startsWith('__libtv_storage_meta__:')) throw new Error('quota');
      original(key, value);
    };
    const repository = createStorageRepository({ getStorage: () => storage });
    expect(() => repository.writeStoredValue('settings', { new: true }, { version: 1 })).toThrow(
      StorageError,
    );
    expect(storage.getItem('settings')).toBe('{"old":true}');
  });
  it('subscribes to external changes lazily and removes the external listener', () => {
    const storage = memoryStorage();
    let changed!: (scope: 'local' | 'session', key: string | null) => void;
    const stop = vi.fn();
    const listen = vi.fn((listener) => {
      changed = listener;
      return stop;
    });
    const repository = createStorageRepository({ getStorage: () => storage, listen });
    expect(listen).not.toHaveBeenCalled();
    const subscriber = vi.fn();
    const unsubscribe = repository.subscribeStoredValue('projects', subscriber);
    repository.readStoredValue('projects', []);
    storage.setItem('projects', '[2]');
    changed('local', 'projects');
    expect(subscriber).toHaveBeenCalledOnce();
    expect(repository.readStoredValue('projects', [])).toEqual([2]);
    changed('session', null);
    expect(subscriber).toHaveBeenCalledOnce();
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('can be imported and read without a browser storage provider', () => {
    const repository = createStorageRepository({ getStorage: () => null });
    expect(repository.readStoredState('theme', 'dark')).toMatchObject({
      value: 'dark',
      error: { code: 'UNAVAILABLE' },
    });
    expect(() => repository.writeStoredValue('theme', 'light')).toThrow(StorageError);
  });
});
