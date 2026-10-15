import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import {
  createScriptV2ImageConfigState,
  reconcileScriptV2ImageConfigState,
  changeScriptV2ImageConfigState,
  projectScriptV2ImageConfig,
  buildScriptV2ImageConfirmPayload,
} from './v2-image-config-model.js';
import {
  describeScriptV2ImageReferences,
  planCanvasScriptV2ImageGraph,
} from './v2-image-graph-model.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const emptyRows = [];

/** Owns the r3 form and local graph transaction, never a generation task. */
export function useScriptV2ImageConfiguration(props) {
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false),
    ownerRef = useRef(null);
  const [request, setRequest] = useState(null),
    [state, setState] = useState(null),
    [busy, setBusy] = useState(false),
    [pendingSave, setPendingSave] = useState(false),
    [error, setError] = useState(''),
    [configurationError, setConfigurationError] = useState('');
  const { documentKey, scriptId, modelContent, supportContent } = props;
  const current = useCallback((owner) => {
    const value = latest.current;
    if (
      !active.current ||
      !owner ||
      value.documentKey !== owner.documentKey ||
      value.scriptId !== owner.scriptId ||
      !value.ready ||
      value.readonly ||
      value.suspended ||
      value.selectionEligible === false
    )
      return null;
    const graph = value.getDocument?.();
    return graph?.documentKey === owner.documentKey &&
      graph.ready &&
      !graph.readonly &&
      graph.nodes?.some((node) => node.id === owner.scriptId && node.type === 'script-v2')
      ? graph
      : null;
  }, []);
  const close = useCallback((owner) => {
    if (!owner || ownerRef.current !== owner) return false;
    ownerRef.current = null;
    owner.operation?.abort();
    setRequest(null);
    setBusy(false);
    setPendingSave(false);
    return true;
  }, []);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      ownerRef.current?.operation?.abort();
      ownerRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (!request) return;
    const pagehide = () => close(ownerRef.current);
    window.addEventListener('pagehide', pagehide);
    return () => window.removeEventListener('pagehide', pagehide);
  }, [request, close]);
  const graph = request ? current(request) : null;
  const graphNodes = graph?.nodes;
  const descriptor = useMemo(
    () =>
      graphNodes
        ? describeScriptV2ImageReferences({ nodes: graphNodes, scriptId: request.scriptId })
        : null,
    [graphNodes, request],
  );
  const support = supportContent?.data?.items;
  const invalidCatalogue = Boolean(
    (modelContent?.data && !object(modelContent.data.imageModels)) ||
    (supportContent?.data &&
      (!Array.isArray(support) ||
        support.some((item) => !object(item) || typeof item.modelKey !== 'string'))),
  );
  const catalogStatus =
    modelContent?.error || supportContent?.error || invalidCatalogue
      ? 'error'
      : !modelContent?.data || !supportContent?.data
        ? 'loading'
        : 'ready';
  const context = useMemo(
    () => ({
      rows: descriptor?.rows || emptyRows,
      initialSelected: descriptor?.rows || emptyRows,
      models: modelContent?.data,
      support,
      refCounts: descriptor?.refCounts,
    }),
    [descriptor, modelContent?.data, support],
  );
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (!owner) return;
    if (!current(owner) || (!latest.current.enabled && !owner.committed)) {
      close(owner);
      return;
    }
    if (owner.committed || owner.operation || catalogStatus !== 'ready' || !descriptor?.valid)
      return;
    const result = owner.state
      ? reconcileScriptV2ImageConfigState({ ...context, state: owner.state })
      : createScriptV2ImageConfigState(context);
    if (!result?.valid) {
      setConfigurationError('图片参数配置无效，请重试加载模型。');
      return;
    }
    setConfigurationError('');
    if (result.state && result.state !== owner.state) {
      owner.state = result.state;
      setState(result.state);
    }
  }, [
    request,
    graph,
    descriptor,
    context,
    catalogStatus,
    props.enabled,
    props.ready,
    props.readonly,
    props.suspended,
    props.selectionEligible,
    documentKey,
    scriptId,
    current,
    close,
  ]);
  const open = (opener = document.activeElement) => {
    const value = latest.current;
    if (
      value.documentKey !== documentKey ||
      value.scriptId !== scriptId ||
      !value.enabled ||
      !current({ documentKey, scriptId })
    )
      return false;
    if (ownerRef.current && current(ownerRef.current)) return true;
    value.cancelOtherGestures?.();
    const owner = { documentKey, scriptId, opener, state: null, operation: null };
    ownerRef.current = owner;
    setRequest(owner);
    setState(null);
    setBusy(false);
    setPendingSave(false);
    setError('');
    setConfigurationError('');
    return true;
  };
  const change = (owner, command) => {
    if (
      ownerRef.current !== owner ||
      !current(owner) ||
      owner.operation ||
      owner.committed ||
      catalogStatus !== 'ready' ||
      !owner.state
    )
      return false;
    const result = changeScriptV2ImageConfigState({ ...context, state: owner.state, command });
    if (!result?.valid || !result.state) return false;
    owner.state = result.state;
    setState(result.state);
    setError('');
    return true;
  };
  const projection = useMemo(() => {
    const value = state ? projectScriptV2ImageConfig({ ...context, state }) : null;
    return configurationError && value ? { ...value, canConfirm: false } : value;
  }, [context, state, configurationError]);
  const finish = (owner, committed) => {
    const group = committed.nodes.find((node) => node.id === owner.committed.groupId);
    close(owner);
    latest.current.onCreated?.(group);
    latest.current.notify?.('分镜图组已保存到本机；生成服务未连接，未提交任务');
    // Unlike the video path, source tQ/sC does not close the parent editor or fit.
  };
  const submit = async (owner) => {
    let raw = current(owner);
    if (ownerRef.current !== owner || !raw || owner.operation) return false;
    if (!owner.committed && (catalogStatus !== 'ready' || !owner.state)) return false;
    latest.current.cancelOtherGestures?.();
    raw = current(owner);
    if (!raw) return false;
    const controller = new AbortController();
    owner.operation = controller;
    setBusy(true);
    setError('');
    try {
      if (owner.committed) {
        if (!raw.nodes.some((node) => node.id === owner.committed.groupId))
          throw new Error('分镜图组已移除，请重新打开配置');
        if (latest.current.flushGraph?.(raw) !== true)
          throw new Error('分镜图组已添加，但本机保存失败。释放空间后重试保存。');
        finish(owner, raw);
        return true;
      }
      // Re-read the raw graph at the action boundary; a caller may publish a
      // document before React renders its new reference counts or prompts.
      const fresh = describeScriptV2ImageReferences({ nodes: raw.nodes, scriptId: owner.scriptId });
      const freshContext = {
        rows: fresh.rows,
        models: latest.current.modelContent?.data,
        support: latest.current.supportContent?.data?.items,
        refCounts: fresh.refCounts,
        state: { ...owner.state, rows: fresh.rows },
      };
      const freshProjection = fresh.valid ? projectScriptV2ImageConfig(freshContext) : null;
      if (!freshProjection?.canConfirm)
        throw new Error('当前镜头或模型参数已变化，请检查选择后重试');
      const payload = buildScriptV2ImageConfirmPayload(freshContext);
      if (!payload?.config) throw new Error('图片参数无效，请调整后重试');
      const plan = planCanvasScriptV2ImageGraph({
        nodes: raw.nodes,
        edges: raw.edges,
        scriptId: owner.scriptId,
        selectedIndices: new Set(payload.selectedIndices),
        config: payload.config,
        modelSchema: freshProjection.schema,
        makeId: createLocalId,
      });
      if (!plan.ok) throw new Error(plan.message || plan.reason || '分镜图组创建失败');
      const latestGraph = current(owner);
      if (
        ownerRef.current !== owner ||
        controller.signal.aborted ||
        latestGraph?.nodes !== raw.nodes ||
        latestGraph?.edges !== raw.edges ||
        latestGraph?.models !== raw.models
      )
        return false;
      const patches = new Map(plan.nodePatches.map((patch) => [patch.nodeId, patch.data]));
      const next = {
        ...raw,
        nodes: [
          ...raw.nodes.map((node) =>
            patches.has(node.id)
              ? { ...node, data: { ...node.data, ...patches.get(node.id) } }
              : node,
          ),
          ...plan.addedNodes,
        ],
        edges: [...raw.edges, ...plan.addedEdges],
      };
      if (latest.current.commitGraph?.(next, { expectedGraph: raw }) !== true)
        throw new Error('画布已经变化，请重试创建分镜图组');
      owner.committed = { groupId: plan.groupId };
      setPendingSave(true);
      const committed = latest.current.getDocument();
      if (latest.current.flushGraph?.(committed) !== true) {
        throw new Error('分镜图组已添加，但本机保存失败。释放空间后重试保存。');
      }
      finish(owner, committed);
      return true;
    } catch (failure) {
      if (!controller.signal.aborted && ownerRef.current === owner && current(owner))
        setError(failure?.message || '分镜图组创建失败');
      return false;
    } finally {
      if (ownerRef.current === owner && owner.operation === controller) {
        owner.operation = null;
        setBusy(false);
      }
    }
  };
  return {
    open,
    request: graph && ownerRef.current === request ? request : null,
    props: {
      opened: Boolean(graph && ownerRef.current === request),
      rows: context.rows,
      state,
      projection,
      busy,
      pendingSave,
      error:
        error ||
        configurationError ||
        (descriptor && !descriptor.valid ? '当前脚本数据无效，请重新打开配置。' : ''),
      catalogStatus: configurationError ? 'error' : catalogStatus,
      onChange: (command) => change(request, command),
      onClose: () => close(request),
      onConfirm: () => submit(request),
      onRetryCatalog: () =>
        Promise.allSettled([
          Promise.resolve().then(() => latest.current.modelContent?.reload?.()),
          Promise.resolve().then(() => latest.current.supportContent?.reload?.()),
        ]),
    },
  };
}
