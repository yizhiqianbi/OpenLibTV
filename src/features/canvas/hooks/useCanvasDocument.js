import { useEffect, useRef, useCallback, useState } from 'react';
import {
  canvasDocumentState,
  loadCanvasDocument,
  persistCanvasDocument,
  writeCanvasSnapshot,
} from '../persistence.js';
import { readOnlyCanvasView } from '../geometry.js';
import {
  readSkillHandoff,
  consumeSkillHandoff,
  legacySkillHandoff,
  skillHandoffText,
} from '../../../services/agent-handoff.js';

export function useCanvasDocument(route, actions) {
  const [loadedStorageKey, setLoadedStorageKey] = useState(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const { storageKey, readonly, template } = route;
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const route = routeRef.current;
    let active = true;
    const state = latest.current;
    setLoadedStorageKey(null);
    state.setLoaded(false);
    state.setLoadError('');
    state.setAgentOpen(!route.readonly);
    state.setSurface('workflow');
    state.setSelected?.([]);
    state.setPanel?.(null);
    state.setDialog?.(null);
    state.setContext?.(null);
    state.setAgentConfig?.({});
    state.clearHistory();
    loadCanvasDocument(route)
      .then((document) => {
        if (!active) return;
        const data = canvasDocumentState(document);
        const actions = latest.current;
        const handoffId = route.query.get('draftPromptId');
        const incoming = !route.readonly ? readSkillHandoff(handoffId) : null;
        const draft = route.readonly
          ? document.snapshot.agentDraft || null
          : incoming || document.snapshot.agentDraft || legacySkillHandoff(route.query);
        actions.setAgentDraft?.(draft);
        actions.setAgentConfig?.(data.agentConfig);
        actions.setPrompt?.(skillHandoffText(draft));
        actions.setMessages?.(data.messages);
        actions.setSharedMessages?.(route.chatShare ? data.messages : []);
        actions.setReplay?.(0);
        actions.setReplayPlaying?.(route.chatShare);
        if (draft && !route.readonly) actions.setAgentOpen(true);
        // Consume the tab-scoped handoff only after a durable local project copy exists.
        // A quota failure leaves the handoff available for retry and page refresh.
        if (incoming && actions.user) {
          try {
            writeCanvasSnapshot(route.key, {
              ...document.snapshot,
              title: data.title,
              agentDraft: draft,
            });
            consumeSkillHandoff(handoffId);
          } catch {
            actions.notify?.('本机存储空间不足，创作参考仍保留在当前标签页');
          }
        }
        actions.setTitle(data.title);
        actions.setNodes(data.nodes);
        actions.setEdges(data.edges);
        setLoadedStorageKey(route.storageKey);
        actions.setLoaded(true);
        if (document.source === 'local' && document.snapshot.view && !route.readonly)
          actions.setView(document.snapshot.view);
        setTimeout(() => {
          if (!active) return;
          if (document.source === 'local' && document.snapshot.view && !route.readonly) return;
          if (route.readonly && !route.chatShare)
            actions.setView(
              readOnlyCanvasView(
                data.nodes,
                actions.board.current?.getBoundingClientRect().height || 700,
              ),
            );
          else actions.fit(data.nodes);
        }, 0);
      })
      .catch((error) => {
        if (!active) return;
        latest.current.setLoaded(true);
        latest.current.setLoadError(
          route.chatShare
            ? error.message || '加载分享失败'
            : route.template
              ? '创作过程暂不可用'
              : '项目加载失败',
        );
      });
    return () => {
      active = false;
    };
  }, [storageKey, readonly, template]);
  return loadedStorageKey;
}

export function useCanvasAutosave(
  document,
  { loaded, readonly, user, setSaved, notify, projectDrafts, acknowledgeDrafts },
) {
  const latest = useRef(null);
  latest.current = {
    document,
    setSaved,
    notify,
    projectDrafts,
    acknowledgeDrafts,
    loaded,
    readonly,
    user,
    storageKey: document.storageKey,
  };
  const pending = useRef(null);
  const lastSaved = useRef(null);
  const [saveFailure, setSaveFailure] = useState(null);
  const flush = useCallback((updateUI = true, expectedStorageKey) => {
    const base =
      pending.current?.storageKey === expectedStorageKey || expectedStorageKey === undefined
        ? pending.current || lastSaved.current
        : lastSaved.current;
    if (!base || (expectedStorageKey !== undefined && base.storageKey !== expectedStorageKey))
      return;
    const access = latest.current;
    if (
      !pending.current &&
      base.storageKey === access.storageKey &&
      (!access.loaded || access.readonly || !access.user)
    )
      return;
    const projected = access.projectDrafts?.(base) || base;
    // A settled document may still contain an editor draft that has not reached its debounce.
    if (!pending.current && projected === base) return;
    try {
      persistCanvasDocument(projected);
      latest.current.acknowledgeDrafts?.(projected);
      // Keep the graph baseline: a still-mounted editor may advance the same draft again.
      lastSaved.current = base;
      if (pending.current === base) pending.current = null;
      if (updateUI && access.storageKey === base.storageKey) {
        latest.current.setSaved(true);
        setSaveFailure(null);
      }
      return true;
    } catch {
      if (updateUI && access.storageKey === base.storageKey)
        setSaveFailure({ storageKey: base.storageKey, message: '本机保存失败' });
      latest.current.notify('本机存储空间不足，请导出画布文件');
      return false;
    }
  }, []);
  const { nodes, edges, title, view, key, storageKey, agentDraft, messages, agentConfig } =
    document;
  useEffect(() => {
    if (!loaded || readonly || !user) return;
    pending.current = {
      nodes,
      edges,
      title,
      view,
      key,
      storageKey,
      agentDraft,
      messages,
      agentConfig,
    };
    latest.current.setSaved(false);
    const timer = setTimeout(() => flush(), 600);
    return () => clearTimeout(timer);
  }, [
    nodes,
    edges,
    title,
    view,
    loaded,
    readonly,
    key,
    storageKey,
    agentDraft,
    messages,
    agentConfig,
    user,
    flush,
  ]);
  useEffect(() => {
    const leaving = () => flush(true, storageKey);
    window.addEventListener('pagehide', leaving);
    return () => {
      window.removeEventListener('pagehide', leaving);
      flush(false, storageKey);
    };
  }, [storageKey, flush]);
  // Source fixed-grid overflow flushes synchronously. Use the committed graph,
  // since React's document effect may still hold the preceding render's graph.
  const flushGraph = (graph) => {
    const access = latest.current;
    if (
      !access.loaded ||
      access.readonly ||
      !access.user ||
      graph?.documentKey !== access.storageKey ||
      !graph.ready ||
      graph.readonly ||
      !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.edges)
    )
      return false;
    pending.current = { ...access.document, nodes: graph.nodes, edges: graph.edges };
    return flush(true, access.storageKey) === true;
  };
  const retrySave = () => {
    const access = latest.current;
    if (access.storageKey !== storageKey || !access.loaded || access.readonly || !access.user)
      return false;
    return flush(true, storageKey) === true;
  };
  return {
    flushGraph,
    retrySave,
    saveError: saveFailure?.storageKey === storageKey ? saveFailure.message : '',
  };
}
