import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasClipEditorEntry from './CanvasClipEditorEntry.jsx';

const state = {
  draftSession: {},
  nodeId: 'clip-a',
  previewExpanded: false,
  height: 260,
};

function controller(overrides = {}) {
  const value = { ...state };
  return {
    subscribe: () => () => {},
    getState: () => value,
    close: vi.fn(),
    onReturnToNode: vi.fn(),
    ...overrides,
  };
}

let frames;
let nextFrame;

beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function flushFrame() {
  const callback = frames.values().next().value;
  if (!callback) return false;
  frames.delete(frames.keys().next().value);
  act(() => callback());
  return true;
}

describe('Canvas clip editor media host placement', () => {
  it('shows a bounded recovery action when a collapsed node portal stays unavailable', async () => {
    const value = controller();
    render(<CanvasClipEditorEntry controller={value} documentKey="doc-a" src="" />);
    await act(async () => {
      await Promise.resolve();
    });
    let count = 0;
    while (flushFrame()) count += 1;
    expect(count).toBeGreaterThanOrEqual(300);
    expect(screen.getByText('当前节点暂不可见')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '回到节点' }));
    expect(value.onReturnToNode).toHaveBeenCalledTimes(1);
  });

  it('moves the stable host into a portal that appears before the retry bound', async () => {
    const value = controller();
    render(<CanvasClipEditorEntry controller={value} documentKey="doc-a" src="" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(flushFrame()).toBe(true);
    const target = document.createElement('div');
    target.id = 'clip-preview-drop-clip-a';
    document.body.appendChild(target);
    expect(flushFrame()).toBe(true);
    expect(target.querySelector('.cv-clip-editor-media-host')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '回到节点' })).toBeNull();
  });
});
