import { reconcileStoryboardPromptState } from './prompt-state.js';

/** ScriptV2 304380 / 373983. Pure local plans; the caller owns CAS and persistence. */
export const SCRIPT_ASSET_ROLES = [
  { role: 'character', key: 'characters', label: '角色' },
  { role: 'scene', key: 'scenes', label: '场景' },
  { role: 'prop', key: 'props', label: '道具' },
];
const entityFields = [
  'plotDescriptionEntityRefs',
  'finalImagePromptEntityRefs',
  'finalVideoPromptEntityRefs',
];
const renameFields = [
  'plotDescription',
  'dialogue',
  'imageGenerationPrompt',
  'videoMotionPrompt',
  'voiceover',
  'lightingAndAtmosphere',
  'audioEffects',
];
const previewFields = [
  'plotDescription',
  'dialogue',
  'voiceover',
  'lightingAndAtmosphere',
  'audioEffects',
];
const firstUrl = (value) =>
  Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
const ordinaryEdge = (edge) => !edge.data?.portraitVirtual && !edge.data?.assetVirtual;
const rowsOf = (data) => (Array.isArray(data?.rows) ? data.rows : []);
const normalizedName = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[，。、；：,.;:!?！？"'`“”‘’（）()【】[\]<>《》]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function normalizeScriptAssets(data) {
  return SCRIPT_ASSET_ROLES.map(({ role, key, label }) => ({
    role,
    key,
    label,
    items: (Array.isArray(data?.assets?.[key]) ? data.assets[key] : [])
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => ({
        ...item,
        role: SCRIPT_ASSET_ROLES.some((entry) => entry.role === item.role) ? item.role : role,
        name: typeof item.name === 'string' ? item.name : '',
      })),
  }));
}

export function scriptAssetById(data, id) {
  for (const group of normalizeScriptAssets(data)) {
    const item = group.items.find((value) => value.id === id);
    if (item) return item;
  }
  return null;
}

/** Editing concurrency guard, separate from the latest script object used by graph CAS. */
export const scriptAssetFingerprint = (item) =>
  JSON.stringify([item?.id, item?.name ?? '', item?.description ?? '', item?.updatedAt]);

export function scriptAssetImageUrl(item, nodes = []) {
  if (typeof item?.thumbnailUrl === 'string' && item.thumbnailUrl.trim()) return item.thumbnailUrl;
  const url = firstUrl(nodes.find((node) => node.id === item?.linkedNodeId)?.data?.url);
  return typeof url === 'string' && url.trim() ? url : '';
}

/** The source selects the first output, not every URL or a first nonempty output. */
export function scriptAssetCandidates({ nodes = [], edges = [], scriptId }) {
  const incoming = new Set(
    edges
      .filter((edge) => edge.target === scriptId && ordinaryEdge(edge))
      .map((edge) => edge.source),
  );
  return nodes.flatMap((node) => {
    const data = node.data || {};
    if ((data.type || node.type) !== 'image' || data.assetVideoAssetId || data.assetAudioAssetId)
      return [];
    const url = firstUrl(data.url) ?? firstUrl(data.originalUrl);
    if (!url) return [];
    return [
      {
        id: node.id,
        name: data.name || '图片',
        thumbnailUrl: url,
        alreadyLinked: incoming.has(node.id),
      },
    ];
  });
}

function referencedRows(data, item) {
  const rows = rowsOf(data);
  const rowId = (row) => row.id || row.hiddenUuid;
  const idMatches = rows
    .filter((row) =>
      item.role === 'character'
        ? row.characters?.some((entry) => entry.characterAssetId === item.id)
        : row[item.role === 'scene' ? 'sceneAssetIds' : 'propAssetIds']?.includes(item.id),
    )
    .map(rowId)
    .filter(Boolean);
  if (idMatches.length || item.role === 'scene') return idMatches;
  const name = normalizedName(item.name);
  if (name.length <= 1) return [];
  return rows
    .filter((row) => {
      if (item.role === 'prop')
        return row.propTags?.split(/[,，/、\n]+/).some((value) => normalizedName(value) === name);
      const values = [
        ...(row.characters || []).flatMap((value) => [
          value.characterName,
          value.characterDescription,
        ]),
        row.dialogue,
        ...(row.dialogueLines || []).map((value) => value.text),
        row.voiceover,
      ];
      return values.filter(Boolean).some((value) => {
        const text = normalizedName(value);
        return /[\u4e00-\u9fff]/.test(name) || name.includes(' ')
          ? text.includes(name)
          : text.split(' ').includes(name);
      });
    })
    .map(rowId)
    .filter(Boolean);
}

