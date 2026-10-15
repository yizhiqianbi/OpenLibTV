import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClipTimelinePlaybackRuntime,
  readClipTimelineMediaMetadata,
} from './useClipTimelinePlayback.js';

const videos = [];
const audios = [];
let draw;
let originalCreate;
function metadata(url, width = 1280, height = 720, sourceDuration = 12) {
  return { url, sourceDuration, width, height };
}
function nativeReady(element, values = {}, frame = true) {
  for (const [key, value] of Object.entries({
    duration: 12,
    videoWidth: 1280,
    videoHeight: 720,
    readyState: frame ? 2 : 1,
    seeking: false,
    ...values,
  }))
    Object.defineProperty(element, key, { configurable: true, value });
  element.dispatchEvent(new Event('loadedmetadata'));
  if (frame) element.dispatchEvent(new Event('loadeddata'));
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
function clip(id, sourceNodeId, extra = {}) {
  return {
    id,
    sourceNodeId,
    type: 'video',
    zIndex: 0,
    startTime: 0,
    duration: 5,
    sourceOffset: 0,
    sourceDuration: 900,
    width: 350,
    height: 350,
    embedAudioMuted: true,
    ...extra,
  };
}
function timeline(clips) {
  return {
    clips,
    videoTrackCount: 1,
    currentTime: 0,
    totalDuration: 10,
    videoAudioVolume: 1,
    audioTrackVolume: 1,
  };
}
function context(clips = [clip('one', 'v1')], overrides = {}) {
  const host = document.createElement('div');
  const outer = document.createElement('div');
  outer.getBoundingClientRect = () => ({ width: 800, height: 450 });
  outer.appendChild(host);
  document.body.appendChild(outer);
  const input = {
    timeline: timeline(clips),
    mediaBySourceId: new Map([['v1', { url: '/one.mp4', kind: 'video' }]]),
    playing: false,
    metadataReader: vi.fn(({ url, kind }) =>
      Promise.resolve(metadata(url, kind === 'audio' ? 0 : 1280, kind === 'audio' ? 0 : 720)),
    ),
    ...overrides,
  };
  const callbacks = {
    current: {
      onMetadata: vi.fn(),
      onContentHeightRequired: vi.fn(),
      onPreparationChange: vi.fn(),
      onTimeChange: vi.fn(),
      onPlayingChange: vi.fn(),
      onError: vi.fn(),
    },
  };
  const publish = vi.fn();
  const runtime = new ClipTimelinePlaybackRuntime(host, callbacks, publish);
  runtime.update(input);
  return {
    host,
    outer,
    input,
    runtime,
    callbacks: callbacks.current,
    publish,
    scene: (id) => runtime.scenes.get(id),
  };
}
const runtimes = [];
function setup(...args) {
  const result = context(...args);
  runtimes.push(result.runtime);
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  videos.length = 0;
  audios.length = 0;
  draw = vi.fn();
  originalCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((name, ...args) => {
    const element = originalCreate(name, ...args);
    if (name === 'video') videos.push(element);
    if (name === 'audio') audios.push(element);
    return element;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    drawImage: draw,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
});
afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.dispose();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('URL-matched actual native metadata boundary', () => {
  it('reports video dimensions/duration from the native resource, ignoring any saved clip defaults', async () => {
    const abort = new AbortController();
    const promise = readClipTimelineMediaMetadata({
      url: 'source.mp4',
      loadUrl: '/actual.mp4',
      kind: 'video',
      signal: abort.signal,
    });
    const video = videos[0];
    expect(video.getAttribute('src')).toBe('/actual.mp4');
    nativeReady(video, { duration: 27.125, videoWidth: 720, videoHeight: 1280 }, false);
    await expect(promise).resolves.toEqual({
      url: 'source.mp4',
      sourceDuration: 27.125,
      width: 720,
      height: 1280,
    });
    expect(video.getAttribute('src')).toBeNull();
    expect(video.parentNode).toBeNull();
  });

  it('reports real audio duration with zero dimensions and releases after abort or timeout', async () => {
    const controller = new AbortController();
    const promise = readClipTimelineMediaMetadata({
      url: '/sound.mp3',
      kind: 'audio',
      signal: controller.signal,
    });
    nativeReady(audios[0], { duration: 149.88 }, false);
    await expect(promise).resolves.toEqual({
      url: '/sound.mp3',
      sourceDuration: 149.88,
      width: 0,
      height: 0,
    });
    const cancelled = new AbortController();
    const failed = readClipTimelineMediaMetadata({
      url: '/pending.mp4',
      kind: 'video',
      signal: cancelled.signal,
    });
    const rejected = expect(failed).rejects.toMatchObject({ name: 'AbortError' });
    cancelled.abort();
    await rejected;
    expect(videos.at(-1).getAttribute('src')).toBeNull();
    const timeout = readClipTimelineMediaMetadata({
      url: '/timeout.mp4',
      kind: 'video',
      signal: new AbortController().signal,
    });
    const timed = expect(timeout).rejects.toThrow('媒体元数据准备超时');
    vi.advanceTimersByTime(15_000);
    await timed;
    expect(videos.at(-1).getAttribute('src')).toBeNull();
  });

  it.each([
    [{ duration: 0 }, '媒体没有可用'],
    [{ duration: Infinity }, '媒体没有可用'],
    [{ videoWidth: 0 }, '媒体没有可用'],
    [{ videoHeight: 0 }, '媒体没有可用'],
  ])(
    'rejects unknown required resource metadata %o instead of using five seconds/box dimensions',
    async (values, message) => {
      const promise = readClipTimelineMediaMetadata({
        url: '/bad.mp4',
        kind: 'video',
        signal: new AbortController().signal,
      });
      const rejected = expect(promise).rejects.toThrow(message);
      nativeReady(videos.at(-1), values, false);
      await rejected;
    },
  );
});

describe('actual multitrack playback and cancellation ownership', () => {
  it('mounts a URL-matched native subtitle track and retires it when the clip source changes', () => {
    const c = setup([clip('one', 'v1', { subtitleUrl: '/caption.vtt' })], {
      mapUrl: (url) => `/mapped${url}`,
    });
    const first = c.scene('one').media.querySelector('track');
    expect(first).toBeTruthy();
    expect(first.kind).toBe('subtitles');
    expect(first.getAttribute('src')).toBe('/mapped/caption.vtt');
    expect(first.default).toBe(true);
    expect(c.runtime.describe().unsupportedFlags).not.toContain('subtitle-vtt');

    c.input = {
      ...c.input,
      timeline: {
        ...c.input.timeline,
        clips: [clip('one', 'v1', { subtitleUrl: '/replacement.vtt' })],
      },
    };
    c.runtime.update(c.input);
    expect(c.scene('one').media.querySelector('track')).not.toBe(first);
    expect(c.scene('one').media.querySelector('track').getAttribute('src')).toBe(
      '/mapped/replacement.vtt',
    );

    c.input = {
      ...c.input,
      timeline: { ...c.input.timeline, clips: [clip('one', 'v1')] },
    };
    c.runtime.update(c.input);
    expect(c.scene('one').media.querySelector('track')).toBeNull();
  });

  it('reports the source-derived embedded preview height once per aspect change', async () => {
    const c = setup([clip('one', 'v1')], {
      metadataReader: vi.fn(({ url }) => Promise.resolve(metadata(url, 720, 1280, 12))),
    });
    for (const media of videos)
      nativeReady(media, { duration: 12, videoWidth: 720, videoHeight: 1280 });
    await settle();
    expect(c.callbacks.onContentHeightRequired).toHaveBeenCalledWith(622);
    expect(c.callbacks.onContentHeightRequired).toHaveBeenCalledTimes(1);
    c.runtime.update(c.input);
    expect(c.callbacks.onContentHeightRequired).toHaveBeenCalledTimes(1);
  });

  function webAudio() {
    const contexts = [];
    class Context {
      constructor() {
        this.state = 'suspended';
        this.destination = {};
        this.nodes = [];
        this.gains = [];
        this.resume = vi.fn(() => {
          this.state = 'running';
          return Promise.resolve();
        });
        this.close = vi.fn(() => {
          this.state = 'closed';
          return Promise.resolve();
        });
        contexts.push(this);
      }
      createMediaElementSource(media) {
        const node = { media, connect: vi.fn(), disconnect: vi.fn() };
        this.nodes.push(node);
        return node;
      }
      createGain() {
        const node = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
        this.gains.push(node);
        return node;
      }
    }
    vi.stubGlobal('AudioContext', Context);
    return contexts;
  }

  it('plays all visible video audio and independent audio tracks with WebAudio gains above native volume 1', async () => {
    const contexts = webAudio();
    const clips = [
      clip('main', 'v1', {
        zIndex: 1,
        embedAudioMuted: false,
        decibel: 20,
        sourceOffset: 1,
        speed: 2,
      }),
      clip('overlay', 'v1', { embedAudioMuted: false, decibel: 10, sourceOffset: 2 }),
      clip('hidden', 'v1', { zIndex: 2, embedAudioMuted: false }),
      clip('voice', 'a1', {
        type: 'audio',
        zIndex: 3,
        decibel: 20,
        sourceOffset: 3,
        linkedVideoClipId: 'hidden',
      }),
      clip('music', 'a1', { type: 'audio', zIndex: 4, decibel: 0, sourceOffset: 4 }),
    ];
    const c = setup(clips, {
      timeline: {
        ...timeline(clips),
        videoTrackCount: 3,
        videoTrackHiddenPerTrack: [false, false, true],
        videoAudioVolume: 0.5,
        audioTrackVolume: 0.25,
      },
      mediaBySourceId: new Map([
        ['v1', { url: '/one.mp4', kind: 'video' }],
        ['a1', { url: '/sound.mp3', kind: 'audio' }],
      ]),
    });
    for (const media of [...videos, ...audios]) nativeReady(media);
    await settle();
    const playing = c.runtime.play();
    for (const audio of audios) nativeReady(audio);
    await expect(playing).resolves.toBe(true);
    const [context] = contexts;
    expect(context.nodes).toHaveLength(4);
    const gains = context.gains.map((gain) => gain.gain.value);
    expect([gains[0], gains[2], gains[3]]).toEqual([2.5, 1.25, 0.25]);
    expect(gains[1]).toBeCloseTo(1.5, 12);
    expect(context.nodes.map((node) => node.media.currentTime)).toEqual([1, 2, 3, 4]);
    expect(context.nodes.map((node) => node.media.playbackRate)).toEqual([2, 1, 1, 1]);
    expect(context.nodes.every((node) => node.media.volume === 1 && !node.media.paused)).toBe(true);
    expect(c.scene('main').media.muted).toBe(true);
    expect(c.scene('overlay').media.paused).toBe(false);
    expect(c.scene('hidden').media.paused).toBe(true);
    c.runtime.pause();
    expect([...videos, ...audios].every((media) => media.paused)).toBe(true);
    expect(c.runtime.raf).toBeNull();
    c.runtime.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(context.nodes.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect(context.gains.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true);
    expect([...videos, ...audios].every((media) => media.getAttribute('src') === null)).toBe(true);
  });

  it('reports an actual unavailable gain capability instead of silently clamping amplification to native volume 1', async () => {
    const c = setup([clip('one', 'v1', { embedAudioMuted: false, decibel: 20 })]);
    nativeReady(c.scene('one').media);
    await settle();
    await expect(c.runtime.play()).resolves.toBe(false);
    expect(c.publish.mock.calls.at(-1)[0]).toMatchObject({
      ready: false,
      preparing: false,
      error: '当前浏览器无法应用音轨增益',
      unsupportedFeatures: ['audio-amplification'],
    });
    expect(audios.every((media) => media.paused)).toBe(true);
  });

  it('updates source clocks after 0.18s drift, changes clips at the end-exclusive boundary and pauses all media at timeline end', async () => {
    const frames = new Map();
    let next = 0;
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      frames.set(++next, callback);
      return next;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    const step = async (ms) => {
      now = ms;
      const callback = frames.values().next().value;
      frames.clear();
      callback();
      await settle();
    };
    const clips = [
      clip('one', 'v1', { duration: 1, sourceOffset: 2, speed: 2 }),
      clip('two', 'v1', { startTime: 1, duration: 1, sourceOffset: 6 }),
    ];
    const c = setup(clips, { timeline: { ...timeline(clips), totalDuration: 2 } });
    for (const media of videos) nativeReady(media);
    await settle();
    await expect(c.runtime.play()).resolves.toBe(true);
    await step(100);
    expect(c.scene('one').media.currentTime).toBe(2.2);
    await step(1000);
    expect(c.scene('one').media.paused).toBe(true);
    expect(c.scene('two').media.paused).toBe(false);
    expect(c.scene('two').media.currentTime).toBe(6);
    expect(c.scene('one').wrapper.hidden).toBe(true);
    await step(2000);
    expect(c.callbacks.onTimeChange.mock.calls.at(-1)).toEqual([2]);
    expect(c.callbacks.onPlayingChange.mock.calls.at(-1)).toEqual([false]);
    expect(videos.every((media) => media.paused)).toBe(true);
    expect(frames.size).toBe(0);
  });

  it('leaves no stuck preparation when explicitly paused before metadata/frame completion', async () => {
    const c = setup();
    await settle();
    c.runtime.pause();
    await settle();
    expect(c.publish.mock.calls.at(-1)[0]).toMatchObject({ ready: false, preparing: false });
    nativeReady(c.scene('one').media);
    await settle();
    expect(c.publish.mock.calls.at(-1)[0].ready).toBe(false);
    await expect(c.runtime.seekAndWait(0)).resolves.toBe(true);
  });
  it('does not rewind or cancel boundary preparation when its status callback echoes the last UI time', async () => {
    const clips = [clip('one', 'v1'), clip('two', 'v1', { startTime: 5, sourceOffset: 5 })];
    const c = setup(clips);
    for (const media of videos) nativeReady(media);
    await settle();
    c.callbacks.onPreparationChange.mockImplementation((status) => {
      if (status.preparing) c.runtime.update({ ...c.runtime.input });
    });
    const waiting = c.runtime.prepare(5.016, { resume: true });
    expect(c.runtime.time).toBe(5.016);
    await expect(waiting).resolves.toBe(true);
    expect(c.scene('two').media.paused).toBe(false);
    expect(c.runtime.running).toBe(true);
    expect(c.callbacks.onTimeChange).toHaveBeenLastCalledWith(5.016);
    // A genuinely changed controlled time still requests a fresh seek.
    c.runtime.pause();
    c.runtime.update({ ...c.input, timeline: { ...c.input.timeline, currentTime: 2 } });
    await settle();
    expect(c.runtime.time).toBe(2);
  });

  it('pauses a late native play resolution after its owner has been disposed', async () => {
    const c = setup();
    nativeReady(c.scene('one').media);
    await settle();
    const media = c.scene('one').media;
    let finish;
    vi.spyOn(media, 'play').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => {
            Object.defineProperty(media, 'paused', { configurable: true, value: false });
            resolve();
          };
        }),
    );
    const playing = c.runtime.play();
    await settle();
    expect(finish).toBeTypeOf('function');
    c.runtime.dispose();
    await expect(playing).resolves.toBe(false);
    finish();
    await settle();
    expect(media.paused).toBe(true);
    expect(media.getAttribute('src')).toBeNull();
    expect(c.callbacks.onPlayingChange.mock.calls.some(([state]) => state === true)).toBe(false);
  });

  it('does not let a canceled play lease pause a later valid play on the same retained video', async () => {
    const c = setup();
    nativeReady(c.scene('one').media);
    await settle();
    const media = c.scene('one').media;
    let finishOld;
    vi.spyOn(media, 'play')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(() => {
        Object.defineProperty(media, 'paused', { configurable: true, value: false });
        return Promise.resolve();
      });
    const old = c.runtime.play();
    await settle();
    c.runtime.pause();
    await expect(old).resolves.toBe(false);
    await expect(c.runtime.play()).resolves.toBe(true);
    finishOld();
    await settle();
    expect(media.paused).toBe(false);
    expect(c.runtime.running).toBe(true);
  });
});

