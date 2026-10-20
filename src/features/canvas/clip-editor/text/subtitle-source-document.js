import { createTimedTextCueIdSync } from '../../../../services/timed-text-id.js';
import {
  TEXT_HTML_ATTRIBUTES as A,
  outerTimedElements,
  subtitleCompositionRoot,
} from './timed-text-dom.js';

const number = (element, name) => {
  const raw = element.getAttribute(name);
  if (raw == null) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
};

/** Archived iR/iO/ll/oQ: tolerant subtitle reading is distinct from strict timeline overlays. */
export function readSourceSubtitleHtml(html) {
  let document;
  try {
    document = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return {
      ok: false,
      issues: [{ code: 'parse-failed', detail: '字幕HTML无法解析，原数据已保留' }],
    };
  }
  const root = subtitleCompositionRoot(document),
    issues = [],
    fatal = [];
  const issue = (code, detail, subject) =>
    issues.push({ code, detail, ...(subject ? { subject } : {}) });
  const reject = (code, detail) => fatal.push({ code, detail });
  if (!root || document.querySelector('parsererror'))
    return {
      ok: false,
      issues: [{ code: 'parse-failed', detail: '字幕HTML无法解析，原数据已保留' }],
    };
  const rawVersion = Number((root.getAttribute(A.contract)?.trim() || '').split('/')[1] || 0);
  const contractVersion = Number.isFinite(rawVersion) ? rawVersion : 0;
  if (contractVersion > 4)
    reject('contract-version', '字幕HTML契约版本高于当前支持版本，原数据已保留');
  if (new TextEncoder().encode(html).length > 2097152)
    reject('oversize', '字幕HTML超过2MiB读取上限，原数据已保留');
  const width = number(root, A.width) || 0,
    height = number(root, A.height) || 0;
  const duration = number(root, A.duration) || 0;
  if (!(width > 0) || !(height > 0))
    reject('missing-composition-size', '字幕HTML缺少有效画幅，原数据已保留');
  const used = new Set(
    [...document.querySelectorAll(`[${A.cue}]`)]
      .map((element) => element.getAttribute(A.cue)?.trim())
      .filter(Boolean),
  );
  const cues = outerTimedElements(root).map((element) => {
    const start = number(element, A.start) || 0,
      duration = number(element, A.duration) || 0;
    let cueId = element.getAttribute(A.cue)?.trim();
    if (!cueId) {
      cueId = createTimedTextCueIdSync(
        element.textContent || '',
        start,
        duration,
        '',
        [...used].map((cueId) => ({ cueId })),
      );
      element.setAttribute(A.cue, cueId);
      used.add(cueId);
    }
    const trackIndex = Math.max(0, Math.round(number(element, A.track) || 0));
    // Normalize the inert working DOM to the source's parsed values. Original
    // bytes remain in the source cache/document until an actual edit is saved.
    element.setAttribute(A.track, String(trackIndex));
    const words = [...element.querySelectorAll(`[${A.wordStart}]`)].map((word) => ({
      start: number(word, A.wordStart) || 0,
      duration: number(word, A.wordDuration) || 0,
      text: word.textContent || '',
    }));
    const textElement = element.querySelector(`[${A.text}]`);
    const text = words.length
      ? (textElement?.textContent ?? words.map((word) => word.text).join(''))
      : (textElement || element).textContent?.trim() || '';
    const mode = element.getAttribute(A.mode)?.trim().toLowerCase();
    return {
      cueId,
      start,
      duration,
      trackIndex,
      z: number(element, A.z) ?? 100 - trackIndex,
      role: element.getAttribute(A.role)?.trim() || undefined,
      textMode: mode === 'plain' || mode === 'words' ? mode : words.length ? 'words' : 'plain',
      text,
      hidden: element.getAttribute(A.hidden) === 'true',
      trackHidden: element.getAttribute(A.trackHidden) === 'true',
      clipId: element.getAttribute(A.clip)?.trim() || null,
      libraryCueId: element.getAttribute(A.libraryCue)?.trim() || null,
      words,
      element,
    };
  });
  const clipMeta = {};
  for (const element of root.children) {
    const clipId = element.getAttribute(A.clipMeta);
    if (element.tagName.toLowerCase() !== 'template' || !clipId) continue;
    const raw = element.getAttribute(A.materialized)?.split(',').map(Number);
    clipMeta[clipId] = {
      materialized:
        raw?.length === 2 && raw.every(Number.isFinite) && raw[1] >= raw[0] ? raw : null,
      subtitlesHidden: element.getAttribute(A.subtitlesHidden) === 'true',
    };
  }
  if (!cues.length && !Object.keys(clipMeta).length)
    issue('missing-cues', '字幕HTML中没有可读取的字幕');
  const tracks = [...new Set(cues.map((cue) => cue.trackIndex))].sort((a, b) => a - b);
  if (tracks.length > 4) reject('track-limit-exceeded', '字幕轨道超过4条，原数据已保留');
  if (duration > 0 && cues.some((cue) => cue.start + cue.duration - duration > 0.001))
    issue('duration-overflow', '部分字幕超出文档总时长，末句可能被截断');
  const ids = new Set(),
    groups = new Map();
  for (const cue of cues) {
    if (ids.has(cue.cueId))
      issue('duplicate-cue-id', '字幕标识重复，编辑可能关联到其他句子', cue.cueId);
    ids.add(cue.cueId);
    if (
      cue.words.some(
        (word) =>
          word.start - cue.start < -0.001 ||
          word.start + word.duration - cue.start - cue.duration > 0.001,
      )
    )
      issue('word-time-out-of-range', '逐字时间超出所属字幕区间', cue.cueId);
    const key = JSON.stringify([cue.trackIndex, cue.clipId]);
    const group = groups.get(key) || [];
    group.push(cue);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++)
      if (sorted[index - 1].start + sorted[index - 1].duration - sorted[index].start > 0.001) {
        issue('track-overlap', '同轨字幕时间重叠，原始内容已保留', sorted[index].cueId);
        break;
      }
  }
  if (/@font-face[\s\S]*?src\s*:[^;}]*local\s*\(/i.test(html))
    issue('local-font-src', '字幕使用本机字体，其他设备可能显示默认字体');
  if (fatal.length) return { ok: false, issues: [...fatal, ...issues] };
  const anchor = number(root, 'data-libtv-overlay-group-anchor');
  return {
    ok: true,
    document,
    root,
    contractVersion,
    compositionId: root.getAttribute(A.composition)?.trim() || '',
    timeBase:
      root.getAttribute(A.timeBase)?.trim().toLowerCase() === 'timeline' ? 'timeline' : 'source',
    sourceAssetKey: root.getAttribute(A.sourceAssetKey)?.trim() || undefined,
    clipMeta,
    width,
    height,
    duration,
    cues,
    trackIndexes: tracks,
    groupAnchor:
      anchor != null && Number.isSafeInteger(anchor) && anchor >= 0 ? anchor : (tracks[0] ?? 0),
    hasScript: Boolean(document.querySelector('script')),
    issues,
  };
}
