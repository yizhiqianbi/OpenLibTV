import { createFilmRuntime, type FilmRuntimeState } from './runtime.ts';
import type { FilmManifest, FilmNode } from './types.ts';

const CSS = `
.pf-shell{height:100%;min-height:360px;background:#000;color:#fff;font:14px system-ui,sans-serif;border-radius:8px;overflow:hidden;position:relative;color-scheme:dark}
.pf-shell,.pf-shell *{box-sizing:border-box}
.pf-shell:fullscreen{width:100vw;height:100dvh;border-radius:0}
.pf-stage{position:relative;height:100%;min-height:360px;aspect-ratio:16/9;overflow:hidden;background:#000}
.pf-shell:fullscreen .pf-stage{min-height:0;aspect-ratio:auto}
.pf-media{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pf-overlay{position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;justify-content:flex-end;padding:28px 24px 96px;box-sizing:border-box;background:transparent}
.pf-overlay button{pointer-events:auto}
.pf-prompt{white-space:pre-wrap;font-size:16px;line-height:1.6;text-shadow:0 2px 8px #000;margin:0 0 14px;max-width:560px}
.pf-choices{display:grid;gap:8px;width:min(100%,480px);max-height:65%;overflow:auto;padding:3px}
.pf-shell .pf-choice,.pf-shell .pf-qte{border:1px solid #ffffff66;background:#171717d9;border-radius:6px;color:#fff;padding:12px 16px;font:inherit;text-align:left;cursor:pointer;transition:background .15s,color .15s}
.pf-shell .pf-choice{display:block;width:100%}
.pf-shell .pf-choice:hover{background:#fff;color:#171717}
.pf-shell button:focus-visible,.pf-shell input:focus-visible{outline:2px solid #fff;outline-offset:3px}
.pf-shell button:disabled{opacity:.45;cursor:default}
.pf-shell .pf-qte{display:flex;align-items:center;justify-content:center;gap:10px;align-self:center;background:#fff;color:#171717;text-align:center;padding:10px 16px}
.pf-shell .pf-qte:hover{background:#ededed;color:#171717}
.pf-key{border:1px solid #0003;border-radius:4px;padding:3px 8px;font-size:12px;line-height:1.4}
.pf-shell .pf-hotspot{display:block;position:absolute;pointer-events:auto;border:1px solid #ffffff99;background:#ffffff08;border-radius:6px;padding:0;cursor:pointer;color:#fff;font:inherit}
.pf-shell .pf-hotspot:hover,.pf-shell .pf-hotspot:focus-visible{background:#ffffff1f;border-color:#fff}
.pf-shell .pf-hotspot span{position:absolute;bottom:calc(100% + 6px);left:0;white-space:nowrap;background:#171717cc;padding:4px 8px;border-radius:4px;font-size:12px;opacity:0}
.pf-shell .pf-hotspot:hover span,.pf-shell .pf-hotspot:focus-visible span{opacity:1}
.pf-cover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;z-index:3;padding:24px;box-sizing:border-box;text-align:center;pointer-events:none}
.pf-cover button{pointer-events:auto}
.pf-cover.pf-failed{background:#000c}
.pf-cover[hidden],.pf-shell [hidden]{display:none!important}
.pf-cover h2,.pf-ending{white-space:pre-wrap;line-height:1.6}
.pf-cover h2{font-size:18px;font-weight:500;margin:0}
.pf-ending{font-size:18px;text-align:center;align-self:center;margin:auto;max-width:560px;text-shadow:0 2px 8px #000}
.pf-ending h2{font-size:22px;font-weight:500;line-height:1.5;margin:0 0 12px}
.pf-ending p{font-size:16px;line-height:1.6;margin:0;color:#eee}
.pf-shell .pf-start{display:flex;align-items:center;justify-content:center;width:64px;height:64px;flex-shrink:0;border:0;border-radius:50%;background:#fff;color:#171717;cursor:pointer}
.pf-shell .pf-start:hover{background:#ededed}
.pf-shell .pf-start svg{width:28px;height:28px;margin-left:3px}
.pf-controls{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:28px 16px 12px;background:linear-gradient(transparent,#000b);box-sizing:border-box}
.pf-progress{display:block;appearance:none;border:0;width:100%;height:3px;margin:0 0 10px;border-radius:2px;overflow:hidden;background:#ffffff40;color:#fff;accent-color:#fff}
.pf-progress::-webkit-progress-bar{background:#ffffff40}.pf-progress::-webkit-progress-value{background:#fff}.pf-progress::-moz-progress-bar{background:#fff}
.pf-control-row{display:flex;align-items:center;gap:12px;min-height:32px}
.pf-shell .pf-control-row button{display:flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;background:transparent;color:#fff;border:0;border-radius:4px;padding:4px;cursor:pointer;font:inherit}
.pf-shell .pf-control-row button:hover{background:#ffffff14}
.pf-control-row svg{display:block;width:18px;height:18px;pointer-events:none}
.pf-time{font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.pf-volume{display:flex;align-items:center;gap:4px}
.pf-shell .pf-volume input{width:64px;min-width:0;height:16px;margin:0;padding:0;border:0;background:transparent;accent-color:#fff;cursor:pointer}
.pf-spacer{flex:1;min-width:0}
.pf-status,.pf-title{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pf-timer{position:absolute;right:16px;top:14px;padding:5px 9px;border-radius:4px;background:#ffffffeb;color:#171717;font-size:12px;font-variant-numeric:tabular-nums}
.pf-error{color:#fff;white-space:pre-wrap;font-size:13px;margin:0}
@media(max-width:600px){.pf-shell,.pf-stage{min-height:300px}.pf-overlay{padding:20px 16px 90px}.pf-prompt{font-size:14px}.pf-shell .pf-choice{padding:11px 13px}.pf-controls{padding:24px 8px 10px}.pf-control-row{gap:6px}.pf-shell .pf-control-row button{width:30px;height:30px}.pf-time{font-size:11px}.pf-volume{gap:0}.pf-shell .pf-volume input{width:44px}.pf-ending h2{font-size:18px}.pf-ending p{font-size:14px}}
`;
const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (className: string, text: string, action: () => void) => {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
};

