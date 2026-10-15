import { useEffect, useRef, useState } from 'react';
import { useAssetLibrary } from '../../../hooks/useAssetLibrary.ts';
import {
  createLibraryFolder,
  deleteLibraryEntries,
  folderPath,
  libraryEntries,
  moveLibraryEntries,
  normalizeAssetLibrary,
  renameLibraryEntry,
  setLibraryFolderCover,
  selectedLibraryEntries,
  tagLibraryAssets,
  validateLibrarySelection,
} from '../../../services/asset-library/model.ts';
import { createCanvasFromAssets } from '../domain/canvas-export.js';

export const ASSET_LIBRARY_DRAG_TYPE = 'application/x-libtv-asset-library';
export function useAssetLibraryController({ login, user, toast, navigate }) {
  const store = useAssetLibrary();
  const library = store.value;
  const [folder, setFolder] = useState(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [tags, setTags] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [preview, setPreview] = useState(null);
  const [batch, setBatch] = useState(false);
  const [selectedKeys, setSelected] = useState([]);
  const selected = selectedKeys.filter((key) =>
    key.startsWith('folder:')
      ? library.folders.some((item) => `folder:${item.id}` === key)
      : library.assets.some((item) => !item.deletedAt && `asset:${item.id}` === key),
  );
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const more = useRef(null);
  const downloadController = useRef(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setLimit(20);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => () => downloadController.current?.abort(), []);
  let path = [];
  let pathError = '';
  try {
    path = folderPath(library, folder);
  } catch (error) {
    pathError = error.message;
  }
  const entries = libraryEntries(library, { folder, query: search, tags });
  useEffect(() => {
    const marker = more.current;
    if (!marker || !window.IntersectionObserver || limit >= entries.length) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items[0]?.isIntersecting) setLimit((count) => count + 20);
      },
      { rootMargin: '160px' },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [limit, entries.length]);
  const authorize = (action) => {
    if (!user) {
      login?.();
      return;
    }
    action();
  };
  const commit = (operation) => {
    try {
      if (store.error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(store.error.code))
        throw new Error('资产库未正确加载，请先重试');
      const saved = store.setValue((previous) => operation(normalizeAssetLibrary(previous)));
      if (!saved) toast?.('保存失败，本机存储空间不足或不可用');
      return saved;
    } catch (error) {
      toast?.(error.message || '操作失败，请重试');
      return false;
    }
  };
  const createFolder = (name, parentId) => {
    const id = crypto.randomUUID();
    return commit((state) => createLibraryFolder(state, name, parentId, id)) ? id : null;
  };
  const applyTags = (value) => {
    setTags(value);
    setFolder(null);
    setLimit(20);
  };
  const changeFolder = (id) => {
    setFolder(id);
    setQuery('');
    setSearch('');
    setTags([]);
    setLimit(20);
  };
  const select = (key) => {
    // A checked asset within a selected folder must be individually removable.
    const current = selectedLibraryEntries(library, selected);
    const checked =
      key.startsWith('asset:') && current.assets.some((item) => `asset:${item.id}` === key);
    let next = selected.includes(key)
      ? selected.filter((item) => item !== key)
      : [...selected, key];
    if (checked && !selected.includes(key))
      next = current.assets
        .filter((item) => `asset:${item.id}` !== key)
        .map((item) => `asset:${item.id}`);
    try {
      validateLibrarySelection(library, next);
      setSelected(next);
    } catch (error) {
      toast?.(error.message);
    }
  };
  const selection = selectedLibraryEntries(library, selected);
  const show = (type, keys = selected, extra = {}) =>
    authorize(() => setDialog({ type, keys, ...extra }));
  const enterBatch = (key) =>
    authorize(() => {
      setBatch(true);
      try {
        validateLibrarySelection(library, [key]);
        setSelected([key]);
      } catch (error) {
        setSelected([]);
        toast?.(error.message);
      }
    });
  const createCanvas = (keys) =>
    authorize(() => {
      try {
        const chosen = selectedLibraryEntries(library, keys);
        navigate(createCanvasFromAssets(chosen.assets));
      } catch (error) {
        toast?.(error.message || '创建画布失败，请重试');
      }
    });
  const download = async (keys) => {
    if (busy) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setBusy(true);
    try {
      const { downloadLibraryAssets } = await import('../domain/download.js');
      await downloadLibraryAssets(selectedLibraryEntries(library, keys).assets, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) toast?.(error.message || '下载失败，请重试');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const drop = (event, target) => {
    event.preventDefault();
    setDropTarget(null);
    const data = event.dataTransfer.getData(ASSET_LIBRARY_DRAG_TYPE);
    if (!data || !user) return;
    try {
      const keys = JSON.parse(data);
      if (!Array.isArray(keys) || !keys.every((key) => typeof key === 'string')) return;
      if (commit((state) => moveLibraryEntries(state, keys, target))) toast?.('已移动');
    } catch (error) {
      toast?.(error.message || '移动失败');
    }
  };
  const saveUpload = (files, target, nextTags) => {
    const saved = commit((state) => {
      if (!state.folders.length) {
        target = crypto.randomUUID();
        state = createLibraryFolder(state, '待整理', null, target);
      } else if (target) folderPath(state, target);
      const now = Date.now();
      const assets = files.map((file, index) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        mimeType: file.mimeType,
        url: file.url,
        bytes: file.bytes,
        folderId: target,
        tags: [],
        assetType: null,
        createdAt: now + index,
        updatedAt: now,
      }));
      return tagLibraryAssets(
        { ...state, assets: [...state.assets, ...assets] },
        assets.map((item) => `asset:${item.id}`),
        nextTags,
      );
    });
    if (saved) {
      toast?.(`已保存 ${files.length} 个资产`);
      if (!search.trim() && !tags.length) changeFolder(target);
    }
    return saved;
  };
  const remove = (keys) => {
    const saved = commit((state) => deleteLibraryEntries(state, keys));
    if (saved) {
      setSelected([]);
      if (folder && keys.includes(`folder:${folder}`)) changeFolder(null);
      toast?.('已删除');
    }
    return saved;
  };
  return {
    library,
    error: store.error,
    folder,
    path,
    pathError,
    query,
    setQuery,
    search,
    searchOpen,
    setSearchOpen,
    tags,
    applyTags,
    changeFolder,
    dialog,
    setDialog,
    preview,
    setPreview,
    batch,
    selected,
    selection,
    limit,
    loadMore: () => setLimit((count) => count + 20),
    entries,
    more,
    busy,
    dropTarget,
    setDropTarget,
    select,
    show,
    enterBatch,
    createCanvas,
    download,
    drop,
    createFolder,
    saveUpload,
    remove,
    rename: (key, name) => commit((state) => renameLibraryEntry(state, key, name)),
    setFolderCover: (folderId, assetId) =>
      commit((state) => setLibraryFolderCover(state, folderId, assetId)),
    move: (keys, target) => commit((state) => moveLibraryEntries(state, keys, target)),
    tag: (keys, value) => commit((state) => tagLibraryAssets(state, keys, value)),
    exitBatch: () => {
      setBatch(false);
      setSelected([]);
    },
    closeDialog: () => setDialog(null),
  };
}
