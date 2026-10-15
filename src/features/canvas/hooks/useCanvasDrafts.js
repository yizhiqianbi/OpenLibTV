import { useCallback, useLayoutEffect, useRef } from 'react';
import { pendingCanvasDraft, projectCanvasNodeDraft } from '../domain/draft-projection.js';

/** Collect drafts at the persistence boundary, including a child removed before React renders. */
export function useCanvasDrafts({ storageKey, nodes, ready } = {}) {
  const drafts = useRef(new Map());
  const register = useCallback((documentKey, nodeId, read, channel = 'default', accept) => {
    const key = JSON.stringify([documentKey, nodeId, channel]);
    const entry = { documentKey, nodeId, read, channel, accept };
    drafts.current.set(key, entry);
    return () => {
      if (drafts.current.get(key) !== entry) return;
      entry.snapshot = read();
      entry.read = null;
      if (
        !entry.snapshot?.writable ||
        (!entry.snapshot.scriptPrompts?.length &&
          entry.snapshot.value === entry.snapshot.basePrompt)
      )
        drafts.current.delete(key);
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    for (const [key, entry] of drafts.current) {
      if (entry.read || entry.documentKey !== storageKey) continue;
      const node = nodes.find((item) => item.id === entry.nodeId);
      const remaining = pendingCanvasDraft(node, entry.snapshot);
      if (!remaining) drafts.current.delete(key);
      else entry.snapshot = remaining;
    }
  }, [nodes, storageKey, ready]);
  const acknowledge = useCallback((document) => {
    for (const [key, entry] of drafts.current)
      if (!entry.read && entry.documentKey === document.storageKey) drafts.current.delete(key);
  }, []);
  // A destructive graph edit can normalize back to the input's old baseline.
  // Consume that exact node's input only after CAS succeeds, including a draft
  // retained when selecting the source unmounted the downstream editor.
  const consume = useCallback(
    (document, { explicitPromptNodeIds = [], removedNodeIds = [] } = {}) => {
      const explicit = new Set(explicitPromptNodeIds);
      const removed = new Set(removedNodeIds);
      const byId = new Map(document.nodes.map((node) => [node.id, node]));
      for (const [key, entry] of drafts.current) {
        if (entry.documentKey !== document.storageKey) continue;
        if (removed.has(entry.nodeId)) {
          drafts.current.delete(key);
          continue;
        }
        if (!explicit.has(entry.nodeId)) continue;
        let draft;
        try {
          draft = entry.read?.() || entry.snapshot;
          if (draft)
            entry.lastDraftKind = Array.isArray(draft.scriptPrompts) ? 'script-rows' : 'prompt';
        } catch {
          // Preflight read the same input before this graph was accepted. A
          // temporary plain-reader failure must still cancel its old timer;
          // rows and unknown legacy readers retain their recoverable drafts.
          if (
            entry.lastDraftKind === 'script-rows' ||
            (entry.lastDraftKind !== 'prompt' && typeof entry.accept !== 'function')
          )
            continue;
        }
        if (
          Array.isArray(draft?.scriptPrompts) ||
          ['clip-composer', 'clip-timeline'].includes(draft?.kind)
        )
          continue;
        const node = byId.get(entry.nodeId);
        const value = node?.data?.params?.prompt;
        if (typeof value !== 'string') continue;
        if (entry.read && typeof entry.accept === 'function') {
          try {
            if (entry.accept(value) !== false) continue;
          } catch {
            // The graph is already accepted. An interrupted input cannot put
            // its captured text back into the document during a save retry.
          }
        }
        // Retired readers cannot issue another change; their captured input is
        // already in history. Legacy live registrations have no accept bridge
        // and must register anew before projecting subsequent edits.
        drafts.current.delete(key);
      }
    },
    [],
  );
  const project = useCallback((document, { explicitPromptNodeIds = [] } = {}) => {
    let nodes = document.nodes;
    const explicitPrompts = new Set(explicitPromptNodeIds);
    for (const entry of drafts.current.values()) {
      if (entry.documentKey !== document.storageKey) continue;
      const draft = entry.read?.() || entry.snapshot;
      if (draft)
        entry.lastDraftKind = Array.isArray(draft.scriptPrompts) ? 'script-rows' : 'prompt';
      if (!draft?.writable) continue;
      if (
        explicitPrompts.has(entry.nodeId) &&
        !Array.isArray(draft.scriptPrompts) &&
        !['clip-composer', 'clip-timeline'].includes(draft.kind)
      )
        continue;
      const projected = nodes.map((node) => {
        if (node.id !== entry.nodeId) return node;
        return projectCanvasNodeDraft(node, draft);
      });
      if (projected.some((node, index) => node !== nodes[index])) nodes = projected;
    }
    return nodes === document.nodes ? document : { ...document, nodes };
  }, []);
  return { register, project, acknowledge, consume };
}
