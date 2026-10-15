import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { describeClipTimelinePlayback } from './domain/playback-model.js';
import { createClipTransitionRenderer } from './transition-renderer.js';
import { awaitNative, nativeMedia, releaseMedia } from './native-media.js';
import { createSubtitlePreviewRenderer } from './subtitle-preview-renderer.js';
import { TextOverlayPreviewRuntime } from './text/preview-runtime.js';
import { HtmlSubtitlePreviewRuntime } from './text/html-subtitle-preview.js';

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const abortError = () => new DOMException('播放准备已取消', 'AbortError');

function syncSubtitleTrack(record, clip, resolveUrl) {
  if (!record || record.kind !== 'video' || !record.media) return;
  const raw = typeof clip?.subtitleUrl === 'string' ? clip.subtitleUrl.trim() : '';
  const mapped = raw ? resolveUrl(raw) : '';
  const loadUrl = typeof mapped === 'string' ? mapped : '';
  if (record.subtitleTrack?.getAttribute('src') === loadUrl && loadUrl) return;
  record.subtitleTrack?.remove();
  record.subtitleTrack = null;
  if (!loadUrl) return;
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = '字幕';
  track.srclang = 'zh';
  track.default = true;
  track.setAttribute('data-preview-clip-track', record.id);
  track.src = loadUrl;
  record.media.appendChild(track);
  // jsdom and older browsers may not expose a TextTrack object yet. Native
  // browsers that do expose it need an explicit showing mode because the
  // preview media controls stay hidden.
  try {
    if (track.track) track.track.mode = 'showing';
  } catch {
    /* The native track remains attached and will be enabled when available. */
  }
  record.subtitleTrack = track;
}

/** Genuine URL-matched native metadata. No saved clip/box/default duration is used. */
export async function readClipTimelineMediaMetadata({
  url,
  loadUrl = url,
  kind,
  signal,
  timeoutMs = 15_000,
}) {
  const media = nativeMedia(kind, loadUrl);
  try {
    await awaitNative(media, () => media.readyState >= 1, {
      signal,
      timeoutMs,
      events: ['loadedmetadata', 'durationchange'],
      label: '媒体元数据',
    });
    if (
      !positive(media.duration) ||
      (kind !== 'audio' && (!positive(media.videoWidth) || !positive(media.videoHeight)))
    )
      throw new Error('媒体没有可用的时长或画面尺寸');
    return {
      url,
      sourceDuration: media.duration,
      width: kind === 'audio' ? 0 : media.videoWidth,
      height: kind === 'audio' ? 0 : media.videoHeight,
    };
  } finally {
    releaseMedia(media);
  }
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(abortError());
    };
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        if (!signal.aborted) resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        if (!signal.aborted) reject(error);
      },
    );
  });
}

function timedReader(promise, controller, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve(result);
    };
    const cancel = () => finish(abortError());
    const timer = setTimeout(() => {
      finish(new Error('媒体元数据准备超时'));
      controller.abort();
    }, timeoutMs);
    controller.signal.addEventListener('abort', cancel, { once: true });
    if (controller.signal.aborted) cancel();
    Promise.resolve(promise).then(
      (value) => finish(null, value),
      (error) => finish(error),
    );
  });
}

/** DOM/audio ownership controller. Pure clock/track/gain/transform rules stay in domain. */
export class ClipTimelinePlaybackRuntime {
  constructor(host, callbacks, publish) {
    this.host = host;
    this.callbacks = callbacks;
    this.publish = publish;
    this.live = true;
    this.sources = new Map();
    this.scenes = new Map();
    this.transition = null;
    this.subtitleRenderer = createSubtitlePreviewRenderer(host);
    this.textRenderer = new TextOverlayPreviewRuntime(host, (status) =>
      this.callbacks.current.onTextPreviewStatus?.(status),
    );
    this.htmlSubtitleRenderer = new HtmlSubtitlePreviewRuntime(host, (status) =>
      this.callbacks.current.onHtmlSubtitlePreviewStatus?.(status),
    );
    this.input = null;
    this.sceneSignature = null;
    this.sourceSignature = null;
    this.operation = null;
    this.raf = null;
    this.time = 0;
    this.intentPlaying = false;
    this.running = false;
    this.audioContext = null;
    this.lastStatus = null;
    this.status = null;
    this.playOwners = new WeakMap();
    this.extraUnsupported = new Set();
    this.contentHeight = null;
    this.generation = 0;
    this.resize = () => this.renderLayers();
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    if (this.observer && host.parentElement) this.observer.observe(host.parentElement);
    window.addEventListener('resize', this.resize);
  }

