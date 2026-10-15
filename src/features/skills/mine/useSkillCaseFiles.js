import { useEffect, useRef, useState } from 'react';
import { MAX_SKILL_CASES, validateSkillCaseFile } from './skill-mine-model.js';

export function useSkillCaseFiles(initial, resultType) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState('');
  const readers = useRef(new Map()),
    sources = useRef(new Map()),
    active = useRef(false),
    current = useRef(items);
  current.current = items;
  useEffect(() => {
    active.current = true;
    const pending = readers.current,
      source = sources.current;
    return () => {
      active.current = false;
      pending.forEach((reader) => reader.abort());
      pending.clear();
      source.clear();
    };
  }, []);
  const read = (id, file) => {
    readers.current.get(id)?.abort();
    readers.current.delete(id);
    let media;
    try {
      media = validateSkillCaseFile(file, resultType);
    } catch (error) {
      setItems((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: 'error', error: error.message } : item,
        ),
      );
      return;
    }
    let reader;
    try {
      reader = new FileReader();
    } catch {
      setItems((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: 'error', error: '案例读取失败，请重试' } : item,
        ),
      );
      return;
    }
    readers.current.set(id, reader);
    setItems((items) =>
      items.map((item) => (item.id === id ? { ...item, status: 'reading', error: '' } : item)),
    );
    const finish = (update) => {
      if (!active.current || readers.current.get(id) !== reader) return;
      readers.current.delete(id);
      setItems((items) => items.map((item) => (item.id === id ? { ...item, ...update } : item)));
    };
    reader.onload = () =>
      finish({
        ...media,
        url: String(reader.result),
        status: 'ready',
        error: '',
        fileName: file.name,
      });
    reader.onerror = () => finish({ status: 'error', error: '案例读取失败，请重试' });
    try {
      reader.readAsDataURL(file);
    } catch {
      finish({ status: 'error', error: '案例读取失败，请重试' });
    }
  };
  const addFiles = (list) => {
    const files = Array.from(list);
    const capacity = MAX_SKILL_CASES - current.current.length;
    setError(files.length > capacity ? '最多上传 4 个案例' : '');
    const added = files.slice(0, Math.max(0, capacity)).map((file) => {
      const id = crypto.randomUUID();
      sources.current.set(id, file);
      return { id, name: file.name, link: '', url: '', status: 'reading' };
    });
    const next = [...current.current, ...added];
    current.current = next;
    setItems(next);
    added.forEach((item) => read(item.id, sources.current.get(item.id)));
  };
  const remove = (id) => {
    const reader = readers.current.get(id);
    readers.current.delete(id);
    reader?.abort();
    sources.current.delete(id);
    setError('');
    setItems((items) => items.filter((item) => item.id !== id));
  };
  const replace = (id, file) => {
    if (!file) return;
    sources.current.set(id, file);
    read(id, file);
  };
  return {
    items,
    error,
    addFiles,
    remove,
    replace,
    retry: (id) => {
      const file = sources.current.get(id);
      if (file) read(id, file);
    },
    setLink: (id, link) =>
      setItems((items) => items.map((item) => (item.id === id ? { ...item, link } : item))),
    pending: items.some((item) => item.status === 'reading'),
  };
}
