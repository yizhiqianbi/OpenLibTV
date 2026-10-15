import { applyTextOverlayPatches } from './html-patches.js';
import { readTextOverlayHtml } from './html-document.js';
import {
  placeTextCue,
  textNumericValue,
  textOutputScale,
  textPixelValue,
} from '../domain/text-timing-model.js';
import { textColor, textColorWithOpacity } from '../domain/text-color-model.js';
import { readTextMotion } from './motion-document.js';

export function textLoadPlan(timeline) {
  if (timeline.overlayHtmlInline?.trim())
    return { key: `inline:${timeline.overlayHtmlInline}`, html: timeline.overlayHtmlInline };
  if (timeline.overlayHtmlUrl?.trim())
    return { key: `url:${timeline.overlayHtmlUrl}`, url: timeline.overlayHtmlUrl };
  return { key: 'empty', ready: true };
}
export const effectiveTextHtml = (session) =>
  session?.timeline.overlayHtmlInline || session?.textSourceHtml || '';
export function textOutputSize(session) {
  const clips = (session?.timeline?.clips || []).filter(
    (clip) => clip.type !== 'audio' && clip.width > 0 && clip.height > 0,
  );
  const clip = clips.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
  return clip ? { width: clip.width, height: clip.height } : null;
}
const styleVars = {
  fontSizePx: '--libtvSubtitleFontSize',
  fontWeight: '--libtvSubtitleFontWeight',
  lineHeight: '--libtvSubtitleLineHeight',
  letterSpacingPx: '--libtvSubtitleLetterSpacing',
  strokeWidthPx: '--libtvSubtitleStrokeWidth',
  color: '--libtvSubtitleColor',
  fontFamily: '--libtvSubtitleFontFamily',
  textShadow: '--libtvSubtitleTextShadow',
  strokeColor: '--libtvSubtitleStrokeColor',
};
const layout = ['xPct', 'yPct', 'widthPct', 'scalePct'];
export function textStylePatches(cueId, fields, current = {}, pixelScale = 1) {
  const vars = {},
    position = {},
    appearance = {};
  for (const [key, raw] of Object.entries(fields || {})) {
    if (layout.includes(key)) {
      const number = raw === '' ? null : textNumericValue(key, Number(raw));
      if (number != null)
        position[key === 'scalePct' ? 'scale' : key] = key === 'scalePct' ? number / 100 : number;
    } else if (styleVars[key]) {
      if (['color', 'fontFamily', 'textShadow', 'strokeColor'].includes(key)) {
        if (String(raw).trim())
          vars[styleVars[key]] =
            key === 'fontFamily'
              ? `"${String(raw).replace(/[;{}"'\\]/g, '')}", "Noto Sans SC", sans-serif`
              : String(raw);
      } else {
        const value = raw === '' ? null : textNumericValue(key, Number(raw));
        if (value != null)
          vars[styleVars[key]] =
            `${key.endsWith('Px') ? textPixelValue(value, 1 / pixelScale) : value}${key.endsWith('Px') ? 'px' : ''}`;
      }
    } else if (key === 'lineHeightPct') {
      const value = raw === '' ? null : textNumericValue(key, Number(raw));
      if (value != null) vars[styleVars.lineHeight] = String(value / 100);
    } else if (['cornerRadiusPx', 'backgroundBlurPx'].includes(key)) {
      const value = raw === '' ? null : textNumericValue(key, Number(raw));
      if (value != null) appearance[key] = textPixelValue(value, 1 / pixelScale);
    } else if (['fontStyle', 'textAlign'].includes(key)) appearance[key] = raw;
  }
  if (fields?.backgroundColor != null || fields?.backgroundOpacityPct != null) {
    const base = textColor(current.backgroundColor ?? 'transparent');
    const color = fields.backgroundColor ?? base.color;
    const opacity =
      fields.backgroundOpacityPct === ''
        ? null
        : textNumericValue('backgroundOpacityPct', Number(fields.backgroundOpacityPct));
    appearance.backgroundColor = textColorWithOpacity(color, opacity ?? base.opacityPct);
  }
  const patches = [
    ...(Object.keys(vars).length
      ? [{ kind: 'styleVar', scope: { type: 'cue', cueId }, vars }]
      : []),
    ...(Object.keys(position).length ? [{ kind: 'layout', cueId, ...position }] : []),
    ...(Object.keys(appearance).length ? [{ kind: 'textAppearance', cueId, ...appearance }] : []),
    ...(fields?.animationType != null
      ? [{ kind: 'animation', cueId, type: fields.animationType }]
      : []),
  ];
  return patches.length ? [{ kind: 'textPresetId', cueId, presetId: null }, ...patches] : patches;
}
export function projectTextDraft(session) {
  if (!session.textDraft) return session.timeline;
  const { cueId, text, fields } = session.textDraft;
  const model = readTextOverlayHtml(effectiveTextHtml(session));
  if (!model.ok) throw new Error(model.issues[0].detail);
  const scale = textOutputScale(model, textOutputSize(session));
  const result = applyTextOverlayPatches(effectiveTextHtml(session), [
    ...(text == null ? [] : [{ kind: 'text', cueId, text }]),
    ...textStylePatches(cueId, fields, readTextStyle(model, cueId, textOutputSize(session)), scale),
  ]);
  if (!result.ok) throw new Error(result.issues[0].detail);
  return result.changed
    ? { ...session.timeline, overlayHtmlInline: result.html }
    : session.timeline;
}
export function prepareTextTimelineEdit(
  timeline,
  { patches, kind, cueId, delta = 0, mode, trackIndex } = {},
) {
  const html = timeline.overlayHtmlInline;
  const model = readTextOverlayHtml(html || '');
  if (!model.ok) return { timeline, status: 'invalid-html', error: model.issues[0].detail };
  if (kind === 'gesture') {
    const cue = model.cues.find((entry) => entry.cueId === cueId);
    if (!cue || !Number.isFinite(delta)) return { timeline };
    const maximum = Math.max(timeline.totalDuration, cue.start + cue.duration),
      minimum = 0.1;
    let start = cue.start,
      duration = cue.duration;
    const row = trackIndex ?? cue.trackIndex;
    if (mode === 'move') {
      const proposed = {
        ...cue,
        start: Math.max(0, Math.min(maximum - duration, start + delta)),
        trackIndex: row,
      };
      start = placeTextCue(model.cues, proposed).start;
      if (start + duration > maximum + 0.001) return { timeline, status: 'no-slot' };
    } else if (mode === 'resize-start') {
      const previousEnd = Math.max(
        0,
        ...model.cues
          .filter(
            (entry) => entry.cueId !== cueId && entry.trackIndex === row && entry.start < cue.start,
          )
          .map((entry) => entry.start + entry.duration),
      );
      start = Math.max(previousEnd, Math.min(start + delta, cue.start + duration - minimum));
      duration = cue.start + cue.duration - start;
    } else if (mode === 'resize-end') {
      const nextStart = Math.min(
        maximum,
        ...model.cues
          .filter(
            (entry) => entry.cueId !== cueId && entry.trackIndex === row && entry.start > cue.start,
          )
          .map((entry) => entry.start),
      );
      duration = Math.max(minimum, Math.min(cue.duration + delta, nextStart - cue.start));
    }
    patches = [{ kind: 'timing', cueId, start, duration, trackIndex: row }];
  }
  const result = applyTextOverlayPatches(html, patches || []);
  return result.ok
    ? { timeline: result.changed ? { ...timeline, overlayHtmlInline: result.html } : timeline }
    : { timeline, status: 'invalid-html', error: result.issues[0].detail };
}

