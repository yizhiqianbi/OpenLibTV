import { useLayoutEffect, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { createLocalId } from '../../editor/model.js';
import { canvasWorldPosition, canvasNodeSize } from '../domain/groups.js';
import { canvasBatchVideoFocusView } from '../domain/batch-video-viewport-model.js';
import {
  resolveStoryboardBatchVideoShots,
  initialStoryboardBatchVideoConfig,
  reconcileStoryboardBatchVideoConfig,
  switchStoryboardBatchVideoModel,
  storyboardBatchVideoModelKeys,
  buildStoryboardBatchVideoFeeRequest,
  projectStoryboardBatchVideoFee,
  storyboardBatchVideoReasonLabel,
} from '../storyboard/batch-video-config-model.js';
import { planCanvasBatchVideoGraph } from '../storyboard/batch-video-graph-model.js';

/** Local configuration owns cancellation; creating generators never submits a generation task. */
export function useCanvasBatchVideo(props) {
  const latest = useRef(props);
  latest.current = props;
  const mounted = useRef(false),
    ownerRef = useRef(null),
    postCommit = useRef(null);
  const [request, setRequest] = useState(null),
    [config, setConfig] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pendingSave, setPendingSave] = useState(false),
    [feeState, setFeeState] = useState({ status: 'unavailable', cost: '-' });
  const { documentKey, ready, readonly, nodes, selected, suspended, modelContent, supportContent } =
    props;
  const clearPostCommit = useCallback(() => {
    clearTimeout(postCommit.current?.timer);
    postCommit.current = null;
  }, []);
  const current = useCallback((owner) => {
    const state = latest.current,
      graph = state.getDocument?.();
    return mounted.current &&
      state.documentKey === owner?.documentKey &&
      state.ready &&
      !state.readonly &&
      !state.suspended &&
      graph?.documentKey === owner.documentKey &&
      graph.ready &&
      !graph.readonly
      ? graph
      : null;
  }, []);
  const close = useCallback(
    (owner, { restoreFocus = true, restoreViewport = true } = {}) => {
      if (!owner || ownerRef.current !== owner) return false;
      ownerRef.current = null;
      owner.operation?.abort();
      owner.feeController?.abort();
      setRequest(null);
      setBusy(false);
      setPendingSave(false);
      const graph = current(owner);
      if (graph && restoreViewport && owner.originalView)
        latest.current.focusView?.(owner.originalView, { duration: 300 });
      if (graph && restoreFocus && owner.opener?.isConnected) owner.opener.focus();
      return true;
    },
    [current],
  );
  useLayoutEffect(() => {
    mounted.current = true;
    const pagehide = () => {
      if (ownerRef.current)
        close(ownerRef.current, { restoreFocus: false, restoreViewport: false });
      clearPostCommit();
    };
    window.addEventListener('pagehide', pagehide);
    return () => {
      window.removeEventListener('pagehide', pagehide);
      mounted.current = false;
      ownerRef.current?.operation?.abort();
      ownerRef.current?.feeController?.abort();
      ownerRef.current = null;
      clearPostCommit();
    };
  }, [close, clearPostCommit]);
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (
      owner &&
      (!current(owner) ||
        (owner.operation &&
          (modelContent?.error ||
            supportContent?.error ||
            owner.operationSource !== props.source ||
            owner.operationSupport !== supportContent?.data ||
            owner.operationModels !== modelContent?.data)) ||
        selected?.length !== 1 ||
        selected[0] !== owner.groupId ||
        !nodes.some((node) => node.id === owner.groupId))
    )
      close(owner, { restoreFocus: false });
    const after = postCommit.current;
    if (
      after &&
      (!ready ||
        readonly ||
        suspended ||
        documentKey !== after.documentKey ||
        selected?.length !== after.selected.length ||
        selected?.some((id, index) => id !== after.selected[index]))
    )
      clearPostCommit();
  }, [
    documentKey,
    ready,
    readonly,
    nodes,
    selected,
    suspended,
    props.source,
    supportContent?.data,
    modelContent?.data,
    modelContent?.error,
    supportContent?.error,
    close,
    current,
    clearPostCommit,
  ]);
  useLayoutEffect(() => {
    const element = props.board?.current;
    const cancelPendingFocus = () => clearPostCommit();
    element?.addEventListener?.('pointerdown', cancelPendingFocus, true);
    return () => element?.removeEventListener?.('pointerdown', cancelPendingFocus, true);
  }, [props.board, clearPostCommit]);

  const graph = request ? current(request) : null;
  const graphNodes = graph?.nodes;
  const shots = useMemo(
    () =>
      graphNodes
        ? resolveStoryboardBatchVideoShots({ nodes: graphNodes, groupId: request.groupId })
        : null,
    [graphNodes, request],
  );
  const support = supportContent?.data?.items;
  const catalogInvalid = Boolean(
    (modelContent?.data &&
      (!modelContent.data.videoModels ||
        typeof modelContent.data.videoModels !== 'object' ||
        Array.isArray(modelContent.data.videoModels))) ||
    (supportContent?.data &&
      (!Array.isArray(support) || storyboardBatchVideoModelKeys(support) === null)),
  );
  const catalogReady = Boolean(
    modelContent?.data &&
    supportContent?.data &&
    !modelContent?.error &&
    !supportContent?.error &&
    !catalogInvalid,
  );
  const normalized = useCallback((value, owner, switching = false) => {
    const state = latest.current;
    const context = {
      models: state.modelContent?.data,
      support: state.supportContent?.data?.items,
      firstChildDimensions: owner.firstChildDimensions,
      normalize: true,
    };
    return switching
      ? switchStoryboardBatchVideoModel({ ...context, config: owner.config, model: value.model })
      : reconcileStoryboardBatchVideoConfig({ ...context, config: value });
  }, []);
  const firstChildWidth = shots?.firstChildDimensions?.width;
  const firstChildHeight = shots?.firstChildDimensions?.height;
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (!owner || owner !== request || !catalogReady || owner.committed) return;
    owner.firstChildDimensions =
      firstChildWidth != null && firstChildHeight != null
        ? { width: firstChildWidth, height: firstChildHeight }
        : undefined;
    const initial =
      owner.config ||
      initialStoryboardBatchVideoConfig({
        models: modelContent.data,
        support,
        initialImageSettings: owner.initialImageSettings,
        firstChildDimensions: owner.firstChildDimensions,
      });
    const next = normalized(initial, owner);
    if (next && next !== owner.config) {
      owner.config = next;
      setConfig(next);
    }
  }, [
    request,
    catalogReady,
    modelContent?.data,
    support,
    firstChildWidth,
    firstChildHeight,
    normalized,
  ]);

  const open = (groupId, opener = document.activeElement) => {
    const state = latest.current;
    if (!mounted.current || state.documentKey !== documentKey) return false;
    const graph = current({ documentKey });
    if (!graph || state.selected?.length !== 1 || state.selected[0] !== groupId) return false;
    if (ownerRef.current?.groupId === groupId && current(ownerRef.current)) return true;
    const found = resolveStoryboardBatchVideoShots({ nodes: graph.nodes, groupId });
    if (!found?.valid || !found.enabled) {
      state.notify?.(storyboardBatchVideoReasonLabel(found?.reason) || '当前分镜组不能创建视频组');
      return false;
    }
    if (ownerRef.current) close(ownerRef.current, { restoreFocus: false });
    clearPostCommit();
    state.cancelOtherGestures?.();
    const originalView = state.getView?.();
    const owner = {
      id: createLocalId(),
      documentKey,
      groupId,
      originalView:
        originalView && Number.isFinite(originalView.x + originalView.y + originalView.z)
          ? { ...originalView }
          : null,
      initialImageSettings: found.initialImageSettings,
      firstChildDimensions: found.firstChildDimensions,
      opener,
      config: null,
    };
    ownerRef.current = owner;
    setRequest(owner);
    setConfig(null);
    setError('');
    setBusy(false);
    setPendingSave(false);
    setFeeState({ status: 'unavailable', cost: '-' });
    const container = state.board?.current?.getBoundingClientRect();
    const nextView = canvasBatchVideoFocusView({ nodes: graph.nodes, groupId, container });
    if (nextView) state.focusView?.(nextView, { duration: 300 });
    return true;
  };
  const change = (owner, nextConfig) => {
    if (ownerRef.current !== owner || !current(owner) || owner.operation || owner.committed) return;
    const next = normalized(nextConfig, owner, nextConfig.model !== owner.config?.model);
    if (!next) return;
    owner.config = next;
    setConfig(next);
    setError('');
  };
  const schema = modelContent?.data?.videoModels?.[config?.model];
  const feeModel = config?.model;
  const feeMode = config?.modeType;
  const feeSettings = JSON.stringify(config?.settings ?? {});
  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner || owner !== request || !feeModel || !catalogReady || !schema) return;
    const source = latest.current.source;
    if (typeof source?.estimatePower !== 'function') {
      setFeeState({ status: 'unavailable', cost: '-', reason: '费用服务未连接' });
      return;
    }
    const controller = new AbortController();
    owner.feeController = controller;
    setFeeState({ status: 'loading', cost: '-' });
    const timer = setTimeout(async () => {
      try {
        const value = buildStoryboardBatchVideoFeeRequest({
          config: owner.config,
          schema,
          nodeId: owner.groupId,
          projectId: latest.current.projectId,
          requestId: createLocalId(),
        });
        const response = await source.estimatePower(value, { signal: controller.signal });
        if (controller.signal.aborted || ownerRef.current !== owner || !current(owner)) return;
        if (response?.code !== 0) throw new Error('费用暂时不可用');
        setFeeState({
          status: 'ready',
          feeResult: {
            power: response.data?.power ?? 0,
            originalPrice: response.data?.originalPrice,
          },
        });
      } catch (failure) {
        if (!controller.signal.aborted && ownerRef.current === owner && current(owner))
          setFeeState({ status: 'error', cost: '-', reason: failure?.message || '费用暂时不可用' });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (owner.feeController === controller) owner.feeController = null;
    };
  }, [
    request,
    feeModel,
    feeMode,
    feeSettings,
    catalogReady,
    schema,
    props.source,
    props.projectId,
    current,
  ]);

  const finishSaved = (owner, committed) => {
    const created = committed.nodes.find((node) => node.id === owner.committed.groupId);
    close(owner, { restoreFocus: false });
    const after = {
      documentKey: owner.documentKey,
      group: created,
      selected: [...latest.current.selected],
      timer: null,
    };
    postCommit.current = after;
    after.timer = setTimeout(() => {
      const graph = current(after);
      if (postCommit.current !== after) return;
      postCommit.current = null;
      if (!graph || !graph.nodes.includes(after.group)) return;
      latest.current.setSelected?.([after.group.id]);
      latest.current.focusCreatedGroup?.(after.group.id, graph.nodes);
    }, 100);
    latest.current.notify?.('视频组已保存到本机；生成服务未连接，未提交任务');
  };
  const submit = async (owner) => {
    let graph = current(owner);
    if (ownerRef.current !== owner || !graph || owner.operation) return false;
    if (owner.committed) {
      if (!graph.nodes.some((node) => node.id === owner.committed.groupId)) {
        setError('视频组已移除，请重新打开配置');
        return false;
      }
      if (latest.current.flushGraph?.(graph) !== true) {
        setError('视频组已添加，但本机保存失败。释放空间后重试保存。');
        return false;
      }
      finishSaved(owner, graph);
      return true;
    }
    if (!catalogReady || !schema || !owner.config) return false;
    latest.current.cancelOtherGestures?.();
    graph = current(owner);
    if (!graph) return false;
    const controller = new AbortController();
    const operationSource = latest.current.source;
    const operationSupport = latest.current.supportContent?.data;
    owner.operationSource = operationSource;
    owner.operationSupport = operationSupport;
    owner.operationModels = latest.current.modelContent?.data;
    owner.operation = controller;
    setBusy(true);
    setError('');
    const belongs = () => {
      const next = current(owner);
      return (
        ownerRef.current === owner &&
        !controller.signal.aborted &&
        !latest.current.modelContent?.error &&
        !latest.current.supportContent?.error &&
        latest.current.source === operationSource &&
        latest.current.supportContent?.data === operationSupport &&
        next?.nodes === graph.nodes &&
        next?.edges === graph.edges &&
        next?.models === graph.models
      );
    };
    try {
      const configuration = { ...owner.config, modelSchema: schema };
      let plan = planCanvasBatchVideoGraph({
        nodes: graph.nodes,
        edges: graph.edges,
        imageGroupId: owner.groupId,
        config: configuration,
        makeId: createLocalId,
        nowMs: Date.now(),
      });
      if (!plan.ok && plan.portraitRequired?.length && operationSource?.checkPortrait) {
        const portraitResults = await operationSource.checkPortrait(
          {
            projectId: latest.current.projectId,
            nodeId: owner.groupId,
            model: configuration.model,
            images: plan.portraitRequired,
          },
          { signal: controller.signal },
        );
        if (!belongs()) return false;
        plan = planCanvasBatchVideoGraph({
          nodes: graph.nodes,
          edges: graph.edges,
          imageGroupId: owner.groupId,
          config: configuration,
          makeId: createLocalId,
          nowMs: Date.now(),
          portraitResults,
        });
      }
      if (!belongs()) return false;
      if (!plan.ok)
        throw new Error(
          (['stale-image-group', 'no-children'].includes(plan.reason) &&
            storyboardBatchVideoReasonLabel(plan.reason)) ||
            plan.message ||
            storyboardBatchVideoReasonLabel(plan.reason) ||
            '视频组创建失败',
        );
      const patches = new Map(plan.nodePatches.map((patch) => [patch.nodeId, patch.data]));
      const next = {
        ...graph,
        nodes: [
          ...graph.nodes.map((node) =>
            patches.has(node.id)
              ? { ...node, data: { ...node.data, ...patches.get(node.id) } }
              : node,
          ),
          ...plan.addedNodes,
        ],
        edges: [...graph.edges, ...plan.addedEdges],
      };
      if (latest.current.commitGraph?.(next, { expectedGraph: graph }) !== true)
        throw new Error('画布已经变化，请重试创建视频组');
      owner.committed = { groupId: plan.groupId };
      const committed = latest.current.getDocument();
      if (latest.current.flushGraph?.(committed) !== true) {
        setPendingSave(true);
        throw new Error('视频组已添加，但本机保存失败。释放空间后重试保存。');
      }
      finishSaved(owner, committed);
      return true;
    } catch (failure) {
      if (!controller.signal.aborted && ownerRef.current === owner && current(owner))
        setError(failure?.message || '视频组创建失败');
      return false;
    } finally {
      if (ownerRef.current === owner && owner.operation === controller) {
        owner.operation = null;
        setBusy(false);
      }
    }
  };
  const group = graph?.nodes.find((node) => node.id === request.groupId);
  const bounds = group
    ? {
        ...canvasWorldPosition(group, new Map(graph.nodes.map((node) => [node.id, node]))),
        ...canvasNodeSize(group),
      }
    : null;
  const catalogue = useMemo(() => {
    const modelKeys = storyboardBatchVideoModelKeys(support) || [];
    const metadata = new Map(
      (Array.isArray(support) ? support : []).map((item) => [item.modelKey, item]),
    );
    const menuModels = Object.fromEntries(
      modelKeys.map((key) => {
        const value = modelContent?.data?.videoModels?.[key];
        return [key, { ...value, ...metadata.get(key), disabled: !value || !!value.disabled }];
      }),
    );
    return { modelKeys, menuModels };
  }, [support, modelContent?.data]);
  const disabledReason =
    !ready || readonly || suspended
      ? '当前画布不可编辑'
      : pendingSave
        ? ''
        : modelContent?.error || supportContent?.error || catalogInvalid
          ? '模型配置加载失败'
          : !catalogReady || !schema
            ? '模型配置尚未就绪'
            : !shots?.enabled
              ? storyboardBatchVideoReasonLabel(shots?.reason) || '没有可用分镜图'
              : '';
  return {
    open,
    request: group && ownerRef.current === request ? request : null,
    props: {
      bounds,
      config: config || { model: '', settings: {}, advancedSettings: {} },
      schema,
      modelKeys: catalogue.modelKeys,
      models: catalogue.menuModels,
      busy,
      pendingSave,
      error,
      readyCount: shots?.readyCount || 0,
      feeState: {
        ...feeState,
        ...projectStoryboardBatchVideoFee({
          feeResult: feeState.feeResult,
          totalCount: shots?.readyCount || 0,
        }),
      },
      disabledReason,
      submitLabel: pendingSave ? '重试保存' : '创建视频组',
      onRetry: () =>
        Promise.allSettled([
          Promise.resolve().then(() => latest.current.modelContent?.reload?.()),
          Promise.resolve().then(() => latest.current.supportContent?.reload?.()),
        ]),
      onConfigChange: (value) => change(request, value),
      onClose: (options) => close(request, options),
      onSubmit: () => submit(request),
    },
  };
}