describe('centered transition media preparation and lifecycle', () => {
  function transitionSetup(type = 'fade') {
    const clips = [
      clip('one', 'v1', { speed: 2, sourceOffset: 1 }),
      clip('two', 'v2', { startTime: 5, sourceOffset: 2, transitionIn: { type, duration: 2 } }),
    ];
    return setup(clips, {
      timeline: { ...timeline(clips), currentTime: 4.5 },
      mediaBySourceId: new Map([
        ['v1', { url: '/one.mp4', kind: 'video' }],
        ['v2', { url: '/two.mp4', kind: 'video' }],
      ]),
    });
  }
  async function readyScenes(c) {
    for (const record of c.runtime.scenes.values()) nativeReady(record.media);
    await settle();
    expect(c.runtime.transition).toBeTruthy();
    for (const record of c.runtime.transition.records) nativeReady(record.media);
    await settle();
  }

  it.each(['fade', 'fadeblack', 'fadewhite'])(
    'prepares both %s frames with actual URLs and keeps audio on the ordinary timeline',
    async (type) => {
      const c = transitionSetup(type);
      for (const record of c.runtime.scenes.values()) nativeReady(record.media);
      await settle();
      const pair = c.runtime.transition;
      expect(pair.canvas.hidden).toBe(true);
      expect(c.runtime.status.ready).toBe(false);
      expect(pair.records.map((record) => record.media.getAttribute('src'))).toEqual([
        '/one.mp4',
        '/two.mp4',
      ]);
      nativeReady(pair.records[0].media);
      await settle();
      expect(c.runtime.status.ready).toBe(false);
      nativeReady(pair.records[1].media);
      await settle();
      expect(c.runtime.status.ready).toBe(true);
      expect(pair.canvas.hidden).toBe(false);
      expect(pair.records.map((record) => record.media.currentTime)).toEqual([10, 2]);
      expect(pair.records.every((record) => record.media.muted)).toBe(true);
      const seek = c.runtime.seekAndWait(5.5);
      await expect(seek).resolves.toBe(true);
      expect(pair.records[0].media.currentTime).toBeCloseTo(10.998);
      expect(pair.records[1].media.currentTime).toBe(2.5);
      expect(
        c.runtime.describe().activeVideos.map((entry) => [entry.id, entry.sourceTime]),
      ).toEqual([['two', 2.5]]);
      expect(c.runtime.status.unsupportedFeatures).not.toContain('transition-preview');
      await expect(c.runtime.seekAndWait(7)).resolves.toBe(true);
      expect(c.runtime.transition).toBeNull();
      expect(pair.canvas.parentNode).toBeNull();
      expect(
        pair.records.every((record) => !record.live && !record.media.getAttribute('src')),
      ).toBe(true);
    },
  );

  it('retires pending transition preparation and all detached media on update/unmount without publishing a late frame', async () => {
    const c = transitionSetup();
    for (const record of c.runtime.scenes.values()) nativeReady(record.media);
    await settle();
    const previous = c.runtime.transition;
    c.runtime.update({ ...c.input, timeline: { ...c.input.timeline, currentTime: 1 } });
    for (const record of previous.records) nativeReady(record.media);
    await settle();
    expect(c.runtime.transition).toBeNull();
    expect(c.runtime.time).toBe(1);
    expect(previous.records.every((record) => !record.live)).toBe(true);
    c.runtime.update(c.input);
    await settle();
    const last = c.runtime.transition;
    c.runtime.dispose();
    const calls = c.publish.mock.calls.length;
    for (const record of last.records) nativeReady(record.media);
    await settle();
    expect(c.publish).toHaveBeenCalledTimes(calls);
    expect(last.records.every((record) => !record.media.getAttribute('src'))).toBe(true);
    expect(c.host.querySelector('canvas')).toBeNull();
  });

  it('plays only the moving side, pauses both on user pause, and surfaces rendering failure', async () => {
    const c = transitionSetup();
    await readyScenes(c);
    const pair = c.runtime.transition;
    await expect(c.runtime.play()).resolves.toBe(true);
    expect(pair.records[0].media.paused).toBe(false);
    expect(pair.records[1].media.paused).toBe(true);
    c.runtime.pause();
    expect(pair.records.every((record) => record.media.paused)).toBe(true);
    pair.renderer.render = () => false;
    await expect(c.runtime.seekAndWait(4.7)).resolves.toBe(false);
    expect(c.runtime.status).toMatchObject({
      ready: false,
      preparing: false,
      error: '转场画面尚不可读取，请重试',
    });
    expect(pair.canvas.hidden).toBe(true);
    expect(c.runtime.transition).toBeNull();
    expect(pair.records.every((record) => !record.live && !record.media.getAttribute('src'))).toBe(
      true,
    );
    const retry = c.runtime.seekAndWait(4.7);
    await settle();
    const replacement = c.runtime.transition;
    expect(replacement).not.toBe(pair);
    for (const record of replacement.records) nativeReady(record.media);
    await expect(retry).resolves.toBe(true);
    expect(replacement.canvas.hidden).toBe(false);
    expect(c.runtime.status).toMatchObject({ ready: true, preparing: false });
  });
});

