import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasEdgeLayer } from './CanvasEdgeLayer.jsx';
import { useCanvasEdgeSelection } from '../hooks/useCanvasEdgeSelection.js';

let frames;
let frameId;

beforeEach(() => {
  frames = new Map();
  frameId = 0;
  vi.useFakeTimers();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const source = {
  id: 'source',
  type: 'image',
  position: { x: 0, y: 0 },
  width: 100,
  height: 80,
  data: { type: 'image', name: '来源' },
};
const target = {
  id: 'target',
  type: 'video',
  position: { x: 300, y: 0 },
  width: 100,
  height: 80,
  data: { type: 'video', name: '目标' },
};
const edge = { id: 'edge', source: 'source', target: 'target' };

function ManagedSelectionLayer({ options }) {
  const selection = useCanvasEdgeSelection({
    documentKey: options.documentKey,
    ready: options.ready,
    readonly: options.readonly,
    edges: options.edges,
    isDisabled: () => options.interactionDisabled,
    clearNodeSelection: options.clearNodeSelection,
  });
  return (
    <CanvasEdgeLayer
      {...options}
      selectedEdgeIds={selection.selected}
      onSelectEdge={(id, intent) => {
        options.onSelectEdge(id, intent);
        selection.select(id, intent);
      }}
      onDeselectEdge={(id) => {
        options.onDeselectEdge(id);
        selection.deselect(id);
      }}
    />
  );
}

function setup(patch = {}, { managedSelection = false } = {}) {
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 700 });
  let options = {
    edges: [edge],
    worldById: new Map([
      [source.id, source],
      [target.id, target],
    ]),
    selectedNodeIds: [],
    selectedEdgeIds: [],
    visibleNodeIds: new Set(['source', 'target']),
    onSelectEdge: vi.fn(),
    onDeselectEdge: vi.fn(),
    onDeleteEdge: vi.fn(),
    clearNodeSelection: vi.fn(),
    documentKey: 'A',
    ready: true,
    readonly: false,
    interactionDisabled: false,
    board: { current: board },
    view: { x: 20, y: 10, z: 0.5 },
    ...patch,
  };
  const pane = vi.fn();
  const keyPane = vi.fn();
  const layer = () =>
    managedSelection ? (
      <ManagedSelectionLayer options={options} />
    ) : (
      <CanvasEdgeLayer {...options} />
    );
  const mounted = render(
    <svg onPointerDown={pane} onClick={pane} onDoubleClick={pane} onKeyDown={keyPane}>
      {layer()}
    </svg>,
  );
  const group = (id = 'edge') => mounted.container.querySelector(`[data-edge-id="${id}"]`);
  const hit = (id = 'edge') => mounted.container.querySelector(`[data-edge-hit="${id}"]`);
  const visual = (id = 'edge') => mounted.container.querySelector(`[data-edge-visual="${id}"]`);
  const nativePath = () => {
    const path = hit();
    // jsdom does not implement native SVG length APIs. This fixture is a known
    // 200-world straight path from (100,40) to (300,40), not a hit-testing proof.
    path.getTotalLength = vi.fn(() => 200);
    path.getPointAtLength = vi.fn((length) => ({ x: 100 + length, y: 40 }));
    return path;
  };
  const hover = () => {
    nativePath();
    fireEvent.mouseEnter(group(), { clientX: 210, clientY: 82.5 });
  };
  const flushFrame = () =>
    act(() => {
      const work = [...frames.values()];
      frames.clear();
      work.forEach((callback) => callback(0));
    });
  return {
    ...mounted,
    group,
    hit,
    visual,
    hover,
    flushFrame,
    pane,
    keyPane,
    get options() {
      return options;
    },
    rerenderOptions(value) {
      options = { ...options, ...value };
      mounted.rerender(
        <svg onPointerDown={pane} onClick={pane} onDoubleClick={pane} onKeyDown={keyPane}>
          {layer()}
        </svg>,
      );
    },
  };
}

