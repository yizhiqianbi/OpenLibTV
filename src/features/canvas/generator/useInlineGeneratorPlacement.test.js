import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inlineGeneratorCenter,
  useInlineGeneratorPlacement,
} from './useInlineGeneratorPlacement.js';

afterEach(() => vi.unstubAllGlobals());

describe('inline generator board placement', () => {
  it('keeps valid desktop centers exactly, including fractional world coordinates and pan/zoom', () => {
    for (const viewportWidth of [768, 888, 1024, 1280, 1920]) {
      for (const z of [0.25, 0.7, 1, 2]) {
        for (const x of [-500, 20, 400]) {
          const center = (viewportWidth / 2 - x) / z;
          expect(inlineGeneratorCenter(center, { x, z }, viewportWidth)).toBe(center);
        }
      }
    }
    const center = 565.123456789;
    expect(inlineGeneratorCenter(center, { x: 12.34, z: 0.9 }, 1280)).toBe(center);
  });

  it('clamps both edges across narrow and desktop board widths without changing the camera', () => {
    for (const viewportWidth of [390, 700, 768, 888, 1280]) {
      const width = Math.min(660, Math.max(0, viewportWidth - 40));
      for (const z of [0.25, 0.7, 1, 2]) {
        for (const x of [-500, 20, 400]) {
          const view = { x, y: -100, z };
          const before = { ...view };
          const left = inlineGeneratorCenter((-200 - x) / z, view, viewportWidth);
          const right = inlineGeneratorCenter((viewportWidth + 200 - x) / z, view, viewportWidth);
          expect(x + left * z - width / 2).toBeCloseTo(20);
          expect(x + right * z + width / 2).toBeCloseTo(viewportWidth - 20);
          expect(view).toEqual(before);
        }
      }
    }
  });

  it('fixes the observed 888px clipping and keeps the same center when the board is wide enough', () => {
    expect(inlineGeneratorCenter(705, { x: 0, z: 1 }, 888)).toBe(538);
    expect(inlineGeneratorCenter(705, { x: 0, z: 1 }, 1280)).toBe(705);
    // The old width>767 bypass let even this off-screen desktop center through.
    expect(inlineGeneratorCenter(565, { x: -500, z: 0.25 }, 1280)).toBe(3400);
  });

  it('preserves the original center while width is unknown and safely handles degenerate views', () => {
    for (const width of [undefined, null, 0, -1, NaN, Infinity])
      expect(inlineGeneratorCenter(565, { x: -500, z: 0.25 }, width)).toBe(565);
    for (const view of [null, { x: NaN, z: 1 }, { x: 0, z: 0 }, { x: 0, z: Infinity }])
      expect(inlineGeneratorCenter(565, view, 888)).toBe(565);
  });

  it('returns undefined width until measured and resets it when a new board is absent', () => {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 888 });
    const { result, rerender } = renderHook(
      ({ board }) => useInlineGeneratorPlacement(705, { x: 0, z: 1 }, board),
      { initialProps: { board: { current: null } } },
    );
    expect(result.current).toEqual({ center: 705, width: undefined });
    rerender({ board: { current: element } });
    expect(result.current).toEqual({ center: 538, width: 660 });
    rerender({ board: { current: null } });
    expect(result.current).toEqual({ center: 705, width: undefined });
  });

  it('tracks an Agent panel shrinking the measured board, then preserves valid centers after pan/zoom', () => {
    let measure;
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          measure = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const element = document.createElement('div');
    let boardWidth = 1280;
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ width: boardWidth }));
    const board = { current: element };
    const { result, rerender, unmount } = renderHook(
      ({ center, view }) => useInlineGeneratorPlacement(center, view, board),
      { initialProps: { center: 705, view: { x: 0, z: 1 } } },
    );
    expect(observe).toHaveBeenCalledExactlyOnceWith(element);
    expect(result.current).toEqual({ center: 705, width: 660 });
    boardWidth = 888;
    act(() => measure());
    expect(result.current).toEqual({ center: 538, width: 660 });
    boardWidth = 600;
    act(() => measure());
    expect(result.current).toEqual({ center: 300, width: 560 });
    rerender({ center: 800, view: { x: -100, z: 0.5 } });
    expect(result.current).toEqual({ center: 800, width: 560 });
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    const calls = element.getBoundingClientRect.mock.calls.length;
    act(() => measure());
    expect(element.getBoundingClientRect).toHaveBeenCalledTimes(calls);
  });

  it('measures on window resize without ResizeObserver and removes listeners when retired', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const element = document.createElement('div');
    let boardWidth = 390;
    const read = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockImplementation(() => ({ width: boardWidth }));
    const { result, unmount } = renderHook(() =>
      useInlineGeneratorPlacement(705, null, { current: element }),
    );
    expect(result.current).toEqual({ center: 195, width: 350 });
    boardWidth = 1280;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(result.current).toEqual({ center: 705, width: 660 });
    unmount();
    const calls = read.mock.calls.length;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(read).toHaveBeenCalledTimes(calls);
  });

  it('never returns negative panel width when a tiny board is measured', () => {
    const element = document.createElement('div');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 30 });
    const { result } = renderHook(() =>
      useInlineGeneratorPlacement(705, { x: 0, z: 1 }, { current: element }),
    );
    expect(result.current).toEqual({ center: 15, width: 0 });
  });
});
