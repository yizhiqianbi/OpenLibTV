import { StrictMode, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VideoClipTimeline from './VideoClipTimeline.jsx';
import {
  deleteClipTimelineSelection,
  pushClipTimelineHistory,
  setClipTimelineTrackControl,
  stepClipTimelineHistory,
} from './domain/timeline-document-model.js';
import {
  finishClipTimelineTrackInsertion,
  moveClipTimelineRealtime,
  reorderClipTimelineVideo,
  trimClipTimelineRealtime,
} from './domain/timeline-edit-model.js';

function timeline() {
  return {
    videoSourceNodeIds: ['main-source', 'next-source', 'overlay-source'],
    audioSourceNodeIds: ['audio-source'],
    clipsAuthoritative: true,
    clips: [
      {
        id: 'overlay',
        sourceNodeId: 'overlay-source',
        type: 'video',
        name: '叠层',
        zIndex: 0,
        startTime: 8,
        duration: 2,
        sourceOffset: 0,
        sourceDuration: 2,
        width: 640,
        height: 360,
        futureClip: { keep: true },
      },
      {
        id: 'main',
        sourceNodeId: 'main-source',
        type: 'video',
        name: '主片',
        zIndex: 1,
        startTime: 0,
        duration: 4,
        sourceOffset: 1,
        sourceDuration: 20,
        width: 1920,
        height: 1080,
        speed: 2,
      },
      {
        id: 'next',
        sourceNodeId: 'next-source',
        type: 'video',
        name: '第二片',
        zIndex: 1,
        startTime: 4,
        duration: 3,
        sourceOffset: 0,
        sourceDuration: 3,
        width: 1280,
        height: 720,
      },
      {
        id: 'sound',
        sourceNodeId: 'audio-source',
        type: 'audio',
        name: '原声',
        zIndex: 2,
        startTime: 0,
        duration: 4,
        sourceOffset: 0,
        sourceDuration: 10,
        linkedVideoClipId: 'main',
        decibel: -2,
      },
    ],
    videoTrackCount: 2,
    totalDuration: 10,
    currentTime: 2,
    scale: 100,
    scrollX: 0,
    videoAudioMuted: false,
    videoAudioMutedPerTrack: [true, false],
    videoTrackHiddenPerTrack: [false, false],
    videoAudioVolume: 0.7,
    audioTrackMuted: false,
    audioTrackMutedPerTrack: [false],
    audioTrackHiddenPerTrack: [false],
    audioTrackVolume: 0.6,
    cropRange: { start: 0, end: 4 },
    overlayHtmlUrl: '/overlay.html',
    subtitlesHtml: { 'main-source': { contractVersion: 4, extra: true } },
    futureDoc: { keep: ['x'] },
  };
}

function props(overrides = {}) {
  return {
    timeline: timeline(),
    selectedClipIds: ['main'],
    mediaBySourceId: new Map([
      [
        'main-source',
        {
          url: '/video.mp4',
          name: '真实主片',
          poster: '/real-poster.jpg',
          metadata: { url: '/video.mp4', sourceDuration: 20, width: 1920, height: 1080 },
        },
      ],
    ]),
    ready: true,
    playing: false,
    history: { past: [], future: [] },
    height: 300,
    onBeginEdit: vi.fn(() => true),
    onEditPreview: vi.fn(),
    onEndEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    onSeek: vi.fn(),
    onSelectClip: vi.fn(),
    onDelete: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSplit: vi.fn(),
    onTrim: vi.fn(),
    onPlayToggle: vi.fn(),
    onSetTrackControl: vi.fn(),
    onSetView: vi.fn(),
    onCompose: vi.fn(),
    onClose: vi.fn(),
    onTogglePreview: vi.fn(),
    onResizeHeight: vi.fn(),
    ...overrides,
  };
}

function pointer(element, type, x, y, id = 7) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  fireEvent(element, event);
}

const raf = new Map();
let nextFrame = 0;
beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = ++nextFrame;
      raf.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => raf.delete(id)),
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const track = this.getAttribute('data-clip-track');
    if (track === 'video:0')
      return { left: 0, top: 178, right: 672, bottom: 230, width: 672, height: 52 };
    if (track === 'video:1')
      return { left: 0, top: 230, right: 672, bottom: 298, width: 672, height: 68 };
    if (track === 'audio:0')
      return { left: 0, top: 298, right: 672, bottom: 338, width: 672, height: 40 };
    return { left: 72, top: 150, right: 672, bottom: 178, width: 600, height: 28 };
  });
});
afterEach(() => {
  cleanup();
  raf.clear();
  vi.unstubAllGlobals();
});

