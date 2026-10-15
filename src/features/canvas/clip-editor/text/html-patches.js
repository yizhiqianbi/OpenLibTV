import {
  readTextOverlayHtml,
  serializeTextHtml,
  TEXT_HTML_ATTRIBUTES as A,
  outerTimedElements,
  readSubtitleHtml,
} from './html-document.js';
import { textNumericValue, textPixelValue } from '../domain/text-timing-model.js';
import { applyTextMotion, syncTextMotionStart } from './motion-document.js';
import { timedTextWordTokens as wordTokens } from '../domain/text-word-model.js';
import { applyWordHighlight } from './highlight-document.js';
const ms = (value) => String(Math.round(value * 1000) / 1000);
const cueElement = (root, id) =>
  [...root.querySelectorAll(`[${A.cue}]`)].find((element) => element.getAttribute(A.cue) === id);
export const cueUnit = (cue) =>
  cue.parentElement?.hasAttribute('data-libtv-editor-scale-wrapper') ? cue.parentElement : cue;
function removeCue(root, cue) {
  const unit = cueUnit(cue);
  let parent = unit.parentElement;
  unit.remove();
  while (parent && parent !== root) {
    const next = parent.parentElement;
    if (parent.hasAttribute(A.track) && !outerTimedElements(parent).length) parent.remove();
    parent = next;
  }
}
function textTarget(cue) {
  const target = cue.querySelector(`[${A.text}]`);
  if (target) return target;
  while (cue.children.length === 1) cue = cue.children[0];
  return cue;
}
function retimeWords(cue, target, text, template) {
  const tokens = wordTokens(text),
    start = Number(cue.getAttribute(A.start)),
    duration = Number(cue.getAttribute(A.duration));
  const karaoke = cue.hasAttribute('data-libtv-word-highlight');
  const weights = tokens.map((token) =>
    karaoke ? 1 : Math.max(1, Array.from(token.trim() || token).length),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  target.replaceChildren();
  tokens.forEach((token, index) => {
    const node = template.cloneNode(false),
      from = Math.round((start + (duration * elapsed) / total) * 1000) / 1000;
    elapsed += weights[index];
    const spanDuration =
      Math.round((Math.round((start + (duration * elapsed) / total) * 1000) / 1000 - from) * 1000) /
      1000;
    node.setAttribute(A.wordStart, ms(from));
    node.setAttribute(A.wordDuration, ms(spanDuration));
    node.textContent = token;
    if (karaoke) {
      node.setAttribute('data-libtv-karaoke-unit', '');
      node.style.setProperty('--libtv-karaoke-start', `${ms(from)}s`);
      node.style.setProperty('--libtv-karaoke-duration', `${ms(Math.max(0.001, spanDuration))}s`);
    } else {
      node.removeAttribute('data-libtv-karaoke-unit');
      node.style.removeProperty('--libtv-karaoke-start');
      node.style.removeProperty('--libtv-karaoke-duration');
    }
    target.appendChild(node);
  });
  if (!tokens.length) target.textContent = text;
}
/** Source ao/al: preserve language spans and regenerate existing word timing. */
function replaceCueText(document, cue, text) {
  const target = textTarget(cue),
    template = cue.querySelector(`[${A.wordStart}]`);
  const words =
    cue.getAttribute(A.mode) === 'words' || (cue.getAttribute(A.mode) !== 'plain' && template);
  const lines = [...target.children].filter((child) => child.tagName.toLowerCase() === 'span');
  if (lines.some((child) => child.hasAttribute('data-lang'))) {
    target.replaceChildren();
    text.split('\n').forEach((line, index) => {
      if (index) target.appendChild(document.createTextNode('\n'));
      const container = lines[index] || document.createElement('span');
      if (words && template)
        retimeWords(cue, container, line, container.querySelector(`[${A.wordStart}]`) || template);
      else container.textContent = line;
      target.appendChild(container);
    });
  } else if (words && template) retimeWords(cue, template.parentElement || target, text, template);
  else target.textContent = text;
  const layout = cue.hasAttribute('data-libtv-layout-target')
    ? cue
    : cue.querySelector('[data-libtv-layout-target]') || cue;
  layout.style.height = 'auto';
}
function putTrack(cue, previous, next) {
  for (const element of [cue, ...cue.querySelectorAll(`[${A.track}]`)])
    if (element === cue || Number(element.getAttribute(A.track)) === previous) {
      element.setAttribute(A.track, String(next));
      element.setAttribute(A.z, String(100 - next));
      element.style.zIndex = String(100 - next);
    }
}
function rememberAnchor(root) {
  if (root.hasAttribute('data-libtv-overlay-group-anchor')) return;
  const indexes = outerTimedElements(root)
    .map((cue) => Number(cue.getAttribute(A.track)))
    .filter(Number.isFinite);
  if (indexes.length)
    root.setAttribute('data-libtv-overlay-group-anchor', String(Math.min(...indexes)));
}

/** Apply to a new inert document, validate the whole transaction, then serialize once. */
export function applyTextOverlayPatches(html, patches) {
  return applyTimedTextPatches(html, patches);
}

export function applyTimedTextPatches(html, patches, { subtitle = false } = {}) {
  const read = subtitle ? readSubtitleHtml : readTextOverlayHtml;
  const model = read(html);
  if (!model.ok) return { ok: false, issues: model.issues, html };
  if (!patches.length) return { ok: true, html, changed: false, model };
  const { document, root } = model;
  const before = serializeTextHtml(document);
  for (const patch of patches) {
    const cue = cueElement(root, patch.cueId);
    switch (patch.kind) {
      case 'wordHighlight':
        if (!subtitle)
          return {
            ok: false,
            html,
            issues: [{ code: 'subtitle-only', detail: '逐字高亮只适用于字幕' }],
          };
        applyWordHighlight(document, cue, patch);
        break;
      case 'text':
        if (cue && textTarget(cue).textContent !== patch.text)
          replaceCueText(document, cue, patch.text);
        break;
      case 'timing':
        if (cue) {
          if (!subtitle) rememberAnchor(root);
          const previousStart = Number(cue.getAttribute(A.start)),
            previousDuration = Number(cue.getAttribute(A.duration));
          const start = Number.isFinite(patch.start) ? Math.max(0, patch.start) : previousStart;
          const duration = Number.isFinite(patch.duration)
            ? Math.max(0, patch.duration)
            : previousDuration;
          cue.setAttribute(A.start, ms(start));
          cue.setAttribute(A.duration, ms(duration));
          if (Number.isFinite(patch.trackIndex)) {
            const previousTrack = Number(cue.getAttribute(A.track)),
              nextTrack = Math.max(0, Math.round(patch.trackIndex));
            const others = outerTimedElements(root).filter(
              (element) => element !== cue && Number(element.getAttribute(A.track)) === nextTrack,
            );
            if (previousTrack !== nextTrack && cue.parentElement !== root) {
              const target = others[0]?.parentElement;
              if (!target)
                return {
                  ok: false,
                  html,
                  issues: [
                    {
                      code: 'track-wrapper-unmapped',
                      detail: '该HTML轨道容器暂不能移动，原数据已保留',
                    },
                  ],
                };
              const previousParent = cue.parentElement;
              target.appendChild(cue);
              if (
                previousParent.hasAttribute(A.track) &&
                !previousParent.querySelector(`[${A.cue}]`)
              )
                previousParent.remove();
            }
            putTrack(cue, previousTrack, nextTrack);
            if (
              others.length &&
              others.every((element) => element.getAttribute(A.trackHidden) === 'true')
            )
              cue.setAttribute(A.trackHidden, 'true');
            else cue.removeAttribute(A.trackHidden);
          }
          if (previousStart !== start || previousDuration !== duration)
            for (const word of cue.querySelectorAll(`[${A.wordStart}]`)) {
              const ratio = previousDuration > 0 ? duration / previousDuration : 0;
              const nextStart =
                start + (Number(word.getAttribute(A.wordStart)) - previousStart) * ratio;
              const nextDuration = Number(word.getAttribute(A.wordDuration)) * ratio;
              word.setAttribute(A.wordStart, ms(nextStart));
              word.setAttribute(A.wordDuration, ms(nextDuration));
              if (cue.hasAttribute('data-libtv-word-highlight')) {
                word.style.setProperty('--libtv-karaoke-start', `${ms(nextStart)}s`);
                word.style.setProperty(
                  '--libtv-karaoke-duration',
                  `${ms(Math.max(0.001, nextDuration))}s`,
                );
              }
            }
          syncTextMotionStart(cue);
        }
        break;
      case 'addCue':
        {
          if (cueElement(root, patch.cue.cueId)) break;
          if (!subtitle) rememberAnchor(root);
          const cues = outerTimedElements(root),
            value = patch.cue;
          const template =
            cues.find((element) => Number(element.getAttribute(A.track)) === value.trackIndex) ||
            cues[0];
          const created = template ? template.cloneNode(true) : document.createElement('div');
          if (!template) {
            const text = document.createElement('span');
            text.setAttribute(A.text, '');
            text.className = 'hf-text';
            created.appendChild(text);
          }
          created.classList.add('clip', 'hf-cue');
          created.setAttribute('data-libtv-layout-target', '');
          created.setAttribute(A.cue, value.cueId);
          created.setAttribute(A.start, ms(value.start));
          created.setAttribute(A.duration, ms(value.duration));
          created.setAttribute(A.role, value.role || (subtitle ? 'caption' : 'text'));
          putTrack(
            created,
            Number(template?.getAttribute(A.track) || value.trackIndex),
            value.trackIndex,
          );
          created.setAttribute(A.z, String(value.z ?? 100 - value.trackIndex));
          created.removeAttribute(A.hidden);
          if (subtitle && value.clipId) {
            created.setAttribute(A.clip, value.clipId);
            created.setAttribute(A.libraryCue, value.cueId);
          } else {
            created.removeAttribute(A.clip);
            created.removeAttribute(A.libraryCue);
          }
          const peers = cues.filter(
            (element) => Number(element.getAttribute(A.track)) === value.trackIndex,
          );
          if (
            peers.length &&
            peers.every((element) => element.getAttribute(A.trackHidden) === 'true')
          )
            created.setAttribute(A.trackHidden, 'true');
          else created.removeAttribute(A.trackHidden);
          root.appendChild(created);
          replaceCueText(document, created, value.text);
          syncTextMotionStart(created);
        }
        break;
      case 'removeCue':
        if (cue) {
          if (!subtitle) rememberAnchor(root);
          removeCue(root, cue);
        }
        break;
      case 'cloneCuesToClip':
        {
          if (!subtitle || !patch.toClipId || !patch.cloneSuffix)
            return {
              ok: false,
              html,
              issues: [{ code: 'clip-clone-invalid', detail: '字幕复制缺少有效目标或稳定标识' }],
            };
          const ids = patch.cueIds ? new Set(patch.cueIds) : null;
          for (const source of outerTimedElements(root)) {
            const id = source.getAttribute(A.cue);
            if (
              !id ||
              source.getAttribute(A.clip)?.trim() !== patch.fromClipId ||
              (ids && !ids.has(id))
            )
              continue;
            const libraryId = source.getAttribute(A.libraryCue) ?? id;
            const baseId = `${id}~${patch.cloneSuffix}`;
            let nextId = baseId,
              ordinal = 2,
              existing = cueElement(root, nextId);
            while (
              existing &&
              (existing.getAttribute(A.clip)?.trim() !== patch.toClipId ||
                existing.getAttribute(A.libraryCue) !== libraryId)
            ) {
              nextId = `${baseId}-${ordinal++}`;
              existing = cueElement(root, nextId);
            }
            if (existing) continue;
            const unit = cueUnit(source),
              copy = unit.cloneNode(true);
            const target = unit === source ? copy : copy.firstElementChild;
            target.setAttribute(A.cue, nextId);
            target.setAttribute(A.clip, patch.toClipId);
            target.setAttribute(A.libraryCue, libraryId);
            unit.parentElement.insertBefore(copy, unit.nextSibling);
          }
        }
        break;
      case 'retagCues':
        if (!subtitle || !patch.toClipId || !Array.isArray(patch.cueIds))
          return {
            ok: false,
            html,
            issues: [{ code: 'clip-retag-invalid', detail: '字幕片段绑定无效' }],
          };
        for (const id of patch.cueIds) cueElement(root, id)?.setAttribute(A.clip, patch.toClipId);
        break;
      case 'setClipMeta':
        {
          if (!subtitle || !patch.clipId)
            return {
              ok: false,
              html,
              issues: [{ code: 'clip-meta-invalid', detail: '字幕片段元数据无效' }],
            };
          let element = [...root.children].find(
            (item) =>
              item.tagName.toLowerCase() === 'template' &&
              item.getAttribute(A.clipMeta) === patch.clipId,
          );
          if (patch.remove) {
            element?.remove();
            break;
          }
          if (!element) {
            element = document.createElement('template');
            element.setAttribute(A.clipMeta, patch.clipId);
          }
          if ('materialized' in patch) {
            if (patch.materialized == null) element.removeAttribute(A.materialized);
            else if (
              Array.isArray(patch.materialized) &&
              patch.materialized.length === 2 &&
              patch.materialized.every(Number.isFinite) &&
              patch.materialized[1] >= patch.materialized[0]
            )
              element.setAttribute(
                A.materialized,
                patch.materialized.map((value) => value.toFixed(3)).join(','),
              );
            else
              return {
                ok: false,
                html,
                issues: [
                  { code: 'clip-materialized-invalid', detail: '字幕素材范围无效，原数据已保留' },
                ],
              };
          }
          if (patch.subtitlesHidden != null) {
            if (patch.subtitlesHidden) element.setAttribute(A.subtitlesHidden, 'true');
            else element.removeAttribute(A.subtitlesHidden);
          }
          if (!element.parentElement)
            root.insertBefore(
              element,
              [...root.children].find((child) => !child.hasAttribute(A.clipMeta)) || null,
            );
        }
        break;
      case 'removeClipCues':
        if (!subtitle || !patch.clipId)
          return {
            ok: false,
            html,
            issues: [{ code: 'clip-remove-invalid', detail: '字幕片段目标无效' }],
          };
        for (const element of outerTimedElements(root))
          if (element.getAttribute(A.clip)?.trim() === patch.clipId) removeCue(root, element);
        if (patch.removeMeta)
          for (const element of [...root.children])
            if (
              element.tagName.toLowerCase() === 'template' &&
              element.getAttribute(A.clipMeta) === patch.clipId
            )
              element.remove();
        break;
      case 'cueHidden':
        if (cue) {
          if (patch.hidden) cue.setAttribute(A.hidden, 'true');
          else cue.removeAttribute(A.hidden);
        }
        break;
      case 'trackVisible':
        for (const element of outerTimedElements(root))
          if (Number(element.getAttribute(A.track)) === patch.trackIndex) {
            if (patch.visible) element.removeAttribute(A.trackHidden);
            else element.setAttribute(A.trackHidden, 'true');
          }
        break;
      case 'zOrder':
        if (cue && Number.isFinite(patch.z)) {
          cue.setAttribute(A.z, String(Math.round(patch.z)));
          cue.style.zIndex = String(Math.round(patch.z));
        }
        break;
      case 'textPresetId':
        if (cue) {
          if (typeof patch.presetId === 'string' && patch.presetId.trim())
            cue.setAttribute('data-libtv-text-preset-id', patch.presetId);
          else cue.removeAttribute('data-libtv-text-preset-id');
        }
        break;
      case 'animation':
        applyTextMotion(document, cue, patch);
        break;
      case 'textAppearance':
        if (cue) {
          const target = cue.querySelector('[data-libtv-text]');
          if (!target) break;
          if (typeof patch.backgroundColor === 'string')
            target.style.backgroundColor = patch.backgroundColor;
          const radius = textNumericValue('cornerRadiusPx', patch.cornerRadiusPx),
            blur = textNumericValue('backgroundBlurPx', patch.backgroundBlurPx);
          if (radius != null) target.style.borderRadius = `${radius}px`;
          if (blur != null) target.style.backdropFilter = `blur(${blur}px)`;
          if (['normal', 'italic'].includes(patch.fontStyle))
            target.style.fontStyle = patch.fontStyle;
          if (['left', 'center', 'right'].includes(patch.textAlign))
            target.style.textAlign = patch.textAlign;
          // Source ordinary-text direct edits remove subtitle-only highlighting.
          if (!subtitle) {
            cue.removeAttribute('data-libtv-word-highlight');
            target.style.removeProperty('--libtv-text-highlight-color');
            target.style.removeProperty('--libtv-text-highlight-background-color');
          }
        }
        break;
      case 'clearTextStyle':
        if (cue)
          for (const key of [...cue.style])
            if (key.startsWith('--libtvSubtitle')) cue.style.removeProperty(key);
        break;
      case 'copyTextAppearance':
        if (cue) {
          const source = cueElement(root, patch.sourceCueId),
            from =
              source?.querySelector('[data-libtv-text]') ||
              (typeof patch.sourceStyle === 'string' ? document.createElement('span') : null),
            target = cue.querySelector('[data-libtv-text]');
          if (!from || !target) break;
          if (!source && typeof patch.sourceStyle === 'string')
            from.setAttribute('style', patch.sourceStyle);
          for (const key of ['fontStyle', 'textAlign', 'backgroundColor'])
            target.style[key] = from.style[key];
          const scale = patch.pixelScale > 0 ? patch.pixelScale : 1;
          const sourceScale = patch.sourcePixelScale > 0 ? patch.sourcePixelScale : scale;
          for (const key of [
            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',
            'borderRadius',
          ]) {
            const value = /^-?[\d.]+px$/i.test(from.style[key])
              ? textPixelValue(parseFloat(from.style[key]), sourceScale)
              : 0;
            target.style[key] = `${textPixelValue(Math.max(0, Math.min(200, value)), 1 / scale)}px`;
          }
          const blur =
            parseFloat(from.style.backdropFilter?.match(/blur\(([-\d.]+)px\)/)?.[1]) || 0;
          const boundedBlur = textPixelValue(
            Math.max(0, Math.min(100, textPixelValue(blur, sourceScale))),
            1 / scale,
          );
          target.style.backdropFilter = boundedBlur > 0 ? `blur(${boundedBlur}px)` : 'none';
          if (!subtitle) {
            cue.removeAttribute('data-libtv-word-highlight');
            target.style.removeProperty('--libtv-text-highlight-color');
            target.style.removeProperty('--libtv-text-highlight-background-color');
          }
        }
        break;
      case 'styleVar':
        {
          if (!['global', 'cue', 'cueLang'].includes(patch.scope?.type))
            return {
              ok: false,
              html,
              issues: [{ code: 'style-scope-unsupported', detail: '文字样式作用范围不受支持' }],
            };
          const scopedCue = cueElement(root, patch.scope.cueId);
          const targets =
            patch.scope.type === 'global'
              ? [root]
              : !scopedCue
                ? []
                : patch.scope.type === 'cueLang'
                  ? [...scopedCue.querySelectorAll('[data-lang]')].filter(
                      (element) => element.getAttribute('data-lang') === patch.scope.lang,
                    )
                  : [scopedCue];
          for (const target of targets)
            for (const [key, value] of Object.entries(patch.vars)) {
              if (!key.startsWith('--libtv'))
                return {
                  ok: false,
                  html,
                  issues: [{ code: 'style-var-unsupported', detail: '文字样式变量不受支持' }],
                };
              if (value === null) target.style.removeProperty(key);
              else if (value !== undefined) target.style.setProperty(key, value);
            }
        }
        break;
      case 'layout':
        {
          const target = patch.cueId == null ? root : cue;
          if (!target) break;
          for (const [key, variable] of [
            ['xPct', '--libtvSubtitleX'],
            ['yPct', '--libtvSubtitleY'],
            ['widthPct', '--libtvSubtitleWidth'],
          ]) {
            const value = textNumericValue(key, patch[key]);
            if (value != null) target.style.setProperty(variable, `${value}%`);
          }
          const scale = textNumericValue('scalePct', patch.scale * 100);
          if (scale != null) target.style.setProperty('--libtvSubtitleScale', String(scale / 100));
          if (target !== root) target.style.height = 'auto';
        }
        break;
      default:
        return {
          ok: false,
          html,
          issues: [{ code: 'patch-unsupported', detail: `文字操作尚未支持：${patch.kind}` }],
        };
    }
  }
  const next = serializeTextHtml(document);
  if (next === before) return { ok: true, html, changed: false, model };
  const validated = read(next);
  return validated.ok
    ? { ok: true, html: next, changed: true, model: validated }
    : { ok: false, html, issues: validated.issues };
}
