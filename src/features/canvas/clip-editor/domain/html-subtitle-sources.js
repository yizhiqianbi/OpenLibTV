import {
  subtitleDocumentId,
  subtitleDocumentSource,
  staleSubtitleDocument,
} from './html-subtitle-model.js';
import { collectSubtitleSources } from './subtitle-source-mode.js';

/** Source collectClipSubtitleSources/aX: a stable plan independent of playhead and clip positions. */
export function htmlSubtitleLoadPlan(timeline, nodeSubtitleHtmlUrl) {
  const saved = timeline.subtitlesHtml;
  if (saved != null && (typeof saved !== 'object' || Array.isArray(saved)))
    throw new Error('HTML字幕存档无法读取，原数据已保留');
  const clips = timeline.clips.filter((clip) => clip.type !== 'audio' && clip.sourceNodeId?.trim());
  const nodes = new Set(clips.map((clip) => clip.sourceNodeId));
  const layers = new Map();
  for (const [key, archive] of Object.entries(saved || {})) {
    if (!archive || typeof archive !== 'object')
      throw new Error('HTML字幕存档格式无效，原数据已保留');
    const nodeId = subtitleDocumentSource(key).nodeId || archive.sourceNodeId;
    if (!nodes.has(nodeId) || staleSubtitleDocument(key, archive.bindingClipIds, clips)) continue;
    const html = archive.htmlInline?.trim() ? archive.htmlInline : undefined;
    const url = archive.htmlUrl?.trim();
    if (!html && !url) throw new Error('HTML字幕存档缺少可恢复内容，原数据已保留');
    layers.set(key, { key, nodeId, html, url, archive });
  }
  const add = (nodeId, url) => {
    if (!url?.trim()) return;
    const key = subtitleDocumentId(nodeId, url);
    if (layers.has(key) || layers.has(nodeId)) return;
    layers.set(key, { key, nodeId, url: url.trim() });
  };
  for (const source of collectSubtitleSources({ clips, nodeSubtitleHtmlUrl })) {
    if (source.kind !== 'html') continue;
    // A saved local document replaces the node fallback, including an explicitly empty archive.
    if (!source.clipId && [...layers.values()].some((layer) => layer.nodeId === source.nodeId))
      continue;
    add(source.nodeId, source.url);
  }
  const result = [...layers.values()];
  return { key: JSON.stringify(result), layers: result };
}
