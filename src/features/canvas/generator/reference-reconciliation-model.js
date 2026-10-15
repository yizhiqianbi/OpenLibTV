const array = (value) => (Array.isArray(value) ? value : []);
const keys = {
  Image: 'imageList',
  Portrait: 'imageList',
  Video: 'videoList',
  Audio: 'audioList',
  Mixed: 'mixedList',
};
const positions = (items) => new Map(array(items).map((item, index) => [item.nodeId, index + 1]));

/** Source 469850/98844: store reconciliation reads the previous mode/model. */
export function usesMixedGeneratorReferences(mode, model, schema) {
  const seedance =
    ['star-video2.5', 'star-video2.5-draft'].includes(model) ||
    ['star-video2.5', 'star-video2.5-draft'].includes(model?.modelKey) ||
    model?.modelVendor === 'star-video2.5' ||
    schema?.modelVendor === 'star-video2.5';
  return (
    ['mixed2video', 'videoExtend2video', 'longVideo2video'].includes(mode) ||
    (mode === 'videoEdit2video' && seedance)
  );
}

/** Source 677418: an explicit order uses the last record for duplicate node IDs. */
export function orderGeneratorMediaReferences(items, order) {
  if (!array(order).length || items.length <= 1) return items;
  const remaining = new Map(items.map((item) => [item.nodeId, item]));
  const result = [];
  for (const nodeId of order) {
    if (!remaining.has(nodeId)) continue;
    result.push(remaining.get(nodeId));
    remaining.delete(nodeId);
  }
  return [...result, ...remaining.values()];
}

/**
 * Source 704418: before a generation request, materialize stable media order
 * from the current reference records.  The source only writes an order when
 * the corresponding list contains string node IDs; URL-only/legacy records
 * remain untouched rather than receiving invented identities.
 */
export function ensureGeneratorMediaListOrder(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  let patch;
  for (const [listKey, orderKey] of [
    ['imageList', 'imageListOrder'],
    ['videoList', 'videoListOrder'],
    ['audioList', 'audioListOrder'],
    ['mixedList', 'mixedListOrder'],
  ]) {
    const list = params[listKey];
    if (!Array.isArray(list)) continue;
    const ids = list
      .map((item) => (item && typeof item.nodeId === 'string' ? item.nodeId : null))
      .filter((id) => id !== null);
    if (!ids.length) continue;
    const current = Array.isArray(params[orderKey]) ? params[orderKey] : null;
    if (current && current.length === ids.length && current.every((id, index) => id === ids[index]))
      continue;
    (patch ||= {})[orderKey] = ids;
  }
  return patch ? { ...params, ...patch } : params;
}

export function buildGeneratorMixedReferences(lists, order) {
  const combined = ['image', 'video', 'audio'].flatMap((kind) =>
    array(lists[kind + 'List']).map((item) => ({ ...item, mediaType: kind })),
  );
  return orderGeneratorMediaReferences(combined, order);
}

/** Typed-to-Mixed normalization is distinct from store deletion and reorder cleanup. */
export function normalizeGeneratorMentionsToMixed(prompt, references) {
  if (typeof prompt !== 'string' || !/\{\{(?:Image|Portrait|Video|Audio)\s/.test(prompt))
    return prompt;
  const mixed = positions(references.mixedList);
  return prompt
    .replace(
      /(\n[ \t]*)?\{\{(Image|Portrait|Video|Audio)\s+(\d+)\}\}[ \t]*/g,
      (_token, line, kind, index) => {
        const reference = references[keys[kind]]?.[parseInt(index, 10) - 1];
        const next = reference?.nodeId ? mixed.get(reference.nodeId) : undefined;
        return next === undefined ? '' : `${line ?? ''}{{Mixed ${next}}} `;
      },
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Store ig: resolve old occurrences by stable ID before converting current typed indices. */
export function reconcileGeneratorIncomingPrompt(prompt, before, after, mixed = false) {
  if (typeof prompt !== 'string' || prompt.length === 0) return prompt;
  const maps = Object.fromEntries(
    Object.entries(keys).map(([kind, key]) => [kind, positions(after[key])]),
  );
  let changed = false;
  const text = prompt.replace(
    /(\n[ \t]*)?\{\{(Image|Video|Audio|Mixed|Portrait)\s+(\d+)\}\}[ \t]*/g,
    (token, line, kind, index) => {
      const previousIndex = parseInt(index, 10) - 1;
      const reference = before[keys[kind]]?.[previousIndex];
      const next = reference?.nodeId ? maps[kind].get(reference.nodeId) : undefined;
      if (next === undefined) {
        changed = true;
        return '';
      }
      if (next === previousIndex + 1) return token;
      changed = true;
      return `${line ?? ''}{{${kind} ${next}}} `;
    },
  );
  if (!changed && !mixed) return prompt;
  const normalized = mixed ? normalizeGeneratorMentionsToMixed(text, after) : text;
  return changed || normalized !== prompt ? normalized.replace(/ {2,}/g, ' ').trim() : prompt;
}

/** Video r1 uses a different policy: invalid typed mentions survive unless converted to Mixed. */
export function rewriteGeneratorReferenceTokens(prompt, before, after, mixed = false) {
  if (typeof prompt !== 'string' || prompt.length === 0) return prompt;
  const maps = Object.fromEntries(
    Object.entries(keys).map(([kind, key]) => [kind, positions(after[key])]),
  );
  const text = prompt.replace(
    /\{\{(Image|Video|Audio|Mixed|Portrait)\s+(\d+)\}\}/g,
    (token, kind, index) => {
      const previousIndex = parseInt(index, 10) - 1;
      const reference = before[keys[kind]]?.[previousIndex];
      const convert = mixed && kind !== 'Mixed';
      const next = reference?.nodeId
        ? maps[convert ? 'Mixed' : kind].get(reference.nodeId)
        : undefined;
      if (next === undefined) return convert ? '' : token;
      const nextKind = convert ? 'Mixed' : kind;
      return next === previousIndex + 1 && nextKind === kind ? token : `{{${nextKind} ${next}}}`;
    },
  );
  return mixed
    ? text
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : text;
}
