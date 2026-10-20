import { readTextOverlayHtml, readSubtitleHtml, serializeTextHtml } from './html-document.js';
import { subtitleCompositionRoot } from './timed-text-dom.js';
const abortError = () => new DOMException('文字预览已取消', 'AbortError');
const ASSET_ORIGINS =
  "'self' https://libtv-res.liblib.art https://tv-res.newtake.cloud https://fonts.gstatic.cn";
export function prepareTextPreviewHtml(html) {
  return prepareTimedTextPreviewHtml(html);
}
export function prepareTimedTextPreviewHtml(html, { subtitle = false } = {}) {
  const model = (subtitle ? readSubtitleHtml : readTextOverlayHtml)(html);
  if (!model.ok) throw new Error(model.issues[0].detail);
  const scriptUnsupported =
    model.hasScript || Boolean(model.document.querySelector('link[rel=stylesheet]'));
  for (const element of model.document.querySelectorAll(
    'script,iframe,object,embed,base,form,link,meta[http-equiv]',
  ))
    element.remove();
  for (const element of model.document.querySelectorAll('*'))
    for (const attribute of [...element.attributes])
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
  const policy = model.document.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; font-src ${ASSET_ORIGINS} data:; img-src ${ASSET_ORIGINS} data: blob:; media-src ${ASSET_ORIGINS} data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'`;
  model.document.head.prepend(policy);
  return { html: serializeTextHtml(model.document), model, scriptUnsupported };
}

/** Real seek implementation for the scriptless composition protocol, owned by the host. */
export function seekTextPreview(document, time, includeCue) {
  if (!Number.isFinite(time)) return;
  time = Math.max(0, time);
  const composition = subtitleCompositionRoot(document);
  for (const cue of document.querySelectorAll('[data-start][data-duration]')) {
    if (cue === composition) continue;
    const start = Number(cue.getAttribute('data-start')),
      duration = Number(cue.getAttribute('data-duration'));
    const hidden = cue.closest('[data-libtv-hidden="true"],[data-libtv-track-hidden="true"]');
    const active =
      !hidden &&
      (!includeCue || includeCue(cue)) &&
      Number.isFinite(start) &&
      Number.isFinite(duration) &&
      time >= start - 0.001 &&
      time < start + duration - 0.001;
    cue.style.opacity = active ? '1' : '0';
    cue.style.visibility = active ? 'visible' : 'hidden';
  }
  for (const element of document.querySelectorAll(
    '[data-libtv-motion-target],[data-libtv-karaoke-unit]',
  )) {
    for (const animation of element.getAnimations?.({ subtree: false }) || []) {
      animation.pause();
      animation.currentTime = time * 1000;
    }
  }
}
function waitForFrame(frame, html, signal, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = [];
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      frame.removeEventListener('load', loaded);
      signal.removeEventListener('abort', cancelled);
      for (const dispose of cleanup) dispose();
      if (error) reject(error);
      else resolve(frame.contentDocument);
    };
    const cancelled = () => finish(abortError());
    const timer = setTimeout(() => finish(new Error('文字预览准备超时，请重试')), timeoutMs);
    const loaded = async () => {
      try {
        const document = frame.contentDocument;
        const root = document && subtitleCompositionRoot(document);
        if (
          !root ||
          !(Number(root.getAttribute('data-width')) > 0) ||
          !(Number(root.getAttribute('data-height')) > 0)
        )
          throw new Error('文字预览缺少composition');
        await document.fonts?.ready;
        for (const image of document.images) {
          if (!image.complete) await image.decode();
          if (!image.naturalWidth) throw new Error('文字预览图片不可读取');
        }
        const videos = [...document.querySelectorAll('video')];
        await Promise.all(
          videos.map((video) => {
            if (video.readyState >= 2) return undefined;
            return new Promise((ready, failed) => {
              const check = () => {
                if (video.readyState >= 2) ready();
              };
              const error = () => failed(new Error('文字预览内的视频不可读取'));
              video.addEventListener('loadeddata', check);
              video.addEventListener('canplay', check);
              video.addEventListener('error', error);
              cleanup.push(() => {
                video.removeEventListener('loadeddata', check);
                video.removeEventListener('canplay', check);
                video.removeEventListener('error', error);
                failed(abortError());
              });
              check();
            });
          }),
        );
        if (signal.aborted) throw abortError();
        finish();
      } catch (error) {
        finish(error);
      }
    };
    frame.addEventListener('load', loaded);
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    else frame.srcdoc = html;
  });
}
const wait = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    const done = () => {
      signal.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });

