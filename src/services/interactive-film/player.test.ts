import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { mountFilmPlayer, type FilmPlayerHandle } from './player.ts';
import type { FilmManifest, FilmNode } from './types.ts';

const node = (id: string, kind: FilmNode['kind'], extra: Partial<FilmNode> = {}): FilmNode => ({
  id,
  kind,
  title: id,
  position: { x: 0, y: 0 },
  ...extra,
});
function story(
  nodes: FilmNode[],
  routes: [string, string, string][],
  media: FilmManifest['media'] = {},
): FilmManifest {
  return {
    schemaVersion: 1,
    runtimeVersion: '1',
    title: '试映',
    revision: 1,
    startNodeId: nodes[0].id,
    nodes,
    edges: routes.map(([source, sourcePort, target], i) => ({
      id: String(i),
      source,
      sourcePort,
      target,
    })),
    variables: [],
    media,
  };
}
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let root: HTMLDivElement;
let player: FilmPlayerHandle | undefined;
let hidden = false;
let nativePaused: WeakMap<HTMLMediaElement, boolean>;
beforeEach(() => {
  hidden = false;
  frames = new Map();
  nextFrame = 0;
  nativePaused = new WeakMap();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    return nativePaused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    nativePaused.set(this, false);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    nativePaused.set(this, true);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  player?.destroy();
  player = undefined;
  root.remove();
  vi.unstubAllGlobals();
});
function frame(time: number) {
  const [id, callback] = frames.entries().next().value!;
  frames.delete(id);
  callback(time);
}
function readyVideo() {
  const video = root.querySelector('video')!;
  Object.defineProperties(video, {
    duration: { configurable: true, value: 20 },
    readyState: { configurable: true, value: 2 },
    seeking: { configurable: true, value: false },
    videoWidth: { configurable: true, value: 1600 },
    videoHeight: { configurable: true, value: 900 },
  });
  fireEvent.loadedMetadata(video);
  return video;
}
const videoRecord = {
  v: {
    id: 'v',
    name: 'movie.mp4',
    type: 'video' as const,
    mimeType: 'video/mp4',
    bytes: 1,
    duration: 20,
    url: 'media/movie.mp4',
  },
};

