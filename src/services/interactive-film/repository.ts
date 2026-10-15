import { readStoredState, removeStoredValue, writeStoredValue } from '../storage.ts';
import { assertFilmDocumentShape } from './document.ts';
import type { FilmDocument } from './types.ts';

export const FILM_DOCUMENT_PREFIX = 'libtv.film.';
const listeners = new Set<() => void>();
const clone = (document: FilmDocument): FilmDocument => JSON.parse(JSON.stringify(document));
const key = (id: string) => {
  if (!id.trim()) throw new Error('缺少影游项目 ID');
  return FILM_DOCUMENT_PREFIX + id;
};
const notify = () => {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      // One broken view must not turn an already-durable write into a failed save.
      console.error('影游项目订阅更新失败', error);
    }
  }
};

export function loadFilmDocument(id: string): FilmDocument | null {
  const state = readStoredState<unknown>(key(id), null);
  if (state.error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(state.error.code)) {
    const detail = ['INVALID_DATA', 'VERSION_MISMATCH'].includes(state.error.code)
      ? '影游数据损坏或版本不兼容'
      : '本机存储暂时无法读取';
    throw new Error(`${detail}（项目 ${id}），原数据已保留`, { cause: state.error });
  }
  if (state.value === null) return null;
  assertFilmDocumentShape(state.value);
  if (state.value.id !== id) throw new Error('影游项目 ID 不匹配，原数据已保留');
  return clone(state.value);
}

function commitFilmDocument(document: FilmDocument, allowRestore = false): FilmDocument {
  assertFilmDocumentShape(document);
  const previous = loadFilmDocument(document.id);
  if (previous?.deletedAt !== undefined && document.deletedAt === undefined && !allowRestore)
    throw new Error('影游已移入回收站，请先恢复，当前草稿已保留');
  const next = { ...clone(document), savedAt: Date.now() };
  writeStoredValue(key(document.id), next);
  notify();
  return clone(next);
}

/** UI owns revisions. Invalid stored source is never replaced by a fresh draft. */
export function saveFilmDocument(document: FilmDocument): FilmDocument {
  return commitFilmDocument(document);
}

/** Includes soft-deleted documents; callers choose the active or trash view. */
export function listFilmDocuments(): FilmDocument[] {
  if (typeof window === 'undefined') throw new Error('当前环境无法读取本机影游项目');
  const storage = window.localStorage;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const candidate = storage.key(index);
    if (candidate?.startsWith(FILM_DOCUMENT_PREFIX)) keys.push(candidate);
  }
  const documents = keys.flatMap((item) => {
    const document = loadFilmDocument(item.slice(FILM_DOCUMENT_PREFIX.length));
    return document ? [document] : [];
  });
  return documents.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
}

const requireFilmDocument = (id: string) => {
  const document = loadFilmDocument(id);
  if (!document) throw new Error('影游项目不存在');
  return document;
};
export function copyFilmDocument(id: string): FilmDocument {
  const source = requireFilmDocument(id);
  const { deletedAt: _deletedAt, ...document } = source;
  return saveFilmDocument({
    ...document,
    id: `film-${crypto.randomUUID()}`,
    title: document.title + ' 副本',
    revision: 0,
  });
}

export function deleteFilmDocument(id: string, { permanent = false } = {}): void {
  const document = requireFilmDocument(id);
  if (permanent) {
    removeStoredValue(key(id));
    notify();
  } else if (document.deletedAt === undefined)
    commitFilmDocument({ ...document, deletedAt: Date.now(), revision: document.revision + 1 });
}
export function renameFilmDocument(id: string, title: string): FilmDocument {
  if (!title.trim()) throw new Error('影游标题不能为空');
  const document = requireFilmDocument(id);
  return commitFilmDocument({ ...document, title: title.trim(), revision: document.revision + 1 });
}
export function restoreFilmDocument(id: string): FilmDocument {
  const source = requireFilmDocument(id);
  if (source.deletedAt === undefined) return source;
  const { deletedAt: _deletedAt, ...document } = source;
  return commitFilmDocument({ ...document, revision: document.revision + 1 }, true);
}

function externalChange(event: StorageEvent) {
  if (
    event.storageArea === window.localStorage &&
    (event.key === null || event.key.startsWith(FILM_DOCUMENT_PREFIX))
  )
    notify();
}
export function subscribeFilmDocuments(listener: () => void): () => void {
  if (!listeners.size && typeof window !== 'undefined')
    window.addEventListener('storage', externalChange);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== 'undefined')
      window.removeEventListener('storage', externalChange);
  };
}