function Harness({ initial = timeline(), selected = ['main'], callbacks = {}, onDocument }) {
  const [doc, setDoc] = useState(initial);
  const [ids, setIds] = useState(selected);
  const [history, setHistory] = useState({ past: [], future: [] });
  const current = useRef({ doc, ids, history });
  const base = useRef(null);
  current.current = { doc, ids, history };
  const apply = (next) => {
    current.current.doc = next;
    setDoc(next);
    onDocument?.(next);
  };
  return (
    <VideoClipTimeline
      {...props()}
      timeline={doc}
      selectedClipIds={ids}
      history={history}
      onSelectClip={(id) => {
        const clip = current.current.doc.clips.find((clip) => clip.id === id);
        setIds([id]);
        current.current.ids = [id];
        apply({
          ...current.current.doc,
          cropRange: { start: clip.startTime, end: clip.startTime + clip.duration },
        });
        callbacks.select?.(id);
      }}
      onBeginEdit={() => {
        base.current = { doc: structuredClone(current.current.doc), ids: [...current.current.ids] };
        callbacks.begin?.();
        return callbacks.allowBegin?.() ?? true;
      }}
      onEditPreview={(operation, options) => {
        callbacks.preview?.(operation, options);
        const before = operation === 'insert-track' ? current.current.doc : base.current.doc;
        const result =
          operation === 'move'
            ? moveClipTimelineRealtime(before, options)
            : operation === 'trim'
              ? trimClipTimelineRealtime(before, options)
              : operation === 'reorder'
                ? reorderClipTimelineVideo(before, options)
                : finishClipTimelineTrackInsertion(before, options);
        if (result.status === 'edited') apply(result.timeline);
      }}
      onEndEdit={() => {
        const next = pushClipTimelineHistory(
          current.current.history,
          base.current.doc,
          base.current.ids,
        );
        setHistory(next);
        current.current.history = next;
        base.current = null;
        callbacks.end?.();
      }}
      onCancelEdit={() => {
        if (base.current) {
          apply(base.current.doc);
          setIds(base.current.ids);
          base.current = null;
        }
        callbacks.cancel?.();
      }}
      onUndo={() => {
        const result = stepClipTimelineHistory(
          current.current.history,
          'undo',
          current.current.doc,
          current.current.ids,
        );
        if (result) {
          apply(result.timeline);
          setIds(result.selectedClipIds);
          setHistory(result.history);
        }
      }}
      onRedo={() => {
        const result = stepClipTimelineHistory(
          current.current.history,
          'redo',
          current.current.doc,
          current.current.ids,
        );
        if (result) {
          apply(result.timeline);
          setIds(result.selectedClipIds);
          setHistory(result.history);
        }
      }}
      onSetTrackControl={(control) =>
        apply(setClipTimelineTrackControl(current.current.doc, control))
      }
      onDelete={() => {
        const result = deleteClipTimelineSelection(current.current.doc, current.current.ids);
        if (result.status === 'deleted') {
          setHistory(
            pushClipTimelineHistory(
              current.current.history,
              current.current.doc,
              current.current.ids,
            ),
          );
          apply(result.timeline);
          setIds(result.selectedClipIds);
        }
        callbacks.delete?.();
      }}
    />
  );
}