  notify(state) {
    if (!this.live) return;
    const signature = JSON.stringify(state);
    if (signature === this.lastStatus) return;
    this.lastStatus = signature;
    this.status = state;
    this.publish(state);
    this.callbacks.current.onPreparationChange?.(state);
    return true;
  }

  describe(time = this.time, includeEnd = !this.running) {
    const timeline = {
      ...this.input.timeline,
      clips: this.input.timeline.clips.map((clip) => {
        if (clip.type === 'audio') return clip;
        const media = this.scenes.get(clip.id)?.media;
        const metadata = this.sources.get(clip.sourceNodeId)?.metadata;
        const width = positive(media?.videoWidth) ? media.videoWidth : metadata?.width;
        const height = positive(media?.videoHeight) ? media.videoHeight : metadata?.height;
        return positive(width) && positive(height)
          ? {
              ...clip,
              width,
              height,
              sourceDuration: metadata?.sourceDuration ?? clip.sourceDuration,
            }
          : clip;
      }),
    };
    return describeClipTimelinePlayback(timeline, time, {
      includeEnd,
      outputSize: this.outputSize(),
      overlayHtmlSupported: this.textRenderer.canRender(this.input.timeline.overlayHtmlInline),
      htmlSubtitlesSupported: this.htmlSubtitleRenderer.canRender(this.input.htmlSubtitleLayers),
    });
  }

  outputSize() {
    if (positive(this.input.outputSize?.width) && positive(this.input.outputSize?.height))
      return this.input.outputSize;
    // Layout fallback comes from actual prepared media on the main/highest track,
    // never from the viewport/node box or a hardcoded media resolution.
    const videos = this.input.timeline.clips
      .filter((clip) => clip.type !== 'audio')
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    for (const clip of videos) {
      const metadata = this.sources.get(clip.sourceNodeId)?.metadata;
      if (positive(metadata?.width) && positive(metadata?.height))
        return { width: metadata.width, height: metadata.height };
    }
    return null;
  }

  unsupported(description) {
    return [...new Set([...description.unsupportedFlags, ...this.extraUnsupported])];
  }

  notifyContentHeight() {
    if (!this.input) return;
    const aspects = this.input.timeline.clips
      .filter((clip) => clip.type !== 'audio')
      .map((clip) => this.sources.get(clip.sourceNodeId)?.metadata)
      .filter((metadata) => positive(metadata?.width) && positive(metadata?.height))
      .map((metadata) => metadata.width / metadata.height);
    if (!aspects.length) return;
    const height = Math.min(Math.round(350 / Math.max(...aspects)), 1050);
    if (height === this.contentHeight) return;
    this.contentHeight = height;
    this.callbacks.current.onContentHeightRequired?.(height);
  }

