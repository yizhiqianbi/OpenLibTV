import { isAgentReference } from './agent-content.js';

/** Accept legacy flat references and explicit grouped rows from a caller-owned source. */
export function normalizeAgentMentionRows(items = []) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (isAgentReference(item))
      return [
        {
          rowKind: 'item',
          id: `${item.type}:${item.id}`,
          label: item.name || item.id,
          reference: item,
          disabled: !!item.disabled,
          disabledReason: item.disabledReason || '',
        },
      ];
    if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') return [];
    if (['header', 'empty', 'loadMore'].includes(item.rowKind)) return [item];
    return item.rowKind === 'item' && isAgentReference(item.reference) ? [item] : [];
  });
}

export function isSelectableMentionRow(row) {
  return Boolean(
    row &&
    !row.disabled &&
    (row.rowKind === 'loadMore' || (row.rowKind === 'item' && isAgentReference(row.reference))),
  );
}

export function firstMentionRow(rows, previousId) {
  const previous = rows.findIndex((row) => row.id === previousId && isSelectableMentionRow(row));
  return previous >= 0 ? previous : rows.findIndex(isSelectableMentionRow);
}

export function nextMentionRow(rows, selected, delta) {
  if (!rows.length) return -1;
  for (let step = 1; step <= rows.length; step++) {
    const index = (selected + delta * step + rows.length * 2) % rows.length;
    if (isSelectableMentionRow(rows[index])) return index;
  }
  return -1;
}