describe('source-shaped clip timeline presentation and toolbar', () => {
  it('uses source track heights and real supplied poster without fake waveform/thumb samples', () => {
    const { container } = render(<VideoClipTimeline {...props()} />);
    expect(screen.getByRole('region', { name: '视频剪辑时间轴' })).toBeTruthy();
    expect(container.querySelector('[data-clip-track="video:0"]').style.height).toBe('52px');
    expect(container.querySelector('[data-clip-track="video:1"]').style.height).toBe('68px');
    expect(container.querySelector('[data-clip-track="audio:0"]').style.height).toBe('40px');
    expect(container.querySelector('[data-clip-id="main"]').style.left).toBe('6px');
    expect(container.querySelector('[data-clip-id="main"]').style.width).toBe('399px');
    expect(container.querySelector('.cv-clip-timeline-poster').getAttribute('src')).toBe(
      '/real-poster.jpg',
    );
    expect(container.querySelectorAll('video, canvas')).toHaveLength(0);
    expect(
      container.querySelector('[data-clip-id="main"] .cv-clip-timeline-source-icon').style
        .maskImage,
    ).toBe('url("/assets/icons/clip-speed-gauge.svg")');
    expect(screen.getByRole('slider', { name: '播放位置' }).getAttribute('aria-valuenow')).toBe(
      '2',
    );
  });

  it('uses the original rendered two-pixel floor for tiny clips rather than unused config minimum20', () => {
    const saved = timeline();
    saved.clips[1].duration = 0.01;
    saved.scale = 2;
    const { container } = render(<VideoClipTimeline {...props({ timeline: saved })} />);
    expect(container.querySelector('[data-clip-id="main"]').style.width).toBe('2px');
  });

  it('renders original video title, twenty-four-fps duration and rounded uppercase speed label', () => {
    const saved = timeline();
    saved.clips[1].name = '  标题  ';
    saved.clips[1].duration = 1.125;
    saved.clips[1].speed = 2.123;
    const { container } = render(<VideoClipTimeline {...props({ timeline: saved })} />);
    expect(
      container.querySelector('[data-clip-id="main"] .cv-clip-timeline-speed').textContent,
    ).toBe('变速 2.12X');
    expect(
      container.querySelector('[data-clip-id="main"] .cv-clip-timeline-clip-name').textContent,
    ).toBe('变速 2.12X标题 00:00:01:03');
  });

  it('keeps exact original loading/error copy and refuses editing an unprepared fragment', () => {
    const saved = timeline();
    saved.clips[1].loading = true;
    saved.clips[2].loadError = true;
    const input = props({ timeline: saved });
    const { container } = render(<VideoClipTimeline {...input} />);
    expect(screen.getByText('视频加载中...')).toBeTruthy();
    expect(screen.getByText('素材加载失败')).toBeTruthy();
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 640, 250);
    pointer(window, 'pointerup', 640, 250);
    expect(input.onBeginEdit).not.toHaveBeenCalled();
  });

  it('does not seek through a retained focused playhead after media readiness is lost', () => {
    const input = props();
    const { rerender } = render(<VideoClipTimeline {...input} />);
    const head = screen.getByRole('slider', { name: '播放位置' });
    head.focus();
    rerender(<VideoClipTimeline {...input} ready={false} />);
    fireEvent.keyDown(head, { key: 'ArrowRight' });
    expect(input.onSeek).not.toHaveBeenCalled();
  });

  it('calls dedicated split/trim with audio only while a single selected audio spans playhead', () => {
    const input = props({ selectedClipIds: ['sound'] });
    const { rerender } = render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '分割' }));
    fireEvent.click(screen.getByRole('button', { name: '向左裁剪' }));
    fireEvent.click(screen.getByRole('button', { name: '向右裁剪' }));
    expect(input.onSplit.mock.calls).toEqual([['audio']]);
    expect(input.onTrim.mock.calls).toEqual([
      ['audio', 'left'],
      ['audio', 'right'],
    ]);
    rerender(<VideoClipTimeline {...input} timeline={{ ...timeline(), currentTime: 5 }} />);
    fireEvent.click(screen.getByRole('button', { name: '分割' }));
    expect(input.onSplit.mock.calls[1]).toEqual(['video']);
  });

  it('gates split/trim for boundaries, too-short durations and unavailable media', () => {
    const input = props({ timeline: { ...timeline(), currentTime: 0 } });
    const { rerender } = render(<VideoClipTimeline {...input} />);
    expect(screen.getByRole('button', { name: '分割' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '向左裁剪' }).disabled).toBe(true);
    rerender(<VideoClipTimeline {...input} timeline={{ ...timeline(), currentTime: 0.2 }} />);
    expect(screen.getByRole('button', { name: '分割' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '向右裁剪' }).disabled).toBe(true);
    rerender(<VideoClipTimeline {...props({ ready: false })} />);
    expect(screen.getByRole('status').textContent).toBe('正在准备时间轴素材…');
    expect(screen.getByRole('button', { name: '分割' }).disabled).toBe(true);
  });

  it('keeps unsupported source controls explicitly disabled and still closes on preparation error', () => {
    const input = props({ error: new Error('真实素材读取失败') });
    render(<VideoClipTimeline {...input} />);
    expect(screen.getByRole('alert').textContent).toBe('真实素材读取失败');
    expect(screen.getByRole('button', { name: '添加字幕（尚未接入）' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '添加文字（尚未接入）' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '添加转场（尚未接入）' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '退出剪辑' }));
    expect(input.onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes the source transition action and renders a selectable cut marker', () => {
    const onAddTransition = vi.fn();
    const onSelectClip = vi.fn();
    const input = props({ onAddTransition, onSelectClip });
    const { container, rerender } = render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '添加转场' }));
    expect(onAddTransition).toHaveBeenCalledTimes(1);
    rerender(
      <VideoClipTimeline
        {...input}
        timeline={{
          ...timeline(),
          clips: timeline().clips.map((clip) =>
            clip.id === 'next' ? { ...clip, transitionIn: { type: 'fade', duration: 0.8 } } : clip,
          ),
        }}
      />,
    );
    const marker = container.querySelector('[data-transition-id="clip-transition-right-next"]');
    expect(marker).toBeTruthy();
    expect(marker.getAttribute('aria-label')).toBe('转场 fade 0.8秒');
    fireEvent.click(marker);
    expect(onSelectClip).toHaveBeenCalledWith('next');
  });

  it('opens the library without applying an effect and selects a cut independently of clips', () => {
    const input = props({
      onAddTransition: vi.fn(),
      onToggleTransitionPanel: vi.fn(),
      onCloseTransitionPanel: vi.fn(),
      onSelectTransition: vi.fn(),
      selectedClipIds: [],
      selectedTransitionRightClipId: 'next',
      transitionPanelOpen: true,
      timeline: {
        ...timeline(),
        clips: timeline().clips.map((clip) =>
          clip.id === 'next' ? { ...clip, transitionIn: { type: 'fade', duration: 1 } } : clip,
        ),
      },
    });
    const { container } = render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '添加转场' }));
    expect(input.onToggleTransitionPanel).toHaveBeenCalledTimes(1);
    expect(input.onAddTransition).not.toHaveBeenCalled();
    const marker = container.querySelector('[data-transition-id="clip-transition-right-next"]');
    expect(marker.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(marker);
    expect(input.onSelectTransition).toHaveBeenCalledWith('next');
    fireEvent.keyDown(marker, { key: 'Delete' });
    expect(input.onDelete).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(marker, { key: 'Escape' });
    expect(input.onCloseTransitionPanel).toHaveBeenCalledTimes(1);
    expect(input.onClose).not.toHaveBeenCalled();
  });

  it('maps exact mute/hidden controls without changing selection or pretending a generated task', () => {
    const input = props();
    render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '取消静音视频轨道 1' }));
    fireEvent.click(screen.getByRole('button', { name: '隐藏音频轨道 1' }));
    expect(input.onSetTrackControl.mock.calls).toEqual([
      [{ kind: 'video', control: 'muted', trackIndex: 0, value: false }],
      [{ kind: 'audio', control: 'hidden', trackIndex: 0, value: true }],
    ]);
    expect(input.onSelectClip).not.toHaveBeenCalled();
    expect(input.onCompose).not.toHaveBeenCalled();
  });

  it('exposes source clip volume fader lines and commits keyboard nudges as one edit', () => {
    const input = props();
    render(<VideoClipTimeline {...input} />);
    const line = screen.getByRole('slider', { name: '主片音量' });
    expect(line.getAttribute('aria-valuenow')).toBe('0.3');
    fireEvent.keyDown(line, { key: 'ArrowUp' });
    expect(input.onBeginEdit).toHaveBeenCalledTimes(1);
    expect(input.onEditPreview).toHaveBeenCalledWith('audio-gain', {
      clipId: 'main',
      position: 0.35,
    });
    expect(input.onEndEdit).toHaveBeenCalledTimes(1);
  });

  it('commits the final pointer position of a volume line instead of moving the clip', () => {
    const input = props();
    const { container } = render(<VideoClipTimeline {...input} />);
    const line = container.querySelector('[data-testid="clip-volume-line-main"]');
    pointer(line, 'pointerdown', 180, 160);
    pointer(window, 'pointermove', 180, 150);
    pointer(window, 'pointerup', 180, 150);
    expect(input.onBeginEdit).toHaveBeenCalledTimes(1);
    expect(input.onEditPreview.mock.calls.at(-1)?.[0]).toBe('audio-gain');
    expect(input.onEditPreview.mock.calls.at(-1)?.[1]).toMatchObject({ clipId: 'main' });
    expect(input.onEndEdit).toHaveBeenCalledTimes(1);
    expect(input.onEditPreview.mock.calls.some(([operation]) => operation === 'move')).toBe(false);
  });

  it('preserves the original linear 2–500 range and playhead-anchored 1.04 zoom', () => {
    const input = props();
    render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '放大' }));
    expect(input.onSetView.mock.calls[0]).toEqual([{ scale: 104, scrollX: 8 }]);
    fireEvent.change(screen.getByRole('slider', { name: '时间轴缩放' }), {
      target: { value: '50' },
    });
    expect(input.onSetView.mock.calls[1]).toEqual([{ scale: 251, scrollX: 302 }]);
  });

  it('uses source wheel behavior for horizontal pan and Ctrl zoom without body event injection', () => {
    const input = props();
    const { container } = render(<VideoClipTimeline {...input} />);
    const body = container.querySelector('.cv-clip-timeline-scroll');
    fireEvent.wheel(body, { deltaX: 25, deltaY: 1 });
    fireEvent.wheel(body, { ctrlKey: true, deltaY: -1 });
    expect(input.onSetView.mock.calls).toEqual([[{ scrollX: 25 }], [{ scale: 104, scrollX: 8 }]]);
  });

  it('seeks through actual ruler pointer coordinates and keyboard increments', () => {
    const input = props();
    render(<VideoClipTimeline {...input} />);
    const ruler = screen.getByLabelText('时间刻度');
    pointer(ruler, 'pointerdown', 378, 161);
    expect(input.onSeek.mock.calls).toEqual([[3]]);
    pointer(window, 'pointermove', 478, 161);
    pointer(window, 'pointerup', 478, 161);
    expect(input.onSeek.mock.calls.at(-1)).toEqual([4]);
    fireEvent.keyDown(screen.getByRole('slider', { name: '播放位置' }), { key: 'ArrowRight' });
    expect(input.onSeek.mock.calls.at(-1)).toEqual([2.1]);
    expect(input.onBeginEdit).not.toHaveBeenCalled();
  });
});

