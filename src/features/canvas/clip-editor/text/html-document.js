import { TEXT_HTML_ATTRIBUTES, canonicalTrack, outerTimedElements } from './timed-text-dom.js';
import { readSourceSubtitleHtml } from './subtitle-source-document.js';
export {
  TEXT_HTML_ATTRIBUTES,
  canonicalTrack,
  outerTimedElements,
  serializeTextHtml,
} from './timed-text-dom.js';
const A = TEXT_HTML_ATTRIBUTES;
const number = (element, key) => {
  const raw = element.getAttribute(key);
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/** Parsing is inert. Keep the source document, including unknown CSS/data/scripts, for round trips. */
export function readTimedTextHtml(html, { subtitle = false } = {}) {
  return subtitle ? readSourceSubtitleHtml(html) : readStrictTextHtml(html);
}
function readStrictTextHtml(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const roots = [...document.querySelectorAll(`[${A.composition}]`)];
  const issues = [];
  const issue = (code, detail) => issues.push({ code, detail });
  if (roots.length !== 1)
    return {
      ok: false,
      issues: [
        {
          code: 'composition-root-count',
          detail: '文字HTML必须且只能包含一个composition，原数据已保留',
        },
      ],
    };
  const root = roots[0],
    compositionId = root.getAttribute(A.composition)?.trim();
  if (!compositionId) issue('composition-id-empty', 'composition标识为空');
  const timeBase = root.getAttribute(A.timeBase);
  if (timeBase !== 'timeline') issue('time-base-invalid', '普通文字composition时基必须为timeline');
  if (root.getAttribute(A.contract) !== 'libtv-subtitle/4')
    issue('contract-version', '文字HTML契约版本尚未支持');
  const width = number(root, A.width),
    height = number(root, A.height),
    duration = number(root, A.duration);
  if (!(width > 0) || !(height > 0)) issue('missing-composition-size', '文字HTML缺少有效画幅');
  if (!(duration > 0)) issue('missing-composition-duration', '文字HTML缺少有效总时长');
  const anchorRaw = root.getAttribute('data-libtv-overlay-group-anchor');
  if (anchorRaw != null && canonicalTrack(anchorRaw) == null)
    issue('group-anchor-invalid', '文字轨道组锚点无效');
  const ids = new Set(),
    tracks = new Set();
  const cues = outerTimedElements(root).map((element) => {
    const cueId = element.getAttribute(A.cue)?.trim(),
      trackIndex = canonicalTrack(element.getAttribute(A.track));
    if (!cueId) issue('cue-id-missing', '文字片段缺少稳定标识');
    else if (ids.has(cueId)) issue('duplicate-cue-id', `文字片段标识重复：${cueId}`);
    ids.add(cueId);
    if (trackIndex == null) issue('cue-track-index-invalid', '文字片段轨道必须为规范非负整数');
    else tracks.add(trackIndex);
    const start = number(element, A.start),
      cueDuration = number(element, A.duration);
    if (start == null || start < 0 || !(cueDuration > 0))
      issue('cue-timing-invalid', `文字片段时间无效：${cueId || ''}`);
    const words = [...element.querySelectorAll(`[${A.wordStart}]`)].map((word) => ({
      start: number(word, A.wordStart),
      duration: number(word, A.wordDuration),
      text: word.textContent || '',
    }));
    if (
      words.some(
        (word) =>
          word.start == null ||
          word.duration == null ||
          word.duration < 0 ||
          word.start < start - 0.001 ||
          word.start + word.duration > start + cueDuration + 0.001,
      )
    )
      issue('word-time-out-of-range', `逐字时间超出片段：${cueId}`);
    const textElement = element.querySelector(`[${A.text}]`);
    return {
      cueId,
      start,
      duration: cueDuration,
      trackIndex,
      z: number(element, A.z) ?? 100 - (trackIndex || 0),
      role: element.getAttribute(A.role)?.trim() || undefined,
      textMode:
        element.getAttribute(A.mode) === 'words' ||
        (words.length && element.getAttribute(A.mode) !== 'plain')
          ? 'words'
          : 'plain',
      text:
        textElement?.textContent ??
        (words.length
          ? words.map((word) => word.text).join('')
          : (element.textContent || '').trim()),
      hidden: element.getAttribute(A.hidden) === 'true',
      trackHidden: element.getAttribute(A.trackHidden) === 'true',
      clipId: element.getAttribute(A.clip)?.trim() || null,
      libraryCueId: element.getAttribute(A.libraryCue)?.trim() || null,
      words,
      element,
    };
  });
  const groups = new Map();
  for (const cue of cues) {
    const key = cue.trackIndex;
    const group = groups.get(key) || [];
    group.push(cue);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++)
      if (sorted[index - 1].start + sorted[index - 1].duration - sorted[index].start > 0.001) {
        issue('track-overlap', `文字轨道${sorted[index].trackIndex}的片段时间重叠`);
        break;
      }
  }
  if (tracks.size > 8) issue('overlay-track-limit-exceeded', '文字轨道超过8条');
  const clipMeta = {};
  for (const element of root.children) {
    if (element.tagName.toLowerCase() !== 'template' || !element.getAttribute(A.clipMeta)) continue;
    const raw = element.getAttribute(A.materialized)?.split(',').map(Number);
    clipMeta[element.getAttribute(A.clipMeta)] = {
      materialized:
        raw?.length === 2 && raw.every(Number.isFinite) && raw[1] >= raw[0] ? raw : null,
      subtitlesHidden: element.getAttribute(A.subtitlesHidden) === 'true',
    };
  }
  for (const element of root.querySelectorAll(`[${A.track}]`)) {
    const index = canonicalTrack(element.getAttribute(A.track));
    if (index == null || !tracks.has(index))
      issue('indexed-element-track-index-unmapped', '文字容器声明了未映射的轨道');
  }
  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        document,
        root,
        compositionId,
        timeBase,
        sourceAssetKey: root.getAttribute(A.sourceAssetKey)?.trim() || undefined,
        clipMeta,
        width,
        height,
        duration,
        cues,
        trackIndexes: [...tracks].sort((a, b) => a - b),
        groupAnchor: canonicalTrack(anchorRaw) ?? [...tracks].sort((a, b) => a - b)[0] ?? 0,
        hasScript: Boolean(document.querySelector('script')),
      };
}