/** The source's offscreen style reader uses var fallbacks plus nearest inline vars. */
export function readTextStyle(model, cueId, output) {
  const cue = model.cues.find((entry) => entry.cueId === cueId);
  if (!cue) return {};
  const target = cue.element.querySelector('[data-libtv-text]') || cue.element;
  const values = {};
  for (const tag of model.document.querySelectorAll('style')) {
    for (const rule of tag.textContent
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      let matches = false;
      try {
        matches = rule[1].split(',').some((selector) => target.matches(selector.trim()));
      } catch {
        /* Ignore unsupported selectors, preserving source CSS. */
      }
      if (!matches) continue;
      const pattern = /var\(\s*(--libtvSubtitle[A-Za-z]+)\s*,/g;
      for (const match of rule[2].matchAll(pattern)) {
        let level = 1,
          end = match.index + match[0].length;
        const start = end;
        while (end < rule[2].length && level > 0) {
          if (rule[2][end] === '(') level++;
          else if (rule[2][end] === ')') level--;
          end++;
        }
        if (!level) values[match[1]] = rule[2].slice(start, end - 1).trim();
      }
    }
  }
  const chain = [];
  for (let element = target; element; element = element.parentElement) chain.push(element);
  for (const element of chain.reverse())
    for (const key of [
      ...Object.values(styleVars),
      '--libtvSubtitleX',
      '--libtvSubtitleY',
      '--libtvSubtitleWidth',
      '--libtvSubtitleScale',
    ]) {
      const value = element.style.getPropertyValue(key).trim();
      if (value) values[key] = value;
    }
  const style = Object.fromEntries(
    Object.entries(styleVars)
      .map(([key, variable]) => [
        key,
        ['color', 'fontFamily', 'textShadow', 'strokeColor'].includes(key)
          ? values[variable]
          : Number.parseFloat(values[variable]),
      ])
      .filter(([, value]) => (typeof value === 'string' ? value : Number.isFinite(value))),
  );
  if (style.fontFamily)
    style.fontFamily = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  const numeric = (key, fallback) =>
    Number.isFinite(Number.parseFloat(values[key])) ? Number.parseFloat(values[key]) : fallback;
  const scale = textOutputScale(model, output);
  for (const key of ['fontSizePx', 'letterSpacingPx', 'strokeWidthPx'])
    if (Number.isFinite(style[key])) style[key] = textPixelValue(style[key], scale);
  const backgroundColor = target.style.backgroundColor || 'transparent';
  return {
    xPct: numeric('--libtvSubtitleX', 50),
    yPct: numeric('--libtvSubtitleY', 88),
    widthPct: numeric('--libtvSubtitleWidth', 86),
    scalePct: numeric('--libtvSubtitleScale', 1) * 100,
    ...style,
    lineHeightPct: Number.isFinite(style.lineHeight)
      ? Math.round(style.lineHeight * 10000) / 100
      : 140,
    backgroundColor,
    backgroundOpacityPct: textColor(backgroundColor).opacityPct,
    cornerRadiusPx: textPixelValue(parseFloat(target.style.borderRadius) || 0, scale),
    backgroundBlurPx: textPixelValue(
      parseFloat(target.style.backdropFilter?.match(/blur\(([-\d.]+)px\)/)?.[1]) || 0,
      scale,
    ),
    fontStyle: target.style.fontStyle || 'normal',
    textAlign: target.style.textAlign || 'center',
    animationType: readTextMotion(cue.element).type,
  };
}
