import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { renumberStoryboardRows } from './rows.js';
import { scriptNodeState } from './script-model.js';
import {
  createScriptV2VideoConfigState,
  reconcileScriptV2VideoConfigState,
  changeScriptV2VideoConfigState,
  projectScriptV2VideoConfig,
  buildScriptV2VideoConfirmPayload,
} from './v2-video-config-model.js';
import {
  describeScriptV2VideoReferences,
  planCanvasScriptV2VideoGraph,
} from './v2-video-graph-model.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const emptyRows = [];

/** ScriptV2 owns a configuration request, never a generation or authentication session. */
export function useScriptV2VideoConfiguration(props) {
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false),
    ownerRef = useRef(null),
    postCommit = useRef(null);
  const [request, setRequest] = useState(null),
    [state, setState] = useState(null),
    [busy, setBusy] = useState(false),
    [pendingSave, setPendingSave] = useState(false),
    [configurationError, setConfigurationError] = useState(''),
    [error, setError] = useState('');
  const { documentKey, scriptId, modelContent, supportContent } = props;
  const current = useCallback((owner) => {
    const value = latest.current,
      graph = value.getDocument?.();
    return active.current &&
      owner &&
      value.documentKey === owner.documentKey &&
      value.scriptId === owner.scriptId &&
      value.ready &&
      !value.readonly &&
      !value.suspended &&
      graph?.documentKey === owner.documentKey &&
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
  const cancelFocus = useCallback(() => {
    const after = postCommit.current;
    clearTimeout(after?.timer);
    after?.board?.removeEventListener('pointerdown', after.cancel, true);
    if (after) window.removeEventListener('pagehide', after.cancel);
    postCommit.current = null;
  }, []);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      ownerRef.current?.operation?.abort();
      ownerRef.current = null;
      cancelFocus();
    };
  }, [cancelFocus]);
  useLayoutEffect(() => {
    if (!request) return;
    const pagehide = () => {
      close(ownerRef.current);
      cancelFocus();
    };
    window.addEventListener('pagehide', pagehide);
    return () => window.removeEventListener('pagehide', pagehide);
  }, [request, close, cancelFocus]);
  useLayoutEffect(() => {
    const after = postCommit.current;
    if (
      after &&
      (!current(after) ||
        props.selected?.length !== after.selected?.length ||
        props.selected?.some((id, index) => id !== after.selected[index]))
    )
      cancelFocus();
  }, [
    documentKey,
    scriptId,
    props.ready,
    props.readonly,
    props.suspended,
    props.selected,
    current,
    cancelFocus,
  ]);

  const graph = request ? current(request) : null;
  const graphNodes = graph?.nodes;
  const descriptor = useMemo(
    () =>
      graphNodes
        ? describeScriptV2VideoReferences({ nodes: graphNodes, scriptId: request.scriptId })
        : null,
    [graphNodes, request],
  );
  const support = supportContent?.data?.items;
  const catalogInvalid = Boolean(
    (modelContent?.data && !object(modelContent.data.videoModels)) ||
    (supportContent?.data &&
      (!Array.isArray(support) ||
        support.some((item) => !object(item) || typeof item.modelKey !== 'string'))),
  );
  const catalogStatus =
    modelContent?.error || supportContent?.error || catalogInvalid
      ? 'error'
      : !modelContent?.data || !supportContent?.data
        ? 'loading'
        : 'ready';
  const rows = useMemo(
    () =>
      descriptor?.rows
        ? scriptNodeState(descriptor.script) === 'resource'
          ? renumberStoryboardRows(descriptor.rows)
          : descriptor.rows
        : emptyRows,
    [descriptor],
  );
  const requiredRefs = state?.selectedHiddenUuids
    ? [...state.selectedHiddenUuids].reduce(
        (max, id) => Math.max(max, descriptor?.refCounts?.get(id) || 0),
        0,
      )
    : descriptor?.maxRequiredRefs || 0;
  const context = useMemo(
    () => ({
      rows,
      models: modelContent?.data,
      support,
      requiredRefs,
      refCounts: descriptor?.refCounts,
      assetsReady: descriptor?.assetReadiness?.ready === true,
      referenceDescription: descriptor,
      // The actual ScriptV2 source caller explicitly supplies no image settings.
      initialImageSettings: undefined,
    }),
    [rows, modelContent?.data, support, descriptor, requiredRefs],
  );
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (!owner) return;
    if (!current(owner) || (!latest.current.enabled && !owner.committed)) {
      close(owner);
      return;
    }
    const operation = owner.operation;
    if (
      operation &&
      (latest.current.source !== owner.operationSource ||
        modelContent?.data !== owner.operationModels ||
        supportContent?.data !== owner.operationSupport ||
        catalogStatus !== 'ready' ||
        graph?.nodes !== owner.operationGraph.nodes ||
        graph?.edges !== owner.operationGraph.edges)
    ) {
      operation.abort();
      owner.operation = null;
      setBusy(false);
      setError('画布或服务配置已变化，请重新确认。');
    }
    if (owner.committed || owner.operation || catalogStatus !== 'ready' || !descriptor?.valid)
      return;
    const result = owner.state
      ? reconcileScriptV2VideoConfigState({ ...context, state: owner.state })
      : createScriptV2VideoConfigState(context);
    if (!result?.valid) {
      setConfigurationError('视频参数配置无效，请重试加载模型。');
      return;
    }
    setConfigurationError('');
    const next = result?.state;
    if (next && next !== owner.state) {
      owner.state = next;
      setState(next);
    }
  }, [
    request,
    graph,
    descriptor,
    context,
    catalogStatus,
    modelContent?.data,
    supportContent?.data,
    props.source,
    props.enabled,
    props.ready,
    props.readonly,
    props.suspended,
    documentKey,
    scriptId,
    current,
    close,
  ]);
  const open = (opener = document.activeElement) => {
    const value = latest.current;
    if (value.documentKey !== documentKey || value.scriptId !== scriptId || !value.enabled)
      return false;
    const found = current({ documentKey, scriptId });
    if (!found) return false;
    if (ownerRef.current && current(ownerRef.current)) return true;
    cancelFocus();
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
    const result = changeScriptV2VideoConfigState({ ...context, state: owner.state, command });
    if (!result?.valid) return false;
    const next = result?.state;
    if (!next) return false;
    owner.state = next;
    setState(next);
    setError('');
    return true;
  };
  const projection = useMemo(() => {
    const value = state ? projectScriptV2VideoConfig({ ...context, state }) : null;
    return configurationError && value ? { ...value, canConfirm: false } : value;
  }, [context, state, configurationError]);
  const finish = (owner, savedGraph) => {
    const group = savedGraph.nodes.find((node) => node.id === owner.committed.groupId);
    close(owner);
    latest.current.onCreated?.(group);
    if (group) {
      const after = {
        documentKey: owner.documentKey,
        scriptId: owner.scriptId,
        group,
        selected: latest.current.selected ? [...latest.current.selected] : undefined,
        board: latest.current.board?.current,
        cancel: cancelFocus,
      };
      postCommit.current = after;
      after.board?.addEventListener('pointerdown', cancelFocus, true);
      window.addEventListener('pagehide', cancelFocus);
      after.timer = setTimeout(() => {
        const currentGraph = current(after);
        if (postCommit.current !== after) return;
        cancelFocus();
        if (!currentGraph?.nodes.includes(group)) return;
        latest.current.setSelected?.([group.id]);
        latest.current.focusCreatedGroup?.(group.id, currentGraph.nodes);
      }, 100);
    }
    const warnings = (owner.committed.warnings || []).flatMap((warning) =>
      warning.key === 'canvas:storyboardVideoRefUnsupportedByModel'
        ? [
            `ScriptV2 批量生视频仅支持 mixed2video，${warning.values.shotCount} 个分镜共 ${warning.values.refCount} 张参考图未生效。请切换支持 mixed2video 的模型`,
          ]
        : [],
    );
    latest.current.notify?.(
      ['视频组已保存到本机；生成服务未连接，未提交任务', ...warnings].join('\n'),
    );
  };
  const submit = async (owner) => {
    let initialGraph = current(owner);
    if (ownerRef.current !== owner || !initialGraph || owner.operation) return false;
    if (owner.committed) {
      if (!initialGraph.nodes.some((node) => node.id === owner.committed.groupId)) {
        setError('视频组已移除，请重新打开配置');
        return false;
      }
      if (latest.current.flushGraph?.(initialGraph) !== true) {
        setError('视频组已添加，但本机保存失败。释放空间后重试保存。');
        return false;
      }
      finish(owner, initialGraph);
      return true;
    }
    if (catalogStatus !== 'ready' || !projection?.canConfirm || !owner.state) return false;
    latest.current.cancelOtherGestures?.();
    initialGraph = current(owner);
    if (!initialGraph) return false;
    const controller = new AbortController();
    owner.operation = controller;
    owner.operationGraph = initialGraph;
    owner.operationSource = latest.current.source;
    owner.operationModels = latest.current.modelContent?.data;
    owner.operationSupport = latest.current.supportContent?.data;
    setBusy(true);
    setError('');
    const belongs = () => {
      const value = latest.current,
        next = current(owner);
      return (
        ownerRef.current === owner &&
        owner.operation === controller &&
        !controller.signal.aborted &&
        !value.modelContent?.error &&
        !value.supportContent?.error &&
        value.source === owner.operationSource &&
        value.modelContent?.data === owner.operationModels &&
        value.supportContent?.data === owner.operationSupport &&
        next?.nodes === initialGraph.nodes &&
        next?.edges === initialGraph.edges &&
        next?.models === initialGraph.models
      );
    };
    try {
      const payload = buildScriptV2VideoConfirmPayload({
        state: owner.state,
        schema: projection.schema,
        requiredRefs: context.requiredRefs,
      });
      if (!payload?.config) throw new Error('视频参数无效，请调整后重试');
      const planInput = {
        nodes: initialGraph.nodes,
        edges: initialGraph.edges,
        scriptId: owner.scriptId,
        config: { ...payload.config, modelSchema: projection.schema },
        perShotDurations: payload.perShotDurations,
        selectedHiddenUuids: payload.selectedHiddenUuids,
        makeId: createLocalId,
        nowMs: Date.now(),
      };
      let plan = planCanvasScriptV2VideoGraph(planInput);
      if (!plan.ok && plan.portraitRequired?.length) {
        if (typeof owner.operationSource?.checkV2Portrait !== 'function')
          throw new Error('此模型需要审核参考资产，审核服务未连接。配置已保留，可选择其他模型。');
        const portraitResults = await owner.operationSource.checkV2Portrait(
          {
            projectId: latest.current.projectId,
            nodeId: owner.scriptId,
            model: payload.config.model,
            images: plan.portraitRequired,
          },
          { signal: controller.signal },
        );
        if (!belongs()) return false;
        plan = planCanvasScriptV2VideoGraph({ ...planInput, nowMs: Date.now(), portraitResults });
      }
      if (!belongs()) return false;
      if (!plan.ok) throw new Error(plan.message || plan.reason || '视频组创建失败');
      const patches = new Map(plan.nodePatches.map((patch) => [patch.nodeId, patch.data]));
      const next = {
        ...initialGraph,
        nodes: [
          ...initialGraph.nodes.map((node) =>
            patches.has(node.id)
              ? { ...node, data: { ...node.data, ...patches.get(node.id) } }
              : node,
          ),
          ...plan.addedNodes,
        ],
        edges: [...initialGraph.edges, ...plan.addedEdges],
      };
      if (latest.current.commitGraph?.(next, { expectedGraph: initialGraph }) !== true)
        throw new Error('画布已经变化，请重试创建视频组');
      owner.committed = { groupId: plan.groupId, warnings: plan.warnings };
      const committed = latest.current.getDocument();
      if (latest.current.flushGraph?.(committed) !== true) {
        setPendingSave(true);
        throw new Error('视频组已添加，但本机保存失败。释放空间后重试保存。');
      }
      finish(owner, committed);
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
  return {
    open,
    request: graph && ownerRef.current === request ? request : null,
    props: {
      opened: Boolean(graph && ownerRef.current === request),
      rows,
      state,
      projection,
      busy,
      pendingSave,
      error:
        error ||
        configurationError ||
        (descriptor && !descriptor.valid ? '当前脚本数据无效，请重新打开配置。' : ''),
      catalogStatus: configurationError ? 'error' : catalogStatus,
      requiresPortraitAudit: Boolean(
        projection?.schema?.properties?.portrait === true ||
        projection?.schema?.modelVendor?.startsWith?.('star-video2'),
      ),
      onChange: (command) => change(request, command),
      onClose: () => close(request),
      onConfirm: () => submit(request),
      onRetryCatalog: () =>
        Promise.allSettled([
          Promise.resolve().then(() => latest.current.modelContent?.reload?.()),
          Promise.resolve().then(() => latest.current.supportContent?.reload?.()),
        ]),
      getPrompt: (row) => descriptor?.refsByRow?.get(row.hiddenUuid)?.previewPrompt || '',
    },
  };
}
