import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasVideoClipNode from './CanvasVideoClipNode.jsx';
import { resolveVideoClipNodePresentation } from './domain/node-presentation-model.js';
import { clearVideoClipPlaybackPool } from './useVideoClipPlayback.js';

const clip = { id: 'clip', type: 'video-clip', data: { url: [] } };
const base = {
  nodeId: 'clip',
  data: clip.data,
  incomingData: { videoList: [], audioList: [] },
  editingClipNodeId: null,
  editingClipPreviewExpanded: true,
  nowMs: 10_000,
};
function view(overrides = {}, props = {}) {
  const node = { ...clip, data: overrides.data ?? clip.data };
  const presentation = resolveVideoClipNodePresentation({ ...base, ...overrides });
  return (
    <CanvasVideoClipNode node={node} presentation={presentation} documentKey="doc-a" {...props} />
  );
}
function hoverOutput(container) {
  fireEvent.mouseEnter(container.querySelector('.cv-clip-node-output'));
  act(() => vi.advanceTimersByTime(300));
  return container.querySelector('.cv-clip-node-output video');
}
function pointer(element, type, values) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...values });
  Object.defineProperty(event, 'pointerId', { value: 7 });
  fireEvent(element, event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
});
afterEach(() => {
  cleanup();
  clearVideoClipPlaybackPool();
  vi.useRealTimers();
});

