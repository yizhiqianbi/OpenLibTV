import { TextOverlayPreviewRuntime } from './preview-runtime.js';
import { prepareSubtitlePreviewHtml, seekSubtitlePreview } from './subtitle-preview-document.js';
import { readSubtitleHtml } from './html-document.js';
import { subtitleClipWindow } from '../domain/html-subtitle-model.js';
import { subtitleClipOutputRect } from '../domain/subtitle-layout-model.js';

/** Per-track, per-visible-clip buffers; future clips prewarm within 0.5s, no whole-timeline iframe fanout. */
export class HtmlSubtitlePreviewRuntime {
  constructor(
    host,
    onStatus,
    { createRuntime = (...args) => new TextOverlayPreviewRuntime(...args) } = {},
  ) {
    this.host = host;
    this.onStatus = onStatus;
    this.createRuntime = createRuntime;
    this.records = new Map();
    this.models = new Map();
    this.waiters = new Set();
    this.live = true;
  }
  model(html) {
    if (!this.models.has(html)) {
      if (this.models.size > 20) this.models.clear();
      this.models.set(html, readSubtitleHtml(html));
    }
    return this.models.get(html);
  }
  canRender(layers) {
    return (
      !!layers?.length &&
      layers.every((layer) => {
        const model = this.model(layer.html);
        return (
          model.ok && !model.hasScript && !model.document.querySelector('link[rel=stylesheet]')
        );
      })
    );
  }
  status() {
    const needed = [...this.records.values()].filter((record) => record.required);
    return {
      ready: needed.every((record) => record.status?.ready),
      error: needed.find((record) => record.status?.error)?.status.error || '',
    };
  }
  notify() {
    const status = this.status(),
      key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.onStatus?.(status);
    }
    for (const waiter of [...this.waiters]) waiter(status);
  }
  render(layers, timeline, time, description, output, overlayModel) {
    if (!this.live) return;
    const indexes = [
      ...new Set(
        (layers || []).flatMap((layer) => {
          const model = this.model(layer.html);
          return model.ok ? model.trackIndexes : [];
        }),
      ),
    ].sort((a, b) => a - b);
    this.trackCount = indexes.length;
    const keep = new Set(),
      active = new Map(description.activeVideos.map((entry) => [entry.id, entry]));
    for (const layer of layers || []) {
      const model = this.model(layer.html);
      if (!model.ok) continue;
      const bound = new Set([
        ...Object.keys(model.clipMeta),
        ...model.cues.flatMap((cue) => (cue.clipId && cue.clipId !== '~' ? [cue.clipId] : [])),
      ]);
      const ownsClips = bound.size > 0 || model.cues.some((cue) => cue.clipId);
      const clips = timeline.clips.filter(
        (clip) =>
          clip.type !== 'audio' &&
          clip.sourceNodeId === layer.nodeId &&
          (!ownsClips || bound.has(clip.id)) &&
          (active.has(clip.id) ||
            (time >= clip.startTime - 0.5 && time < clip.startTime + clip.duration + 0.5)),
      );
      for (const clip of clips)
        for (const trackIndex of model.trackIndexes) {
          const key = JSON.stringify([layer.key, clip.id, trackIndex]);
          keep.add(key);
          let record = this.records.get(key);
          if (!record) {
            const host = document.createElement('div');
            host.className = 'cv-clip-preview-html-subtitle';
            this.host.appendChild(host);
            record = { host, required: active.has(clip.id), status: { ready: false } };
            this.records.set(key, record);
            record.runtime = this.createRuntime(
              host,
              (status) => {
                if (this.live && this.records.get(key) === record) {
                  record.status = status;
                  this.notify();
                }
              },
              {
                title: '字幕HTML预览',
                prepare: prepareSubtitlePreviewHtml,
                seek: (document, sourceTime) =>
                  seekSubtitlePreview(document, sourceTime, clip.id, trackIndex),
              },
            );
          }
          record.required = active.has(clip.id);
          record.host.hidden = !record.required;
          const sourceTime =
            model.timeBase === 'timeline'
              ? time
              : clip.sourceOffset + (time - clip.startTime) * subtitleClipWindow(clip).rate;
          const fit = output && subtitleClipOutputRect(active.get(clip.id)?.clip || clip, output);
          if (fit && output) {
            Object.assign(record.host.style, {
              left: `${(fit.left / output.width) * 100}%`,
              top: `${(fit.top / output.height) * 100}%`,
              width: `${(fit.width / output.width) * 100}%`,
              height: `${(fit.height / output.height) * 100}%`,
              clipPath: clip.maskShape === 'circle' ? 'circle(closest-side at 50% 50%)' : '',
            });
          }
          const rank = indexes.indexOf(trackIndex),
            insertion = Math.min(indexes.length, Math.max(0, overlayModel?.groupAnchor || 0));
          record.host.style.zIndex = String(
            110 - rank - (overlayModel && rank >= insertion ? overlayModel.trackIndexes.length : 0),
          );
          record.runtime.render({ overlayHtmlInline: layer.html }, Math.max(0, sourceTime));
        }
    }
    for (const [key, record] of this.records)
      if (!keep.has(key)) {
        record.runtime.dispose();
        record.host.remove();
        this.records.delete(key);
      }
    this.notify();
  }
  ready(signal) {
    const initial = this.status();
    if (initial.error) return Promise.reject(new Error(initial.error));
    if (initial.ready) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve();
      };
      const check = (status) => {
        if (status.error) finish(new Error(status.error));
        else if (status.ready) finish();
      };
      const abort = () => finish(new DOMException('字幕预览已取消', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('字幕预览准备超时，请重试')), 20000);
      this.waiters.add(check);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      else check(this.status());
    });
  }
  retry() {
    for (const record of this.records.values()) record.runtime.retry();
  }
  dispose() {
    this.live = false;
    for (const record of this.records.values()) {
      record.runtime.dispose();
      record.host.remove();
    }
    this.records.clear();
    for (const check of [...this.waiters]) check({ error: '字幕预览已关闭' });
    this.waiters.clear();
    this.models.clear();
  }
}