  update(input) {
    if (!this.live) return;
    const previous = this.input;
    this.input = input;
    const resolveUrl = input.mapUrl ?? ((url) => url);
    const sources = [...input.mediaBySourceId].map(([id, source]) => [
      id,
      source.url,
      source.kind ?? 'video',
      resolveUrl(source.url),
    ]);
    const sourceSignature = JSON.stringify(sources);
    const sceneSignature = JSON.stringify([
      input.timeline.clips,
      input.timeline.videoTrackCount,
      input.timeline.videoAudioMuted,
      input.timeline.videoAudioMutedPerTrack,
      input.timeline.videoTrackHiddenPerTrack,
      input.timeline.videoAudioVolume,
      input.timeline.audioTrackMuted,
      input.timeline.audioTrackMutedPerTrack,
      input.timeline.audioTrackHiddenPerTrack,
      input.timeline.audioTrackVolume,
      input.outputSize,
    ]);
    const reader = input.metadataReader ?? readClipTimelineMediaMetadata;
    const changed =
      sourceSignature !== this.sourceSignature ||
      sceneSignature !== this.sceneSignature ||
      reader !== this.reader;
    this.reader = reader;
    this.sourceSignature = sourceSignature;
    this.sceneSignature = sceneSignature;
    for (const [id, record] of this.sources) {
      const current = input.mediaBySourceId.get(id);
      if (
        !current ||
        current.url !== record.url ||
        (current.kind ?? 'video') !== record.kind ||
        resolveUrl(current.url) !== record.loadUrl ||
        record.reader !== reader
      ) {
        record.live = false;
        record.abort.abort();
        this.sources.delete(id);
      }
    }
    for (const [id, source] of input.mediaBySourceId) {
      if (!source.url || this.sources.has(id)) continue;
      const record = {
        id,
        kind: source.kind ?? 'video',
        url: source.url,
        loadUrl: resolveUrl(source.url),
        abort: new AbortController(),
        live: true,
        metadata: null,
        error: null,
        reader,
      };
      this.sources.set(id, record);
      record.promise = timedReader(
        Promise.resolve().then(() => {
          if (!record.live || record.abort.signal.aborted) throw abortError();
          return reader({
            sourceId: id,
            url: record.url,
            loadUrl: record.loadUrl,
            kind: record.kind,
            signal: record.abort.signal,
            timeoutMs: input.metadataTimeoutMs ?? 15_000,
          });
        }),
        record.abort,
        input.metadataTimeoutMs ?? 15_000,
      )
        .then((metadata) => {
          if (
            !this.live ||
            !record.live ||
            record.abort.signal.aborted ||
            this.sources.get(id) !== record
          )
            throw abortError();
          if (
            metadata?.url !== record.url ||
            !positive(metadata?.sourceDuration) ||
            (record.kind !== 'audio' && (!positive(metadata.width) || !positive(metadata.height)))
          )
            throw new Error('媒体元数据与当前素材不匹配');
          record.metadata = {
            url: record.url,
            sourceDuration: metadata.sourceDuration,
            width: record.kind === 'audio' ? 0 : metadata.width,
            height: record.kind === 'audio' ? 0 : metadata.height,
          };
          this.callbacks.current.onMetadata?.(id, record.metadata);
          this.notifyContentHeight();
          return record.metadata;
        })
        .catch((error) => {
          record.error = error;
          throw error;
        });
      record.promise.catch(() => {});
    }
    const ids = new Set(input.timeline.clips.map((clip) => clip.id));
    for (const [id, record] of this.scenes) {
      const clip = input.timeline.clips.find((entry) => entry.id === id);
      const source = clip && input.mediaBySourceId.get(clip.sourceNodeId);
      if (
        !ids.has(id) ||
        source?.url !== record.url ||
        resolveUrl(source.url) !== record.loadUrl ||
        (clip.type === 'audio') !== (record.kind === 'audio')
      ) {
        this.disposeScene(record);
        this.scenes.delete(id);
      }
    }
    for (const clip of input.timeline.clips) {
      if (this.scenes.has(clip.id)) continue;
      const source = input.mediaBySourceId.get(clip.sourceNodeId);
      if (!source?.url) continue;
      const kind = clip.type === 'audio' ? 'audio' : 'video';
      const wrapper = document.createElement('div');
      wrapper.className = 'cv-clip-preview-layer';
      wrapper.dataset.clipId = clip.id;
      wrapper.hidden = true;
      const media = nativeMedia(kind, resolveUrl(source.url));
      media.dataset.previewClipId = clip.id;
      media.className = kind === 'audio' ? 'cv-clip-preview-audio' : 'cv-clip-preview-video';
      wrapper.appendChild(media);
      this.host.appendChild(wrapper);
      const record = {
        id: clip.id,
        sourceId: clip.sourceNodeId,
        kind,
        url: source.url,
        loadUrl: resolveUrl(source.url),
        media,
        wrapper,
        live: true,
        audio: kind === 'audio' ? media : null,
        sourceNode: null,
        gainNode: null,
      };
      record.errorListener = () => {
        if (this.live && record.live) this.fail(new Error('时间轴媒体不可读取'));
      };
      media.addEventListener('error', record.errorListener);
      this.scenes.set(clip.id, record);
    }
    for (const clip of input.timeline.clips) {
      const globalTrack = input.timeline.subtitles;
      const hasGlobal =
        globalTrack?.cues?.length ||
        globalTrack?.userCleared ||
        globalTrack?.visible === false ||
        input.htmlSubtitleLayers?.some((layer) => layer.nodeId === clip.sourceNodeId);
      syncSubtitleTrack(this.scenes.get(clip.id), hasGlobal ? null : clip, resolveUrl);
    }
    if (!previous) this.time = input.timeline.currentTime;
    // A preparation callback re-renders the last published UI time while the
    // native clock has already entered a new clip/transition. Only a changed
    // input time requests a seek; an unchanged UI echo must not cancel it.
    if (
      changed ||
      (!this.running && previous && input.timeline.currentTime !== previous.timeline.currentTime)
    ) {
      this.time = input.timeline.currentTime;
      this.stopLoop();
      this.pauseMedia();
      this.clearTransition();
      if (!this.retrying) this.queuePreparation();
    }
    this.renderLayers();
    if (
      previous &&
      input.textRetryKey !== previous.textRetryKey &&
      input.timeline.overlayHtmlInline
    )
      this.textRenderer.retry();
    if (previous && input.htmlSubtitleRetryKey !== previous.htmlSubtitleRetryKey)
      this.htmlSubtitleRenderer.retry();
    if (this.status)
      this.notify({ ...this.status, unsupportedFeatures: this.unsupported(this.describe()) });
    if (previous && input.playing !== previous.playing) {
      if (input.playing && !this.intentPlaying) this.play();
      else if (!input.playing && this.intentPlaying) this.pause();
    }
  }