describe('dedicated source VideoClip body rendering', () => {
  it('renders empty source copy and only injected recommendations, with readonly/preset gates', () => {
    const choose = vi.fn();
    const modes = [
      { modeKey: 'talkingVideo', name: '注入模式一' },
      { modeKey: 'smartMixCut', name: '注入模式二' },
    ];
    const { container, rerender } = render(view({}, { modes, onTryMode: choose }));
    expect(screen.getByText('空空如也，请连接视频节点后操作')).toBeTruthy();
    expect(container.querySelector('.cv-clip-node-content').style.width).toBe('350px');
    expect(screen.queryByRole('button', { name: '打开智能剪辑' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '注入模式二' }));
    expect(choose.mock.calls).toEqual([['smartMixCut']]);
    rerender(view({ readonly: true }, { modes, onTryMode: choose }));
    expect(screen.getByRole('button', { name: '注入模式一' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '注入模式一' }));
    expect(choose).toHaveBeenCalledTimes(1);
    rerender(view({ data: { agentComposerData: { modeKey: 'talkingVideo' } } }, { modes }));
    expect(screen.queryByText('尝试：')).toBeNull();
    expect(screen.queryByText('注入模式一')).toBeNull();
  });

  it('warms injected preset dimensions on idle/fallback only and cancels when readonly or retired', () => {
    const warm = vi.fn();
    const modes = [{ modeKey: 'talkingVideo', name: '模式' }];
    const { rerender, unmount } = render(view({}, { modes, onWarmPresets: warm }));
    act(() => vi.advanceTimersByTime(299));
    expect(warm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(warm.mock.calls).toEqual([[modes]]);
    rerender(view({}, { modes, onWarmPresets: warm, documentKey: 'doc-b' }));
    rerender(view({ readonly: true }, { modes, onWarmPresets: warm, documentKey: 'doc-b' }));
    act(() => vi.advanceTimersByTime(400));
    expect(warm).toHaveBeenCalledTimes(1);
    rerender(view({}, { modes, onWarmPresets: warm, documentKey: 'doc-c' }));
    unmount();
    act(() => vi.advanceTimersByTime(400));
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('renders the incoming 566×350 preview with an aria-hidden decorative 0–22 mini timeline', () => {
    const open = vi.fn();
    const incomingData = { videoList: [{ nodeId: 'v', url: '/assets/video.mp4' }], audioList: [] };
    const { container, rerender } = render(
      view({ incomingData }, { sourcePoster: '/assets/poster.jpg', onOpen: open }),
    );
    const root = container.querySelector('.cv-clip-node-content');
    expect(root.style.width).toBe('566px');
    expect(root.style.height).toBe('350px');
    expect(container.querySelector('img').getAttribute('src')).toBe('/assets/poster.jpg');
    const mini = container.querySelector('.cv-clip-node-mini-timeline');
    expect(mini.getAttribute('aria-hidden')).toBe('true');
    expect(
      [...mini.querySelectorAll('.cv-clip-node-mini-ticks span')].map((entry) => entry.textContent),
    ).toEqual([
      '0',
      '0:02',
      '0:04',
      '0:06',
      '0:08',
      '0:10',
      '0:12',
      '0:14',
      '0:16',
      '0:18',
      '0:20',
      '0:22',
    ]);
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开智能剪辑' }));
    expect(open).toHaveBeenCalledTimes(1);
    rerender(view({ incomingData, agentEditingPending: true }, { onOpen: open }));
    expect(screen.getByRole('button', { name: '打开智能剪辑' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '打开智能剪辑' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('falls back poster→snapshot→passive video, resetting only current identities and releasing native source', () => {
    const incomingData = { videoList: [{ nodeId: 'v', url: '/assets/video.mp4' }], audioList: [] };
    const props = { sourcePoster: '/assets/poster.jpg', sourceSnapshot: '/assets/snapshot.jpg' };
    const { container, rerender, unmount } = render(view({ incomingData }, props));
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img').getAttribute('src')).toBe('/assets/snapshot.jpg');
    fireEvent.error(container.querySelector('img'));
    const video = container.querySelector('video');
    expect(video.getAttribute('src')).toBe('/assets/video.mp4');
    expect(video.controls).toBe(false);
    expect(video.muted).toBe(true);
    rerender(view({ incomingData }, { ...props, documentKey: 'doc-b' }));
    expect(video.getAttribute('src')).toBeNull();
    expect(container.querySelector('img').getAttribute('src')).toBe('/assets/poster.jpg');
    fireEvent.error(container.querySelector('img'));
    fireEvent.error(container.querySelector('img'));
    const current = container.querySelector('video');
    unmount();
    expect(current.getAttribute('src')).toBeNull();
  });

  it('provides the exact collapsed-editor portal instead of a second video or generic generator', () => {
    const { container } = render(
      view({
        data: { url: ['/assets/out.mp4'], embedContentHeight: 197 },
        incomingData: { videoList: [{ nodeId: 'v', url: '/assets/a.mp4' }], audioList: [] },
        editingClipNodeId: 'clip',
        editingClipPreviewExpanded: false,
      }),
    );
    expect(container.querySelector('#clip-preview-drop-clip')).toBeTruthy();
    expect(container.querySelector('.cv-clip-node-content').style.height).toBe('197px');
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/添加提示词/)).toBeNull();
  });

  it('renders active without output as a standalone busy layer; output and busy layer may coexist', () => {
    const { container, rerender } = render(view({ data: { agentEditing: { state: 'running' } } }));
    expect(screen.getByText('剪辑中…')).toBeTruthy();
    expect(screen.queryByText('空空如也，请连接视频节点后操作')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      view(
        { data: { url: ['/assets/out.mp4'], agentEditing: { state: 'running' } } },
        { theme: 'light' },
      ),
    );
    expect(container.querySelector('.cv-clip-node-output')).toBeTruthy();
    expect(container.querySelector('.cv-clip-node-agent-breathing-dark')).toBeTruthy();
    expect(container.querySelector('.cv-clip-node-content').getAttribute('data-clip-theme')).toBe(
      'light',
    );
    expect(screen.getByRole('button', { name: '打开智能剪辑' }).disabled).toBe(true);
  });

  it('exposes only the source output download callback, hiding it during compose generation', () => {
    const download = vi.fn();
    const { rerender } = render(
      view({ data: { url: ['/assets/out.mp4'] }, readonly: true }, { onDownload: download }),
    );
    fireEvent.click(screen.getByRole('button', { name: '下载视频' }));
    expect(download).toHaveBeenCalledTimes(1);
    rerender(
      view(
        { data: { url: ['/assets/out.mp4'], taskInfo: { loading: true, status: 1 } } },
        { onDownload: download },
      ),
    );
    expect(screen.queryByRole('button', { name: '下载视频' })).toBeNull();
    expect(screen.getByRole('button', { name: '生成中' }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /截帧/ })).toBeNull();
  });

  it('readonly output allows actual play, seek, and volume while disabling only the edit button', () => {
    const open = vi.fn();
    const write = vi.fn();
    const { container } = render(
      view(
        { data: { url: ['/assets/out.mp4'], playbackVolume: 0.5 }, readonly: true },
        { onOpen: open, onPlaybackVolumeChange: write },
      ),
    );
    expect(screen.getByRole('button', { name: '打开智能剪辑' }).disabled).toBe(true);
    const video = hoverOutput(container);
    expect(video).toBeTruthy();
    expect(video.controls).toBe(false);
    expect(screen.getByText('--:--')).toBeTruthy();
    Object.defineProperty(video, 'duration', { configurable: true, value: 22 });
    act(() => video.dispatchEvent(new Event('loadedmetadata')));
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByRole('button', { name: '播放' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '播放' }));
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('slider', { name: '播放进度' }), { key: 'End' });
    expect(video.currentTime).toBe(22);
    fireEvent.focus(screen.getByRole('button', { name: '静音' }));
    fireEvent.keyDown(screen.getByRole('slider', { name: '音量' }), { key: 'ArrowUp' });
    act(() => vi.advanceTimersByTime(200));
    expect(write.mock.calls).toEqual([[0.55]]);
    expect(video.volume).toBe(0.55);
    fireEvent.click(screen.getByRole('button', { name: '打开智能剪辑' }));
    expect(open).not.toHaveBeenCalled();
  });

  it('uses source pointer interpolation and compact subsecond time, with keyboard additions kept local', () => {
    const write = vi.fn();
    const { container } = render(
      view(
        { data: { url: ['/assets/out.mp4'], playbackVolume: 0.5 } },
        { onPlaybackVolumeChange: write },
      ),
    );
    const video = hoverOutput(container);
    Object.defineProperty(video, 'duration', { configurable: true, value: 22 });
    Object.defineProperty(video, 'audioTracks', { configurable: true, value: { length: 1 } });
    act(() => video.dispatchEvent(new Event('loadedmetadata')));
    const seek = screen.getByRole('slider', { name: '播放进度' });
    seek.getBoundingClientRect = () => ({ left: 100, width: 200, bottom: 14, height: 14 });
    pointer(seek, 'pointerdown', { button: 0, clientX: 150 });
    expect(video.currentTime).toBe(5.5);
    pointer(window, 'pointermove', { clientX: 500 });
    expect(video.currentTime).toBe(22);
    pointer(window, 'pointermove', { clientX: 50 });
    expect(video.currentTime).toBe(0);
    pointer(window, 'pointerup', {});
    video.currentTime = 0.3;
    act(() => video.dispatchEvent(new Event('timeupdate')));
    expect(screen.getByText('0:01')).toBeTruthy();
    const volume = screen.getByRole('slider', { name: '音量' });
    volume.getBoundingClientRect = () => ({ left: 0, width: 16, bottom: 100, height: 80 });
    pointer(volume, 'pointerdown', { button: 0, clientY: 80 });
    pointer(window, 'pointerup', {});
    act(() => vi.advanceTimersByTime(200));
    expect(write.mock.calls).toEqual([[0.25]]);
    expect(video.volume).toBe(0.25);
  });

  it('retire document slider drag and debounced writes when the same node ID changes owner', () => {
    const write = vi.fn();
    const data = { url: ['/assets/out.mp4'], playbackVolume: 0.5 };
    const { container, rerender } = render(view({ data }, { onPlaybackVolumeChange: write }));
    hoverOutput(container);
    const volume = screen.getByRole('slider', { name: '音量' });
    volume.getBoundingClientRect = () => ({ left: 0, width: 16, bottom: 100, height: 80 });
    pointer(volume, 'pointerdown', { button: 0, clientY: 80 });
    rerender(view({ data }, { onPlaybackVolumeChange: write, documentKey: 'doc-b' }));
    pointer(window, 'pointermove', { clientY: 20 });
    pointer(window, 'pointerup', {});
    act(() => vi.advanceTimersByTime(1000));
    expect(write).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toBeNull();
  });
});
