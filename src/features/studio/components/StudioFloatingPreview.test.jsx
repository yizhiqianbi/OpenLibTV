import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StudioFloatingPreview from './StudioFloatingPreview.jsx';

describe('StudioFloatingPreview', () => {
  it('renders the monitor frame and keeps play/close actions inside the pip', () => {
    const toggle = vi.fn();
    const close = vi.fn();
    render(
      <StudioFloatingPreview
        frame="data:image/jpeg;base64,frame"
        label="镜头一"
        playing={false}
        onTogglePlay={toggle}
        onClose={close}
      />,
    );
    expect(screen.getByRole('complementary', { name: '浮动机位预览' })).toBeTruthy();
    expect(document.querySelector('.cv-studio-floating-preview-frame img')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '播放浮动机位预览' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭浮动机位预览' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows an explicit waiting state when the monitor has not produced a frame', () => {
    render(
      <StudioFloatingPreview label="镜头二" playing onTogglePlay={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByText('等待机位画面…')).toBeTruthy();
    expect(screen.getByRole('button', { name: '暂停浮动机位预览' })).toBeTruthy();
  });
});
