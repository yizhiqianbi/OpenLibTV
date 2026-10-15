function normalizeName(value) {
  const data = { ...(value ?? {}) };
  const name = typeof data.name === 'string' ? data.name : undefined;
  const label = typeof data.label === 'string' ? data.label : undefined;
  if (!name && label) data.name = label;
  delete data.label;
  return data;
}

function normalizeTaskPatch(value) {
  const task = value.taskInfo;
  if (!task || 'ownerUserId' in task || !('loading' in task) || task.loading !== false)
    return value;
  return { ...value, taskInfo: { ...task, ownerUserId: undefined } };
}

/** Source updateNodeData: t4(t5(patch)), t4(merged), then t6 only patch undefined keys. */
export function patchCanvasStoredNodeData(node, patch) {
  const { resourceMeta, ...rest } = patch ?? {};
  const update = normalizeName(normalizeTaskPatch(rest));
  const data = normalizeName({ ...(node.data ?? {}), ...update });
  for (const key of Object.keys(update)) if (update[key] === undefined) delete data[key];
  return {
    ...node,
    data,
    ...(resourceMeta !== undefined ? { resourceMeta } : {}),
  };
}
