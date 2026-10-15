import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { agentNodeVideoPoster } from '../../../services/agent-node-presentation.ts';
import { collectVideoClipIncomingData } from './domain/incoming-model.js';
import {
  getVideoClipAgentRefreshDelay,
  resolveVideoClipNodePresentation,
} from './domain/node-presentation-model.js';

/** The manual canvas replaces React Flow's measured-content pass, not its raw width. */
export function useCanvasVideoClipNodes({
  documentKey,
  ready,
  readonly,
  nodes,
  edges,
  editingClipNodeId = null,
  editingClipPreviewExpanded = true,
  currentDocument,
  setNodes,
  isInteracting,
}) {
  const [clock, setClock] = useState(Date.now);
  const owner = useMemo(() => ({ documentKey, ready, readonly }), [documentKey, ready, readonly]);
  const current = useRef(null);
  const mounted = useRef(false);
  current.current = { owner, documentKey, ready, readonly, setNodes, isInteracting };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const entries = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return new Map(
      nodes
        .filter((node) => node.type === 'video-clip')
        .map((node) => {
          const incomingData = collectVideoClipIncomingData({ node, nodes, edges });
          const presentation = resolveVideoClipNodePresentation({
            nodeId: node.id,
            data: node.data,
            incomingData,
            editingClipNodeId,
            editingClipPreviewExpanded,
            readonly,
            nowMs: clock,
            defaultLabel: '智能剪辑节点',
          });
          const source = byId.get(presentation.firstVideoSourceNodeId);
          const sourcePoster = source?.data?.poster;
          // dC tries the source poster first, then its OSS snapshot helper, and only
          // falls back to a muted native video when both images fail. Keep this
          // projection lazy and URL-qualified: local/blob/data URLs must not gain
          // a fabricated remote snapshot endpoint.
          const sourceSnapshot = agentNodeVideoPoster(presentation.firstVideoUrl || '', 400);
          return [node.id, { incomingData, presentation, sourcePoster, sourceSnapshot }];
        }),
    );
  }, [nodes, edges, editingClipNodeId, editingClipPreviewExpanded, readonly, clock]);

  useEffect(() => {
    if (!ready) return;
    const delays = nodes
      .filter((node) => node.type === 'video-clip')
      .map((node) => getVideoClipAgentRefreshDelay(node.data?.agentEditing, Date.now()))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!delays.length) return;
    const timer = setTimeout(
      () => {
        if (mounted.current && current.current.owner === owner) setClock(Date.now());
      },
      Math.min(...delays),
    );
    return () => clearTimeout(timer);
  }, [nodes, ready, owner, clock]);

  useLayoutEffect(() => {
    const state = current.current;
    const graph = currentDocument.current;
    if (
      !mounted.current ||
      state.owner !== owner ||
      !state.ready ||
      state.isInteracting?.() ||
      graph?.documentKey !== state.documentKey ||
      !graph.ready ||
      graph.nodes !== nodes ||
      graph.edges !== edges
    )
      return;
    let changed = false;
    const measured = nodes.map((node) => {
      const size = entries.get(node.id)?.presentation;
      if (
        !size ||
        !Number.isFinite(size.width) ||
        !Number.isFinite(size.height) ||
        size.width <= 0 ||
        size.height <= 0 ||
        (Math.abs((node.measured?.width ?? 0) - size.width) <= 0.5 &&
          Math.abs((node.measured?.height ?? 0) - size.height) <= 0.5)
      )
        return node;
      changed = true;
      return { ...node, measured: { ...node.measured, width: size.width, height: size.height } };
    });
    if (!changed) return;
    // Measurement does not project drafts, consume a history entry or change
    // data. Readonly documents may measure in memory; their autosave is disabled.
    currentDocument.current = { ...graph, nodes: measured };
    state.setNodes(measured);
  }, [entries, nodes, edges, currentDocument, owner]);

  return entries;
}