export function scriptAssetDeleteInfo({ data, assetId }) {
  const item = scriptAssetById(data, assetId);
  const rowIds = item ? referencedRows(data, item) : [];
  return { item, rowIds, count: rowIds.length, hasRows: rowsOf(data).length > 0 };
}

const replaceText = (value, oldName, name) =>
  typeof value === 'string' && oldName && oldName !== name
    ? value.replaceAll(oldName, name)
    : value;

function renamePropTags(value, oldName, name) {
  if (!value || !oldName || oldName === name) return value;
  return value
    .split(/([,，/、\n]+)/)
    .map((part) =>
      part.trim() === oldName
        ? `${part.match(/^\s*/)?.[0] || ''}${name}${part.match(/\s*$/)?.[0] || ''}`
        : part,
    )
    .join('');
}

export function scriptAssetRenamePreview({ data, assetId, name }) {
  const item = scriptAssetById(data, assetId);
  if (!item?.name || item.name === name) return [];
  const preview = [];
  for (const row of rowsOf(data)) {
    const rowId = row.id || row.hiddenUuid || String(row.shotNumber);
    const add = (field, before, after) => {
      if (before !== after) preview.push({ rowId, field, before, after });
    };
    for (const field of previewFields)
      add(field, row[field], replaceText(row[field], item.name, name));
    if (item.role === 'prop')
      add('propTags', row.propTags, renamePropTags(row.propTags, item.name, name));
    for (const line of row.dialogueLines || [])
      add('dialogueLines', line.text, replaceText(line.text, item.name, name));
    if (item.role === 'character')
      for (const entry of row.characters || []) {
        add(
          'characters.characterName',
          entry.characterName,
          entry.characterName === item.name ? name : entry.characterName,
        );
        add(
          'characters.characterDescription',
          entry.characterDescription,
          replaceText(entry.characterDescription, item.name, name),
        );
      }
  }
  return preview;
}

function renameRows(rows, item, name) {
  if (!item.name || item.name === name) return rows;
  return rows.map((row) => {
    const patch = {};
    for (const field of renameFields) {
      const next = replaceText(row[field], item.name, name);
      if (next !== row[field]) patch[field] = next;
    }
    const updateArray = (field, update) => {
      if (!Array.isArray(row[field])) return;
      const next = row[field].map(update);
      if (next.some((value, index) => value !== row[field][index])) patch[field] = next;
    };
    updateArray('dialogueLines', (line) => {
      const text = replaceText(line.text, item.name, name);
      return text === line.text ? line : { ...line, text };
    });
    if (item.role === 'character')
      updateArray('characters', (entry) => {
        const characterName = entry.characterName === item.name ? name : entry.characterName;
        const characterDescription = replaceText(entry.characterDescription, item.name, name);
        return characterName === entry.characterName &&
          characterDescription === entry.characterDescription
          ? entry
          : { ...entry, characterName, characterDescription };
      });
    if (item.role === 'prop' && row.propAssetIds?.includes(item.id)) {
      const next = renamePropTags(row.propTags, item.name, name);
      if (next !== row.propTags) patch.propTags = next;
    }
    for (const field of entityFields)
      updateArray(field, (ref) => {
        const text = replaceText(ref.text, item.name, name);
        return text === ref.text ? ref : { ...ref, text };
      });
    return Object.keys(patch).length ? { ...row, ...patch } : row;
  });
}

