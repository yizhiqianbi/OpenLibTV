import { useCallback, useEffect, useRef, useState } from 'react';
import { validateAssetUpload } from '../../../services/asset-library/model.ts';

export function useAssetUploads() {
  const [files, setFiles] = useState([]);
  const readers = useRef(new Map());
  const sourceFiles = useRef(new Map());
  const active = useRef(true);
  useEffect(() => {
    const pending = readers.current;
    const sources = sourceFiles.current;
    active.current = true;
    return () => {
      active.current = false;
      for (const reader of pending.values()) reader.abort();
      pending.clear();
      sources.clear();
    };
  }, []);
  const read = useCallback((id, file) => {
    let type;
    try {
      type = validateAssetUpload(file);
    } catch (error) {
      setFiles((items) =>
        items.map((item) =>
          item.id === id ? { ...item, status: 'error', error: error.message } : item,
        ),
      );
      return;
    }
    const previous = readers.current.get(id);
    if (previous) previous.abort();
    const reader = new FileReader();
    readers.current.set(id, reader);
    setFiles((items) =>
      items.map((item) =>
        item.id === id ? { ...item, status: 'reading', error: '', url: '' } : item,
      ),
    );
    const finish = (result) => {
      if (!active.current || readers.current.get(id) !== reader) return;
      readers.current.delete(id);
      setFiles((items) => items.map((item) => (item.id === id ? { ...item, ...result } : item)));
    };
    reader.onload = () =>
      finish({
        status: 'ready',
        type,
        url: String(reader.result),
        mimeType:
          file.type ||
          {
            image: file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
            video: 'video/mp4',
            audio: 'audio/mpeg',
          }[type],
      });
    reader.onerror = () => finish({ status: 'error', error: '文件读取失败，请重试' });
    try {
      reader.readAsDataURL(file);
    } catch {
      finish({ status: 'error', error: '文件读取失败，请重试' });
    }
  }, []);
  const addFiles = useCallback(
    (list) => {
      const added = Array.from(list).map((file) => {
        const id = crypto.randomUUID();
        sourceFiles.current.set(id, file);
        return {
          id,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 50),
          fileName: file.name,
          bytes: file.size,
          status: 'reading',
          url: '',
          error: '',
        };
      });
      setFiles((items) => [...items, ...added]);
      added.forEach((item) => read(item.id, sourceFiles.current.get(item.id)));
    },
    [read],
  );
  const removeFile = useCallback((id) => {
    const reader = readers.current.get(id);
    readers.current.delete(id);
    reader?.abort();
    sourceFiles.current.delete(id);
    setFiles((items) => items.filter((item) => item.id !== id));
  }, []);
  const retryFile = useCallback(
    (id) => {
      const file = sourceFiles.current.get(id);
      if (file) read(id, file);
    },
    [read],
  );
  return {
    files,
    addFiles,
    removeFile,
    retryFile,
    reading: files.some((item) => item.status === 'reading'),
  };
}