describe('same DOM player for preview and releases', () => {
  it('keeps clip time and accessible icon controls while carrying volume and mute across clips', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('first', 'play', { mediaId: 'v', trimIn: 4, trimOut: 8 }),
          node('second', 'play', { mediaId: 'v', trimIn: 2, trimOut: 7 }),
          node('end', 'ending'),
        ],
        [
          ['first', 'next', 'second'],
          ['second', 'next', 'end'],
        ],
        videoRecord,
      ),
    );
    const start = root.querySelector<HTMLButtonElement>('.pf-start')!;
    expect(start.getAttribute('aria-label')).toBe('开始游玩');
    expect(start.textContent).toBe('');
    expect(start.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector<HTMLElement>('.pf-cover h2')!.hidden).toBe(true);
    const first = readyVideo();
    fireEvent.click(start);
    await Promise.resolve();
    first.currentTime = 4.5;
    frame(0);
    expect(player.getState()).toMatchObject({ nodeId: 'first', elapsed: 0.5, paused: false });
    expect(root.querySelector('.pf-time')!.textContent).toBe('00:00 / 00:04');
    expect(root.querySelector<HTMLProgressElement>('.pf-progress')!.value).toBe(0.5);
    expect(root.querySelector<HTMLProgressElement>('.pf-progress')!.max).toBe(4);
    const playControl = root.querySelector<HTMLButtonElement>('.pf-control-row button')!;
    expect(playControl.getAttribute('aria-label')).toBe('暂停');
    expect(playControl.textContent).toBe('');
    const volume = root.querySelector<HTMLInputElement>('input[aria-label="音量"]')!;
    volume.focus();
    fireEvent.keyDown(volume, { key: ' ' });
    expect(player.getState().paused).toBe(false);
    fireEvent.input(volume, { target: { value: '0.35' } });
    expect(first.volume).toBe(0.35);
    const mute = root.querySelector<HTMLButtonElement>('.pf-mute')!;
    fireEvent.click(mute);
    expect(first.muted).toBe(true);
    expect(mute.getAttribute('aria-label')).toBe('取消静音');
    expect(volume.value).toBe('0');
    expect(player.getState().elapsed).toBe(0.5);
    first.currentTime = 8;
    frame(1000);
    const second = readyVideo();
    await Promise.resolve();
    expect(second).not.toBe(first);
    expect(second.volume).toBe(0.35);
    expect(second.muted).toBe(true);
    first.volume = 0.9;
    first.muted = false;
    fireEvent.volumeChange(first);
    expect(mute.getAttribute('aria-label')).toBe('取消静音');
    fireEvent.click(mute);
    expect(second.muted).toBe(false);
    expect(second.volume).toBe(0.35);
    expect(volume.value).toBe('0.35');
    expect(player.getState()).toMatchObject({ nodeId: 'second', elapsed: 0 });
    fireEvent.input(volume, { target: { value: '0' } });
    expect(mute.getAttribute('aria-label')).toBe('取消静音');
    fireEvent.click(mute);
    expect(second.volume).toBe(0.35);
    expect(player.getState().elapsed).toBe(0);
  });
  it('recovers from a rejected native play without consuming the deadline or accepting a paused QTE', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('A gesture is required', 'NotAllowedError')),
    );
    player = mountFilmPlayer(
      root,
      story(
        [
          node('qte', 'qte', { mediaId: 'v', trimIn: 0, trimOut: 10, windowEnd: 5 }),
          node('end', 'ending'),
        ],
        [
          ['qte', 'success', 'end'],
          ['qte', 'failure', 'end'],
        ],
        videoRecord,
      ),
    );
    const interaction = root.querySelector<HTMLButtonElement>('.pf-qte')!;
    expect(interaction.disabled).toBe(true);
    fireEvent.click(interaction);
    expect(player.getState().nodeId).toBe('qte');
    readyVideo();
    fireEvent.click(root.querySelector('.pf-start')!);
    frame(0);
    frame(12000);
    expect(player.getState().elapsed).toBe(0);
    await vi.waitFor(() => expect(player!.getState().paused).toBe(true));
    expect(root.querySelector('.pf-status')?.textContent).toBe('点击继续以播放媒体');
    fireEvent.keyDown(root.querySelector('.pf-qte')!, { key: ' ' });
    fireEvent.click(interaction);
    expect(player.getState().nodeId).toBe('qte');
    fireEvent.click(root.querySelector('.pf-controls button')!);
    await vi.waitFor(() => expect(interaction.disabled).toBe(false));
    expect(play).toHaveBeenCalledTimes(2);
    expect(player.getState().paused).toBe(false);
    frame(13000);
    root.querySelector('video')!.currentTime = 1;
    frame(14000);
    expect(player.getState().elapsed).toBe(1);
    fireEvent.click(interaction);
    expect(player.getState().phase).toBe('ended');
  });
  it('opens an immediate ending after the initial start gesture', () => {
    player = mountFilmPlayer(
      root,
      story([node('end', 'ending', { title: '重逢结局', endingText: '完' })], []),
    );
    expect(root.querySelector<HTMLElement>('.pf-cover')?.hidden).toBe(false);
    fireEvent.click(root.querySelector('.pf-start')!);
    expect(root.querySelector<HTMLElement>('.pf-cover')?.hidden).toBe(true);
    expect(root.querySelector('.pf-ending h2')?.textContent).toBe('重逢结局');
    expect(root.querySelector('.pf-ending p')?.textContent).toBe('完');
    expect(root.querySelector('button[aria-label="重新开始"]')).not.toBeNull();
  });
  it('waits for a start gesture, honors video trims, inherits the actual frame and ignores old media events', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('play', 'play', { mediaId: 'v', trimIn: 5, trimOut: 8 }),
          node('choice', 'choice', {
            prompt: '<img src=x onerror=alert(1)>',
            choices: [{ id: 'a', text: '<script>evil</script>' }],
          }),
          node('end', 'ending'),
        ],
        [
          ['play', 'next', 'choice'],
          ['choice', 'a', 'end'],
        ],
        videoRecord,
      ),
    );
    const video = readyVideo();
    expect(video.currentTime).toBe(5);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(root.querySelector('.pf-start')!);
    await Promise.resolve();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    frame(0);
    video.currentTime = 8;
    frame(1000);
    expect(player.getState().nodeId).toBe('choice');
    expect(root.querySelector('video')).toBe(video);
    expect(root.querySelector('.pf-time')!.textContent).toBe('00:03 / 00:03');
    expect(root.querySelector<HTMLProgressElement>('.pf-progress')!.value).toBe(3);
    expect(root.querySelector<HTMLProgressElement>('.pf-progress')!.max).toBe(3);
    frame(2000);
    expect(player.getState().elapsed).toBe(0);
    frame(3000);
    expect(player.getState().elapsed).toBe(1);
    expect(root.querySelector('.pf-time')!.textContent).toBe('00:03 / 00:03');
    expect(root.querySelector('.pf-choice')?.textContent).toBe('<script>evil</script>');
    expect(root.querySelector('script')).toBeNull();
    fireEvent.ended(video);
    fireEvent.error(video);
    expect(player.getState().nodeId).toBe('choice');
    fireEvent.click(root.querySelector('.pf-choice')!);
    expect(player.getState().phase).toBe('ended');
  });
  it('freezes the active deadline during pause, hidden pages and actual media buffering', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('qte', 'qte', { mediaId: 'v', trimIn: 0, trimOut: 10, windowEnd: 5 }),
          node('end', 'ending'),
        ],
        [
          ['qte', 'success', 'end'],
          ['qte', 'failure', 'end'],
        ],
        videoRecord,
      ),
    );
    const video = readyVideo();
    player.resume();
    await Promise.resolve();
    frame(0);
    video.currentTime = 1;
    frame(1000);
    expect(player.getState().elapsed).toBe(1);
    player.pause();
    frame(9000);
    expect(player.getState().elapsed).toBe(1);
    player.resume();
    await vi.waitFor(() => expect(video.paused).toBe(false));
    frame(10000);
    video.currentTime = 2;
    frame(11000);
    expect(player.getState().elapsed).toBe(2);
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    frame(21000);
    expect(player.getState().elapsed).toBe(2);
    hidden = false;
    fireEvent(document, new Event('visibilitychange'));
    await vi.waitFor(() => expect(video.paused).toBe(false));
    frame(22000);
    video.currentTime = 3;
    frame(23000);
    expect(player.getState().elapsed).toBe(3);
    fireEvent.waiting(video);
    const interaction = root.querySelector<HTMLButtonElement>('.pf-qte')!;
    expect(interaction.disabled).toBe(true);
    fireEvent.click(interaction);
    fireEvent.keyDown(root.querySelector('.pf-shell')!, { key: ' ' });
    expect(player.getState().nodeId).toBe('qte');
    frame(33000);
    expect(player.getState().elapsed).toBe(3);
    fireEvent.canPlay(video);
    expect(interaction.disabled).toBe(false);
    frame(34000);
    video.currentTime = 4;
    frame(35000);
    expect(player.getState().elapsed).toBe(4);
    fireEvent.keyDown(root.querySelector('.pf-shell')!, { key: ' ' });
    expect(player.getState().phase).toBe('ended');
  });
  it('opens choices during their clip, continues video to its end, then waits indefinitely on the actual frame', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('choice', 'choice', {
            mediaId: 'v',
            trimIn: 4,
            trimOut: 10,
            windowStart: 1,
            choices: [{ id: 'a', text: 'A' }],
          }),
          node('end', 'ending'),
        ],
        [['choice', 'a', 'end']],
        videoRecord,
      ),
    );
    const video = readyVideo();
    player.resume();
    await Promise.resolve();
    expect(root.querySelector('.pf-choice')).toBeNull();
    frame(0);
    video.currentTime = 5;
    frame(1000);
    expect(root.querySelector('.pf-choice')).not.toBeNull();
    expect(video.paused).toBe(false);
    video.currentTime = 8;
    frame(2000);
    expect(player.getState().elapsed).toBe(4);
    expect(video.paused).toBe(false);
    video.currentTime = 10;
    frame(3000);
    expect(player.getState()).toMatchObject({ nodeId: 'choice', elapsed: 6 });
    expect(video.paused).toBe(true);
    expect(root.querySelector('video')).toBe(video);
    frame(4000);
    frame(3600000);
    expect(player.getState().nodeId).toBe('choice');
    fireEvent.click(root.querySelector('.pf-choice')!);
    expect(player.getState().phase).toBe('ended');
  });

  it('uses video position across rate changes and seeks, freezes during pause/buffering and rejects an input after its media deadline', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('qte', 'qte', {
            mediaId: 'v',
            trimIn: 4,
            trimOut: 10,
            windowStart: 2,
            windowEnd: 5,
          }),
          node('success', 'ending'),
          node('failure', 'ending'),
        ],
        [
          ['qte', 'success', 'success'],
          ['qte', 'failure', 'failure'],
        ],
        videoRecord,
      ),
    );
    const video = readyVideo();
    player.resume();
    await Promise.resolve();
    frame(0);
    video.currentTime = 4.5;
    frame(10000);
    expect(player.getState().elapsed).toBe(0.5);
    expect(root.querySelector('.pf-qte')).toBeNull();
    video.playbackRate = 4;
    video.currentTime = 6.25;
    frame(10010);
    expect(player.getState().elapsed).toBe(2.25);
    const oldButton = root.querySelector<HTMLButtonElement>('.pf-qte')!;
    expect(oldButton.disabled).toBe(false);
    fireEvent.seeking(video);
    video.currentTime = 5;
    frame(20000);
    expect(player.getState().elapsed).toBe(2.25);
    fireEvent.seeked(video);
    frame(20010);
    expect(player.getState()).toMatchObject({ elapsed: 1, interactionOpen: false });
    fireEvent.click(oldButton);
    expect(player.getState().nodeId).toBe('qte');
    player.pause();
    video.currentTime = 6.5;
    frame(30000);
    expect(player.getState().elapsed).toBe(1);
    player.resume();
    await vi.waitFor(() => expect(video.paused).toBe(false));
    frame(30010);
    expect(player.getState().elapsed).toBe(2.5);
    const liveButton = root.querySelector<HTMLButtonElement>('.pf-qte')!;
    video.currentTime = 9;
    // Click arrives before the next RAF: the actual media deadline wins once.
    fireEvent.click(liveButton);
    expect(player.getState()).toMatchObject({ nodeId: 'failure', phase: 'ended' });
    fireEvent.ended(video);
    fireEvent.error(video);
    fireEvent.click(liveButton);
    expect(player.getState().nodeId).toBe('failure');
  });

  it('uses audio currentTime and freezes the inherited frame only after natural media completion', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('choice', 'choice', {
            mediaId: 'a',
            trimIn: 2,
            choices: [{ id: 'go', text: '继续' }],
          }),
          node('end', 'ending'),
        ],
        [['choice', 'go', 'end']],
        {
          a: {
            ...videoRecord.v,
            id: 'a',
            type: 'audio',
            mimeType: 'audio/mpeg',
            url: 'media/music.mp3',
          },
        },
      ),
    );
    const audio = root.querySelector('audio')!;
    Object.defineProperties(audio, {
      duration: { configurable: true, value: 8 },
      readyState: { configurable: true, value: 2 },
      seeking: { configurable: true, value: false },
    });
    fireEvent.loadedMetadata(audio);
    player.resume();
    await Promise.resolve();
    audio.currentTime = 3.5;
    frame(90000);
    expect(player.getState().elapsed).toBe(1.5);
    expect(audio.paused).toBe(false);
    audio.currentTime = 8;
    fireEvent.ended(audio);
    expect(audio.paused).toBe(true);
    expect(player.getState()).toMatchObject({ nodeId: 'choice', elapsed: 6 });
    player.pause();
    frame(100000);
    expect(player.getState().elapsed).toBe(6);
    player.resume();
    frame(101000);
    frame(102000);
    expect(player.getState().elapsed).toBe(7);
    fireEvent.click(root.querySelector('.pf-choice')!);
    expect(player.getState().phase).toBe('ended');
  });
  it('allows a choice before clip end and keeps late old media events out of the next local clock', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('choice', 'choice', {
            mediaId: 'v',
            trimIn: 4,
            trimOut: 10,
            windowStart: 1,
            choices: [{ id: 'go', text: '继续' }],
          }),
          node('qte', 'qte', { mediaId: 'v', trimIn: 2, trimOut: 8, windowStart: 1, windowEnd: 2 }),
          node('end', 'ending'),
        ],
        [
          ['choice', 'go', 'qte'],
          ['qte', 'success', 'end'],
          ['qte', 'failure', 'end'],
        ],
        videoRecord,
      ),
    );
    const oldVideo = readyVideo();
    player.resume();
    await Promise.resolve();
    oldVideo.currentTime = 5;
    frame(1000);
    const oldButton = root.querySelector('.pf-choice')!;
    expect(oldVideo.paused).toBe(false);
    fireEvent.click(oldButton);
    expect(player.getState()).toMatchObject({ nodeId: 'qte', elapsed: 0 });
    const video = readyVideo();
    await vi.waitFor(() => expect(video.paused).toBe(false));
    oldVideo.currentTime = 20;
    fireEvent.ended(oldVideo);
    fireEvent.seeked(oldVideo);
    fireEvent.error(oldVideo);
    fireEvent.click(oldButton);
    frame(30000);
    expect(player.getState()).toMatchObject({ nodeId: 'qte', elapsed: 0 });
    video.currentTime = 3;
    frame(30010);
    expect(player.getState().elapsed).toBe(1);
    fireEvent.click(root.querySelector('.pf-qte')!);
    expect(player.getState().phase).toBe('ended');
  });
  it('settles a paused media completion before accepting a resumed input and uses a pausable static deadline on inherited frames', async () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('choice', 'choice', {
            mediaId: 'v',
            trimIn: 4,
            trimOut: 10,
            windowEnd: 6,
            choices: [{ id: 'go', text: '继续' }],
          }),
          node('success', 'ending'),
          node('wait', 'choice', { windowEnd: 2, choices: [{ id: 'go', text: '继续' }] }),
          node('end', 'ending'),
        ],
        [
          ['choice', 'go', 'success'],
          ['choice', 'timeout', 'wait'],
          ['wait', 'go', 'end'],
          ['wait', 'timeout', 'end'],
        ],
        videoRecord,
      ),
    );
    const video = readyVideo();
    player.resume();
    await Promise.resolve();
    const staleChoice = root.querySelector('.pf-choice')!;
    player.pause();
    video.currentTime = 10;
    fireEvent.ended(video);
    expect(player.getState()).toMatchObject({ nodeId: 'choice', elapsed: 0, paused: true });
    player.resume();
    // The completion is pending until resume; this click cannot select the expired choice.
    fireEvent.click(staleChoice);
    expect(player.getState()).toMatchObject({ nodeId: 'wait', elapsed: 0 });
    expect(root.querySelector('video')).toBe(video);
    frame(0);
    frame(1000);
    expect(player.getState().elapsed).toBe(1);
    player.pause();
    frame(30000);
    expect(player.getState().elapsed).toBe(1);
    player.resume();
    frame(31000);
    frame(32000);
    expect(player.getState()).toMatchObject({ nodeId: 'end', phase: 'ended' });
    fireEvent.click(staleChoice);
    expect(player.getState().nodeId).toBe('end');
  });
  it('keeps hotspot coordinates inside the fitted image and keyboard buttons inside the fullscreen shell', () => {
    player = mountFilmPlayer(
      root,
      story(
        [
          node('hotspot', 'hotspot', {
            mediaId: 'i',
            displaySeconds: 5,
            windowEnd: 3,
            region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
          }),
          node('end', 'ending'),
        ],
        [
          ['hotspot', 'success', 'end'],
          ['hotspot', 'failure', 'end'],
        ],
        {
          i: {
            id: 'i',
            name: 'still.png',
            type: 'image',
            mimeType: 'image/png',
            bytes: 1,
            width: 1600,
            height: 900,
            url: 'media/still.png',
          },
        },
      ),
    );
    const stage = root.querySelector('.pf-stage')!;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      width: 800,
      height: 600,
    } as DOMRect);
    fireEvent.load(root.querySelector('img')!);
    player.resume();
    const hotspot = root.querySelector<HTMLButtonElement>('.pf-hotspot')!;
    expect(hotspot.style.left).toBe('200px');
    expect(hotspot.style.top).toBe('187.5px');
    expect(hotspot.style.height).toBe('225px');
    expect(root.querySelector('.pf-shell')?.contains(hotspot)).toBe(true);
    fireEvent.click(hotspot);
    expect(player.getState().phase).toBe('ended');
    player.destroy();
    expect(frames.size).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});