function clearRows(rows, item) {
  const name = normalizedName(item.name);
  return rows.map((row) => {
    const patch = {};
    const remove = (field, predicate) => {
      if (!Array.isArray(row[field])) return;
      const next = row[field].filter(predicate);
      if (next.length !== row[field].length) patch[field] = next;
    };
    // Source intentionally skips role-specific removal for one-character/empty names.
    if (name.length > 1) {
      if (item.role === 'character')
        remove(
          'characters',
          (entry) =>
            entry.characterAssetId !== item.id && normalizedName(entry.characterName) !== name,
        );
      if (item.role === 'scene') remove('sceneAssetIds', (id) => id !== item.id);
      if (item.role === 'prop') {
        remove('propAssetIds', (id) => id !== item.id);
        const tags = (row.propTags || '')
          .split(/[,，/、\n]+/)
          .map((tag) => tag.trim())
          .filter(Boolean);
        const next = tags.filter((tag) => normalizedName(tag) !== name);
        if (next.length !== tags.length) patch.propTags = next.join(' / ');
      }
    }
    for (const field of entityFields) remove(field, (ref) => ref.assetId !== item.id);
    if (row.dialogueLines) {
      const next = row.dialogueLines.map((line) => {
        if (!line.entityRefs) return line;
        const refs = line.entityRefs.filter((ref) => ref.assetId !== item.id);
        return refs.length === line.entityRefs.length ? line : { ...line, entityRefs: refs };
      });
      if (next.some((line, index) => line !== row.dialogueLines[index])) patch.dialogueLines = next;
    }
    return Object.keys(patch).length ? { ...row, ...patch } : row;
  });
}

