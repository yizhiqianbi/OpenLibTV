import {
  CANVAS_BATCH_SERVICE_UNAVAILABLE,
  canvasNodeHasOutput,
  resolveCanvasBatchGenerator,
} from './model.js';

export function initialCanvasBatchState(plan) {
  return {
    running: false,
    nodeStatuses: Object.fromEntries(plan.nodeIds.map((id) => [id, 'pending'])),
    errors: {},
    completed: [],
    failed: [],
    skipped: [],
    blocked: [],
    finishedCount: 0,
    error: '',
    cancelled: false,
  };
}

function descendants(nodeId, edges) {
  const visited = new Set();
  const queue = [nodeId];
  for (let index = 0; index < queue.length; index++)
    for (const edge of edges)
      if (edge.source === queue[index] && !visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push(edge.target);
      }
  return visited;
}

function abortableResult(operation, signal) {
  return new Promise((resolve, reject) => {
    const cancel = () => resolve({ status: 'skipped', error: '任务已取消' });
    if (signal.aborted) return cancel();
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}

/**
 * Read-only execution coordinator. Only an injected executor can submit work;
 * undefined/false completion never becomes a successful generated task.
 * executeNode(id,{signal,generator,plan}) => {status,error?}
 */
export async function runCanvasBatch(
  plan,
  {
    executeNode,
    signal = new AbortController().signal,
    isCurrent = () => true,
    getDocument,
    onState,
  } = {},
) {
  let state = initialCanvasBatchState(plan);
  const current = () => !signal.aborted && isCurrent();
  const publish = () => {
    state = { ...state, nodeStatuses: { ...state.nodeStatuses }, errors: { ...state.errors } };
    if (isCurrent()) onState?.(state);
  };
  if (!executeNode) {
    state.error = CANVAS_BATCH_SERVICE_UNAVAILABLE;
    state.blocked = [...plan.nodeIds];
    state.nodeStatuses = Object.fromEntries(plan.nodeIds.map((id) => [id, 'blocked']));
    publish();
    return state;
  }
  state.running = true;
  publish();
  for (const layer of plan.layers) {
    if (!current()) break;
    const activeIds = layer.filter((id) => state.nodeStatuses[id] === 'pending');
    const results = await Promise.all(
      activeIds.map(async (id) => {
        if (!current()) return [id, { status: 'skipped', error: '任务已取消' }];
        const entry = plan.nodes.find((node) => node.id === id);
        let generator = entry.generator;
        let existingResource = entry.existingResource;
        state.nodeStatuses[id] = 'running';
        publish();
        try {
          if (getDocument) {
            const document = getDocument();
            const node = document.nodes.find((item) => item.id === id);
            if (!node) return [id, { status: 'skipped', error: '节点已删除' }];
            existingResource =
              !!node.data?.action?.endsWith('_resource') && canvasNodeHasOutput(node);
            generator = resolveCanvasBatchGenerator(
              node,
              document.nodes,
              document.edges,
              document.models,
              document.metadata,
            );
          }
          if (existingResource) return [id, { status: 'success' }];
          if (generator.error) return [id, { status: 'failed', error: generator.error }];
          const result = await abortableResult(
            executeNode(id, { signal, generator, plan }),
            signal,
          );
          if (!current()) return [id, { status: 'skipped', error: '任务已取消' }];
          if (!['success', 'failed', 'skipped', 'blocked'].includes(result?.status))
            return [id, { status: 'blocked', error: '生成服务未返回有效执行状态，节点内容已保留' }];
          return [id, result];
        } catch (cause) {
          return [
            id,
            {
              status: current() ? 'failed' : 'skipped',
              error: cause instanceof Error ? cause.message : '生成失败',
            },
          ];
        }
      }),
    );
    for (const [id, result] of results) {
      state.nodeStatuses[id] = result.status;
      if (result.error) state.errors[id] = result.error;
      if (result.status === 'failed' || result.status === 'blocked')
        for (const downstream of descendants(id, plan.edges))
          if (state.nodeStatuses[downstream] === 'pending') {
            state.nodeStatuses[downstream] = 'skipped';
            state.errors[downstream] = '上游节点未完成';
          }
    }
    state.finishedCount = Object.values(state.nodeStatuses).filter(
      (status) => !['pending', 'running'].includes(status),
    ).length;
    publish();
  }
  state.cancelled = !current();
  for (const id of plan.nodeIds)
    if (['pending', 'running'].includes(state.nodeStatuses[id])) {
      state.nodeStatuses[id] = 'skipped';
      state.errors[id] = state.cancelled ? '任务已取消' : '依赖节点未完成';
    }
  state.running = false;
  state.finishedCount = plan.nodeIds.length;
  state.completed = plan.nodeIds.filter((id) => state.nodeStatuses[id] === 'success');
  state.failed = plan.nodeIds.filter((id) => state.nodeStatuses[id] === 'failed');
  state.skipped = plan.nodeIds.filter((id) => state.nodeStatuses[id] === 'skipped');
  state.blocked = plan.nodeIds.filter((id) => state.nodeStatuses[id] === 'blocked');
  publish();
  return state;
}