export const readTextOverlayHtml = (html) => readTimedTextHtml(html);
export const readSubtitleHtml = (html) => readTimedTextHtml(html, { subtitle: true });

export const escapeTextHtml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Source iw: the host drives cue visibility; generated documents contain no runtime scripts. */
export function createTimedTextHtml({
  compositionId,
  width,
  height,
  duration,
  cues = [],
  timeBase = 'timeline',
  clipMetas = [],
  sourceAssetKey,
}) {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const size = Math.max(12, Math.round((height * 56) / 1080));
  const attributes = (values) =>
    Object.entries(values)
      .map(([key, value]) => `${key}="${escapeTextHtml(value)}"`)
      .join(' ');
  return `<!DOCTYPE html>\n<html lang="zh"><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent;color-scheme:dark}
#root{position:relative;width:${width}px;height:${height}px;background:transparent}
.hf-cue{position:absolute;left:var(--libtvSubtitleX,50%);top:var(--libtvSubtitleY,88%);width:var(--libtvSubtitleWidth,86%);transform:translate(-50%,-50%) scale(var(--libtvSubtitleScale,1));display:flex;justify-content:center;align-items:center;opacity:0}
.hf-text{font-family:var(--libtvSubtitleFontFamily,"Source Han Sans CN","Noto Sans SC",sans-serif);font-size:var(--libtvSubtitleFontSize,${size}px);font-weight:var(--libtvSubtitleFontWeight,600);line-height:var(--libtvSubtitleLineHeight,1.4);color:var(--libtvSubtitleColor,#FFFFFF);letter-spacing:var(--libtvSubtitleLetterSpacing,0px);text-shadow:var(--libtvSubtitleTextShadow,0 2px 10px rgba(0,0,0,.9));-webkit-text-stroke:var(--libtvSubtitleStrokeWidth,0px) var(--libtvSubtitleStrokeColor,transparent);white-space:pre-wrap;text-align:center}
</style></head><body><div ${attributes({ id: 'root', [A.contract]: 'libtv-subtitle/4', [A.composition]: compositionId, [A.timeBase]: timeBase, ...(sourceAssetKey ? { [A.sourceAssetKey]: sourceAssetKey } : {}), [A.width]: width, [A.height]: height, [A.start]: '0.000', [A.duration]: Math.max(duration, ...cues.map((cue) => cue.start + cue.duration)) })}>${clipMetas.map((meta) => `<template ${attributes({ [A.clipMeta]: meta.clipId, [A.materialized]: meta.materialized.map((value) => value.toFixed(3)).join(',') })}></template>`).join('\n')}${cues.map((cue) => `<div ${attributes({ class: 'clip hf-cue', 'data-libtv-layout-target': '', [A.cue]: cue.cueId, [A.role]: cue.role || (timeBase === 'source' ? 'caption' : 'text'), [A.track]: cue.trackIndex, [A.z]: cue.z ?? 100 - cue.trackIndex, [A.start]: cue.start, [A.duration]: cue.duration, [A.mode]: 'plain', ...(cue.clipId ? { [A.clip]: cue.clipId, [A.libraryCue]: cue.cueId } : {}) })}><span class="hf-text" ${A.text}>${cue.textParts?.length ? cue.textParts.map((part) => `<span${part.className?.trim() ? ` data-lang="${escapeTextHtml(part.className.trim())}"` : ''}>${escapeTextHtml(part.text)}</span>`).join('\n') : escapeTextHtml(cue.text)}</span></div>`).join('\n')}</div></body></html>\n`;
}
export const createTextOverlayHtml = (options) =>
  createTimedTextHtml({ ...options, timeBase: 'timeline' });
export const createSubtitleHtml = (options) =>
  createTimedTextHtml({
    ...options,
    timeBase: options.timeBase || 'source',
    cues: options.cues?.map((cue) => ({ role: 'caption', ...cue })),
  });