describe('real edge SVG layer and native-path hover adapter', () => {
  it('separates the exact 20-world transparent hit from the thin same-geometry visual path', () => {
    const page = setup();
    expect(page.container.querySelectorAll('svg')).toHaveLength(1);
    expect(page.hit().getAttribute('d')).toBe('M100,40 C200,40 200,40 300,40');
    expect(page.visual().getAttribute('d')).toBe(page.hit().getAttribute('d'));
    expect(page.hit().classList.contains('cv-edge-hit')).toBe(true);
    expect(page.visual().classList.contains('cv-edge-visual')).toBe(true);
    expect(page.hit().style.stroke).toBe('transparent');
    expect(page.hit().style.strokeWidth).toBe('20');
    expect(page.hit().style.pointerEvents).toBe('stroke');
    expect(page.visual().style.strokeWidth).toBe('2');
    expect(page.visual().style.pointerEvents).toBe('none');
    expect(page.hit().getAttribute('vector-effect')).toBeNull();
    expect(page.group().getAttribute('tabindex')).toBe('0');
    expect(page.group().getAttribute('aria-label')).toBe('连线：来源 → 目标');
    expect(page.group().getAttribute('aria-pressed')).toBe('false');
  });

  it('selects on normal click, toggles only Ctrl/Meta pointer selection, and isolates the pane', () => {
    const page = setup();
    fireEvent.pointerDown(page.hit());
    fireEvent.click(page.hit());
    fireEvent.click(page.hit(), { ctrlKey: true });
    fireEvent.click(page.hit(), { metaKey: true });
    fireEvent.click(page.hit(), { shiftKey: true });
    expect(page.options.onSelectEdge.mock.calls).toEqual([
      ['edge', { additive: false, toggle: false }],
      ['edge', { additive: true, toggle: true }],
      ['edge', { additive: true, toggle: true }],
      ['edge', { additive: false, toggle: false }],
    ]);
    expect(page.pane).not.toHaveBeenCalled();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
  });

  it('Enter/Space select with add semantics, Escape deselects and blurs, and no key deletes', () => {
    const page = setup();
    page.group().focus();
    fireEvent.keyDown(page.group(), { key: 'Enter' });
    fireEvent.keyDown(page.group(), { key: ' ', ctrlKey: true });
    fireEvent.keyDown(page.group(), { key: 'Enter', metaKey: true });
    fireEvent.keyDown(page.group(), { key: 'Delete' });
    fireEvent.keyDown(page.group(), { key: 'Backspace' });
    fireEvent.keyDown(page.group(), { key: 'Escape' });
    expect(page.options.onSelectEdge.mock.calls).toEqual([
      ['edge', { additive: false, toggle: false, keyboard: true }],
      ['edge', { additive: true, toggle: false, keyboard: true }],
      ['edge', { additive: true, toggle: false, keyboard: true }],
    ]);
    expect(page.options.onDeselectEdge).toHaveBeenCalledExactlyOnceWith('edge');
    expect(document.activeElement).not.toBe(page.group());
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])(
    'workflow Shift+%s adds an edge without clearing the earlier selection',
    (key) => {
      const second = { ...edge, id: 'second' };
      const page = setup({ edges: [edge, second] }, { managedSelection: true });
      const before = structuredClone(page.options.edges);
      fireEvent.click(page.hit());
      page.group('second').focus();
      fireEvent.keyDown(page.group('second'), {
        key,
        code: key === ' ' ? 'Space' : 'Enter',
        shiftKey: true,
      });
      expect(page.group().getAttribute('aria-pressed')).toBe('true');
      expect(page.group('second').getAttribute('aria-pressed')).toBe('true');
      expect(page.options.onSelectEdge.mock.calls).toEqual([
        ['edge', { additive: false, toggle: false }],
        ['second', { additive: true, toggle: false, keyboard: true }],
      ]);
      expect(page.options.clearNodeSelection).toHaveBeenCalledTimes(1);
      expect(page.keyPane).not.toHaveBeenCalled();
      expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
      expect(page.options.edges).toEqual(before);
    },
  );

  it.each([
    ['Enter', 'Shift', { shiftKey: true }],
    [' ', 'Shift', { shiftKey: true }],
    ['Enter', 'Control', { ctrlKey: true }],
    [' ', 'Control', { ctrlKey: true }],
    ['Enter', 'Meta', { metaKey: true }],
    [' ', 'Meta', { metaKey: true }],
  ])(
    'readonly %s with %s replaces keyboard selection but retains pointer modifier toggles',
    (key, _name, modifier) => {
      const second = { ...edge, id: 'second' };
      const page = setup({ edges: [edge, second], readonly: true }, { managedSelection: true });
      const before = structuredClone(page.options.edges);
      fireEvent.click(page.hit());
      page.group('second').focus();
      fireEvent.keyDown(page.group('second'), {
        key,
        code: key === ' ' ? 'Space' : 'Enter',
        ...modifier,
      });
      expect(page.group().getAttribute('aria-pressed')).toBe('false');
      expect(page.group('second').getAttribute('aria-pressed')).toBe('true');
      expect(page.options.onSelectEdge.mock.calls).toEqual([
        ['edge', { additive: false, toggle: false }],
        ['second', { additive: false, toggle: false, keyboard: true }],
      ]);
      expect(page.options.clearNodeSelection).toHaveBeenCalledTimes(2);
      fireEvent.click(page.hit(), { ctrlKey: true });
      expect(page.group().getAttribute('aria-pressed')).toBe('true');
      expect(page.group('second').getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(page.hit(), { metaKey: true });
      expect(page.group().getAttribute('aria-pressed')).toBe('false');
      expect(page.group('second').getAttribute('aria-pressed')).toBe('true');
      expect(page.options.clearNodeSelection).toHaveBeenCalledTimes(2);
      expect(page.keyPane).not.toHaveBeenCalled();
      expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
      expect(page.options.edges).toEqual(before);
    },
  );

  it('focusable edges without mounted endpoints still accept Enter/Space and Escape through the keyboard contract', () => {
    const page = setup({ visibleNodeIds: new Set() });
    const before = structuredClone(page.options.edges);
    expect(page.hit()).toBeNull();
    expect(page.group().getAttribute('tabindex')).toBe('0');
    page.group().focus();
    expect(document.activeElement).toBe(page.group());
    fireEvent.keyDown(page.group(), { key: 'Enter' });
    fireEvent.keyDown(page.group(), { key: ' ', code: 'Space' });
    // Drain jsdom's zero-delay focus work before counting owned reveal timers.
    // Check before Escape so its retirement cannot hide an accidental timer.
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
    fireEvent.keyDown(page.group(), { key: 'Escape' });
    expect(page.options.onSelectEdge.mock.calls).toEqual([
      ['edge', { additive: false, toggle: false, keyboard: true }],
      ['edge', { additive: false, toggle: false, keyboard: true }],
    ]);
    expect(page.options.onDeselectEdge).toHaveBeenCalledExactlyOnceWith('edge');
    expect(document.activeElement).not.toBe(page.group());
    expect(page.keyPane).not.toHaveBeenCalled();
    expect(page.visual().style.strokeWidth).toBe('2');
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(frames.size).toBe(0);
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    expect(page.options.edges).toEqual(before);
  });

  it('double clicking alone has no delete or pane-add action', () => {
    const page = setup();
    fireEvent.doubleClick(page.hit());
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.pane).not.toHaveBeenCalled();
  });

  it('shows source 48-world scissors only after 1000ms and deletes through the provided transaction', () => {
    const page = setup();
    const originalEdges = structuredClone(page.options.edges);
    const originalNodes = structuredClone([...page.options.worldById]);
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.visual().style.strokeWidth).toBe('4');
    act(() => vi.advanceTimersByTime(1));
    const scissors = screen.getByRole('button', { name: '断开连线' });
    const foreign = scissors.closest('[data-edge-cut-container]');
    expect(foreign.getAttribute('width')).toBe('48');
    expect(foreign.getAttribute('height')).toBe('48');
    expect(Number(foreign.getAttribute('x'))).toBeCloseTo(156);
    expect(Number(foreign.getAttribute('y'))).toBeCloseTo(16);
    expect(scissors.querySelector('svg').getAttribute('width')).toBe('28');
    expect(scissors.querySelector('svg').style.transform).toBe('rotate(-115deg)');
    fireEvent.keyDown(scissors, { key: ' ' });
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    fireEvent.click(scissors);
    expect(page.options.onDeleteEdge).toHaveBeenCalledExactlyOnceWith('edge');
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.pane).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.options.edges).toEqual(originalEdges);
    expect([...page.options.worldById]).toEqual(originalNodes);
  });

  it('cut-button Space retains native activation and cannot reach the global Canvas pan shortcut', async () => {
    const page = setup();
    const before = structuredClone(page.options.edges);
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(1000));
    const scissors = screen.getByRole('button', { name: '断开连线' });
    // The owned reveal timer is already complete. Native button activation
    // uses userEvent's platform tasks, which must not wait on a stopped clock.
    vi.useRealTimers();
    scissors.focus();
    expect(document.activeElement).toBe(scissors);
    const globalPan = vi.fn((event) => {
      if (event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keydown', globalPan);
    try {
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
        cancelable: true,
      });
      fireEvent(scissors, event);
      expect(event.defaultPrevented).toBe(false);
      expect(globalPan).not.toHaveBeenCalled();
      expect(page.keyPane).not.toHaveBeenCalled();
      expect(page.options.onSelectEdge).not.toHaveBeenCalled();
      expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: '断开连线' })).toBe(scissors);
      const user = userEvent.setup();
      await user.keyboard('[Space]');
      expect(page.options.onDeleteEdge).toHaveBeenCalledExactlyOnceWith('edge');
      expect(globalPan).not.toHaveBeenCalled();
      expect(page.keyPane).not.toHaveBeenCalled();
      expect(page.options.onSelectEdge).not.toHaveBeenCalled();
      expect(page.options.edges).toEqual(before);
      expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    } finally {
      window.removeEventListener('keydown', globalPan);
    }
  });

  it('hides a visible cut target when native CTM is unavailable and restores it only from a valid painted matrix', () => {
    const page = setup();
    let matrix = {
      inverse: () => ({ a: 2, b: 0, c: 0, d: 2, e: -240, f: -120 }),
    };
    const path = page.hit();
    path.getScreenCTM = vi.fn(() => matrix);
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    expect(path.getTotalLength).toHaveBeenCalledTimes(1);
    matrix = null;
    fireEvent.mouseMove(page.group(), { clientX: 210, clientY: 82.5 });
    page.flushFrame();
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.visual().style.strokeWidth).toBe('4');
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    matrix = {
      inverse: () => ({ a: 2, b: 0, c: 0, d: 2, e: -240, f: -120 }),
    };
    fireEvent.mouseMove(page.group(), { clientX: 210, clientY: 82.5 });
    page.flushFrame();
    const cut = screen.getByRole('button', { name: '断开连线' });
    expect(Number(cut.closest('[data-edge-cut-container]').getAttribute('x'))).toBeCloseTo(156);
    expect(path.getTotalLength).toHaveBeenCalledTimes(1);
    expect(path.getPointAtLength).toHaveBeenCalledTimes(103);
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
  });

  it('shared-layer leave immediately retires scissors, and reenter starts a fresh second', () => {
    const page = setup();
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
    fireEvent.mouseLeave(page.group());
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.visual().style.strokeWidth).toBe('2');
    expect(page.visual().style.transition).toBe('');
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button', { name: '断开连线' })).toBeTruthy();
  });

  it('permits readonly click/key selection and hover, with no scissors timer or writes', () => {
    const page = setup({ readonly: true, selectedEdgeIds: ['edge'] });
    expect(page.hit().style.strokeWidth).toBe('20');
    expect(page.visual().style.strokeWidth).toBe('3');
    expect(page.group().getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(page.hit());
    fireEvent.keyDown(page.group(), { key: ' ' });
    fireEvent.doubleClick(page.hit());
    page.hover();
    act(() => vi.advanceTimersByTime(2000));
    expect(page.visual().style.strokeWidth).toBe('4');
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.options.onSelectEdge).toHaveBeenCalledTimes(2);
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
  });

  it.each([{ interactionDisabled: true }, { ready: false }])(
    'does not intercept the pane while inactive: %o',
    (patch) => {
      const page = setup({ ...patch, selectedEdgeIds: ['edge'] });
      // Shared Y still draws its hit shape; hand-mode CSS closes its pointer gate.
      expect(page.hit().style.strokeWidth).toBe('20');
      expect(page.hit().style.stroke).toBe('transparent');
      expect(page.hit().style.pointerEvents).toBe('none');
      expect(page.visual().style.pointerEvents).toBe('none');
      expect(page.visual().style.stroke).toBe('var(--canvas-edge-selected)');
      expect(page.visual().style.strokeWidth).toBe('3');
      expect(page.group().classList.contains('nopan')).toBe(false);
      expect(page.group().getAttribute('tabindex')).toBeNull();
      fireEvent.pointerDown(page.group());
      fireEvent.click(page.group());
      fireEvent.doubleClick(page.group());
      fireEvent.keyDown(page.group(), { key: 'Enter' });
      fireEvent.mouseEnter(page.group(), { clientX: 210, clientY: 82.5 });
      act(() => vi.advanceTimersByTime(2000));
      expect(page.pane).toHaveBeenCalledTimes(3);
      expect(page.options.onSelectEdge).not.toHaveBeenCalled();
      expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(frames.size).toBe(0);
    },
  );

  it('keeps visual-only edges and independent keyboard focus when neither endpoint is mounted', () => {
    const page = setup({ visibleNodeIds: new Set(), selectedEdgeIds: ['edge'] });
    expect(page.visual()).not.toBeNull();
    expect(page.visual().style.strokeWidth).toBe('2');
    expect(page.hit()).toBeNull();
    expect(page.group().getAttribute('tabindex')).toBe('0');
    expect(page.group().getAttribute('role')).toBe('button');
    fireEvent.click(page.group());
    fireEvent.mouseEnter(page.group(), { clientX: 210, clientY: 82.5 });
    act(() => vi.advanceTimersByTime(2000));
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    page.rerenderOptions({ visibleNodeIds: new Set(['target']) });
    expect(page.hit().style.strokeWidth).toBe('20');
    expect(page.group().getAttribute('tabindex')).toBe('0');
    expect(page.visual().style.strokeWidth).toBe('3');
  });

  it('does not draw missing-endpoint or hidden edges, and keeps previews outside this layer', () => {
    const page = setup({
      edges: [
        edge,
        { ...edge, id: 'missing', target: 'gone' },
        { ...edge, id: 'hidden', hidden: true },
      ],
    });
    expect(page.container.querySelectorAll('[data-edge-id]')).toHaveLength(1);
    expect(page.container.querySelectorAll('.cv-edge-hit')).toHaveLength(1);
    expect(page.container.querySelectorAll('.cv-link-preview,.cv-connection-ghost')).toHaveLength(
      0,
    );
  });

  it('respects selectable, deletable and focusable flags independently', () => {
    const page = setup({ edges: [{ ...edge, selectable: false }] });
    expect(page.group().getAttribute('tabindex')).toBe('0');
    expect(page.group().getAttribute('role')).toBe('button');
    expect(page.hit().style.pointerEvents).toBe('none');
    fireEvent.click(page.group());
    for (const key of ['Enter', ' ', 'Escape']) fireEvent.keyDown(page.group(), { key });
    page.hover();
    act(() => vi.advanceTimersByTime(2000));
    expect(page.options.onSelectEdge).not.toHaveBeenCalled();
    expect(page.options.onDeselectEdge).not.toHaveBeenCalled();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
    page.rerenderOptions({ edges: [{ ...edge, focusable: false, deletable: false }] });
    expect(page.group().getAttribute('tabindex')).toBeNull();
    fireEvent.keyDown(page.group(), { key: 'Enter' });
    fireEvent.click(page.hit());
    page.hover();
    act(() => vi.advanceTimersByTime(2000));
    expect(page.options.onSelectEdge).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses related-node highlighting without inflating line width and decorates with pointer-free flow', () => {
    const page = setup({ selectedNodeIds: ['source'] });
    expect(page.visual().style.stroke).toBe('var(--canvas-edge-hover)');
    expect(page.visual().style.strokeWidth).toBe('2');
    const flow = page.container.querySelector('[data-edge-flow="edge"]');
    expect(flow.style.pointerEvents).toBe('none');
    const paths = [...flow.querySelectorAll('path')];
    expect(paths).toHaveLength(8);
    expect(paths.map((path) => path.style.strokeWidth)).toEqual([
      '12',
      '7',
      '4',
      '4',
      '4',
      '4',
      '4',
      '4',
    ]);
    expect(paths.every((path) => path.style.pointerEvents === 'none')).toBe(true);
    expect(paths.every((path) => path.getAttribute('pathLength') === '300')).toBe(true);
    expect(paths.map((path) => path.getAttribute('stroke-dasharray'))).toEqual([
      '36 64',
      '36 64',
      '36 64',
      '0 6 30 64',
      '0 12 24 64',
      '0 18 18 64',
      '0 24 12 64',
      '0 30 6 64',
    ]);
    page.rerenderOptions({ selectedEdgeIds: ['edge'] });
    expect(page.visual().style.stroke).toBe('var(--canvas-edge-selected)');
    expect(page.visual().style.strokeWidth).toBe('3');
  });

  it('draws reference-source dashes only on the visual path', () => {
    const page = setup({
      worldById: new Map([
        ['source', { ...source, data: { ...source.data, type: 'reference' } }],
        ['target', target],
      ]),
    });
    expect(page.visual().getAttribute('stroke-dasharray')).toBe('6 4');
    expect(page.hit().getAttribute('stroke-dasharray')).toBeNull();
  });

  it.each([
    { documentKey: 'B' },
    { readonly: true },
    { ready: false },
    { interactionDisabled: true },
    { edges: [{ ...edge }] },
  ])('retires a pending scissors operation on owner/capability/incarnation change: %o', (patch) => {
    const page = setup();
    page.hover();
    page.flushFrame();
    act(() => vi.advanceTimersByTime(900));
    page.rerenderOptions(patch);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    expect(page.options.onDeleteEdge).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('window blur and unmount cancel a scheduled frame and late scissors timer', () => {
    const page = setup();
    page.hover();
    expect(frames.size).toBe(1);
    act(() => window.dispatchEvent(new Event('blur')));
    expect(frames.size).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('button', { name: '断开连线' })).toBeNull();
    page.hover();
    expect(frames.size).toBe(1);
    page.unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