describe('real document edits from timeline DOM input', () => {
  it('first click selects only, then the second drag begins after four pixels and commits once', () => {
    const callbacks = {
      select: vi.fn(),
      begin: vi.fn(),
      preview: vi.fn(),
      end: vi.fn(),
      cancel: vi.fn(),
    };
    const seen = vi.fn();
    const { container } = render(<Harness selected={[]} callbacks={callbacks} onDocument={seen} />);
    const main = container.querySelector('[data-clip-id="main"]');
    pointer(main, 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 400, 250);
    pointer(window, 'pointerup', 400, 250);
    expect(callbacks.select.mock.calls).toEqual([['main']]);
    expect(callbacks.begin).not.toHaveBeenCalled();
    pointer(main, 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 180, 250);
    expect(callbacks.begin).not.toHaveBeenCalled();
    pointer(window, 'pointermove', 640, 250);
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(callbacks.preview).not.toHaveBeenCalled();
    expect(container.querySelector('.cv-clip-timeline-drag-ghost')).toBeTruthy();
    pointer(window, 'pointerup', 640, 250);
    expect(callbacks.preview.mock.calls).toEqual([
      ['reorder', { clipId: 'main', index: 1, selectedClipIds: ['main'], viewportWidth: 600 }],
    ]);
    expect(callbacks.end).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      clips: [
        timeline().clips[0],
        { ...timeline().clips[2], startTime: 0 },
        { ...timeline().clips[1], startTime: 3 },
        timeline().clips[3],
      ],
      cropRange: { start: 3, end: 7 },
    });
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(seen.mock.calls.at(-1)[0]).toEqual(timeline());
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    expect(seen.mock.calls.at(-1)[0].clips).toEqual([
      timeline().clips[0],
      { ...timeline().clips[2], startTime: 0 },
      { ...timeline().clips[1], startTime: 3 },
      timeline().clips[3],
    ]);
  });

  it('trim handles call realtime crop and yield one literal undoable document after release', () => {
    const seen = vi.fn(),
      callbacks = { begin: vi.fn(), end: vi.fn(), preview: vi.fn() };
    render(<Harness callbacks={callbacks} onDocument={seen} />);
    pointer(screen.getByRole('button', { name: '调整主片终点' }), 'pointerdown', 478, 250);
    pointer(window, 'pointermove', 378, 250);
    pointer(window, 'pointerup', 378, 250);
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(callbacks.end).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      clips: [
        timeline().clips[0],
        { ...timeline().clips[1], duration: 3 },
        { ...timeline().clips[2], startTime: 3 },
        timeline().clips[3],
      ],
      cropRange: { start: 0, end: 3 },
    });
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(seen.mock.calls.at(-1)[0]).toEqual(timeline());
  });

  it('allows restoring source offset by dragging a first clip left of timeline zero', () => {
    const seen = vi.fn();
    render(<Harness onDocument={seen} />);
    pointer(screen.getByRole('button', { name: '调整主片起点' }), 'pointerdown', 78, 250);
    pointer(window, 'pointermove', 28, 250);
    pointer(window, 'pointerup', 28, 250);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      clips: [
        timeline().clips[0],
        { ...timeline().clips[1], duration: 4.5, sourceOffset: 0 },
        { ...timeline().clips[2], startTime: 4.5 },
        timeline().clips[3],
      ],
      cropRange: { start: 0, end: 4.5 },
    });
  });

  it('inserts a track when a main fragment is dragged below the primary row, retaining another primary fragment', () => {
    const seen = vi.fn(),
      callbacks = { begin: vi.fn(), preview: vi.fn(), end: vi.fn() };
    const { container } = render(<Harness callbacks={callbacks} onDocument={seen} />);
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 478, 310);
    pointer(window, 'pointerup', 478, 310);
    expect(callbacks.preview.mock.calls.map(([operation]) => operation)).toEqual([
      'move',
      'insert-track',
    ]);
    expect(callbacks.end).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      videoTrackCount: 3,
      clips: [
        timeline().clips[0],
        { ...timeline().clips[1], startTime: 3 },
        { ...timeline().clips[2], zIndex: 2, startTime: 0 },
        { ...timeline().clips[3], zIndex: 3 },
      ],
      videoAudioMutedPerTrack: [true, false, false],
      videoTrackHiddenPerTrack: [false, false, false],
      cropRange: { start: 3, end: 7 },
    });
  });

  it('audio drags preview in place and normalize on release without stripping original links', () => {
    const seen = vi.fn(),
      callbacks = { begin: vi.fn(), end: vi.fn(), preview: vi.fn() };
    const { container } = render(
      <Harness selected={['sound']} callbacks={callbacks} onDocument={seen} />,
    );
    pointer(container.querySelector('[data-clip-id="sound"]'), 'pointerdown', 178, 318);
    pointer(window, 'pointermove', 278, 318);
    expect(callbacks.preview.mock.calls[0][0]).toBe('move');
    pointer(window, 'pointerup', 278, 318);
    expect(callbacks.preview.mock.calls.at(-1)[0]).toBe('insert-track');
    expect(callbacks.end).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      clips: [
        timeline().clips[0],
        timeline().clips[1],
        timeline().clips[2],
        { ...timeline().clips[3], startTime: 1 },
      ],
      cropRange: { start: 1, end: 5 },
    });
  });

  it('cancel/Escape restores original full document without adding undo history', () => {
    const seen = vi.fn(),
      callbacks = { begin: vi.fn(), end: vi.fn(), cancel: vi.fn() };
    render(<Harness callbacks={callbacks} onDocument={seen} />);
    pointer(screen.getByRole('button', { name: '调整主片终点' }), 'pointerdown', 478, 250);
    pointer(window, 'pointermove', 378, 250);
    fireEvent.keyDown(screen.getByRole('region', { name: '视频剪辑时间轴' }), { key: 'Escape' });
    pointer(window, 'pointerup', 378, 250);
    expect(callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.end).not.toHaveBeenCalled();
    expect(seen.mock.calls.at(-1)[0]).toEqual(timeline());
    expect(screen.getByRole('button', { name: '撤销' }).disabled).toBe(true);
  });

  it('does not publish edit commands when owner begin denies and ignores another pointer', () => {
    const input = props({ onBeginEdit: vi.fn(() => false) });
    const { container } = render(<VideoClipTimeline {...input} />);
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 640, 250, 99);
    expect(input.onBeginEdit).not.toHaveBeenCalled();
    pointer(window, 'pointermove', 640, 250);
    pointer(window, 'pointerup', 640, 250);
    expect(input.onBeginEdit).toHaveBeenCalledTimes(1);
    expect(input.onEditPreview).not.toHaveBeenCalled();
    expect(input.onEndEdit).not.toHaveBeenCalled();
  });

  it('retire/unmount/blur cancel pending edit and clear edge-scroll RAF under StrictMode', () => {
    const input = props();
    const { container, unmount } = render(
      <StrictMode>
        <VideoClipTimeline {...input} />
      </StrictMode>,
    );
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 670, 250);
    expect(raf.size).toBe(1);
    fireEvent(window, new Event('blur'));
    expect(raf.size).toBe(0);
    expect(input.onCancelEdit).toHaveBeenCalledTimes(1);
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 640, 250);
    unmount();
    pointer(window, 'pointerup', 640, 250);
    expect(input.onCancelEdit).toHaveBeenCalledTimes(2);
    expect(input.onEndEdit).not.toHaveBeenCalled();
  });

  it('auto-scrolls by original twelve pixels and rejects cancelled queued frame callbacks', () => {
    const input = props();
    const { container } = render(<VideoClipTimeline {...input} />);
    pointer(container.querySelector('[data-clip-id="main"]'), 'pointerdown', 178, 250);
    pointer(window, 'pointermove', 670, 250);
    const [id, callback] = [...raf][0];
    raf.delete(id);
    act(() => callback());
    expect(input.onSetView.mock.calls).toEqual([[{ scrollX: 12 }]]);
    pointer(window, 'pointercancel', 670, 250);
    expect(raf.size).toBe(0);
    act(() => callback());
    expect(input.onSetView).toHaveBeenCalledTimes(1);
    expect(input.onCancelEdit).toHaveBeenCalledTimes(1);
    expect(input.onEndEdit).not.toHaveBeenCalled();
  });

  it('keyboard trim handles produce one source edit transaction and original left-video compact', () => {
    const callbacks = { begin: vi.fn(), preview: vi.fn(), end: vi.fn() };
    const seen = vi.fn();
    render(<Harness callbacks={callbacks} onDocument={seen} />);
    fireEvent.keyDown(screen.getByRole('button', { name: '调整主片起点' }), { key: 'ArrowRight' });
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(callbacks.preview.mock.calls.map(([operation]) => operation)).toEqual([
      'trim',
      'insert-track',
    ]);
    expect(callbacks.end).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0]).toEqual({
      ...timeline(),
      clips: [
        timeline().clips[0],
        { ...timeline().clips[1], duration: 3.9, sourceOffset: 1.2 },
        { ...timeline().clips[2], startTime: 3.9 },
        timeline().clips[3],
      ],
      cropRange: { start: 0, end: 3.9 },
    });
  });

  it('makes context deletion protect the last main segment while allowing overlay removal', () => {
    const initial = timeline();
    initial.clips = initial.clips.filter((clip) => clip.id !== 'next');
    const callbacks = { delete: vi.fn() };
    const seen = vi.fn();
    const { container } = render(
      <Harness initial={initial} callbacks={callbacks} onDocument={seen} />,
    );
    fireEvent.contextMenu(container.querySelector('[data-clip-id="main"]'), {
      clientX: 320,
      clientY: 250,
    });
    expect(screen.getByRole('menuitem', { name: '删除' }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '删除' }).title).toBe('主轨道不能清空');
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(callbacks.delete).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu', { name: '片段菜单' }), { key: 'Escape' });
    fireEvent.contextMenu(container.querySelector('[data-clip-id="overlay"]'), {
      clientX: 320,
      clientY: 210,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(callbacks.delete).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls.at(-1)[0].clips).toEqual([
      { ...timeline().clips[1], zIndex: 0 },
      { ...timeline().clips[3], zIndex: 1 },
    ]);
  });

  it('exposes source copy/paste actions in the context menu and keyboard scope', () => {
    const input = props({
      onCopyClip: vi.fn(),
      onPasteClip: vi.fn(),
      canPasteClip: true,
    });
    const { container } = render(<VideoClipTimeline {...input} />);
    fireEvent.contextMenu(container.querySelector('[data-clip-id="main"]'), {
      clientX: 320,
      clientY: 250,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }));
    expect(input.onCopyClip).toHaveBeenCalledWith('main');
    fireEvent.keyDown(screen.getByRole('region', { name: '视频剪辑时间轴' }), {
      key: 'c',
      ctrlKey: true,
    });
    fireEvent.keyDown(screen.getByRole('region', { name: '视频剪辑时间轴' }), {
      key: 'v',
      ctrlKey: true,
    });
    expect(input.onCopyClip).toHaveBeenCalledTimes(2);
    expect(input.onPasteClip).toHaveBeenCalledTimes(1);
  });

  it('exposes source audio separation only when the selected clip capability allows it', () => {
    const onDetachAudio = vi.fn();
    const input = props({
      onCanDetachAudio: vi.fn((clipId) =>
        clipId === 'main' ? { allowed: true } : { allowed: false, reason: '当前视频无音轨' },
      ),
      onDetachAudio,
    });
    const { container } = render(<VideoClipTimeline {...input} />);
    fireEvent.contextMenu(container.querySelector('[data-clip-id="main"]'), {
      clientX: 320,
      clientY: 250,
    });
    const separate = screen.getByRole('menuitem', { name: '音视频分离' });
    expect(separate.disabled).toBe(false);
    fireEvent.click(separate);
    expect(onDetachAudio).toHaveBeenCalledWith('main');
    fireEvent.contextMenu(container.querySelector('[data-clip-id="overlay"]'), {
      clientX: 320,
      clientY: 210,
    });
    expect(screen.getByRole('menuitem', { name: '音视频分离' }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '音视频分离' }).title).toBe('当前视频无音轨');
  });

  it('opens the source vocal separation choices and passes the selected mode', () => {
    const onVocalSplit = vi.fn();
    const input = props({
      onCanVocalSplit: vi.fn(() => ({ allowed: true })),
      onVocalSplit,
    });
    const { container } = render(<VideoClipTimeline {...input} />);
    fireEvent.contextMenu(container.querySelector('[data-clip-id="main"]'), {
      clientX: 320,
      clientY: 250,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '人声分离' }));
    expect(screen.getByRole('group', { name: '人声分离方式' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '仅保留背景音' }));
    expect(onVocalSplit).toHaveBeenCalledWith('main', 'background');
  });
});

