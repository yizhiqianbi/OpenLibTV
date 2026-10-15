import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAT_MODEL_CATALOGUE } from '../../../services/agent-model-catalogue.js';
import {
  buildCanvasMentionRows,
  canvasMentionViewport,
  orderCanvasMentionNodeIds,
} from '../../../services/agent-node-catalogue.js';

/** The ordering is a snapshot at open; search always reads the current nodes. */
export function useCanvasMentions({
  nodes = [],
  projectId,
  view,
  board,
  boardBounds,
  viewport,
  models = CHAT_MODEL_CATALOGUE,
  pendingNodeIds,
} = {}) {
  const latest = useRef();
  const order = useRef(null);
  const limit = useRef(3);
  const [revision, setRevision] = useState(0);
  useLayoutEffect(() => {
    latest.current = {
      nodes,
      projectId,
      view,
      board,
      boardBounds,
      viewport,
      models,
      pendingNodeIds,
    };
  }, [nodes, projectId, view, board, boardBounds, viewport, models, pendingNodeIds]);
  useLayoutEffect(() => {
    order.current = null;
    limit.current = 3;
  }, [projectId]);
  const source = useCallback(
    ({ query = '', parts = [] } = {}) =>
      buildCanvasMentionRows({
        ...latest.current,
        query,
        references: parts,
        nodeIds: order.current,
        nodeLimit: limit.current,
      }),
    [],
  );
  const onOpen = useCallback(() => {
    const current = latest.current;
    const bounds = current.boardBounds || current.board?.current?.getBoundingClientRect();
    const rect = current.viewport || canvasMentionViewport(current.view, bounds);
    order.current = orderCanvasMentionNodeIds(current.nodes, rect, current.pendingNodeIds);
    limit.current = 3;
    setRevision((value) => value + 1);
  }, []);
  const onLoadMore = useCallback(() => {
    limit.current += 3;
    setRevision((value) => value + 1);
  }, []);
  const refreshKey = useMemo(
    () => ({ nodes, projectId, models, pendingNodeIds, revision }),
    [nodes, projectId, models, pendingNodeIds, revision],
  );
  return { source, onOpen, onLoadMore, refreshKey };
}
