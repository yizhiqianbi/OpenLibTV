import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { generatorIncomingIdentity, resolveNodeGenerator } from './node-generator.js';
import { useGeneratorMediaMetadata } from './useGeneratorMediaMetadata.js';
import { patchCanvasMagicPrompt } from './magic-metadata-model.js';

/** The inspector and the node workspace use the same read/normalize/write boundary. */
export function useNodeGenerator({
  node,
  nodes,
  edges,
  models,
  asset,
  readonly,
  ready = true,
  update,
  getDocument,
  documentKey,
}) {
  const synchronized = useRef(null);
  const latest = useRef(null);
  const base = resolveNodeGenerator(node, nodes, edges, models);
  const nodeId = node?.id;
  const syncKey = JSON.stringify([
    nodeId,
    node?.type,
    base.model,
    generatorIncomingIdentity(base.inputMedia),
  ]);
  const syncIncoming =
    !!node && !!base.schema && ready && !readonly && synchronized.current !== syncKey;
  const prepared = syncIncoming
    ? resolveNodeGenerator(node, nodes, edges, models, { syncIncoming: true })
    : base;
  const mediaProbe = useGeneratorMediaMetadata({
    inputs: prepared.inputMedia,
    unresolved: [...prepared.mediaValidation.unresolved, ...prepared.locks.unresolved],
    asset,
  });
  const state = resolveNodeGenerator(node, nodes, edges, models, {
    metadata: mediaProbe.metadata,
    syncIncoming,
  });
  useLayoutEffect(() => {
    latest.current = {
      node,
      nodes,
      edges,
      models,
      readonly,
      ready,
      update,
      getDocument,
      documentKey,
      state,
      baseMode: base.params.modeType,
      metadata: mediaProbe.metadata,
    };
  });
  useEffect(() => {
    const current = latest.current;
    if (!current.node || !current.state.schema || !current.ready || current.readonly) {
      synchronized.current = null;
      return;
    }
    if (!syncIncoming || synchronized.current === syncKey) return;
    synchronized.current = syncKey;
    // A schema becoming available may supply display defaults. Keep the stored
    // document intact until an incoming resource actually changes its mode.
    if (current.baseMode !== current.state.params.modeType)
      current.update(current.node.id, { params: current.state.params });
  }, [nodeId, syncKey, syncIncoming, ready, readonly]);
  const changeParams = useCallback((next) => {
    let current = latest.current;
    if (current.readonly || !current.ready || !current.node) return false;
    if (current.getDocument) {
      const graph = current.getDocument();
      const target = graph?.nodes.find((item) => item.id === current.node.id);
      if (
        !graph ||
        graph.documentKey !== current.documentKey ||
        graph.ready !== true ||
        graph.readonly === true ||
        !target
      )
        return false;
      current = {
        ...current,
        node: target,
        nodes: graph.nodes,
        edges: graph.edges,
        models: graph.models || current.models,
        state: resolveNodeGenerator(
          target,
          graph.nodes,
          graph.edges,
          graph.models || current.models,
          {
            metadata: current.metadata,
            syncIncoming:
              generatorIncomingIdentity(
                resolveNodeGenerator(
                  target,
                  graph.nodes,
                  graph.edges,
                  graph.models || current.models,
                ).inputMedia,
              ) !== generatorIncomingIdentity(current.state.inputMedia),
          },
        ),
      };
    }
    const merged = { ...current.state.params, ...next };
    const params =
      typeof next.prompt === 'string' ? patchCanvasMagicPrompt(merged, next.prompt) : merged;
    const modelChanged = params.model !== current.state.model;
    const normalized = resolveNodeGenerator(
      { ...current.node, data: { ...current.node.data, params } },
      current.nodes,
      current.edges,
      current.models,
      { metadata: current.metadata, syncIncoming: modelChanged },
    );
    if (!normalized.schema) return false;
    latest.current = {
      ...current,
      node: { ...current.node, data: { ...current.node.data, params: normalized.params } },
      state: normalized,
    };
    current.update(current.node.id, {
      params: normalized.params,
      generationError: '',
      ...(current.node.type === 'text' ? { text: normalized.params.prompt } : {}),
    });
    return true;
  }, []);
  return { ...state, mediaProbe, changeParams };
}
