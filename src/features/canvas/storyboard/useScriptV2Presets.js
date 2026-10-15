import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { projectScriptV2Card } from './script-card-model.js';
import { buildScriptV2PresetPlan, validateScriptV2Presets } from './script-preset-model.js';

/** Owns source tL/t_ reference creation, one graph transaction and local save retry. */
export function useScriptV2Presets(props) {
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false),
    ownerRef = useRef(null);
  const [busy, setBusy] = useState(false),
    [pendingSave, setPendingSave] = useState(false),
    [error, setError] = useState('');
  const content = props.content;
  const { documentKey, scriptId } = props;
  const catalogue = useMemo(() => validateScriptV2Presets(content?.data), [content?.data]);
  const catalogStatus =
    content?.error || (content?.data && !catalogue.valid)
      ? 'error'
      : content?.loading || !content?.data
        ? 'loading'
        : 'ready';
  const current = useCallback((owner) => {
    const value = latest.current;
    if (
      !active.current ||
      !owner ||
      value.documentKey !== owner.documentKey ||
      value.scriptId !== owner.scriptId ||
      !value.ready ||
      value.readonly ||
      value.suspended
    )
      return null;
    const graph = value.getDocument?.();
    if (
      graph?.documentKey !== owner.documentKey ||
      graph.ready !== true ||
      graph.readonly !== false ||
      !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.edges) ||
      !graph.nodes.some((node) => node.id === owner.scriptId && node.type === 'script-v2')
    )
      return null;
    if (
      owner.committed &&
      (!owner.nodeIds.every((id) => graph.nodes.some((node) => node.id === id)) ||
        !owner.edgeIds.every((id) => graph.edges.some((edge) => edge.id === id)))
    )
      return null;
    return graph;
  }, []);
  const retire = useCallback((owner) => {
    if (ownerRef.current !== owner) return;
    ownerRef.current = null;
    setBusy(false);
    setPendingSave(false);
    setError('');
  }, []);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      ownerRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const owner = ownerRef.current;
    if (owner && !current(owner)) retire(owner);
  });
  const save = (owner) => {
    const graph = current(owner);
    if (ownerRef.current !== owner || !owner.committed || !graph) return false;
    if (latest.current.flushGraph?.(graph) !== true)
      throw new Error('参考节点已添加，但本机保存失败。释放空间后重试保存。');
    retire(owner);
    latest.current.notify?.('参考节点已保存到本机；脚本生成暂未接入，未提交任务');
    return true;
  };
  const create = (kind) => {
    const value = latest.current;
    if (
      !['scriptToStoryboard', 'characterToStoryboard'].includes(kind) ||
      value.documentKey !== documentKey ||
      value.scriptId !== scriptId ||
      ownerRef.current ||
      !value.enabled ||
      value.content?.error ||
      value.content?.loading ||
      !validateScriptV2Presets(value.content?.data).actions?.[kind]?.enabled
    )
      return false;
    const owner = { documentKey: value.documentKey, scriptId: value.scriptId };
    let raw = current(owner);
    if (!raw) return false;
    ownerRef.current = owner;
    setBusy(true);
    setError('');
    try {
      value.cancelOtherGestures?.();
      raw = current(owner);
      if (!raw) {
        retire(owner);
        return false;
      }
      const script = raw.nodes.find((node) => node.id === owner.scriptId);
      const card = projectScriptV2Card({ node: script, nodes: raw.nodes, edges: raw.edges });
      if (!card.valid || card.kind !== 'empty_generate') {
        retire(owner);
        return false;
      }
      const plan = buildScriptV2PresetPlan({
        kind,
        script,
        nodes: raw.nodes,
        edges: raw.edges,
        presets: value.content?.data,
        makeId: value.makeId || createLocalId,
      });
      if (!plan.valid) throw new Error('参考节点配置无效，原画布已保留。请重试加载示例。');
      const next = {
        ...raw,
        nodes: [
          ...plan.addedNodes,
          ...raw.nodes.map((node) =>
            node === script && plan.scriptPatch
              ? { ...node, data: { ...node.data, ...plan.scriptPatch } }
              : node,
          ),
        ],
        edges: [...raw.edges, ...plan.addedEdges],
      };
      if (ownerRef.current !== owner || !current(owner)) return false;
      if (latest.current.commitGraph?.(next, { expectedGraph: raw }) !== true)
        throw new Error('画布已经变化，参考节点未添加。请重试。');
      owner.committed = true;
      owner.nodeIds = plan.addedNodes.map((node) => node.id);
      owner.edgeIds = plan.addedEdges.map((edge) => edge.id);
      setPendingSave(true);
      return save(owner);
    } catch (failure) {
      if (ownerRef.current === owner && current(owner)) {
        setError(failure?.message || '参考节点创建失败，请重试');
        if (!owner.committed) ownerRef.current = null;
      }
      return false;
    } finally {
      if (ownerRef.current === owner && !current(owner)) retire(owner);
      if (active.current && latest.current.documentKey === owner.documentKey) setBusy(false);
    }
  };
  const retrySave = () => {
    const owner = ownerRef.current;
    if (
      latest.current.documentKey !== documentKey ||
      latest.current.scriptId !== scriptId ||
      !owner?.committed ||
      owner.saving ||
      !current(owner)
    )
      return false;
    owner.saving = true;
    setBusy(true);
    setError('');
    try {
      return save(owner);
    } catch (failure) {
      if (ownerRef.current === owner && current(owner))
        setError(failure?.message || '本机保存失败，请重试');
      return false;
    } finally {
      owner.saving = false;
      if (ownerRef.current === owner && !current(owner)) retire(owner);
      if (active.current && latest.current.documentKey === owner.documentKey) setBusy(false);
    }
  };
  return {
    create,
    retrySave,
    busy,
    pendingSave,
    error,
    catalogStatus,
    disabledActions: {
      scriptToStoryboard:
        !!content?.error || !!content?.loading || !catalogue.actions?.scriptToStoryboard?.enabled,
      characterToStoryboard:
        !!content?.error ||
        !!content?.loading ||
        !catalogue.actions?.characterToStoryboard?.enabled,
    },
    reload: () =>
      Promise.allSettled([Promise.resolve().then(() => latest.current.content?.reload?.())]),
  };
}
