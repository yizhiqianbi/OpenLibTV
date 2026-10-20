import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PreviewTransformOverlay from './PreviewTransformOverlay.jsx';

function setup() {
  const root = document.createElement('div');
  const stage = document.createElement('div');
  stage.className = 'cv-clip-preview-stage';
  root.append(stage);
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 270 });
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 270 });
  document.body.append(root);
  const rootRef = { current: root };
  const handlers = {
    begin: vi.fn(() => true),
    edit: vi.fn(),
    end: vi.fn(),
    cancel: vi.fn(),
  };
  const playback = {
    measurePreviewCueRect: vi.fn(() => ({ left: 120, top: 120, width: 240, height: 40 })),
  };
  const selection = {
    owner: 'overlay',
    cueId: 'cue-a',
    operation: 'text-overlay',
    active: true,
    canEditLayout: true,
    layout: { xPct: 50, yPct: 52, widthPct: 50, scalePct: 100 },
    label: '文字',
  };
  render(
    <PreviewTransformOverlay
      rootRef={rootRef}
      playback={playback}
      selection={selection}
      onBeginEdit={handlers.begin}
      onEditPreview={handlers.edit}
      onEndEdit={handlers.end}
      onCancelEdit={handlers.cancel}
    />,
  );
  return { handlers, root };
}

describe('preview transform overlay', () => {
  it('commits a move gesture through the shared edit transaction', () => {
    const { handlers } = setup();
    const handle = screen.getByRole('button', { name: '拖动文字' });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 240, clientY: 140 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 264, clientY: 126 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 288, clientY: 113 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 288, clientY: 113 });
    expect(handlers.begin).toHaveBeenCalledWith({
      ownerToken: { type: 'preview-geometry', owner: 'overlay', cueId: 'cue-a' },
    });
    expect(handlers.edit).toHaveBeenLastCalledWith('text-overlay', {
      fields: { xPct: 60, yPct: 42 },
    });
    expect(handlers.end).toHaveBeenCalledTimes(1);
    expect(handlers.cancel).not.toHaveBeenCalled();
  });

  it('cancels a width gesture on pointer cancellation', () => {
    const { handlers } = setup();
    const handle = screen.getByRole('button', { name: '调整文字宽度' });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 354, clientY: 140 });
    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 402, clientY: 140 });
    fireEvent.pointerCancel(handle, { pointerId: 2, clientX: 402, clientY: 140 });
    expect(handlers.edit).toHaveBeenCalled();
    expect(handlers.cancel).toHaveBeenCalledTimes(1);
    expect(handlers.end).not.toHaveBeenCalled();
  });
});
