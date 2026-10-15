import { timedTextDigestSync } from '../../../../services/timed-text-digest.ts';
import { readSubtitleHtml } from './html-document.js';
import { applyTimedTextPatches } from './html-patches.js';
import { planSubtitleClipLineage, subtitleLineagePatches } from '../domain/html-subtitle-model.js';

/** Source lD/lL: <=2MiB is the fallback when no upload writer exists. */
export function archiveHtmlSubtitle({ html, nodeId, key, savedAt }) {
  const bytes = new TextEncoder().encode(html).length;
  if (bytes > 2097152) throw new Error('字幕HTML超过本地可恢复上限，原数据和当前编辑已保留');
  const model = readSubtitleHtml(html);
  if (!model.ok) throw new Error(model.issues[0].detail);
  return {
    contractVersion: 4,
    origin: 'libtv',
    htmlInline: html,
    htmlHash: timedTextDigestSync(html).slice(0, 16),
    htmlBytes: bytes,
    compositionWidth: model.width,
    compositionHeight: model.height,
    compositionDuration: model.duration,
    timeBase: model.timeBase,
    sourceNodeId: nodeId,
    documentId: key,
    bindingClipIds: Object.keys(model.clipMeta),
    trackVisible: !model.cues.some((cue) => cue.trackHidden),
    trackCount: Math.max(1, model.trackIndexes.length),
    savedAt,
    ...(!model.cues.length ? { userCleared: true } : {}),
  };
}
export function patchHtmlSubtitle(html, patches) {
  return applyTimedTextPatches(
    html,
    patches.map((patch) =>
      patch.kind === 'cloneCuesToClip'
        ? { ...patch, cloneSuffix: timedTextDigestSync(patch.toClipId).slice(0, 6) }
        : patch,
    ),
    { subtitle: true },
  );
}
export function transformHtmlSubtitleTimeline(session, result, operation, layers) {
  if (!operation || !layers?.length) return result;
  const lineage = planSubtitleClipLineage(
    operation.kind,
    session.timeline.clips,
    result.timeline.clips,
    operation.sourceClipId,
  );
  if (!lineage) return result;
  let timeline = result.timeline;
  const stamp = Date.now();
  for (const layer of layers) {
    if (layer.nodeId !== lineage.nodeId) continue;
    const model = readSubtitleHtml(layer.html);
    if (!model.ok) return { ...result, error: model.issues[0].detail };
    const edited = patchHtmlSubtitle(layer.html, subtitleLineagePatches(model, lineage));
    if (!edited.ok) return { ...result, error: edited.issues[0].detail };
    if (edited.changed)
      timeline = {
        ...timeline,
        subtitlesHtml: {
          ...timeline.subtitlesHtml,
          [layer.key]: archiveHtmlSubtitle({ ...layer, html: edited.html, savedAt: stamp }),
        },
      };
  }
  return { ...result, timeline };
}