// Text/timing/inline-style edits can update the live buffer. Structural or
// resource changes must prepare the other frame before it becomes visible.
function patchableStructure(model) {
  if (
    model.document.querySelector(
      '[data-libtv-text] img,[data-libtv-text] video,[data-libtv-text] audio,[data-libtv-text] svg',
    )
  )
    return null;
  const document = model.document.cloneNode(true);
  for (const cue of document.querySelectorAll('[data-libtv-cue-id]')) {
    for (const key of [
      'style',
      'data-start',
      'data-duration',
      'data-z',
      'data-track-index',
      'data-libtv-hidden',
      'data-libtv-track-hidden',
      'data-libtv-text-preset-id',
    ])
      cue.removeAttribute(key);
    const target = cue.querySelector('[data-libtv-text]');
    if (!target) return null;
    target.removeAttribute('style');
    target.replaceChildren();
  }
  return serializeTextHtml(document);
}
function copyAttributes(source, target) {
  for (const attribute of [...target.attributes])
    if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
  for (const attribute of source.attributes) target.setAttribute(attribute.name, attribute.value);
}
export class TextOverlayPreviewRuntime {
  constructor(
    host,
    onStatus,
    {
      load = waitForFrame,
      delay = wait,
      prepare = prepareTextPreviewHtml,
      seek = seekTextPreview,
      title = '文字HTML预览',
      requireDuration = true,
    } = {},
  ) {
    this.host = host;
    this.onStatus = onStatus;
    this.load = load;
    this.delay = delay;
    this.prepareDocument = prepare;
    this.seekDocument = seek;
    this.title = title;
    this.requireDuration = requireDuration;
    this.live = true;
    this.generation = 0;
    this.frames = [];
    this.active = -1;
    this.requestedHtml = '';
    this.time = 0;
  }
  frame(index) {
    if (!this.frames[index]) {
      const frame = document.createElement('iframe');
      frame.title = this.title;
      frame.setAttribute('sandbox', 'allow-same-origin');
      frame.referrerPolicy = 'no-referrer';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.className = 'cv-clip-preview-html-overlay';
      frame.style.visibility = 'hidden';
      this.host.appendChild(frame);
      this.frames[index] = frame;
    }
    return this.frames[index];
  }
  canRender(html) {
    if (!html) return false;
    if (this.capabilityHtml !== html) {
      this.capabilityHtml = html;
      try {
        const prepared = this.prepareDocument(html);
        this.capability = !prepared.scriptUnsupported;
      } catch {
        this.capability = false;
      }
    }
    return this.capability;
  }
  render(timeline, time, ordinaryTrackCount) {
    this.ordinaryTrackCount = ordinaryTrackCount;
    this.time = time;
    this.timeline = timeline;
    const html = timeline.overlayHtmlInline || '';
    if (html !== this.requestedHtml) {
      this.requestedHtml = html;
      this.abort?.abort();
      const generation = ++this.generation;
      if (!html) {
        for (const frame of this.frames) {
          frame.remove();
          frame.srcdoc = '';
        }
        this.frames = [];
        this.active = -1;
        this.activeModel = null;
        this.onStatus?.({ ready: true });
      } else {
        let prepared;
        try {
          prepared = this.prepareDocument(html);
        } catch {
          /* Rebuild reports the precise error. */
        }
        const signature = prepared && patchableStructure(prepared.model);
        const frame = this.frames[this.active];
        if (signature && signature === this.activeStructure && frame?.contentDocument) {
          const liveCues = [...frame.contentDocument.querySelectorAll('[data-libtv-cue-id]')];
          prepared.model.cues.forEach((cue, index) => {
            const target = liveCues[index];
            copyAttributes(cue.element, target);
            const sourceText = cue.element.querySelector('[data-libtv-text]'),
              liveText = target.querySelector('[data-libtv-text]');
            copyAttributes(sourceText, liveText);
            liveText.replaceChildren(
              ...[...sourceText.childNodes].map((node) =>
                frame.contentDocument.importNode(node, true),
              ),
            );
          });
          this.activeModel = prepared.model;
          this.onStatus?.({ ready: true, scriptUnsupported: prepared.scriptUnsupported });
        } else {
          const abort = new AbortController();
          this.abort = abort;
          this.rebuild(html, generation, abort.signal, prepared);
        }
      }
    }
    this.place();
    const frame = this.frames[this.active];
    if (frame?.contentDocument) this.seekDocument(frame.contentDocument, time);
  }
  place() {
    const rect = this.host.getBoundingClientRect();
    const model = this.activeModel;
    if (!model || !rect.width || !rect.height) return;
    const ratio = Math.min(rect.width / model.width, rect.height / model.height);
    const hasVtt = Boolean(this.timeline?.subtitles?.cues?.length);
    const index = Math.min(
      this.ordinaryTrackCount ?? (hasVtt ? 1 : 0),
      Math.max(0, model.groupAnchor),
    );
    for (const frame of this.frames)
      if (frame) {
        frame.style.width = `${model.width}px`;
        frame.style.height = `${model.height}px`;
        frame.style.left = `${(rect.width - model.width * ratio) / 2}px`;
        frame.style.top = `${(rect.height - model.height * ratio) / 2}px`;
        frame.style.transform = `scale(${ratio})`;
        frame.style.zIndex = String(110 - index);
      }
  }
  vttIndex() {
    return this.activeModel?.groupAnchor === 0 ? this.activeModel.trackIndexes.length : 0;
  }
  async rebuild(html, generation, signal, prepared) {
    this.onStatus?.({ ready: false });
    const index = this.active === 0 ? 1 : 0;
    let error;
    try {
      prepared ||= this.prepareDocument(html);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await this.delay(400 * attempt, signal);
        if (signal.aborted) throw abortError();
        try {
          const frame = this.frame(index),
            document = await this.load(frame, prepared.html, signal);
          if (
            !this.live ||
            signal.aborted ||
            generation !== this.generation ||
            this.requestedHtml !== html
          )
            return;
          if (this.requireDuration && !(prepared.model.duration > 0))
            throw new Error('文字composition总时长无效');
          // This host supplies the actual scriptless seek/duration runtime; original scripts remain inert.
          if (frame.contentWindow)
            frame.contentWindow.__player = {
              seek: (time) => this.seekDocument(document, time),
              getDuration: () => prepared.model.duration,
            };
          this.seekDocument(document, this.time);
          if (this.frames[this.active]) this.frames[this.active].style.visibility = 'hidden';
          this.active = index;
          this.activeModel = prepared.model;
          this.activeStructure = patchableStructure(prepared.model);
          this.place();
          frame.style.visibility = 'visible';
          this.onStatus?.({ ready: true, scriptUnsupported: prepared.scriptUnsupported });
          return;
        } catch (caught) {
          if (caught.name === 'AbortError') throw caught;
          error = caught;
        }
      }
      throw error;
    } catch (caught) {
      if (this.live && generation === this.generation && caught?.name !== 'AbortError')
        this.onStatus?.({ ready: false, error: caught.message || '文字预览失败，请重试' });
    }
  }
  retry() {
    this.requestedHtml = '';
    this.render(this.timeline, this.time);
  }
  measureCueRect(cueId) {
    const frame = this.frames[this.active];
    const doc = frame?.contentDocument;
    const escaped = String(cueId ?? '').replace(/["\\]/g, '\\$&');
    const target = doc?.querySelector?.(`[data-libtv-cue-id="${escaped}"]`);
    const hostRect = this.host.getBoundingClientRect?.();
    if (!target || !hostRect?.width || !hostRect?.height) return null;
    const cueRect = target.getBoundingClientRect?.();
    const frameRect = frame.getBoundingClientRect?.();
    if (!cueRect || !frameRect?.width || !frameRect?.height) return null;
    const scaleX = frame.clientWidth > 0 ? frameRect.width / frame.clientWidth : 1;
    const scaleY = frame.clientHeight > 0 ? frameRect.height / frame.clientHeight : 1;
    return {
      left: frameRect.left - hostRect.left + cueRect.left * scaleX,
      top: frameRect.top - hostRect.top + cueRect.top * scaleY,
      width: cueRect.width * scaleX,
      height: cueRect.height * scaleY,
    };
  }

  dispose() {
    this.live = false;
    this.generation++;
    this.abort?.abort();
    for (const frame of this.frames) {
      frame.srcdoc = '';
      frame.remove();
    }
    this.frames = [];
  }
}
