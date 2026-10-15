import { useCanvasGraphConfirmation } from '../hooks/useCanvasGraphConfirmation.js';
import { sameCanvasConfirmationValue } from './confirmation-value-model.js';
import { canvasDeletionConfirmation } from './deletion-confirmation-model.js';

const businessParams = (params) => {
  const { prompt: _prompt, magicList: _magic, ...rest } = params || {};
  return rest;
};

// Position/measurement copies retain data identity. A prompt commit may replace
// data/params, while preserving the source's other business fields by identity.
function sameSourceIdentity(before, after) {
  if (before === after) return true;
  if (!before || !after || before.id !== after.id || before.type !== after.type) return false;
  if (before.data === after.data) return true;
  const left = before.data || {},
    right = after.data || {};
  const ignored = new Set(['params', 'text', 'generationError']);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  if ([...keys].some((key) => !ignored.has(key) && left[key] !== right[key])) return false;
  if (!sameCanvasConfirmationValue(businessParams(left.params), businessParams(right.params)))
    return false;
  return left.params?.prompt !== right.params?.prompt || left.text !== right.text;
}

/** Confirmation owns eligibility and retirement; GraphActions owns draft/history/CAS. */
export function useCanvasDeleteConfirmation(props) {
  const controls = useCanvasGraphConfirmation({
    ...props,
    failureMessage: '当前节点无法删除，请重试',
    changedMessage: '待删除节点已变化，请重新选择',
    describe: (graph, { nodeIds = props.selectedIds, trigger = 'keyboard' } = {}) => {
      if (!['keyboard', 'menu'].includes(trigger)) return null;
      const requested = new Set(
        Array.isArray(nodeIds) ? nodeIds.filter((id) => typeof id === 'string') : [],
      );
      const byId = new Map(graph.nodes.filter(Boolean).map((node) => [node.id, node]));
      const sources = [...requested].map((id) => byId.get(id)).filter(Boolean);
      if (!sources.length) return null;
      const ids = [...new Set(sources.map((node) => node.id))];
      return {
        operation: ids,
        identity: sources,
        notice: canvasDeletionConfirmation({
          nodes: graph.nodes,
          nodeIds: ids,
          trigger,
          isMac: props.isMac,
        }),
      };
    },
    validate: (graph, sources) =>
      sources.every((source) =>
        sameSourceIdentity(
          source,
          graph.nodes.find((node) => node.id === source.id),
        ),
      ),
    execute: (ids) =>
      props.deleteNodes?.(ids, { zoom: props.zoom, reconcileGroupConsumers: true }) === true,
  });
  return {
    request: controls.request,
    confirm: controls.confirm,
    cancel: controls.cancel,
    remove: (nodeIds, { trigger = 'keyboard' } = {}) =>
      controls.requestOperation({ nodeIds, trigger }),
  };
}