describe('real multi-layer frame preparation and source ownership', () => {
  it('does not become ready on injected metadata alone; every video must decode including later/hidden clips', async () => {
    const c = setup(
      [
        clip('one', 'v1'),
        clip('later', 'v2', { startTime: 5, sourceOffset: 2 }),
        clip('hidden', 'v3', { zIndex: 1 }),
      ],
      {
        timeline: {
          ...timeline([
            clip('one', 'v1'),
            clip('later', 'v2', { startTime: 5, sourceOffset: 2 }),
            clip('hidden', 'v3', { zIndex: 1 }),
          ]),
          videoTrackCount: 2,
          videoTrackHiddenPerTrack: [false, true],
        },
        mediaBySourceId: new Map([
          ['v1', { url: '/one.mp4', kind: 'video' }],
          ['v2', { url: '/later.mp4', kind: 'video' }],
          ['v3', { url: '/hidden.mp4', kind: 'video' }],
        ]),
      },
    );
    await settle();
    expect(c.callbacks.onMetadata).toHaveBeenCalledTimes(3);
    expect(c.publish.mock.calls.at(-1)[0].ready).toBe(false);
    nativeReady(c.scene('one').media);
    nativeReady(c.scene('later').media, {}, false);
    nativeReady(c.scene('hidden').media);
    await settle();
    expect(c.publish.mock.calls.at(-1)[0].ready).toBe(false);
    nativeReady(c.scene('later').media);
    await settle();
    expect(c.publish.mock.calls.at(-1)[0]).toEqual({
      ready: true,
      preparing: false,
      unsupportedFeatures: [],
    });
    expect(draw.mock.calls.map(([video]) => video.dataset.previewClipId)).toEqual([
      'one',
      'hidden',
      'later',
      'one',
    ]);
    expect(c.scene('later').media.currentTime).toBe(2);
    expect(c.scene('hidden').wrapper.hidden).toBe(true);
  });

  it('uses all visible layers in source order with actual-media contain/transform/circle, never a first-video stand-in', async () => {
    const c = setup(
      [
        clip('main', 'v1', { zIndex: 1 }),
        clip('overlay', 'v1', {
          zIndex: 0,
          transform: [
            [2, 0, 128],
            [0, 2, 72],
          ],
          maskShape: 'circle',
        }),
      ],
      { outputSize: { width: 1280, height: 720 } },
    );
    for (const video of videos) nativeReady(video);
    await settle();
    expect(c.scene('main').wrapper.hidden).toBe(false);
    expect(c.scene('overlay').wrapper.hidden).toBe(false);
    expect(c.scene('main').wrapper.style.zIndex).toBe('0');
    expect(c.scene('overlay').wrapper.style.zIndex).toBe('1');
    expect(c.scene('overlay').wrapper.style.transform).toBe('translate(10%, 10%) scale(2)');
    expect(c.scene('overlay').media.style.clipPath).toBe('circle(closest-side at 50% 50%)');
    expect(c.scene('main').media.style.width).toBe('100%');
    expect(c.scene('main').media.style.height).toBe('100%');
    expect(c.host.style.width).toBe('800px');
    expect(c.host.style.height).toBe('450px');
    expect(c.scene('main').media.controls).toBe(false);
    expect(c.scene('main').media.muted).toBe(true);
  });

  it('seeks exact source offsets/speeds and keeps DOM stable through expanded/collapsed/reparented hosts', async () => {
    const c = setup([clip('one', 'v1', { sourceOffset: 2, speed: 2 })]);
    nativeReady(c.scene('one').media);
    await settle();
    const video = c.scene('one').media;
    const result = c.runtime.seekAndWait(3);
    await expect(result).resolves.toBe(true);
    expect(video.currentTime).toBe(8);
    c.runtime.update({
      ...c.input,
      timeline: { ...c.input.timeline, currentTime: 3 },
      previewExpanded: false,
    });
    const target = document.createElement('div');
    document.body.appendChild(target);
    target.appendChild(c.host);
    c.runtime.update({
      ...c.input,
      timeline: { ...c.input.timeline, currentTime: 3 },
      previewExpanded: true,
    });
    await settle();
    expect(c.scene('one').media).toBe(video);
    expect(video.parentElement.parentElement).toBe(c.host);
    expect(c.input.metadataReader).toHaveBeenCalledTimes(1);
  });

  it('aborts previous URL/reader results and ignores their late metadata without discarding other current sources', async () => {
    let resolveOld;
    const reader = vi.fn(({ url }) =>
      url === '/one.mp4'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(metadata(url)),
    );
    const c = setup([clip('one', 'v1')], { metadataReader: reader });
    await settle();
    const firstSignal = reader.mock.calls[0][0].signal;
    const old = c.scene('one').media;
    c.runtime.update({
      ...c.input,
      mediaBySourceId: new Map([['v1', { url: '/two.mp4', kind: 'video' }]]),
    });
    expect(firstSignal.aborted).toBe(true);
    expect(old.getAttribute('src')).toBeNull();
    nativeReady(c.scene('one').media);
    await settle();
    resolveOld(metadata('/one.mp4', 1920, 1080, 500));
    await settle();
    expect(c.callbacks.onMetadata.mock.calls).toEqual([
      ['v1', { url: '/two.mp4', sourceDuration: 12, width: 1280, height: 720 }],
    ]);
    expect(c.publish.mock.calls.at(-1)[0].ready).toBe(true);
    expect(c.scene('one').media.getAttribute('src')).toBe('/two.mp4');
  });

  it('times out a noncooperating injected reader, aborts its signal and permits an actual retry', async () => {
    let oldResolve;
    const reader = vi.fn(({ url }) =>
      reader.mock.calls.length === 1
        ? new Promise((resolve) => {
            oldResolve = resolve;
          })
        : Promise.resolve(metadata(url)),
    );
    const c = setup(undefined, { metadataReader: reader });
    nativeReady(c.scene('one').media);
    await settle();
    vi.advanceTimersByTime(15_000);
    await settle();
    expect(reader.mock.calls[0][0].signal.aborted).toBe(true);
    expect(c.publish.mock.calls.at(-1)[0]).toMatchObject({
      ready: false,
      preparing: false,
      error: '媒体元数据准备超时',
    });
    const retry = c.runtime.seekAndWait(0);
    await expect(retry).resolves.toBe(true);
    oldResolve(metadata('/one.mp4', 350, 350, 5));
    await settle();
    expect(c.callbacks.onMetadata.mock.calls).toEqual([
      ['v1', { url: '/one.mp4', sourceDuration: 12, width: 1280, height: 720 }],
    ]);
  });

  it('external cancel retires frame waits and marks no fake ready; a later seek can complete', async () => {
    const c = setup();
    await settle();
    const controller = new AbortController();
    const pending = c.runtime.seekAndWait(1, { signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBe(false);
    expect(c.publish.mock.calls.at(-1)[0]).toMatchObject({ ready: false, preparing: false });
    nativeReady(c.scene('one').media);
    const next = c.runtime.seekAndWait(2);
    await expect(next).resolves.toBe(true);
    expect(c.scene('one').media.currentTime).toBe(2);
  });

  it('does not claim native high-speed/audio amplification or unsupported subtitle/overlay/transition completion', async () => {
    const c = setup(
      [
        clip('one', 'v1', {
          speed: 32,
          duration: 0.25,
          subtitleUrl: '/subtitle.vtt',
          subtitleHtmlUrl: '/caption.html',
          transition: { type: 'fade', duration: 0.2 },
        }),
      ],
      {
        timeline: {
          ...timeline([
            clip('one', 'v1', {
              speed: 32,
              duration: 0.25,
              subtitleUrl: '/subtitle.vtt',
              subtitleHtmlUrl: '/caption.html',
              transition: { type: 'fade', duration: 0.2 },
            }),
          ]),
          overlayHtmlUrl: '/overlay.html',
        },
      },
    );
    nativeReady(c.scene('one').media);
    await settle();
    expect(c.publish.mock.calls.at(-1)[0].unsupportedFeatures).toEqual([
      'subtitle-html',
      'overlay-html',
      'transition-preview',
      'native-high-speed',
    ]);
    await expect(c.runtime.play()).resolves.toBe(false);
    expect(c.callbacks.onPlayingChange.mock.calls.at(-1)).toEqual([false]);
    expect(c.scene('one').media.paused).toBe(true);
  });

  it('disposes all media sources/listeners/observers/readers before late completion', async () => {
    let complete;
    const c = setup(undefined, {
      metadataReader: vi.fn(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      ),
    });
    await settle();
    const signal = c.input.metadataReader.mock.calls[0][0].signal;
    const video = c.scene('one').media;
    c.runtime.dispose();
    expect(signal.aborted).toBe(true);
    expect(video.getAttribute('src')).toBeNull();
    expect(video.parentNode).toBeNull();
    complete(metadata('/one.mp4'));
    nativeReady(video);
    await settle();
    expect(c.callbacks.onMetadata).not.toHaveBeenCalled();
    expect(c.callbacks.onPreparationChange.mock.calls.some(([state]) => state.ready)).toBe(false);
    expect(c.runtime.scenes.size).toBe(0);
    expect(c.runtime.sources.size).toBe(0);
  });
});