export function planScriptAssetMutation({
  nodes = [],
  edges = [],
  scriptId,
  command = {},
  now = Date.now(),
  makeId = () => crypto.randomUUID(),
}) {
  const base = {
    nodes,
    edges,
    changed: false,
    ok: false,
    assetId: command.assetId || '',
    referencesCleared: false,
  };
  const fail = (reason) => ({ ...base, reason });
  const script = nodes.find((node) => node.id === scriptId);
  if (!script || (script.data?.type || script.type) !== 'script-v2')
    return fail('脚本节点已不存在');
  const data = script.data || {};
  const assets = { ...data.assets };
  for (const { key } of SCRIPT_ASSET_ROLES)
    assets[key] = Array.isArray(data.assets?.[key]) ? data.assets[key] : [];
  const group = SCRIPT_ASSET_ROLES.find(({ key }) =>
    assets[key].some((item) => item?.id === command.assetId),
  );
  const item = group ? assets[group.key].find((value) => value.id === command.assetId) : null;
  if (!['add', 'confirmRecognition'].includes(command.type) && !item) return fail('资产已不存在');
  if (
    command.expectedAssetFingerprint &&
    scriptAssetFingerprint(item) !== command.expectedAssetFingerprint
  )
    return fail('资产已被更新，请重新打开编辑面板');
  let nextEdges = edges;
  let nextRows = rowsOf(data);
  let nextItem;
  let assetId = command.assetId;
  if (command.type === 'confirmRecognition') {
    if (data.confirmedAssetRecognition) return { ...base, ok: true };
    return {
      ...base,
      ok: true,
      changed: true,
      nodes: nodes.map((node) =>
        node === script ? { ...script, data: { ...data, confirmedAssetRecognition: true } } : node,
      ),
    };
  } else if (command.type === 'add') {
    const role = SCRIPT_ASSET_ROLES.find((value) => value.role === command.role);
    if (!role) return fail('不支持的资产类型');
    assetId = command.id || makeId();
    if (
      normalizeScriptAssets(data).some(({ items }) => items.some((value) => value.id === assetId))
    )
      return fail('资产身份冲突，请重试');
    assets[role.key] = [
      ...assets[role.key],
      {
        id: assetId,
        role: command.role,
        name: '',
        description: '',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ];
  } else if (command.type === 'delete') {
    if (!['keep_text', 'clear_chars'].includes(command.policy)) return fail('请选择删除方式');
    if (command.policy === 'clear_chars')
      nextRows = clearRows(nextRows, { ...item, role: item.role || group.role });
    assets[group.key] = assets[group.key].filter((value) => value.id !== assetId);
  } else if (command.type === 'clear') {
    if (!item.linkedNodeId && !item.thumbnailUrl) return { ...base, ok: true };
    nextItem = { ...item, linkedNodeId: undefined, thumbnailUrl: undefined, updatedAt: now };
  } else if (command.type === 'replace') {
    const image = nodes.find((node) => node.id === command.nodeId);
    if (!image || (image.data?.type || image.type) !== 'image') return fail('图片节点已不存在');
    const url = firstUrl(image.data?.url);
    if (item.linkedNodeId === image.id) {
      if (item.status === 'ready' && (!url || item.thumbnailUrl === url))
        return { ...base, ok: true };
      nextItem = {
        ...item,
        status: 'ready',
        thumbnailUrl: url ?? item.thumbnailUrl,
        updatedAt: now,
      };
    } else {
      nextItem = {
        ...item,
        linkedNodeId: image.id,
        thumbnailUrl: url ?? '',
        status: 'ready',
        updatedAt: now,
      };
      if (
        !edges.some(
          (edge) => edge.source === image.id && edge.target === scriptId && ordinaryEdge(edge),
        )
      )
        nextEdges = [
          ...edges,
          {
            id: makeId(),
            source: image.id,
            sourceHandle: 'source',
            target: scriptId,
            targetHandle: 'target',
          },
        ];
    }
  } else if (command.type === 'update') {
    const patch = {};
    for (const field of ['name', 'description'])
      if (command.patch?.[field] !== undefined && command.patch[field] !== item[field])
        patch[field] = command.patch[field];
    if (!Object.keys(patch).length) return { ...base, ok: true };
    nextItem = { ...item, ...patch, updatedAt: now };
  } else if (command.type === 'rename') {
    const name = String(command.name || '').trim() || item.name;
    if (name === item.name) return { ...base, ok: true };
    nextItem = { ...item, name, updatedAt: now };
    if (command.syncRows)
      nextRows = renameRows(nextRows, { ...item, role: item.role || group.role }, name);
  } else return fail('不支持的资产操作');
  if (nextItem)
    assets[group.key] = assets[group.key].map((value) => (value.id === assetId ? nextItem : value));
  // sT's asset-thumbnail effect reconciles only when states change, not merely hashes.
  if (
    nextItem &&
    nextItem.thumbnailUrl !== item.thumbnailUrl &&
    ['replace', 'clear'].includes(command.type)
  ) {
    const reconciled = reconcileStoryboardPromptState(nextRows, nextRows);
    if (
      reconciled.some(
        (row, index) =>
          row.imagePromptState !== nextRows[index].imagePromptState ||
          row.videoPromptState !== nextRows[index].videoPromptState,
      )
    )
      nextRows = reconciled;
  }
  const oldLink = item?.linkedNodeId;
  if (
    oldLink &&
    nextItem?.linkedNodeId !== oldLink &&
    ['delete', 'clear', 'replace'].includes(command.type)
  ) {
    const stillUsed = SCRIPT_ASSET_ROLES.some(({ key }) =>
      assets[key].some((value) => value?.linkedNodeId === oldLink),
    );
    if (!stillUsed)
      nextEdges = nextEdges.filter(
        (edge) => edge.source !== oldLink || edge.target !== scriptId || !ordinaryEdge(edge),
      );
  }
  const rowsChanged = nextRows.some((row, index) => row !== rowsOf(data)[index]);
  const nextNode = {
    ...script,
    data: { ...data, assets, ...(rowsChanged ? { rows: nextRows } : {}) },
  };
  return {
    ...base,
    ok: true,
    changed: true,
    assetId,
    referencesCleared: command.type === 'delete' && rowsChanged,
    nodes: nodes.map((node) => (node === script ? nextNode : node)),
    edges: nextEdges,
  };
}
