import { useEffect, useRef, useState } from 'react';
import {
  createCanvasGroup,
  ungroupCanvasNodes,
  layoutCanvasNodes,
  canvasSelectionRoots,
  isCanvasGroup,
} from '../domain/groups.js';
import { duplicateCanvasSelection, removeCanvasNodes } from '../model.js';
import {
  createStoryboardGridGroup,
  resolveStoryboardGridCreation,
  STORYBOARD_GRID_CREATION_DISABLED_REASON,
} from '../domain/storyboard-grid-create-model.js';
import {
  canvasDownloadEntries,
  canvasSelectionDownloadItems,
  canvasSelectionChatReferences,
  canvasSelectionSkillRequest,
} from './selection-actions.js';
import { createDownloadArchive } from '../../../services/download-archive.ts';
import { download } from '../../editor/browser.js';

/** Selection writes and async exports share a document/permission boundary. */
export function useCanvasSelectionActions(props) {
  const latest = useRef(props),
    active = useRef(false),
    task = useRef(null),
    downloadOwner = useRef(null);
  latest.current = props;
  const [state, setState] = useState({
    documentKey: props.documentKey,
    running: false,
    finished: 0,
    total: 0,
    groupId: undefined,
  });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      task.current?.abort();
      task.current = null;
      downloadOwner.current = null;
    };
  }, []);
  useEffect(() => {
    task.current?.abort();
    task.current = null;
    downloadOwner.current = null;
    setState({
      documentKey: props.documentKey,
      running: false,
      finished: 0,
      total: 0,
      groupId: undefined,
    });
  }, [props.documentKey, props.readonly, props.ready]);
  const target = () => {
    const current = latest.current;
    if (
      !active.current ||
      current.documentKey !== props.documentKey ||
      !current.ready ||
      current.readonly
    )
      return null;
    if (!current.getDocument && !current.commitGraph) return current;
    const graph = current.getDocument?.();
    return graph?.documentKey === props.documentKey &&
      graph.ready === true &&
      graph.readonly === false &&
      Array.isArray(graph.nodes) &&
      Array.isArray(graph.edges)
      ? { ...current, nodes: graph.nodes, edges: graph.edges, graph }
      : null;
  };
  const commit = (current, nodes, edges) => {
    if (!target()) return false;
    try {
      if (current.commitGraph)
        return (
          current.commitGraph(
            { ...current.graph, nodes, edges: edges ?? current.edges },
            { expectedGraph: current.graph },
          ) === true
        );
      // Older callers use a synchronous change callback with no return value.
      return (edges === undefined ? current.change(nodes) : current.change(nodes, edges)) !== false;
    } catch (error) {
      if (target()) latest.current.notify?.(error.message || '画布操作失败，请重试');
      return false;
    }
  };
  const duplicate = (ids = latest.current.selected) => {
    const current = target();
    if (!current) return;
    let source = current.graph ?? { nodes: current.nodes, edges: current.edges };
    let copies;
    try {
      if (current.projectGraph) {
        source = current.projectGraph(source);
        if (!Array.isArray(source?.nodes) || !Array.isArray(source?.edges))
          throw new Error('Invalid graph projection');
      }
      // Draft registrations use original IDs, so copies must be made from the
      // projected source. The commit still compares the untouched raw graph.
      copies = duplicateCanvasSelection(source.nodes, source.edges, ids);
    } catch {
      if (target()) latest.current.notify?.('当前画布草稿无法复制，请重试');
      return;
    }
    if (
      !copies.nodes.length ||
      !commit(current, [...source.nodes, ...copies.nodes], [...source.edges, ...copies.edges])
    )
      return;
    const owner = target();
    if (!owner) return;
    owner.setSelected(
      canvasSelectionRoots(
        copies.nodes,
        copies.nodes.map((node) => node.id),
      ).map((node) => node.id),
    );
  };
  const remove = (ids = latest.current.selected, { trigger = 'keyboard' } = {}) => {
    const current = target();
    if (!current) return;
    if (current.deleteNodes) {
      if (
        current.deleteNodes(ids, {
          zoom: current.zoom,
          reconcileGroupConsumers: true,
          trigger,
        }) !== true
      )
        return;
    } else {
      const next = removeCanvasNodes(current.nodes, current.edges, ids);
      if (!commit(current, next.nodes, next.edges)) return;
    }
    const owner = target();
    if (!owner) return;
    owner.setSelected([]);
    owner.setPanel(null);
  };
  const group = (ids) => {
    const current = target();
    if (!current) return;
    const result = createCanvasGroup(current.nodes, ids, { zoom: current.zoom });
    if (!result.group) return;
    if (!commit(current, result.nodes)) return;
    const owner = target();
    if (!owner) return;
    owner.setSelected([result.group.id]);
    owner.setPanel(null);
  };
  const groupStoryboard = (ids = latest.current.selected) => {
    const current = target();
    if (!current) return;
    const result = createStoryboardGridGroup({
      nodes: current.nodes,
      selectedIds: ids,
      zoom: current.zoom,
      getNodeSize: current.getStoryboardNodeSize,
    });
    if (!result.valid) {
      current.notify?.(STORYBOARD_GRID_CREATION_DISABLED_REASON);
      return result;
    }
    if (!commit(current, result.nodes)) return;
    const owner = target();
    if (!owner || owner.documentKey !== current.documentKey) return;
    owner.setSelected(result.selectedIds);
    owner.setPanel(null);
    owner.onStoryboardGroupCreated?.(result.group.id, owner.graph?.nodes ?? result.nodes);
    return result;
  };
  const ungroup = (id) => {
    const current = target();
    if (!current) return;
    const group = current.nodes.find((node) => node.id === id && isCanvasGroup(node));
    if (!group) return;
    const result = ungroupCanvasNodes(current.nodes, id);
    const children = new Set(
      current.nodes.filter((node) => node.parentId === id).map((node) => node.id),
    );
    const source = current.nodes.find((node) => node.id === group.data?.sourceScriptNodeId);
    const linkKey =
      source?.data?.linkedImageGroupId === id
        ? 'linkedImageGroupId'
        : source?.data?.linkedVideoGroupId === id
          ? 'linkedVideoGroupId'
          : null;
    const next = result.nodes.map((node) => {
      if (linkKey && node.id === source.id) {
        const data = { ...node.data };
        delete data[linkKey];
        return { ...node, data };
      }
      if (!children.has(node.id)) return node;
      let data = node.data;
      if (data?._explicitContentDims === true) {
        const {
          _explicitContentDims: _explicit,
          contentWidth: _width,
          contentHeight: _height,
          ...rest
        } = data;
        data = rest;
      }
      if (data?.params?.scene === 'group-generate') {
        const { scene: _scene, ...params } = data.params;
        data = { ...data, params };
      }
      return data === node.data ? node : { ...node, data };
    });
    if (
      !commit(
        current,
        next,
        current.edges.filter((edge) => edge.source !== id && edge.target !== id),
      )
    )
      return;
    const owner = target();
    if (!owner) return;
    owner.setSelected(result.selectedIds);
    owner.setPanel(null);
    return true;
  };
  const layout = (mode, ids, groupId) => {
    const current = target();
    if (!current) return;
    if (groupId && current.onGeneralGroupCommand)
      return current.onGeneralGroupCommand(groupId, { type: 'layout', mode });
    const next = layoutCanvasNodes(current.nodes, ids ?? current.selected, mode, { groupId });
    if (next !== current.nodes) return commit(current, next);
  };
  const cancelDownload = (groupId) => {
    if (!target()) return;
    const owner = downloadOwner.current;
    if (
      !owner ||
      owner.documentKey !== props.documentKey ||
      task.current !== owner.controller ||
      (typeof groupId === 'string' && groupId !== owner.groupId)
    )
      return;
    owner.controller.abort();
  };
  const downloadAll = async (ids, context = {}) => {
    const current = target();
    if (!current || task.current) return;
    const groupId = context.groupId;
    const controller = new AbortController();
    const owner = { controller, documentKey: current.documentKey, groupId };
    task.current = controller;
    downloadOwner.current = owner;
    const entries = canvasDownloadEntries(canvasSelectionDownloadItems(current.nodes, ids));
    const isCurrent = () =>
      active.current &&
      task.current === controller &&
      downloadOwner.current === owner &&
      !controller.signal.aborted &&
      Boolean(target()) &&
      latest.current.documentKey === current.documentKey &&
      latest.current.ready &&
      !latest.current.readonly;
    setState({
      documentKey: current.documentKey,
      running: true,
      finished: 0,
      total: entries.length,
      groupId,
    });
    try {
      const blob = await (current.createArchive || createDownloadArchive)(entries, {
        signal: controller.signal,
        asset: current.asset,
        onProgress: (progress) => {
          if (isCurrent())
            setState({
              documentKey: current.documentKey,
              running: true,
              groupId,
              ...progress,
            });
        },
      });
      if (isCurrent()) (current.download || download)('画布素材.zip', blob, 'application/zip');
    } catch (error) {
      if (target() && task.current === controller && error.name !== 'AbortError')
        current.notify?.(error.message || '打包下载失败，请重试');
    } finally {
      if (task.current === controller) {
        task.current = null;
        if (downloadOwner.current === owner) downloadOwner.current = null;
        if (active.current && latest.current.documentKey === current.documentKey)
          setState((previous) => ({ ...previous, running: false }));
      }
    }
  };
  const addToChat = (ids) => {
    const current = target();
    if (!current) return;
    const references = canvasSelectionChatReferences(current.nodes, ids, current.projectId);
    if (references.length) current.onAddToChat?.(references);
    else current.notify?.('当前选择没有可加入 Chat 的节点');
  };
  const createSkill = (ids) => {
    const current = target();
    if (!current) return;
    const request = canvasSelectionSkillRequest(current.nodes, ids, current.projectId);
    if (request) current.onSkillRequest?.(request);
    else current.notify?.('当前选择没有可用于创建 Skill 的节点');
  };
  const currentState =
    state.documentKey === props.documentKey
      ? state
      : { running: false, finished: 0, total: 0, groupId: undefined };
  const storyboardCreation = resolveStoryboardGridCreation({
    nodes: props.nodes,
    selectedIds: props.selected,
  });
  return {
    remove,
    duplicate,
    group,
    groupStoryboard,
    ungroup,
    layout,
    toolbarProps: {
      onLayoutChange: layout,
      onGroup: group,
      onGroupStoryboard: groupStoryboard,
      canStoryboardGroup: props.ready && !props.readonly && storyboardCreation.allowed,
      storyboardGroupDisabledReason: STORYBOARD_GRID_CREATION_DISABLED_REASON,
      onDuplicate: duplicate,
      onCreateAsset: (ids) => {
        if (target()) latest.current.setDialog({ saveSelectionIds: ids });
      },
      onDownloadAll: downloadAll,
      onCancelDownload: cancelDownload,
      isDownloading: currentState.running,
      canDownloadAll: canvasSelectionDownloadItems(props.nodes, props.selected).length > 0,
      onAddToChat: props.onAddToChat ? addToChat : undefined,
      onCreateSkill: props.onSkillRequest ? createSkill : undefined,
    },
    downloadState: currentState,
  };
}
