import { useRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import ClipTransitionWorkspace from './ClipTransitionWorkspace.jsx';
import { startTransitionInspectorPreview } from './transition-inspector-runtime.js';

vi.mock('./transition-inspector-runtime.js', () => ({
  startTransitionInspectorPreview: vi.fn(() => vi.fn()),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function props(patch = {}) {
  return {
    src: (url) => url,
    state: {
      ready: true,
      previewExpanded: true,
      transitionPanelOpen: true,
      selectedTransitionRightClipId: null,
      mediaBySourceId: new Map([
        ['a', { url: '/a.mp4' }],
        ['b', { url: '/b.mp4' }],
      ]),
      timeline: {
        videoTrackCount: 1,
        clips: [
          {
            id: 'a',
            sourceNodeId: 'a',
            type: 'video',
            zIndex: 0,
            startTime: 0,
            duration: 4,
            sourceDuration: 10,
            sourceOffset: 0,
          },
          {
            id: 'b',
            sourceNodeId: 'b',
            type: 'video',
            zIndex: 0,
            startTime: 4,
            duration: 3,
            sourceDuration: 10,
            sourceOffset: 1,
            transitionIn: { type: 'fade', duration: 2 },
          },
        ],
      },
      ...patch,
    },
    controller: {
      onAddTransition: vi.fn(),
      onCloseTransitionPanel: vi.fn(),
      onSetTransitionDuration: vi.fn(),
      onDeleteTransition: vi.fn(),
    },
  };
}

describe('source transition rails', () => {
  it('retains resized rail widths across closing and reopening the library', () => {
    const input = props();
    const { rerender } = render(
      <ClipTransitionWorkspace {...input}>preview</ClipTransitionWorkspace>,
    );
    fireEvent.keyDown(screen.getByRole('separator', { name: '调整转场库宽度' }), {
      key: 'ArrowLeft',
    });
    expect(
      screen.getByRole('separator', { name: '调整转场库宽度' }).getAttribute('aria-valuenow'),
    ).toBe('364');
    rerender(
      <ClipTransitionWorkspace {...input} state={{ ...input.state, transitionPanelOpen: false }}>
        preview
      </ClipTransitionWorkspace>,
    );
    rerender(<ClipTransitionWorkspace {...input}>preview</ClipTransitionWorkspace>);
    expect(
      screen.getByRole('separator', { name: '调整转场库宽度' }).getAttribute('aria-valuenow'),
    ).toBe('364');
  });
  it('shows only the three source library effects and gates inspector without selection', () => {
    const input = props();
    render(<ClipTransitionWorkspace {...input}>main preview</ClipTransitionWorkspace>);
    expect(screen.queryByRole('button', { name: '像素溶解' })).toBeNull();
    expect(screen.getByText('未选择转场')).toBeTruthy();
    expect(screen.getByRole('button', { name: '删除' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '黑场过渡' }));
    expect(input.controller.onAddTransition).toHaveBeenCalledWith({ type: 'fadeblack' });
    expect(startTransitionInspectorPreview).not.toHaveBeenCalled();
  });

  it('commits duration on blur, passes stable cut identity and disposes previews when closing', () => {
    const input = props({ selectedTransitionRightClipId: 'b' });
    const { rerender } = render(
      <ClipTransitionWorkspace {...input}>main preview</ClipTransitionWorkspace>,
    );
    expect(startTransitionInspectorPreview).toHaveBeenCalledTimes(1);
    const dispose = startTransitionInspectorPreview.mock.results[0].value;
    expect(startTransitionInspectorPreview.mock.calls[0][0]).toMatchObject({
      from: { url: '/a.mp4', time: 3.8 },
      to: { url: '/b.mp4', time: 1 },
      type: 'fade',
    });
    const field = screen.getByRole('spinbutton', { name: '时长' });
    fireEvent.change(field, { target: { value: '0.26' } });
    expect(input.controller.onSetTransitionDuration).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(input.controller.onSetTransitionDuration).toHaveBeenLastCalledWith(0.26, 'b');
    fireEvent.click(screen.getByRole('button', { name: '时长 +0.1s' }));
    expect(input.controller.onSetTransitionDuration).toHaveBeenLastCalledWith(2.1, 'b');
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(input.controller.onDeleteTransition).toHaveBeenCalledWith('b');
    rerender(
      <ClipTransitionWorkspace {...input} state={{ ...input.state, transitionPanelOpen: false }}>
        main preview
      </ClipTransitionWorkspace>,
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('main preview')).toBeTruthy();
  });

  it('lets Escape close the non-modal rails before the parent dialog and returns focus', () => {
    const input = props();
    const parentClose = vi.fn();
    function Editor() {
      const root = useRef(null);
      useDialogBehavior(root, { onClose: parentClose });
      return (
        <section ref={root} className="cv-clip-editor" tabIndex={-1}>
          <button data-testid="clip-transition-trigger">添加转场</button>
          <ClipTransitionWorkspace {...input}>preview</ClipTransitionWorkspace>
        </section>
      );
    }
    render(<Editor />);
    act(() => screen.getByRole('button', { name: '黑场过渡' }).focus());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(input.controller.onCloseTransitionPanel).toHaveBeenCalledTimes(1);
    expect(parentClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '添加转场' }));
  });
});
