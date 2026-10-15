import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { resolveAgentNodePresentation } from '../../../services/agent-node-presentation.ts';
import { canvasAgentNodeFocusView } from '../domain/agent-node-focus.ts';

const emptyNodes = [];

/** No node mutation/selection and no global Canvas store access; readonly view navigation is allowed. */
export function useCanvasNodePresentation({
  nodes = emptyNodes,
  projectId,
  documentReady = false,
  isShareReplay = false,
  board,
  boardBounds,
  setView,
  onOpenProject,
  onError,
} = {}) {
  const latest = useRef(null);
  useLayoutEffect(() => {
    const owner = {
      nodes,
      projectId,
      documentReady,
      isShareReplay,
      board,
      boardBounds,
      setView,
      onOpenProject,
      onError,
    };
    latest.current = owner;
    return () => {
      if (latest.current === owner) latest.current = null;
    };
  }, [
    nodes,
    projectId,
    documentReady,
    isShareReplay,
    board,
    boardBounds,
    setView,
    onOpenProject,
    onError,
  ]);
  const locate = useCallback((reference, expectedProjectId) => {
    const current = latest.current;
    if (!current || current.projectId !== expectedProjectId || !current.documentReady) return false;
    const presentation = resolveAgentNodePresentation(reference, {
      nodes: current.nodes,
      projectId: current.projectId,
      ready: current.documentReady,
      isShareReplay: current.isShareReplay,
      canLocate: typeof current.setView === 'function',
    });
    if (!presentation.canLocate) return false;
    const bounds = current.boardBounds || current.board?.current?.getBoundingClientRect();
    if (!bounds) return false;
    const view = canvasAgentNodeFocusView(presentation.nodeId, current.nodes, bounds);
    if (!view) return false;
    current.setView(view, { duration: 300 });
    return true;
  }, []);
  const openProject = useCallback(async (reference, expectedProjectId) => {
    const current = latest.current;
    if (!current || current.projectId !== expectedProjectId || !current.documentReady) return false;
    const presentation = resolveAgentNodePresentation(reference, {
      nodes: current.nodes,
      projectId: current.projectId,
      ready: true,
      isShareReplay: current.isShareReplay,
      canOpenProject: typeof current.onOpenProject === 'function',
    });
    if (!presentation.canOpenProject) return false;
    try {
      const result = await current.onOpenProject({
        nodeId: presentation.nodeId,
        projectId: presentation.projectId,
      });
      if (result === false && latest.current === current) current.onError?.('操作失败');
      return result !== false;
    } catch {
      if (latest.current === current) current.onError?.('操作失败');
      return false;
    }
  }, []);
  return useMemo(
    () => ({
      nodes,
      projectId,
      ready: documentReady,
      isShareReplay,
      onLocate:
        typeof setView === 'function' ? (reference) => locate(reference, projectId) : undefined,
      onOpenProject:
        typeof onOpenProject === 'function'
          ? (reference) => openProject(reference, projectId)
          : undefined,
    }),
    [nodes, projectId, documentReady, isShareReplay, setView, onOpenProject, locate, openProject],
  );
}
