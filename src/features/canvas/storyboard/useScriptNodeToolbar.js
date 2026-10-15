import { useCallback, useLayoutEffect, useEffect, useRef, useState } from 'react';
import { describeScriptV2NodeToolbar } from './node-toolbar-model.js';
import { isScriptV2 } from './script-model.js';
import { scriptAssetProgress, scriptWorkflowState } from './workflow-model.js';

const generationUnavailable = '脚本生成服务尚未连接，当前脚本已保留';

/** Owns toolbar requests only; the script's existing controllers own drafts and graph writes. */
export function useScriptNodeToolbar(props) {
  const identity = JSON.stringify([props.documentKey, props.node.id]);
  const latest = useRef(props),
    epoch = useRef(0),
    operation = useRef(null),
    mounted = useRef(false);
  latest.current = props;
  const [state, setState] = useState({ identity, pending: false, regeneration: null, error: '' });
  const current =
    state.identity === identity ? state : { pending: false, regeneration: null, error: '' };
  const project = (value, pending = false) =>
    describeScriptV2NodeToolbar({ ...value, tablePending: value.tablePending || pending });
  const projection = project(props, current.pending);
  const sourceProjection = project(props);
  // Disabling the active opener drops native focus before the dialog can record
  // it. Its synchronous request lock rejects duplicates while the DOM stays stable.
  if (current.pending && sourceProjection.actions[current.pendingAction]?.enabled)
    projection.actions[current.pendingAction] = sourceProjection.actions[current.pendingAction];
  projection.pending = current.pending;
  const regenerationEnabled = project(props).actions.regenerate.enabled;
  const invalidate = useCallback(() => {
    epoch.current++;
    operation.current = null;
  }, []);
  const cancel = () => {
    invalidate();
    setState({ identity, pending: false, regeneration: null, error: '' });
  };
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [invalidate]);
  useLayoutEffect(() => {
    invalidate();
    setState({ identity, pending: false, regeneration: null, error: '' });
  }, [identity, props.ready, props.readonly, props.selectionEligible, invalidate]);
  useLayoutEffect(() => {
    if (!current.regeneration || regenerationEnabled) return;
    invalidate();
    setState({ identity, pending: false, regeneration: null, error: '' });
  }, [current.regeneration, regenerationEnabled, identity, invalidate]);
  useEffect(() => {
    if (!current.pending && !current.regeneration) return;
    const pagehide = () => {
      invalidate();
      setState({ identity, pending: false, regeneration: null, error: '' });
    };
    window.addEventListener('pagehide', pagehide);
    return () => window.removeEventListener('pagehide', pagehide);
  }, [identity, current.pending, current.regeneration, invalidate]);
  const report = (message) => {
    latest.current.notify?.(message);
    setState((value) => ({ ...value, error: message }));
  };
  const dispatch = async (action, nodeId, opener) => {
    const owner = latest.current;
    if (
      identity !== JSON.stringify([owner.documentKey, owner.node.id]) ||
      nodeId !== owner.node.id ||
      operation.current ||
      current.pending ||
      !project(owner).actions[action]?.enabled
    )
      return false;
    const sequence = ++epoch.current;
    const belongs = () => {
      const value = latest.current;
      if (
        !mounted.current ||
        epoch.current !== sequence ||
        value.documentKey !== owner.documentKey ||
        value.node.id !== owner.node.id ||
        !project(value).actions[action]?.enabled
      )
        return null;
      const document = value.getDocument?.();
      if (
        document &&
        (document.documentKey !== owner.documentKey || !document.ready || document.readonly)
      )
        return null;
      const node = document?.nodes?.find((item) => item.id === owner.node.id) ?? value.node;
      if (!isScriptV2(node)) return null;
      // An explicitly supplied document that lost the node is authoritative.
      if (document && !document.nodes?.some((item) => item.id === owner.node.id)) return null;
      if (document) {
        const nodes = document.nodes;
        const workflow = scriptWorkflowState(node.data, {
          getNodeUrl: (id) => nodes.find((item) => item.id === id)?.data?.url?.[0],
          assetProgress: scriptAssetProgress(node.data, nodes),
        });
        if (!project({ ...value, node, workflow }).actions[action]?.enabled) return null;
      }
      return { ...value, node };
    };
    if (action === 'regenerate') {
      const value = belongs();
      if (!value) return false;
      if (!value.node.data?.rows?.length) {
        report(generationUnavailable);
        return false;
      }
      opener?.focus?.({ preventScroll: true });
      setState({ identity, pending: false, regeneration: { nodeId: owner.node.id }, error: '' });
      return true;
    }
    operation.current = { sequence };
    setState({ identity, pending: true, pendingAction: action, regeneration: null, error: '' });
    try {
      if ((await owner.beforeAction?.()) === false) {
        if (belongs()) report('当前提示词未保存，请重试');
        return false;
      }
      const value = belongs();
      if (!value) return false;
      opener?.focus?.({ preventScroll: true });
      const callback = {
        image: value.onCreateImages,
        video: value.onCreateVideos,
        download: value.onDownload,
      }[action];
      if (typeof callback !== 'function') {
        report('当前操作尚未连接');
        return false;
      }
      if ((await callback({ node: value.node, opener })) === false) {
        if (belongs()) report('当前操作未完成，请重试');
        return false;
      }
      return true;
    } catch (failure) {
      if (belongs()) report(failure?.message || '当前操作未完成，请重试');
      return false;
    } finally {
      if (operation.current?.sequence === sequence) operation.current = null;
      if (mounted.current && epoch.current === sequence)
        setState((value) => ({ ...value, pending: false, pendingAction: null }));
    }
  };
  return {
    projection,
    pending: current.pending,
    regeneration: current.regeneration,
    error: current.error,
    closeRegeneration: cancel,
    onRegenerate: (nodeId, opener) => dispatch('regenerate', nodeId, opener),
    onCreateImages: (nodeId, opener) => dispatch('image', nodeId, opener),
    onCreateVideos: (nodeId, opener) => dispatch('video', nodeId, opener),
    onDownload: (nodeId, opener) => dispatch('download', nodeId, opener),
  };
}
