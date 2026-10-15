import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FocusAttachment from './FocusAttachment.jsx';

const region = {
  imageUrl: 'https://images.test/source.png',
  relX: 0.1016,
  relY: 0.2021,
  width: 0.2055,
  height: 0.3005,
};
let images;
let drawImage;
let toDataURL;
let play;
let pause;
let load;
class PreviewImage {
  naturalWidth = 1000;
  naturalHeight = 800;
  constructor() {
    images.push(this);
  }
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
}
beforeEach(() => {
  images = [];
  vi.stubGlobal('Image', PreviewImage);
  drawImage = vi.fn();
  toDataURL = vi.fn(() => `data:image/png;base64,preview${toDataURL.mock.calls.length}`);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(toDataURL);
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const previewImage = () =>
  screen.getByRole('button', { name: '编辑聚焦区域' }).querySelector('img');
const finishImage = async (index = 0) => {
  await act(async () => images[index].onload());
};

describe('source focus attachment', () => {
  it('hides both entry and saved card when the source capability is unavailable, without cropping', () => {
    const page = render(<FocusAttachment available={false} region={region} onEdit={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(images).toHaveLength(0);
    page.rerender(<FocusAttachment available onEnter={vi.fn()} />);
    expect(screen.getByRole('button', { name: '聚焦' })).toBeTruthy();
  });

  it('uses the chip only before a saved region, supplies the stable opener, and reflects the active mode', () => {
    const onEnter = vi.fn();
    const onEdit = vi.fn();
    render(<FocusAttachment available active onEnter={onEnter} onEdit={onEdit} />);
    const chip = screen.getByRole('button', { name: '聚焦' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(onEnter).toHaveBeenCalledExactlyOnceWith(chip);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '编辑聚焦区域' })).toBeNull();
  });

  it('edits the saved region and deletes it separately without invoking the chip or bubbling a node click', () => {
    const onEnter = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const click = vi.fn();
    render(
      <div onClick={click}>
        <FocusAttachment available region={region} {...{ onEnter, onEdit, onDelete }} />
      </div>,
    );
    const edit = screen.getByRole('button', { name: '编辑聚焦区域' });
    const remove = screen.getByRole('button', { name: '删除聚焦区域' });
    fireEvent.click(edit);
    fireEvent.click(remove);
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(edit);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(remove);
    expect(onEnter).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '聚焦' })).toBeNull();
  });

  it('keeps unavailable actions disabled rather than supplying an apparent writable control', () => {
    const callback = vi.fn();
    const page = render(<FocusAttachment available disabled onEnter={callback} />);
    fireEvent.click(screen.getByRole('button', { name: '聚焦' }));
    expect(callback).not.toHaveBeenCalled();
    page.rerender(<FocusAttachment available region={region} onEdit={callback} disabled />);
    expect(screen.getByRole('button', { name: '编辑聚焦区域' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '删除聚焦区域' }).disabled).toBe(true);
    page.rerender(<FocusAttachment available region={region} />);
    expect(screen.getByRole('button', { name: '编辑聚焦区域' }).disabled).toBe(true);
    page.rerender(<FocusAttachment available />);
    expect(screen.getByRole('button', { name: '聚焦' }).disabled).toBe(true);
  });

  it('crops the natural image with the source rounding order and PNG output, not graph dimensions', async () => {
    render(<FocusAttachment available region={region} onEdit={vi.fn()} />);
    expect(images[0].src).toBe(region.imageUrl);
    expect(images[0].crossOrigin).toBe('anonymous');
    expect(previewImage()).toBeNull();
    await finishImage();
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      images[0],
      102,
      162,
      206,
      240,
      0,
      0,
      206,
      240,
    );
    expect(toDataURL).toHaveBeenCalledExactlyOnceWith('image/png');
    expect(previewImage().getAttribute('src')).toBe('data:image/png;base64,preview1');
  });

  it('clips a rounded rectangle to the natural image boundary and preserves exact crop size', async () => {
    render(
      <FocusAttachment
        available
        region={{ ...region, relX: 0.9014, relY: 0.95, width: 0.2, height: 0.2 }}
        onEdit={vi.fn()}
      />,
    );
    await finishImage();
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(images[0], 901, 760, 99, 40, 0, 0, 99, 40);
    expect(toDataURL.mock.instances[0].width).toBe(99);
    expect(toDataURL.mock.instances[0].height).toBe(40);
  });

  it('falls back to a dark card after a failed read, retaining edit and delete without displaying the entire source', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<FocusAttachment available region={region} {...{ onEdit, onDelete }} />);
    await act(async () => images[0].onerror());
    expect(previewImage()).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: '编辑聚焦区域' }).closest('[data-preview-state]').dataset
        .previewState,
    ).toBe('fallback');
    fireEvent.click(screen.getByRole('button', { name: '编辑聚焦区域' }));
    fireEvent.click(screen.getByRole('button', { name: '删除聚焦区域' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('handles a tainted or unavailable canvas without rendering a fake crop', async () => {
    toDataURL.mockImplementation(() => {
      throw new DOMException('Tainted image', 'SecurityError');
    });
    const page = render(<FocusAttachment available region={region} onEdit={vi.fn()} />);
    await finishImage();
    expect(previewImage()).toBeNull();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    page.rerender(<FocusAttachment available region={{ ...region, relX: 0.4 }} onEdit={vi.fn()} />);
    await finishImage(1);
    expect(previewImage()).toBeNull();
  });

  it('retires the old image on a source or geometry change and ignores retained late load callbacks', async () => {
    const page = render(<FocusAttachment available region={region} onEdit={vi.fn()} />);
    const oldLoad = images[0].onload;
    const next = { ...region, imageUrl: 'https://images.test/new.png', relX: 0.3 };
    page.rerender(<FocusAttachment available region={next} onEdit={vi.fn()} />);
    expect(images[0].src).toBe('');
    expect(images[0].onload).toBeNull();
    await act(async () => oldLoad());
    expect(drawImage).not.toHaveBeenCalled();
    await finishImage(1);
    expect(drawImage.mock.calls[0][0]).toBe(images[1]);
    expect(previewImage().getAttribute('src')).toBe('data:image/png;base64,preview1');
    const finalLoad = images[1].onload;
    page.unmount();
    expect(images[1].src).toBe('');
    // The completed request has no retained handler; this also confirms cleanup.
    expect(finalLoad).toBeNull();
  });

  it('drops the displayed crop immediately when the asset mapping changes and cancels unmount work', async () => {
    const page = render(
      <FocusAttachment
        available
        region={region}
        asset={() => '/assets/first.png'}
        onEdit={vi.fn()}
      />,
    );
    await finishImage();
    expect(previewImage()).toBeTruthy();
    page.rerender(
      <FocusAttachment
        available
        region={region}
        asset={() => '/assets/second.png'}
        onEdit={vi.fn()}
      />,
    );
    expect(previewImage()).toBeNull();
    expect(images[1].src).toBe('/assets/second.png');
    const lateLoad = images[1].onload;
    page.unmount();
    await act(async () => lateLoad());
    expect(drawImage).toHaveBeenCalledOnce();
    expect(images[1].src).toBe('');
  });

  it('opens the real tutorial only after 200ms hover and retires its playback after the source 150ms leave delay', () => {
    vi.useFakeTimers();
    render(<FocusAttachment available onEnter={vi.fn()} />);
    const chip = screen.getByRole('button', { name: '聚焦' });
    fireEvent.mouseEnter(chip);
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tutorial = screen.getByRole('tooltip', { name: '聚焦教程' });
    const video = tutorial.querySelector('video');
    expect(video.getAttribute('src')).toContain('e5d71224e151896d9ead9955953984aff3f293e4.mp4');
    expect(video.autoplay && video.muted && video.loop && video.playsInline).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    fireEvent.mouseLeave(chip);
    act(() => vi.advanceTimersByTime(149));
    expect(screen.queryByRole('tooltip')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(video.getAttribute('src')).toBeNull();
  });

  it('consumes Escape only for an open shared tutorial popover and restores its chip', () => {
    vi.useFakeTimers();
    const outsideKey = vi.fn();
    render(
      <div onKeyDown={outsideKey}>
        <FocusAttachment available onEnter={vi.fn()} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: '聚焦' });
    fireEvent.mouseEnter(chip);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(chip);
    fireEvent.keyDown(chip, { key: 'Escape' });
    expect(outsideKey).toHaveBeenCalledOnce();
  });

  it('shows a real media error without a substitute tutorial and releases the failed video', () => {
    vi.useFakeTimers();
    render(<FocusAttachment available onEnter={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByRole('button', { name: '聚焦' }));
    act(() => vi.advanceTimersByTime(200));
    const video = screen.getByRole('tooltip').querySelector('video');
    fireEvent.error(video);
    expect(screen.getByRole('status').textContent).toBe('聚焦教程暂不可用');
    expect(screen.getByRole('tooltip').querySelector('video')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });

  it('keeps native keyboard activation while isolating Space, pointer and double-click from canvas gestures', async () => {
    const user = userEvent.setup();
    const pointer = vi.fn();
    const doubleClick = vi.fn();
    const keydown = vi.fn();
    const onEnter = vi.fn();
    render(
      <div onPointerDown={pointer} onDoubleClick={doubleClick} onKeyDown={keydown}>
        <FocusAttachment available onEnter={onEnter} />
      </div>,
    );
    const chip = screen.getByRole('button', { name: '聚焦' });
    fireEvent.pointerDown(chip, { pointerId: 1, button: 0 });
    fireEvent.doubleClick(chip);
    expect(pointer).not.toHaveBeenCalled();
    expect(doubleClick).not.toHaveBeenCalled();
    chip.focus();
    await user.keyboard(' ');
    expect(onEnter).toHaveBeenCalledExactlyOnceWith(chip);
    expect(keydown).not.toHaveBeenCalled();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
