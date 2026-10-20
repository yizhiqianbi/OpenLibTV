// The production font directory is an operations concern. The editor accepts
// a small read-only adapter while keeping the verified local fallback list.
export const EMPTY_TEXT_FONT_SOURCE = Object.freeze({
  load: async () => ({ fonts: [] }),
});

const validWeight = (value) =>
  Number.isInteger(value) && value >= 100 && value <= 900 && value % 100 === 0;

export function readTextFontCatalogue(value) {
  if (!Array.isArray(value?.fonts)) throw new Error('字体目录数据无法读取');
  const seen = new Set();
  const fonts = value.fonts.map((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id.trim() ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      typeof item.family !== 'string' ||
      !item.family.trim() ||
      seen.has(item.id)
    )
      throw new Error('字体目录数据无法读取');
    if (item.src != null && (typeof item.src !== 'string' || !/^https?:\/\//i.test(item.src)))
      throw new Error('字体资源地址无法读取');
    if (item.weight != null && !validWeight(item.weight)) throw new Error('字体字重无法读取');
    if (item.style != null && !['normal', 'italic'].includes(item.style))
      throw new Error('字体样式无法读取');
    seen.add(item.id);
    return {
      id: item.id.trim(),
      name: item.name.trim(),
      family: item.family.trim(),
      ...(item.src ? { src: item.src } : {}),
      ...(item.weight != null ? { weight: item.weight } : {}),
      ...(item.style ? { style: item.style } : {}),
    };
  });
  return { fonts };
}

export async function loadTextFontResources(
  fonts,
  { signal, FontFaceCtor = globalThis.FontFace, fontSet = globalThis.document?.fonts } = {},
) {
  const remote = (fonts || []).filter((font) => font?.src);
  if (!remote.length) return { status: 'ready', loaded: [], failed: [], faces: [] };
  if (typeof FontFaceCtor !== 'function' || !fontSet?.add)
    return { status: 'unsupported', loaded: [], failed: [], faces: [] };
  const loaded = [],
    failed = [],
    faces = [];
  for (const font of remote) {
    if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
    try {
      const face = new FontFaceCtor(font.family, `url("${font.src}")`, {
        weight: String(font.weight || 400),
        style: font.style || 'normal',
      });
      await face.load();
      if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
      fontSet.add(face);
      faces.push(face);
      loaded.push(font.id);
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      failed.push({ id: font.id, message: error?.message || '字体资源加载失败' });
    }
  }
  return { status: failed.length ? 'partial' : 'ready', loaded, failed, faces };
}