  queuePreparation() {
    const generation = ++this.generation;
    this.cancelOperation();
    this.notify({
      ready: false,
      preparing: true,
      unsupportedFeatures: this.unsupported(this.describe()),
    });
    queueMicrotask(() => {
      if (this.live && generation === this.generation)
        this.prepare(this.time, { resume: this.intentPlaying });
    });
  }

  cancelOperation() {
    this.operation?.abort.abort();
    this.operation = null;
  }

  pauseMedia() {
    for (const record of [...this.scenes.values(), ...(this.transition?.records ?? [])]) {
      try {
        record.media.pause();
      } catch {
        /* Stop other tracks as well. */
      }
      if (record.audio && record.audio !== record.media) {
        try {
          record.audio.pause();
        } catch {
          /* Continue disposal. */
        }
      }
    }
  }

  stopLoop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.running = false;
  }

  fail(error) {
    if (!this.live || error?.name === 'AbortError') return;
    this.stopLoop();
    this.cancelOperation();
    this.pauseMedia();
    // A failed GPU context or decode record cannot service a retry. Keep source
    // metadata, but retire the entire visual pair before publishing the error.
    this.clearTransition();
    this.intentPlaying = false;
    this.callbacks.current.onPlayingChange?.(false);
    const changed = this.notify({
      ready: false,
      preparing: false,
      error: error.message || '加载媒体失败',
      unsupportedFeatures: this.unsupported(this.describe()),
    });
    if (changed) this.callbacks.current.onError?.(error);
  }

  async frameReady(record, time, signal) {
    if (!record?.live) throw new Error('片段媒体不可读取');
    const media = record.media;
    await awaitNative(media, () => media.readyState >= 1, {
      signal,
      timeoutMs: 10_000,
      events: ['loadedmetadata', 'durationchange'],
      label: '片段元数据',
    });
    if (
      !positive(media.duration) ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > media.duration + 0.001
    )
      throw new Error('片段超出实际媒体范围');
    if (record.kind !== 'audio' && (!positive(media.videoWidth) || !positive(media.videoHeight)))
      throw new Error('视频没有可用的实际画面尺寸');
    if (Math.abs(media.currentTime - time) > 0.001)
      media.currentTime = Math.min(time, media.duration);
    await awaitNative(media, () => !media.seeking && media.readyState >= 2, {
      signal,
      timeoutMs: 10_000,
      events: ['seeked', 'loadeddata', 'canplay', 'timeupdate'],
      label: record.kind === 'audio' ? '音频' : '视频帧',
    });
    if (record.kind !== 'audio') {
      const witness = document.createElement('canvas');
      witness.width = 1;
      witness.height = 1;
      const context = witness.getContext('2d');
      if (!context) throw new Error('无法确认视频预览帧');
      try {
        context.drawImage(media, 0, 0, 1, 1);
      } finally {
        witness.width = 0;
        witness.height = 0;
      }
    }
  }

  async prepare(time, { signal: externalSignal, resume = false } = {}) {
    if (!this.live || externalSignal?.aborted) return false;
    this.generation += 1;
    this.cancelOperation();
    this.stopLoop();
    this.pauseMedia();
    const operation = { abort: new AbortController(), generation: this.generation, probes: [] };
    this.operation = operation;
    const signal = operation.abort.signal;
    const cancel = () => operation.abort.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    const current = () => this.live && this.operation === operation && !signal.aborted;
    this.time = Math.max(0, Math.min(time, this.input.timeline.totalDuration));
    this.notify({
      ready: false,
      preparing: true,
      unsupportedFeatures: this.unsupported(this.describe()),
    });
    try {
      await abortable(
        Promise.all([...this.sources.values()].map((source) => source.promise)),
        signal,
      );
      if (!current()) return false;
      for (const clip of this.input.timeline.clips)
        if (!this.scenes.has(clip.id)) throw new Error('部分片段缺少可读取的素材连接');
      const represented = new Set([...this.scenes.values()].map((record) => record.sourceId));
      for (const source of this.sources.values()) {
        if (represented.has(source.id)) continue;
        operation.probes.push({
          kind: source.kind,
          live: true,
          media: nativeMedia(source.kind, source.loadUrl),
        });
      }
      // Sources not yet inserted by the metadata callback also need real data,
      // rather than allowing an empty draft to become ready from metadata alone.
      await Promise.all(operation.probes.map((record) => this.frameReady(record, 0, signal)));
      if (!current()) return false;
      // Every clip decodes its actual first/offset frame, including later and
      // hidden clips. Current composition then seeks every active layer.
      await Promise.all(
        this.input.timeline.clips.map((clip) =>
          this.frameReady(this.scenes.get(clip.id), clip.sourceOffset, signal),
        ),
      );
      if (!current()) return false;
      const description = this.describe(this.time, !resume);
      await Promise.all(
        [...description.activeVideos, ...description.activeAudios].map((entry) =>
          this.frameReady(this.scenes.get(entry.id), entry.sourceTime, signal),
        ),
      );
      if (!current()) return false;
      this.renderLayers();
      await this.htmlSubtitleRenderer.ready(signal);
      await this.prepareTransition(description.transition, signal, resume);
      if (!current()) return false;
      if (resume) await this.startMedia(description, signal);
      if (!current()) return false;
      this.notify({
        ready: true,
        preparing: false,
        unsupportedFeatures: this.unsupported(description),
      });
      this.callbacks.current.onTimeChange?.(this.time);
      if (resume) {
        this.intentPlaying = true;
        this.callbacks.current.onPlayingChange?.(true);
        this.startLoop();
      }
      return true;
    } catch (error) {
      if (current()) this.fail(error);
      return false;
    } finally {
      for (const record of operation.probes) {
        record.live = false;
        releaseMedia(record.media);
      }
      externalSignal?.removeEventListener('abort', cancel);
      if (this.operation === operation) {
        this.operation = null;
        if (signal.aborted && this.live) {
          this.pauseMedia();
          this.notify({
            ready: false,
            preparing: false,
            unsupportedFeatures: this.unsupported(this.describe()),
          });
        }
      }
    }
  }

  ensureAudio(record) {
    if (!record.audio) record.audio = nativeMedia('audio', record.loadUrl);
    if (!record.sourceNode) {
      const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (Constructor) {
        try {
          this.audioContext ??= new Constructor();
          const source = this.audioContext.createMediaElementSource(record.audio);
          const gain = this.audioContext.createGain();
          source.connect(gain);
          gain.connect(this.audioContext.destination);
          record.sourceNode = source;
          record.gainNode = gain;
        } catch {
          this.extraUnsupported.add('web-audio-unavailable');
        }
      }
    }
    return record.audio;
  }

  async startMedia(description, signal) {
    if (
      [...description.activeVideos, ...description.activeAudios].some(
        (entry) => !entry.nativeRateSupported,
      )
    )
      throw new Error('当前片段速度超过原生预览支持范围，请降低速度后播放');
    const required = [...description.activeVideos, ...description.activeAudios].filter(
      (entry) => entry.audioEligible,
    );
    for (const entry of required) {
      const record = this.scenes.get(entry.id);
      const audio = this.ensureAudio(record);
      audio.muted = entry.muted;
      if (!record.gainNode && entry.gain > 1) {
        this.extraUnsupported.add('audio-amplification');
        throw new Error('当前浏览器无法应用音轨增益');
      }
      if (record.gainNode) {
        record.gainNode.gain.value = entry.gain;
        audio.volume = 1;
      } else audio.volume = entry.gain;
      audio.playbackRate = entry.nativePlaybackRate;
      await awaitNative(audio, () => audio.readyState >= 1, {
        signal,
        timeoutMs: 10_000,
        events: ['loadedmetadata'],
        label: '音轨元数据',
      });
      audio.currentTime = entry.sourceTime;
      await awaitNative(audio, () => !audio.seeking && audio.readyState >= 2, {
        signal,
        timeoutMs: 10_000,
        events: ['seeked', 'loadeddata', 'canplay'],
        label: '音轨',
      });
    }
    if (this.audioContext) await abortable(this.audioContext.resume(), signal);
    await abortable(
      Promise.all(
        required.map((entry) => {
          const record = this.scenes.get(entry.id);
          return this.playOwned(record, record.audio, signal);
        }),
      ),
      signal,
    );
    if (
      required.some((entry) => this.scenes.get(entry.id).audio.paused) ||
      (required.length && this.audioContext && this.audioContext.state !== 'running')
    )
      throw new Error('音轨播放被拒绝');
    await abortable(
      Promise.all(
        description.activeVideos.map((entry) => {
          const media = this.scenes.get(entry.id).media;
          media.muted = true;
          media.playbackRate = entry.nativePlaybackRate;
          return this.playOwned(this.scenes.get(entry.id), media, signal);
        }),
      ),
      signal,
    );
  }

  playOwned(record, media, signal) {
    const owner = {};
    this.playOwners.set(media, owner);
    return Promise.resolve(media.play()).then(() => {
      if (this.playOwners.get(media) === owner && (!this.live || !record.live || signal.aborted))
        media.pause();
    });
  }

  clearTransition() {
    const current = this.transition;
    if (!current) return;
    this.transition = null;
    current.renderer.dispose();
    for (const record of current.records) {
      record.live = false;
      record.media.removeEventListener('error', record.errorListener);
      releaseMedia(record.media);
    }
    current.canvas.remove();
  }

  transitionKey(frame) {
    if (!frame) return null;
    return JSON.stringify([
      frame.id,
      frame.type,
      frame.startTime,
      frame.endTime,
      ...[frame.from, frame.to].map((entry) => {
        const source = this.sources.get(entry.sourceNodeId);
        return [entry.clipId, source?.url, source?.loadUrl];
      }),
      this.outputSize(),
    ]);
  }

  async prepareTransition(frame, signal, resume) {
    if (!frame) {
      this.clearTransition();
      return;
    }
    const key = this.transitionKey(frame);
    if (this.transition?.key !== key) {
      this.clearTransition();
      const size = this.outputSize();
      if (!size) throw new Error('转场缺少实际输出尺寸');
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.className = 'cv-clip-preview-transition';
      canvas.dataset.previewTransition = frame.type;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.hidden = true;
      const renderer = createClipTransitionRenderer(canvas, frame.type);
      const current = { key, canvas, renderer, records: [], prepared: false };
      this.transition = current;
      for (const entry of [frame.from, frame.to]) {
        const source = this.sources.get(entry.sourceNodeId);
        if (!source?.loadUrl) throw new Error('转场素材不可读取');
        const record = { kind: 'video', live: true, media: nativeMedia('video', source.loadUrl) };
        record.media.dataset.transitionSource = entry.clipId;
        record.errorListener = () => {
          if (this.live && record.live) this.fail(new Error('转场视频不可读取'));
        };
        record.media.addEventListener('error', record.errorListener);
        current.records.push(record);
      }
      this.host.appendChild(canvas);
    }
    const current = this.transition;
    current.prepared = false;
    const entries = [frame.from, frame.to];
    await Promise.all(
      entries.map((entry, index) => this.frameReady(current.records[index], entry.time, signal)),
    );
    if (signal.aborted || !this.live || this.transition !== current) throw abortError();
    if (resume) {
      await Promise.all(
        entries.map((entry, index) => {
          const record = current.records[index];
          if (entry.rate < 0.0625) return;
          if (entry.rate > 16.000001) throw new Error('当前转场速度超过原生预览支持范围');
          record.media.playbackRate = Math.min(16, entry.rate);
          return this.playOwned(record, record.media, signal);
        }),
      );
    }
    if (signal.aborted || !this.live || this.transition !== current) throw abortError();
    current.prepared = true;
    if (!this.renderTransition(frame)) throw new Error('转场画面尚不可读取，请重试');
  }

  renderTransition(frame) {
    const current = this.transition;
    if (!current) return !frame;
    if (!frame || this.transitionKey(frame) !== current.key) {
      current.canvas.hidden = true;
      return !frame;
    }
    if (!current.prepared) return false;
    const drawn = current.renderer.render(
      current.records[0].media,
      current.records[1].media,
      frame.progress,
    );
    current.canvas.hidden = !drawn;
    return drawn;
  }

  renderLayers() {
    if (!this.live || !this.input) return;
    const description = this.describe();
    const size = this.outputSize();
    if (size) {
      this.host.style.aspectRatio = `${size.width} / ${size.height}`;
      const rect = this.host.parentElement?.getBoundingClientRect();
      if (rect?.width > 0 && rect?.height > 0) {
        const ratio = Math.min(rect.width / size.width, rect.height / size.height);
        this.host.style.width = `${size.width * ratio}px`;
        this.host.style.height = `${size.height * ratio}px`;
      }
    }
    const visible = new Set(description.activeVideos.map((entry) => entry.id));
    for (const record of this.scenes.values()) record.wrapper.hidden = !visible.has(record.id);
    description.activeVideos.forEach((entry, index) => {
      const record = this.scenes.get(entry.id);
      if (!record) return;
      record.wrapper.style.zIndex = String(index);
      const matrix = entry.transform;
      record.wrapper.style.transform = size
        ? `translate(${(matrix[0][2] / size.width) * 100}%, ${(matrix[1][2] / size.height) * 100}%) scale(${matrix[0][0]})`
        : `scale(${matrix[0][0]})`;
      record.media.style.clipPath =
        entry.maskShape === 'circle' ? 'circle(closest-side at 50% 50%)' : '';
      const fit = entry.contentFitRect;
      if (fit && size) {
        record.media.style.left = `${(fit.dx / size.width) * 100}%`;
        record.media.style.top = `${(fit.dy / size.height) * 100}%`;
        record.media.style.width = `${(fit.dw / size.width) * 100}%`;
        record.media.style.height = `${(fit.dh / size.height) * 100}%`;
      }
    });
    const rendered = this.renderTransition(description.transition);
    this.htmlSubtitleRenderer.render(
      this.input.htmlSubtitleLayers,
      this.input.timeline,
      this.time,
      description,
      size,
      this.textRenderer.activeModel,
    );
    this.textRenderer.render(
      this.input.timeline,
      this.time,
      this.input.htmlSubtitleLayers?.length ? this.htmlSubtitleRenderer.trackCount : undefined,
    );
    this.subtitleRenderer.render(
      this.input.timeline,
      this.time,
      description,
      size,
      this.textRenderer.vttIndex(),
    );
    return rendered;
  }

  playbackSignature(description) {
    return JSON.stringify([
      [...description.activeVideos, ...description.activeAudios].map((entry) => entry.id),
      description.transition
        ? [this.transitionKey(description.transition), description.transition.phase]
        : null,
    ]);
  }

  startLoop() {
    this.stopLoop();
    this.running = true;
    this.renderLayers();
    const startTime = this.time;
    const startedAt = performance.now();
    let signature = this.playbackSignature(this.describe(this.time, false));
    const tick = () => {
      if (!this.live || !this.running) return;
      this.time = Math.min(
        this.input.timeline.totalDuration,
        startTime + (performance.now() - startedAt) / 1000,
      );
      if (this.time >= this.input.timeline.totalDuration) {
        this.stopLoop();
        this.pauseMedia();
        this.renderLayers();
        this.callbacks.current.onTimeChange?.(this.time);
        this.intentPlaying = false;
        this.callbacks.current.onPlayingChange?.(false);
        return;
      }
      const description = this.describe(this.time, false);
      const nextSignature = this.playbackSignature(description);
      if (nextSignature !== signature) {
        signature = nextSignature;
        this.prepare(this.time, { resume: true });
        return;
      }
      for (const entry of [...description.activeVideos, ...description.activeAudios]) {
        const record = this.scenes.get(entry.id);
        if (!record) continue;
        for (const media of new Set([record.media, record.audio].filter(Boolean)))
          if (media.readyState >= 2 && Math.abs(media.currentTime - entry.sourceTime) > 0.18)
            media.currentTime = entry.sourceTime;
      }
      if (description.transition) {
        const entries = [description.transition.from, description.transition.to];
        if (
          entries.some((entry, index) => {
            const media = this.transition?.records[index]?.media;
            return (
              !media ||
              media.seeking ||
              media.readyState < 2 ||
              Math.abs(media.currentTime - entry.time) > 0.18
            );
          })
        ) {
          this.prepare(this.time, { resume: true });
          return;
        }
      } else this.clearTransition();
      const drawn = this.renderLayers();
      if (description.transition && !drawn) {
        this.fail(new Error('转场画面不可读取，请重试'));
        return;
      }
      this.callbacks.current.onTimeChange?.(this.time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  seekAndWait(time, options = {}) {
    const failed = [...this.sources.values()].filter((source) => source.error);
    for (const source of failed) {
      source.live = false;
      source.abort.abort();
      this.sources.delete(source.id);
    }
    if (failed.length) {
      this.sourceSignature = null;
      this.retrying = true;
      this.update(this.input);
      this.retrying = false;
    }
    return this.prepare(time, { ...options, resume: this.intentPlaying });
  }

  play() {
    if (!this.live) return Promise.resolve(false);
    this.intentPlaying = true;
    for (const entry of [...this.describe().activeVideos, ...this.describe().activeAudios])
      if (entry.audioEligible) {
        const record = this.scenes.get(entry.id);
        if (record) this.ensureAudio(record);
      }
    // Resume inside the user's activation, before asynchronous preparation.
    this.audioContext?.resume().catch(() => {});
    return this.prepare(this.time, { resume: true });
  }

  pause() {
    if (!this.live) return;
    this.intentPlaying = false;
    this.generation += 1;
    this.cancelOperation();
    this.stopLoop();
    this.pauseMedia();
    if (this.status?.preparing)
      this.notify({
        ready: false,
        preparing: false,
        unsupportedFeatures: this.unsupported(this.describe()),
      });
    this.callbacks.current.onPlayingChange?.(false);
  }

  disposeScene(record) {
    record.live = false;
    record.media.removeEventListener('error', record.errorListener);
    try {
      record.sourceNode?.disconnect();
    } catch {
      /* Continue native cleanup. */
    }
    try {
      record.gainNode?.disconnect();
    } catch {
      /* Continue native cleanup. */
    }
    releaseMedia(record.media);
    if (record.audio && record.audio !== record.media) releaseMedia(record.audio);
    record.wrapper.remove();
  }

  dispose() {
    if (!this.live) return;
    this.live = false;
    this.cancelOperation();
    this.stopLoop();
    for (const source of this.sources.values()) {
      source.live = false;
      source.abort.abort();
    }
    this.sources.clear();
    for (const record of this.scenes.values()) this.disposeScene(record);
    this.scenes.clear();
    this.clearTransition();
    this.subtitleRenderer.dispose();
    this.htmlSubtitleRenderer.dispose();
    this.textRenderer.dispose();
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.observer?.disconnect();
    window.removeEventListener('resize', this.resize);
  }
}

export function useClipTimelinePlayback({ hostRef, documentKey, nodeId, ...input }) {
  const [state, setState] = useState({ ready: false, preparing: true, unsupportedFeatures: [] });
  const owner = useMemo(() => ({ documentKey, nodeId }), [documentKey, nodeId]);
  const current = useRef(null);
  const callbacks = useRef(input);
  useLayoutEffect(() => {
    callbacks.current = input;
  });
  useLayoutEffect(() => {
    const runtime = new ClipTimelinePlaybackRuntime(hostRef.current, callbacks, setState);
    current.current = { owner, runtime };
    runtime.update(callbacks.current);
    return () => {
      if (current.current?.runtime === runtime) current.current = null;
      runtime.dispose();
    };
  }, [owner, hostRef]);
  useLayoutEffect(() => {
    if (current.current?.owner === owner) current.current.runtime.update(input);
  });
  const call = (method, ...args) =>
    current.current?.owner === owner ? current.current.runtime[method](...args) : false;
  return {
    state,
    seekAndWait: (time, options) => call('seekAndWait', time, options),
    play: () => call('play'),
    pause: () => call('pause'),
  };
}
