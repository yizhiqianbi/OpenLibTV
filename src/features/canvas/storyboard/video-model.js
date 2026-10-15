import { enumOptions, fieldGroups, storeKey } from '../generator/schema.js';

/** Source getModel aliases storyboardVideo to video, but its support list is separate. */
export function storyboardVideoModelKeys(models, support) {
  const schema = models?.videoModels || {};
  return (
    Array.isArray(support) ? support.map((item) => item.modelKey) : [models?.default?.video]
  ).filter((key, index, all) => !!schema[key] && all.indexOf(key) === index);
}
export function storyboardVideoMode(schema) {
  const items = schema?.properties?.modeType?.items || {};
  return Object.hasOwn(items, 'singleImage2video')
    ? 'singleImage2video'
    : Object.hasOwn(items, 'image2video')
      ? 'image2video'
      : 'text2video';
}
export function storyboardClosestRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return undefined;
  const ratios = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
  let closest,
    distance = Infinity;
  for (const ratio of ratios) {
    const [w, h] = ratio.split(':').map(Number);
    const diff = Math.abs(width / height - w / h);
    if (diff < distance) {
      distance = diff;
      closest = ratio;
    }
  }
  return distance < 0.15 ? closest : undefined;
}
export function initialStoryboardVideoConfig({
  models,
  support,
  initialImageSettings = {},
  firstChildDimensions,
  value,
}) {
  const keys = storyboardVideoModelKeys(models, support);
  const model = keys.includes(value?.model)
    ? value.model
    : keys.includes('kling-v3-omni')
      ? 'kling-v3-omni'
      : keys[0] || models?.default?.video || '';
  const schema = models?.videoModels?.[model];
  const ratioEntry = Object.entries(initialImageSettings).find(
    ([key, val]) => key.startsWith('ratio') && typeof val === 'string',
  );
  const ratio =
    ratioEntry?.[1] ||
    storyboardClosestRatio(firstChildDimensions?.width, firstChildDimensions?.height);
  const settings = {
    ...(initialImageSettings.resolution ? { resolution: initialImageSettings.resolution } : {}),
    ...value?.settings,
  };
  const ratioKey = Object.keys(schema?.properties || {}).find((key) => key.startsWith('ratio'));
  if (
    ratioKey &&
    !settings[storeKey(ratioKey, schema.properties[ratioKey])] &&
    ratio &&
    enumOptions(schema.properties[ratioKey]).some((item) => item.value === ratio)
  )
    settings[storeKey(ratioKey, schema.properties[ratioKey])] = ratio;
  return {
    ...value,
    model,
    modeType: storyboardVideoMode(schema),
    settings,
    advancedSettings: { ...value?.advancedSettings },
  };
}
/** eM limits only the embedded advanced section to batch:true; normal fields stay intact. */
export function storyboardVideoSettingsSchema(schema, modeType) {
  if (!schema) return null;
  const groups = fieldGroups(schema.config?.advancedSettings, modeType).map((group) => ({
    ...group,
    fields: group.fields.filter((key) => schema.properties?.[key]?.batch === true),
  }));
  return {
    ...schema,
    properties: { ...schema.properties, count: { enum: [1], default: 1 } },
    config: { ...schema.config, advancedSettings: groups },
  };
}
export function storyboardDurationConstraint(schema) {
  const property = schema?.properties?.duration;
  const values = enumOptions(property)
    .map((item) => item.value)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (values.length) return { type: 'enum', values };
  if (Number.isFinite(property?.min) && Number.isFinite(property?.max))
    return {
      type: 'slider',
      min: property.min,
      max: property.max,
      step: Number.isFinite(property.step) && property.step > 0 ? property.step : 1,
    };
  return null;
}
export function storyboardDurationSupported(value, constraint) {
  if (!Number.isFinite(value)) return false;
  if (!constraint) return true;
  if (constraint.type === 'enum') return constraint.values.includes(value);
  const offset = (value - constraint.min) / constraint.step;
  return (
    value >= constraint.min &&
    value <= constraint.max &&
    Math.abs(offset - Math.round(offset)) < 1e-6
  );
}

/** eX binds completed image children by hiddenUuid; index matching could attach the wrong shot. */
export function resolveStoryboardImageShots(nodes, groupId, selectedHiddenUuids) {
  const group = nodes.find((node) => node.id === groupId);
  const script = nodes.find((node) => node.id === group?.data?.sourceScriptNodeId);
  if (!group || group.type !== 'group' || !script) return { shots: [], reason: 'no-source' };
  if (script.data?.linkedImageGroupId && script.data.linkedImageGroupId !== groupId)
    return { shots: [], reason: 'stale-image-group' };
  const children = nodes
    .filter((node) => node.parentId === groupId && node.type === 'image')
    .sort((a, b) =>
      (a.data?.name || '').localeCompare(b.data?.name || '', undefined, { numeric: true }),
    );
  const byRow = new Map();
  for (const child of children) {
    const id = child.data?.scriptRowHiddenUuid;
    const url = Array.isArray(child.data?.url) ? child.data.url[0] : child.data?.url;
    if (id && typeof url === 'string' && url.trim() && !byRow.has(id)) byRow.set(id, child);
  }
  const shots = (script.data?.rows || []).flatMap((row) =>
    row.hiddenUuid &&
    (!selectedHiddenUuids || selectedHiddenUuids.has(row.hiddenUuid)) &&
    byRow.has(row.hiddenUuid)
      ? [{ row, child: byRow.get(row.hiddenUuid) }]
      : [],
  );
  return { group, script, shots, reason: shots.length ? '' : 'no-children' };
}

/** 556544: regenerate only empty or explicitly failed/time-out storyboard outputs. */
export function storyboardGroupPendingPlan({ kind, groupId, nodes, rows = [] }) {
  const group = nodes.find((node) => node.id === groupId);
  const order = group?.data?.childNodeIds || [];
  const children = nodes.filter((node) => node.parentId === groupId && node.type === kind);
  children.sort((a, b) => {
    const left = order.indexOf(a.id),
      right = order.indexOf(b.id);
    if (left >= 0 || right >= 0)
      return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right);
    return (a.data?.name || '').localeCompare(b.data?.name || '', undefined, { numeric: true });
  });
  const byRow = new Map(rows.filter((row) => row.hiddenUuid).map((row) => [row.hiddenUuid, row]));
  const targets = children.flatMap((node, index) => {
    const urls = Array.isArray(node.data?.url) ? node.data.url : [node.data?.url];
    const output = urls.some((url) => typeof url === 'string' && url.trim());
    const failed =
      [3, 4].includes(Number(node.data?.taskInfo?.status)) &&
      node.data?.taskInfo?.loading === false;
    if (output && !failed) return [];
    const row = byRow.get(node.data?.scriptRowHiddenUuid) || rows[index];
    const patch =
      kind === 'image'
        ? {
            action: 'image_generate',
            name: row ? `分镜 #${row.shotNumber ?? index + 1}` : node.data?.name,
            params: {
              ...node.data?.params,
              prompt: row?.imageGenerationPrompt || row?.plotDescription || '',
            },
          }
        : { action: 'video_generate' };
    return [{ nodeId: node.id, generatorType: kind, patch }];
  });
  return {
    targets,
    emptyReason: children.length ? (targets.length ? '' : 'no-pending-targets') : 'no-children',
  };
}
