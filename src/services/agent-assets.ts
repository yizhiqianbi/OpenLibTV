export const CHAT_ASSET_MAX_PER_KIND = 20;
const mediaKinds = ['image', 'video', 'audio'] as const;
type MediaKind = (typeof mediaKinds)[number];
interface AssetNode {
  data: Record<string, unknown>;
}
interface AssetOrigin {
  assetName?: string;
  assetUuid?: string;
}
const defaults = {
  image: { label: '图片素材', mime: 'image/jpeg' },
  video: { label: '视频素材', mime: 'video/mp4' },
  audio: { label: '音频素材', mime: 'audio/mpeg' },
};
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** Public source 55061: the payload is JSON {version:2,items:[{data:...}]}. */
export function parseAgentAssetNodes(json: string): AssetNode[] {
  try {
    const payload = record(JSON.parse(json));
    if (!Array.isArray(payload?.items)) return [];
    return payload.items.flatMap((item) => {
      const data = record(record(item)?.data);
      return data ? [{ data }] : [];
    });
  } catch {
    return [];
  }
}
export function agentAssetReferences(json: string, origin: AssetOrigin = {}) {
  const nodes = parseAgentAssetNodes(json);
  const first = nodes[0]?.data;
  const fallbackName =
    (typeof first?.name === 'string' && first.name) ||
    (typeof first?.label === 'string' && first.label) ||
    '资产';
  const name = origin.assetName?.trim() || fallbackName;
  return nodes.flatMap(({ data }) => {
    if (!mediaKinds.includes(data.type as MediaKind) || !Array.isArray(data.url)) return [];
    const type = data.type as MediaKind;
    const label = typeof data.name === 'string' ? data.name : data.label;
    return data.url.flatMap((url) => {
      if (typeof url !== 'string' || !url.length || url.startsWith('blob:')) return [];
      return [
        {
          id: crypto.randomUUID(),
          name: label ? `${name} · ${label}` : `${defaults[type].label} · ${name.slice(0, 32)}`,
          type,
          status: 'ready',
          source: {
            type: url.startsWith('data:') ? 'data' : 'url',
            value: url,
            mimeType: defaults[type].mime,
          },
          ...(origin.assetUuid ? { metadata: { mediaAssetUuid: origin.assetUuid } } : {}),
        },
      ];
    });
  });
}
export function agentAssetText(json: string): string {
  return parseAgentAssetNodes(json)
    .flatMap(({ data }) => {
      if (data.type !== 'text') return [];
      const content = Array.isArray(data.content) ? data.content : [data.content];
      const text = content
        .filter((value): value is string => typeof value === 'string')
        .join('\n')
        .trim();
      return text ? [text] : [];
    })
    .join('\n\n');
}
/** Source 341341 validates each incoming batch, independently of existing input references. */
export function canInsertAgentAssets(
  references: readonly { type: string }[],
  maximum = CHAT_ASSET_MAX_PER_KIND,
) {
  const counts = { image: 0, video: 0, audio: 0 };
  for (const reference of references) {
    if (mediaKinds.includes(reference.type as MediaKind)) counts[reference.type as MediaKind]++;
  }
  return Object.values(counts).every((count) => count <= maximum);
}
