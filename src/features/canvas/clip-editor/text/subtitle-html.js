import { timedTextDigest, createTimedTextCueId } from '../../../../services/timed-text-id.js';
import { applyTimedTextPatches } from './html-patches.js';
import { readSubtitleHtml } from './html-document.js';
import {
  planNewHtmlSubtitleCue,
  planSubtitleClipLineage,
  subtitleLineagePatches,
} from '../domain/html-subtitle-model.js';

/** Hashing stays asynchronous, before an atomic inert DOM transaction. Callers recheck their owner/CAS after await. */
export async function applySubtitleHtmlPatches(html, patches) {
  const ids = [
    ...new Set(
      patches.filter((patch) => patch.kind === 'cloneCuesToClip').map((patch) => patch.toClipId),
    ),
  ];
  if (ids.some((id) => typeof id !== 'string' || !id))
    return {
      ok: false,
      html,
      issues: [{ code: 'clip-clone-invalid', detail: '字幕复制目标无效，原数据已保留' }],
    };
  const hashes = new Map(
    await Promise.all(ids.map(async (id) => [id, (await timedTextDigest(id)).slice(0, 6)])),
  );
  return applyTimedTextPatches(
    html,
    patches.map((patch) =>
      patch.kind === 'cloneCuesToClip'
        ? { ...patch, cloneSuffix: hashes.get(patch.toClipId) }
        : patch,
    ),
    { subtitle: true },
  );
}

export async function addHtmlSubtitleCue(html, options) {
  const model = readSubtitleHtml(html);
  if (!model.ok) return { ok: false, html, issues: model.issues };
  const plan = planNewHtmlSubtitleCue({
    ...options,
    existing: model.cues,
    maxEnd: Math.min(options.maxEnd ?? Infinity, model.duration),
  });
  if (!plan)
    return {
      ok: false,
      html,
      issues: [{ code: 'no-space', detail: '当前素材区间没有可用字幕位置' }],
    };
  const cueId = await createTimedTextCueId(
    plan.text,
    plan.start,
    plan.duration,
    options.namespace,
    model.cues,
  );
  const result = await applySubtitleHtmlPatches(html, [
    { kind: 'addCue', cue: { ...plan, cueId } },
  ]);
  return { ...result, cueId };
}

/** No partial timeline replacement: every affected document must succeed. No source cue trimming at the cut. */
export async function applySubtitleLineageDocuments(
  documents,
  { kind, before, after, sourceClipId },
) {
  const lineage = planSubtitleClipLineage(kind, before, after, sourceClipId);
  if (!lineage) return { ok: true, documents, changed: false, lineage: null };
  const next = { ...documents };
  let changed = false;
  for (const [key, entry] of Object.entries(documents)) {
    if (entry.nodeId !== lineage.nodeId) continue;
    const model = readSubtitleHtml(entry.html);
    if (!model.ok) return { ok: false, documents, issues: model.issues };
    const result = await applySubtitleHtmlPatches(
      entry.html,
      subtitleLineagePatches(model, lineage),
    );
    if (!result.ok) return { ok: false, documents, issues: result.issues };
    if (result.changed) {
      changed = true;
      next[key] = { ...entry, html: result.html };
    }
  }
  return { ok: true, documents: changed ? next : documents, changed, lineage };
}
