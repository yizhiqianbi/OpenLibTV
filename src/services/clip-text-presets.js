// Source falls back to empty categories/presets when remote configuration is absent.
// Operations can supply a read-only adapter with { categories, presets: [{ id, name, categoryId, fields }] }.
export const EMPTY_TEXT_PRESET_SOURCE = Object.freeze({
  load: async () => ({ categories: [], presets: [] }),
});

/** Small read-only operations adapter. This is not the source remote-config schema. */
export function readTextPresetCatalogue(value) {
  if (!Array.isArray(value?.categories) || !Array.isArray(value?.presets))
    throw new Error('预设样式数据无法读取');
  const seen = new Set();
  for (const [kind, items] of Object.entries(value)) {
    if (!['categories', 'presets'].includes(kind)) continue;
    for (const item of items) {
      if (
        !item ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        seen.has(`${kind}:${item.id}`)
      )
        throw new Error('预设样式数据无法读取');
      if (
        kind === 'presets' &&
        (!item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields))
      )
        throw new Error('预设样式参数无法读取');
      seen.add(`${kind}:${item.id}`);
    }
  }
  return value;
}
