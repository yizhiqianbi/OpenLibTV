import { useEffect, useRef } from 'react';
import { createLocalId } from '../../editor/model.js';
import { writeCanvasSnapshot } from '../persistence.js';

/** Copy, share and exports read the same projected snapshot, including pending prompts. */
export function useCanvasSnapshotActions(options) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(false);
  const { documentKey } = options;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const current = () =>
    active.current && latest.current.documentKey === documentKey && latest.current.ready
      ? latest.current
      : null;
  const getSnapshot = () => {
    const state = latest.current;
    const { title, nodes, edges, view, agentDraft, messages, agentConfig } = state.document;
    return {
      title,
      nodes: state.projectDrafts({ storageKey: state.documentKey, nodes }).nodes,
      edges,
      view,
      agentDraft,
      messages,
      agentConfig,
    };
  };
  const persist = (state, title) => {
    const id = createLocalId();
    try {
      writeCanvasSnapshot(id, { ...getSnapshot(), ...(title ? { title } : {}) });
      return id;
    } catch {
      state.notify('本机存储空间不足，请导出画布文件');
      return null;
    }
  };
  const copyCanvas = () => {
    const state = current();
    if (!state) return;
    if (!state.user) {
      state.login?.();
      return;
    }
    const id = persist(state, state.document.title + ' 副本');
    if (id) state.navigate?.('/canvas?projectId=' + id);
  };
  const share = async () => {
    const state = current();
    if (!state || state.readonly) return;
    const id = persist(state);
    if (!id) return;
    const url = window.location.origin + '/canvas/share?shareId=' + id;
    state.setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      if (current()) latest.current.notify('已复制分享链接，分享快照保存在本机');
    } catch {
      if (current()) latest.current.notify('分享链接已生成');
    }
  };
  return { getSnapshot, copyCanvas, share };
}