const ICON_PATHS = {
  play: ['M8 5l11 7-11 7V5Z'],
  pause: ['M8 5v14M16 5v14'],
  restart: ['M3 10a9 9 0 1 1 2.7 8.4', 'M3 3v7h7'],
  volume: ['M11 5 6 9H3v6h3l5 4V5Z', 'M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14'],
  muted: ['M11 5 6 9H3v6h3l5 4V5Z', 'm16 9 5 6m0-6-5 6'],
  fullscreen: ['M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'],
  exitFullscreen: ['M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5'],
};
type PlayerIcon = keyof typeof ICON_PATHS;
function controlIcon(control: HTMLButtonElement, label: string, name: PlayerIcon) {
  control.setAttribute('aria-label', label);
  control.title = label;
  if (control.dataset.icon === name) return;
  control.dataset.icon = name;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', name === 'play' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'pause' ? '3' : '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  control.replaceChildren(svg);
}
const formatTime = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  return [hours || undefined, Math.floor((value % 3600) / 60), value % 60]
    .filter((part) => part !== undefined)
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

/** Shared by editor preview, published releases and the classic-script offline bundle. */
export function mountFilmPlayer(root: HTMLElement, manifest: FilmManifest) {
  const runtime = createFilmRuntime(manifest);
  const shell = element('div', 'pf-shell');
  shell.tabIndex = 0;
  shell.setAttribute('aria-label', `${manifest.title}互动影游播放器`);
  const style = element('style', '');
  style.textContent = CSS;
  const stage = element('div', 'pf-stage');
  const mediaHost = element('div', 'pf-media-host');
  const overlay = element('div', 'pf-overlay');
  const title = element('div', 'pf-title');
  const timer = element('div', 'pf-timer');
  const cover = element('div', 'pf-cover');
  const coverTitle = element('h2', '', manifest.title);
  const coverMessage = element('p', '');
  const controls = element('div', 'pf-controls');
  const controlRow = element('div', 'pf-control-row');
  const progress = element('progress', 'pf-progress');
  progress.setAttribute('aria-label', '视频播放进度');
  const time = element('span', 'pf-time', '00:00 / 00:00');
  const volumeControl = element('div', 'pf-volume');
  const volumeInput = element('input', 'pf-volume-range');
  volumeInput.type = 'range';
  volumeInput.min = '0';
  volumeInput.max = '1';
  volumeInput.step = '0.05';
  volumeInput.setAttribute('aria-label', '音量');
  const status = element('span', 'pf-status');
  status.setAttribute('role', 'status');
  const startButton = button('pf-start', '开始游玩', () => resume());
  const playButton = button('', '继续', () => (userPaused ? resume() : pause()));
  const restartButton = button('', '重新开始', () => restart());
  const muteButton = button('pf-mute', '静音', () => {
    const silent = muted || volume === 0;
    muted = !silent;
    if (silent && volume === 0) volume = lastAudibleVolume;
    applySound();
  });
  const fullscreenButton = button('pf-fullscreen', '全屏', () => {
    const action =
      document.fullscreenElement === shell
        ? document.exitFullscreen?.()
        : shell.requestFullscreen?.();
    action?.catch(() => {
      status.textContent = '当前浏览器无法进入全屏';
    });
  });
  controlIcon(startButton, '开始游玩', 'play');
  controlIcon(playButton, '继续', 'play');
  controlIcon(restartButton, '重新开始', 'restart');
  controlIcon(muteButton, '静音', 'volume');
  controlIcon(fullscreenButton, '全屏', 'fullscreen');
  volumeInput.addEventListener('input', () => {
    const value = Number(volumeInput.value);
    if (!Number.isFinite(value)) return;
    volume = Math.min(1, Math.max(0, value));
    muted = false;
    if (volume > 0) lastAudibleVolume = volume;
    applySound();
  });
  cover.append(coverTitle, coverMessage, startButton);
  stage.append(mediaHost, overlay, title, timer, cover);
  volumeControl.append(muteButton, volumeInput);
  controlRow.append(
    playButton,
    time,
    volumeControl,
    element('span', 'pf-spacer'),
    restartButton,
    fullscreenButton,
    status,
  );
  controls.append(progress, controlRow);
  shell.append(style, stage, controls);
  root.replaceChildren(shell);

  let disposed = false;
  let started = false;
  let userPaused = true;
  let currentEpoch = -1;
  let lastTime: number | null = null;
  let frameId = 0;
  let ready = true;
  let buffering = false;
  let clipFinished = false;
  let finalMediaTime: number | null = null;
  let media: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null = null;
  let displayMediaNode: FilmNode | null = null;
  let displayElapsed = 0;
  let mediaCleanup = () => {};
  let pendingPlay = false;
  let previousOpen = false;
  let visualWidth = 16;
  let visualHeight = 9;
  let volume = 1;
  let lastAudibleVolume = 1;
  let muted = false;
  let hotspotButton: HTMLButtonElement | null = null;
  const ownedMedia = () => runtime.getSnapshot().node?.mediaId !== undefined;
  const live = (epoch: number) => !disposed && epoch === runtime.getSnapshot().epoch;
  const timeMedia = () => (media instanceof HTMLMediaElement ? media : null);
  function updateSoundControls() {
    volumeControl.hidden = !timeMedia();
    const silent = muted || volume === 0;
    volumeInput.value = String(silent ? 0 : volume);
    volumeInput.setAttribute('aria-valuetext', `${Math.round((silent ? 0 : volume) * 100)}%`);
    controlIcon(muteButton, silent ? '取消静音' : '静音', silent ? 'muted' : 'volume');
  }
  function applySound() {
    const native = timeMedia();
    if (native) {
      native.volume = volume;
      native.muted = muted;
    }
    updateSoundControls();
  }
  function updatePlaybackTime(state: FilmRuntimeState) {
    const native = timeMedia();
    const record = displayMediaNode?.mediaId ? manifest.media[displayMediaNode.mediaId] : undefined;
    const sourceDuration = native
      ? Number.isFinite(native.duration)
        ? native.duration
        : record?.duration
      : undefined;
    const trimIn = displayMediaNode?.trimIn ?? 0;
    const trimOut = displayMediaNode?.trimOut ?? sourceDuration ?? trimIn;
    const duration = native
      ? Math.max(0, trimOut - trimIn)
      : record?.type === 'image'
        ? (displayMediaNode?.displaySeconds ?? 0)
        : 0;
    if (native) displayElapsed = Math.max(0, native.currentTime - trimIn);
    else if (state.node?.id === displayMediaNode?.id) displayElapsed = state.elapsed;
    const elapsed = Math.min(duration, displayElapsed);
    progress.hidden = duration === 0;
    progress.max = duration || 1;
    progress.value = elapsed;
    progress.setAttribute('aria-valuetext', `${formatTime(elapsed)} / ${formatTime(duration)}`);
    time.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
  }
  const frozenChoice = () => {
    const state = runtime.getSnapshot();
    return state.node?.kind === 'choice' && clipFinished;
  };
  const canInteract = () => {
    const native = timeMedia();
    return (
      ready &&
      (!buffering || frozenChoice()) &&
      !runtime.getSnapshot().paused &&
      (!native || !ownedMedia() || frozenChoice() || clipFinished || !native.paused)
    );
  };
  const localMediaTime = (node: FilmNode, native: HTMLMediaElement) => {
    const end = node.trimOut ?? native.duration;
    const position = Number.isFinite(end) ? Math.min(native.currentTime, end) : native.currentTime;
    return Math.max(0, position - (node.trimIn ?? 0));
  };
  function consumeFinalMediaTime(epoch: number) {
    const state = runtime.getSnapshot();
    if (!live(epoch) || state.paused || finalMediaTime === null) return;
    const time = finalMediaTime;
    finalMediaTime = null;
    runtime.syncMediaTime(time, epoch);
    if (!live(epoch)) return;
    if (state.node?.kind === 'play') runtime.completeMedia(epoch);
    else render(runtime.getSnapshot());
  }
  function finishClip(node: FilmNode, native: HTMLMediaElement, epoch: number) {
    if (!live(epoch) || clipFinished) return;
    clipFinished = true;
    finalMediaTime = localMediaTime(node, native);
    buffering = false;
    lastTime = null;
    native.pause();
    consumeFinalMediaTime(epoch);
  }
  function sampleMediaClock(epoch: number) {
    const state = runtime.getSnapshot();
    const native = timeMedia();
    if (!live(epoch) || !canInteract() || !native || !ownedMedia() || !state.node) return;
    if (clipFinished) {
      consumeFinalMediaTime(epoch);
      return;
    }
    runtime.syncMediaTime(localMediaTime(state.node, native), epoch);
    if (
      live(epoch) &&
      ((state.node.trimOut !== undefined && native.currentTime >= state.node.trimOut) ||
        native.ended)
    )
      finishClip(state.node, native, epoch);
  }
  function input(epoch: number, action: () => void) {
    if (!live(epoch) || !canInteract()) return;
    sampleMediaClock(epoch);
    if (live(epoch) && canInteract()) action();
  }
  function syncPlayback() {
    const state = runtime.getSnapshot();
    const native = timeMedia();
    if (!native) return;
    if (
      state.paused ||
      !started ||
      !ownedMedia() ||
      frozenChoice() ||
      clipFinished ||
      ['ended', 'error'].includes(state.phase)
    ) {
      native.pause();
      return;
    }
    if (!ready || !native.paused || pendingPlay) return;
    const epoch = state.epoch;
    pendingPlay = true;
    Promise.resolve(native.play())
      .then(() => {
        if (!live(epoch)) native.pause();
        else render(runtime.getSnapshot());
      })
      .catch(() => {
        if (!live(epoch)) return;
        userPaused = true;
        runtime.setPaused(true);
        status.textContent = '点击继续以播放媒体';
      })
      .finally(() => {
        if (live(epoch)) {
          pendingPlay = false;
          syncPlayback();
        }
      });
  }
  function syncPaused() {
    lastTime = null;
    runtime.setPaused(userPaused || document.hidden);
    syncPlayback();
  }
  function pause() {
    if (disposed) return;
    userPaused = true;
    syncPaused();
  }
  function resume() {
    if (disposed || runtime.getSnapshot().phase === 'error') return;
    if (started && runtime.getSnapshot().phase === 'ended') return;
    started = true;
    userPaused = false;
    cover.hidden = true;
    syncPaused();
    syncPlayback();
    const epoch = runtime.getSnapshot().epoch;
    queueMicrotask(() => {
      if (!live(epoch)) return;
      (canInteract() ? overlay.querySelector<HTMLButtonElement>('button') || shell : shell).focus({
        preventScroll: true,
      });
    });
  }
  function restart() {
    if (disposed) return;
    started = true;
    userPaused = false;
    lastTime = null;
    runtime.start();
    syncPaused();
  }
  function locateHotspot() {
    const region = runtime.getSnapshot().node?.region;
    if (!hotspotButton || !region) return;
    const rect = stage.getBoundingClientRect();
    const scale = Math.min(rect.width / visualWidth, rect.height / visualHeight);
    const width = visualWidth * scale,
      height = visualHeight * scale;
    hotspotButton.style.left = `${(rect.width - width) / 2 + region.x * width}px`;
    hotspotButton.style.top = `${(rect.height - height) / 2 + region.y * height}px`;
    hotspotButton.style.width = `${region.width * width}px`;
    hotspotButton.style.height = `${region.height * height}px`;
  }
  function releaseMedia(clear: boolean) {
    mediaCleanup();
    mediaCleanup = () => {};
    const native = timeMedia();
    native?.pause();
    if (clear && media) {
      media.removeAttribute('src');
      native?.load();
      mediaHost.replaceChildren();
      media = null;
      displayMediaNode = null;
      displayElapsed = 0;
    }
  }
  function setMedia(node: FilmNode, epoch: number) {
    releaseMedia(Boolean(node.mediaId));
    pendingPlay = false;
    buffering = false;
    clipFinished = false;
    finalMediaTime = null;
    ready = !node.mediaId;
    if (!node.mediaId) return;
    const record = manifest.media[node.mediaId];
    if (!record?.url) {
      runtime.failMedia(`「${node.title}」的媒体不存在`, epoch);
      return;
    }
    displayMediaNode = node;
    displayElapsed = 0;
    visualWidth = record.width || 16;
    visualHeight = record.height || 9;
    const callbacks: Array<() => void> = [];
    const listen = (target: EventTarget, name: string, callback: EventListener) => {
      target.addEventListener(name, callback);
      callbacks.push(() => target.removeEventListener(name, callback));
    };
    if (record.type === 'image') {
      const image = element('img', 'pf-media');
      image.alt = record.name;
      media = image;
      listen(image, 'load', () => {
        if (!live(epoch)) return;
        ready = true;
        visualWidth = image.naturalWidth || visualWidth;
        visualHeight = image.naturalHeight || visualHeight;
        lastTime = null;
        locateHotspot();
        render(runtime.getSnapshot());
      });
      listen(image, 'error', () => {
        if (live(epoch)) runtime.failMedia(`无法加载图片：${record.name}`, epoch);
      });
      mediaHost.append(image);
      image.src = record.url;
    } else {
      const native = element(record.type === 'video' ? 'video' : 'audio', 'pf-media');
      native.preload = 'metadata';
      if (native instanceof HTMLVideoElement) native.playsInline = true;
      media = native;
      applySound();
      listen(native, 'volumechange', () => {
        if (!live(epoch)) return;
        volume = native.volume;
        muted = native.muted;
        if (volume > 0) lastAudibleVolume = volume;
        updateSoundControls();
      });
      const playable = () => {
        if (!live(epoch)) return;
        if (Math.abs(native.currentTime - (node.trimIn || 0)) > 0.15 && !ready) return;
        ready = true;
        buffering = false;
        lastTime = null;
        render(runtime.getSnapshot());
      };
      listen(native, 'loadedmetadata', () => {
        if (!live(epoch)) return;
        if (Number.isFinite(native.duration) && (node.trimIn || 0) >= native.duration) {
          runtime.failMedia(`「${node.title}」的开始点超出媒体长度`, epoch);
          return;
        }
        if (native instanceof HTMLVideoElement) {
          visualWidth = native.videoWidth || visualWidth;
          visualHeight = native.videoHeight || visualHeight;
        }
        native.currentTime = node.trimIn || 0;
        if (native.readyState >= 2 && !native.seeking) playable();
        locateHotspot();
      });
      for (const name of ['loadeddata', 'canplay', 'seeked']) listen(native, name, playable);
      listen(native, 'playing', () => {
        if (live(epoch)) {
          buffering = false;
          lastTime = null;
          render(runtime.getSnapshot());
        }
      });
      for (const name of ['waiting', 'stalled', 'seeking'])
        listen(native, name, () => {
          if (live(epoch)) {
            buffering = true;
            lastTime = null;
            render(runtime.getSnapshot());
          }
        });
      listen(native, 'ended', () => {
        if (!live(epoch)) return;
        finishClip(node, native, epoch);
      });
      listen(native, 'error', () => {
        if (live(epoch)) runtime.failMedia(`无法播放媒体：${record.name}`, epoch);
      });
      mediaHost.append(native);
      native.src = record.url;
      native.load();
    }
    mediaCleanup = () => {
      callbacks.forEach((stop) => stop());
    };
  }
  function renderInteraction(state: FilmRuntimeState) {
    overlay.replaceChildren();
    hotspotButton = null;
    const node = state.node;
    if (!node) return;
    if (node.kind === 'ending') {
      const ending = element('div', 'pf-ending');
      ending.append(element('h2', '', node.title || '故事结束'));
      if (node.endingText) ending.append(element('p', '', node.endingText));
      overlay.append(ending);
      return;
    }
    if (!state.interactionOpen || state.phase !== 'interaction') return;
    if (node.prompt) overlay.append(element('p', 'pf-prompt', node.prompt));
    if (node.kind === 'choice') {
      const choices = element('div', 'pf-choices');
      choices.setAttribute('role', 'group');
      choices.setAttribute('aria-label', node.prompt || '选择接下来的剧情');
      for (const choice of node.choices || [])
        choices.append(
          button('pf-choice', choice.text, () => {
            input(state.epoch, () => runtime.choose(choice.id, state.epoch));
          }),
        );
      overlay.append(choices);
    } else if (node.kind === 'qte') {
      const qte = button('pf-qte', '', () => {
        input(state.epoch, () => runtime.qte(state.epoch));
      });
      qte.setAttribute('aria-label', '按空格或点击完成');
      qte.append(element('span', 'pf-key', 'Space'), element('span', '', '点击完成'));
      overlay.append(qte);
    } else if (node.kind === 'hotspot' && node.region) {
      const region = node.region;
      hotspotButton = button('pf-hotspot', '', () => {
        input(state.epoch, () =>
          runtime.hit(region.x + region.width / 2, region.y + region.height / 2, state.epoch),
        );
      });
      hotspotButton.setAttribute('aria-label', node.prompt || '点击互动热点');
      hotspotButton.append(element('span', '', '互动热点'));
      overlay.append(hotspotButton);
      locateHotspot();
    }
    queueMicrotask(() => {
      if (!live(state.epoch) || !canInteract()) return;
      overlay.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    });
  }
  function render(state: FilmRuntimeState) {
    if (disposed) return;
    if (state.epoch !== currentEpoch) {
      currentEpoch = state.epoch;
      previousOpen = state.interactionOpen;
      lastTime = null;
      if (state.node && state.phase !== 'error') setMedia(state.node, state.epoch);
      else {
        releaseMedia(false);
        buffering = false;
      }
      if (runtime.getSnapshot().epoch !== state.epoch) return;
      renderInteraction(state);
    } else if (previousOpen !== state.interactionOpen) {
      previousOpen = state.interactionOpen;
      renderInteraction(state);
    }
    title.textContent = state.node?.title || manifest.title;
    timer.hidden = state.node?.windowEnd === undefined || state.phase !== 'interaction';
    timer.textContent =
      state.node?.windowEnd === undefined
        ? ''
        : `${Math.max(0, state.node.windowEnd - state.elapsed).toFixed(1)} 秒`;
    controlIcon(playButton, state.paused ? '继续' : '暂停', state.paused ? 'play' : 'pause');
    playButton.disabled = ['error', 'ended'].includes(state.phase);
    overlay.querySelectorAll<HTMLButtonElement>('button').forEach((item) => {
      item.disabled = !canInteract();
    });
    cover.hidden = started && state.phase !== 'error';
    cover.classList.toggle('pf-failed', state.phase === 'error');
    coverTitle.hidden = state.phase !== 'error';
    coverMessage.hidden = state.phase !== 'error';
    coverTitle.textContent = state.phase === 'error' ? '暂时无法继续' : manifest.title;
    coverMessage.textContent = state.error;
    coverMessage.className = state.phase === 'error' ? 'pf-error' : '';
    startButton.hidden = state.phase === 'error';
    status.textContent =
      state.phase === 'error'
        ? state.error
        : state.phase === 'ended'
          ? '故事结束'
          : state.paused
            ? '已暂停'
            : state.interactionOpen
              ? '等待互动'
              : ready
                ? '播放中'
                : '媒体加载中';
    updatePlaybackTime(state);
    updateSoundControls();
    syncPlayback();
  }
  function frame(now: number) {
    if (disposed) return;
    const state = runtime.getSnapshot();
    const native = timeMedia();
    const delta = lastTime === null ? 0 : Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    if (
      !state.paused &&
      ready &&
      (!buffering || frozenChoice()) &&
      (!native || !ownedMedia() || frozenChoice() || clipFinished || !native.paused) &&
      !['error', 'ended'].includes(state.phase)
    ) {
      if (native && ownedMedia()) {
        if (!clipFinished) sampleMediaClock(state.epoch);
        else if (finalMediaTime !== null) consumeFinalMediaTime(state.epoch);
        else runtime.advance(delta, state.epoch);
      } else runtime.advance(delta, state.epoch);
    }
    updatePlaybackTime(runtime.getSnapshot());
    frameId = requestAnimationFrame(frame);
  }
  const visibility = () => syncPaused();
  const fullscreenChanged = () => {
    const fullscreen = document.fullscreenElement === shell;
    controlIcon(
      fullscreenButton,
      fullscreen ? '退出全屏' : '全屏',
      fullscreen ? 'exitFullscreen' : 'fullscreen',
    );
    locateHotspot();
  };
  const keyboard = (event: KeyboardEvent) => {
    if (
      event.key !== ' ' ||
      event.repeat ||
      (event.target as HTMLElement).closest('button,input,textarea,select')
    )
      return;
    event.preventDefault();
    sampleMediaClock(runtime.getSnapshot().epoch);
    const state = runtime.getSnapshot();
    if (state.node?.kind === 'qte' && state.interactionOpen && !state.paused) {
      input(state.epoch, () => runtime.qte(state.epoch));
    } else if (userPaused) resume();
    else pause();
  };
  shell.addEventListener('keydown', keyboard);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  window.addEventListener('resize', locateHotspot);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(locateHotspot);
  observer?.observe(stage);
  const unsubscribe = runtime.subscribe(render);
  runtime.start();
  runtime.setPaused(true);
  frameId = requestAnimationFrame(frame);
  return {
    pause,
    resume,
    restart,
    getState: runtime.getSnapshot,
    destroy() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      unsubscribe();
      releaseMedia(true);
      observer?.disconnect();
      shell.removeEventListener('keydown', keyboard);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      window.removeEventListener('resize', locateHotspot);
      if (document.fullscreenElement === shell) document.exitFullscreen?.()?.catch(() => {});
      shell.remove();
    },
  };
}
export type FilmPlayerHandle = ReturnType<typeof mountFilmPlayer>;