describe('timeline keyboard, additional source capabilities and resize', () => {
  it('keeps key input scope and emits Delete/space/history once without modifier fallthrough', () => {
    const input = props({ history: { past: [timeline()], future: [] } });
    render(<VideoClipTimeline {...input} />);
    const root = screen.getByRole('region', { name: '视频剪辑时间轴' });
    fireEvent.keyDown(root, { key: 'Delete' });
    fireEvent.keyDown(root, { key: 'Delete', repeat: true });
    fireEvent.keyDown(root, { key: 'Delete', ctrlKey: true });
    fireEvent.keyDown(root, { key: ' ' });
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(root, { key: 'z', metaKey: true, shiftKey: true });
    expect(input.onDelete).toHaveBeenCalledTimes(1);
    expect(input.onPlayToggle).toHaveBeenCalledTimes(1);
    expect(input.onUndo).toHaveBeenCalledTimes(1);
    expect(input.onRedo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('slider', { name: '时间轴缩放' }), { key: 'Delete' });
    expect(input.onDelete).toHaveBeenCalledTimes(1);
  });

  it('uses exact source resizer deltas and keyboard resize without creating clip history', () => {
    const input = props();
    render(<VideoClipTimeline {...input} />);
    const handle = screen.getByRole('separator', { name: '拖拽调整高度' });
    pointer(handle, 'pointerdown', 200, 150);
    pointer(window, 'pointermove', 200, 120);
    pointer(window, 'pointerup', 200, 120);
    expect(input.onResizeHeight.mock.calls.at(-1)).toEqual([330]);
    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(input.onResizeHeight.mock.calls.at(-1)).toEqual([288]);
    expect(input.onBeginEdit).not.toHaveBeenCalled();
  });

  it('dispatches injected source capabilities and filters dropped files to actual video/audio', () => {
    const input = props({
      onAddText: vi.fn(),
      onAddSubtitle: vi.fn(),
      onAddTransition: vi.fn(),
      onToggleSnap: vi.fn(),
      onDropFiles: vi.fn(),
    });
    const { container } = render(<VideoClipTimeline {...input} />);
    fireEvent.click(screen.getByRole('button', { name: '添加文字' }));
    fireEvent.click(screen.getByRole('button', { name: '添加字幕' }));
    fireEvent.click(screen.getByRole('button', { name: '添加转场' }));
    fireEvent.click(screen.getByRole('button', { name: '吸附' }));
    expect(input.onAddText).toHaveBeenCalledTimes(1);
    expect(input.onAddSubtitle).toHaveBeenCalledTimes(1);
    expect(input.onAddTransition).toHaveBeenCalledTimes(1);
    expect(input.onToggleSnap).toHaveBeenCalledTimes(1);
    const video = new File(['video'], 'v.mp4', { type: 'video/mp4' }),
      audio = new File(['audio'], 'a.wav', { type: 'audio/wav' }),
      image = new File(['image'], 'i.png', { type: 'image/png' });
    fireEvent.drop(container.querySelector('.cv-clip-timeline-scroll'), {
      dataTransfer: { files: [video, image, audio] },
    });
    expect(input.onDropFiles.mock.calls).toEqual([[[video, audio]]]);
  });
});
