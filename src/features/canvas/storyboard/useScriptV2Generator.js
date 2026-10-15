import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { projectScriptV2Card } from './script-card-model.js';
import {
  resolveScriptV2Generator,
  patchScriptV2GeneratorParams,
  patchScriptV2GeneratorPrompt,
  reorderScriptV2References,
  planScriptV2ReferenceRemoval,
} from './script-generator-model.js';

/** Script-specific params and reference transactions. No task or fee writer is invoked. */
export function useScriptV2Generator(props) {
  const { documentKey, node } = props;
  const owner = useMemo(() => ({ documentKey, nodeId: node.id }), [documentKey, node.id]);
  const latest = useRef(props),
    active = useRef(false),
    pending = useRef(null);
  latest.current = { ...props, owner };
  const [error, setError] = useState(''),
    [pendingSave, setPendingSave] = useState(false);
  const projection = useMemo(
    () =>
      resolveScriptV2Generator({
        node,
        nodes: props.nodes,
        edges: props.edges,
        models: props.modelContent?.data,
        support: props.supportContent?.data?.items,
      }),
    [node, props.nodes, props.edges, props.modelContent?.data, props.supportContent?.data],
  );
  const catalogStatus =
    props.modelContent?.error || props.supportContent?.error
      ? 'error'
      : props.modelContent?.loading ||
          props.supportContent?.loading ||
          !props.modelContent?.data ||
          !props.supportContent?.data
        ? 'loading'
        : !projection.valid || !projection.schema
          ? 'error'
          : 'ready';
  const current = useCallback((captured) => {
    const value = latest.current;
    if (
      !active.current ||
      value.owner !== captured ||
      !value.ready ||
      value.readonly ||
      value.suspended
    )
      return null;
    const raw = value.getDocument?.();
    const target = raw?.nodes?.find((item) => item.id === captured.nodeId);
    if (
      raw?.documentKey !== captured.documentKey ||
      raw.ready !== true ||
      raw.readonly !== false ||
      target?.type !== 'script-v2' ||
      !Array.isArray(raw.edges)
    )
      return null;
    const card = projectScriptV2Card({ node: target, nodes: raw.nodes, edges: raw.edges });
    return card.valid && !card.fullGenerationBusy ? { raw, target, value } : null;
  }, []);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (pending.current && !current(pending.current)) {
      pending.current = null;
      setPendingSave(false);
      setError('');
    }
  }, [
    current,
    owner,
    node,
    props.nodes,
    props.edges,
    props.ready,
    props.readonly,
    props.suspended,
  ]);
  const flush = (captured) => {
    const state = current(captured);
    if (!state) return false;
    if (state.value.flushGraph?.(state.raw) !== true) {
      pending.current = captured;
      setPendingSave(true);
      setError('剧情和参考已保留，但本机保存失败。释放空间后重试保存。');
      return false;
    }
    pending.current = null;
    setPendingSave(false);
    setError('');
    return true;
  };
  const fresh = () => {
    const state = current(owner);
    if (
      !state ||
      state.value.modelContent?.error ||
      state.value.supportContent?.error ||
      state.value.modelContent?.loading ||
      state.value.supportContent?.loading
    )
      return null;
    const resolved = resolveScriptV2Generator({
      node: state.target,
      nodes: state.raw.nodes,
      edges: state.raw.edges,
      models: state.value.modelContent?.data,
      support: state.value.supportContent?.data?.items,
    });
    return resolved.valid && resolved.schema ? { ...state, resolved } : null;
  };
  const commit = (state, next) => {
    if (!current(owner) || state.value.commitGraph?.(next, { expectedGraph: state.raw }) !== true) {
      if (current(owner)) setError('画布已经变化，当前输入已保留，请重试。');
      return false;
    }
    // A successful graph publication is accepted even if persistence fails. The
    // editor cancels its debounce; retry only flushes the current published graph.
    pending.current = owner;
    flush(owner);
    return true;
  };
  const withPrompt = (state, prompt, clean = false) => {
    if (typeof prompt !== 'string') return state.resolved.initializationParams;
    if ((state.target.data.params?.prompt ?? '') !== (state.value.node.data.params?.prompt ?? '')) {
      setError('剧情已在其他位置更新，当前输入已保留，无法覆盖新内容。');
      return null;
    }
    return clean || prompt !== (state.target.data.params?.prompt ?? '')
      ? patchScriptV2GeneratorPrompt({ params: state.resolved.initializationParams, prompt })
      : { ...state.resolved.initializationParams, prompt };
  };
  const changeParams = (patch, prompt) => {
    const state = fresh();
    if (!state) return false;
    if (
      Object.hasOwn(patch, 'model') &&
      (!state.resolved.modelKeys.includes(patch.model) ||
        state.resolved.modelList.find((item) => item.modelKey === patch.model)?.disabled)
    )
      return false;
    const value = typeof prompt === 'string' ? prompt : patch.prompt;
    const base = withPrompt(state, value, typeof patch.prompt === 'string');
    if (!base) return false;
    const { prompt: _rawPrompt, ...otherPatch } = patch;
    const params = patchScriptV2GeneratorParams({
      params: base,
      patch: typeof value === 'string' ? otherPatch : patch,
    });
    if (!params) return false;
    return commit(state, {
      ...state.raw,
      nodes: state.raw.nodes.map((item) =>
        item === state.target ? { ...item, data: { ...item.data, params } } : item,
      ),
    });
  };
  const reorder = (listType, order, prompt) => {
    const state = fresh();
    if (!state) return false;
    const base = withPrompt(state, prompt);
    if (!base) return false;
    const params = reorderScriptV2References({
      params: base,
      references: state.resolved.references,
      listType: listType?.replace(/List$/, ''),
      order,
    });
    return (
      !!params &&
      commit(state, {
        ...state.raw,
        nodes: state.raw.nodes.map((item) =>
          item === state.target ? { ...item, data: { ...item.data, params } } : item,
        ),
      })
    );
  };
  const removeReference = (sourceId, prompt) => {
    const state = fresh();
    if (!state || !withPrompt(state, prompt)) return false;
    const plan = planScriptV2ReferenceRemoval({
      nodes: state.raw.nodes,
      edges: state.raw.edges,
      targetId: owner.nodeId,
      sourceId,
      prompt,
    });
    if (!plan) return false;
    const target = plan.nodes.find((item) => item.id === owner.nodeId);
    const nextProjection = resolveScriptV2Generator({
      node: target,
      nodes: plan.nodes,
      edges: plan.edges,
      models: state.value.modelContent.data,
      support: state.value.supportContent.data.items,
    });
    if (!nextProjection.valid) return false;
    return commit(state, {
      ...state.raw,
      nodes: plan.nodes.map((item) =>
        item === target
          ? { ...item, data: { ...item.data, params: nextProjection.initializationParams } }
          : item,
      ),
      edges: plan.edges,
    });
  };
  const changeExpandedSize = (size) => {
    const state = current(owner);
    return (
      !!state &&
      commit(state, {
        ...state.raw,
        nodes: state.raw.nodes.map((item) =>
          item === state.target
            ? {
                ...item,
                data: {
                  ...item.data,
                  expandedGeneratorWidth: size.width,
                  expandedGeneratorHeight: size.height,
                },
              }
            : item,
        ),
      })
    );
  };
  const submit = (prompt) => {
    const state = fresh();
    if (!state) return null;
    const params = withPrompt(state, prompt);
    if (!params) return null;
    const final = resolveScriptV2Generator({
      node: state.target,
      nodes: state.raw.nodes,
      edges: state.raw.edges,
      models: state.value.modelContent.data,
      support: state.value.supportContent.data.items,
      params,
    });
    if (!final.canGenerate) {
      setError(final.error || '当前剧情或参考尚不满足生成条件');
      return null;
    }
    if (!changeParams({ prompt: params.prompt }, params.prompt)) return null;
    if (!pending.current) {
      setError('脚本生成服务尚未接入，剧情和参考已保存到本机。');
      state.value.notify?.('脚本生成服务尚未接入，未提交任务');
    }
    return { submitted: false, params: final.params };
  };
  return {
    projection,
    catalogStatus,
    error,
    pendingSave,
    changeParams,
    reorder,
    removeReference,
    changeExpandedSize,
    submit,
    retrySave: () => (pending.current === owner && current(owner) ? flush(owner) : false),
    reload: () =>
      Promise.allSettled([
        Promise.resolve().then(() => latest.current.modelContent?.reload?.()),
        Promise.resolve().then(() => latest.current.supportContent?.reload?.()),
      ]),
  };
}
