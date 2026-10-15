const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
export const studioNodePath = (path) => path.join('.');
export const studioNodeId = (ownerId, path) => `${ownerId}:node:${studioNodePath(path)}`;

const studioNodeDeleted = (object, path) =>
  path.some((_, index) => object.nodeEdits?.[studioNodePath(path.slice(0, index + 1))]?.deleted);

/** Serializable source-tree metadata is independent of Three's per-load UUIDs. */
export function studioOutlinerRows(objects) {
  const rows = [];
  for (const object of objects) {
    rows.push({ ...object, ownerId: object.id, depth: 0, parentId: null, subtree: false });
    for (const node of object.subtree || []) {
      if (!Array.isArray(node.path) || !node.path.length) continue;
      // A deleted source node owns its complete descendant subtree. Keep the
      // source metadata untouched so undo/redo can restore the original GLB
      // hierarchy without inventing new paths or IDs.
      if (studioNodeDeleted(object, node.path)) continue;
      const override = object.nodeEdits?.[studioNodePath(node.path)] || {};
      rows.push({
        ...node,
        ...override,
        id: studioNodeId(object.id, node.path),
        ownerId: object.id,
        path: node.path,
        depth: node.path.length,
        parentId:
          node.path.length === 1 ? object.id : studioNodeId(object.id, node.path.slice(0, -1)),
        subtree: true,
      });
    }
  }
  return studioRowRelations(rows);
}

export function studioRowRelations(rows) {
  const lookup = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    row.childCount = 0;
    row.descendantCount = 0;
    row.hiddenByAncestorId = null;
  }
  for (const row of rows) {
    const parent = lookup.get(row.parentId);
    if (parent) {
      parent.childCount += 1;
      row.hiddenByAncestorId = parent.visible === false ? parent.id : parent.hiddenByAncestorId;
    }
    for (let ancestor = parent; ancestor; ancestor = lookup.get(ancestor.parentId))
      ancestor.descendantCount += 1;
  }
  return rows;
}

/** Source ead: search reveals matches and ancestors, temporarily ignoring collapse. */
export function visibleStudioRows(rows, collapsed, query = '') {
  const search = query.trim().toLowerCase();
  const lookup = new Map(rows.map((row) => [row.id, row]));
  const included = new Set();
  if (search)
    for (const row of rows) {
      if (!row.name?.toLowerCase().includes(search) && !row.type?.includes(search)) continue;
      for (let item = row; item && !included.has(item.id); item = lookup.get(item.parentId))
        included.add(item.id);
    }
  const result = [];
  let collapsedDepth = Infinity;
  for (const row of rows) {
    if (!search && row.depth > collapsedDepth) continue;
    collapsedDepth = Infinity;
    const isCollapsed = !search && row.childCount > 0 && collapsed.has(row.id);
    if (isCollapsed) collapsedDepth = row.depth;
    if (!search || included.has(row.id)) result.push({ ...row, collapsed: isCollapsed });
  }
  return result;
}

export function toggleStudioSubtree(rows, collapsed, id, recursive = false) {
  const next = new Set(collapsed);
  const row = rows.find((row) => row.id === id);
  if (!row?.childCount) return next;
  const closing = !collapsed.has(id);
  const start = rows.indexOf(row);
  const targets = [row];
  if (recursive)
    for (let index = start + 1; index < rows.length && rows[index].depth > row.depth; index++)
      if (rows[index].childCount) targets.push(rows[index]);
  for (const target of targets) closing ? next.add(target.id) : next.delete(target.id);
  return next;
}

export function revealStudioRow(rows, collapsed, id) {
  const next = new Set(collapsed),
    lookup = new Map(rows.map((row) => [row.id, row]));
  for (let row = lookup.get(id); row?.parentId; row = lookup.get(row.parentId))
    next.delete(row.parentId);
  return next;
}

/** Only known source-tree nodes may receive an override; arbitrary IDs never mutate a root. */
export function patchStudioRow(objects, id, changes) {
  let row = studioOutlinerRows(objects).find((candidate) => candidate.id === id);
  // Deleted rows are intentionally omitted from the rendered tree, but their
  // source path must remain addressable so undo can clear the tombstone.
  if (!row) {
    for (const object of objects) {
      const prefix = `${object.id}:node:`;
      if (!id.startsWith(prefix)) continue;
      const rawPath = id.slice(prefix.length);
      const path = rawPath.split('.').map(Number);
      if (!path.length || path.some((part) => !Number.isInteger(part) || part < 0)) continue;
      const source = (object.subtree || []).find(
        (node) => Array.isArray(node.path) && studioNodePath(node.path) === rawPath,
      );
      if (source) {
        row = { ...source, id, ownerId: object.id, path, subtree: true };
        break;
      }
    }
  }
  if (!row || !record(changes)) return objects;
  return objects.map((object) => {
    if (object.id !== row.ownerId) return object;
    if (!row.subtree) return { ...object, ...changes };
    const key = studioNodePath(row.path);
    return {
      ...object,
      nodeEdits: { ...object.nodeEdits, [key]: { ...object.nodeEdits?.[key], ...changes } },
    };
  });
}

/** Source r_/eiD: trimmed 1–128 chars, binding-safe and unique throughout the scene. */
export function studioNameError(rows, id, draft) {
  if (!rows.some((row) => row.id === id)) return '当前对象无法重命名';
  const name = draft.trim();
  if (!name || name.length > 128) return '名称长度须为 1–128 个字符';
  if (rows.find((row) => row.id === id)?.name === name) return '';
  if (/[[\].:/]/.test(name)) return '名称不能包含方括号、句点、冒号或斜杠';
  const bindingName = name.replace(/\s/g, '_');
  if (rows.some((row) => row.id !== id && row.name?.replace(/\s/g, '_') === bindingName))
    return '请使用唯一的对象名称';
  return '';
}
