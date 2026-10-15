import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCanvasEdgeSelection } from './useCanvasEdgeSelection.js';

afterEach(cleanup);

it('reads same-event pending selection for deletion without applying visual gates again', () => {
  const f = fixture();
  act(() => {
    f.hook.result.current.select('first', { additive: true });
    f.hook.result.current.select('second', { additive: true });
    expect(f.hook.result.current.getSelectedIds()).toEqual(['first', 'second']);
  });
  f.change({
    edges: [
      { ...f.first, hidden: true, selectable: false, deletable: false },
      { ...f.second, selectable: false },
    ],
    isDisabled: () => true,
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.hook.result.current.getSelectedIds()).toEqual(['first', 'second']);
  act(() => {
    f.hook.result.current.retireMissing([f.first]);
    expect(f.hook.result.current.getSelectedIds()).toEqual(['first']);
  });
});

it('retires deletion getters with the document owner, including A -> B -> A and unmount', () => {
  const f = fixture();
  f.select();
  const old = f.hook.result.current.getSelectedIds;
  f.change({ documentKey: 'B' });
  f.change({ documentKey: 'A' });
  f.select('second');
  expect(old()).toEqual([]);
  expect(f.hook.result.current.getSelectedIds()).toEqual(['second']);
  const current = f.hook.result.current.getSelectedIds;
  f.hook.unmount();
  expect(current()).toEqual([]);
});

function fixture(patch = {}, strict = false) {
  const first = Object.freeze({ id: 'first', source: 'a', target: 'b' });
  const second = Object.freeze({ id: 'second', source: 'b', target: 'c' });
  const clearNodeSelection = vi.fn();
  let props = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    edges: Object.freeze([first, second]),
    clearNodeSelection,
    ...patch,
  };
  const hook = renderHook((options) => useCanvasEdgeSelection(options), {
    initialProps: props,
    wrapper: strict ? StrictMode : undefined,
  });
  const change = (next) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const select = (id = 'first', options) => {
    let accepted;
    act(() => {
      accepted = hook.result.current.select(id, options);
    });
    return accepted;
  };
  return { hook, first, second, clearNodeSelection, change, select };
}

it('accepts the first ready selection after StrictMode effect replay', () => {
  const f = fixture({}, true);
  expect(f.select()).toBe(true);
  expect(f.hook.result.current.selected).toEqual(['first']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
});

it('does not let the first unready StrictMode owner act when readiness arrives', () => {
  const f = fixture({ ready: false }, true),
    old = f.hook.result.current;
  expect(f.select()).toBe(false);
  f.change({ ready: true });
  expect(f.select('second')).toBe(true);
  act(() => {
    expect(old.select('first')).toBe(false);
    expect(old.clear()).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
});

it('retires old select, deselect, clear and missing-edge bridges across A→B→A', () => {
  const f = fixture();
  f.select();
  const old = f.hook.result.current;
  f.change({ documentKey: 'B' });
  expect(f.hook.result.current.selected).toEqual([]);
  f.select('second');
  act(() => {
    expect(old.select('first')).toBe(false);
    expect(old.deselect('second')).toBe(false);
    expect(old.clear()).toBe(false);
    expect(old.retireMissing([])).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
  f.change({ documentKey: 'A' });
  expect(f.hook.result.current.selected).toEqual([]);
  f.select();
  act(() => {
    expect(old.clear()).toBe(false);
    expect(old.retireMissing([])).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['first']);
});

it('ordinary click clears node selection and replaces other edges; additive pointer clicks retain nodes', () => {
  const f = fixture();
  f.select();
  f.select('second', { additive: true, toggle: true });
  expect(f.hook.result.current.selected).toEqual(['first', 'second']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
  f.select('first', { additive: true, toggle: true });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
  f.select();
  expect(f.hook.result.current.selected).toEqual(['first']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
});

it('uses pending selection for same-event append and repeated pointer toggle', () => {
  const f = fixture();
  act(() => {
    expect(f.hook.result.current.select('first', { additive: true })).toBe(true);
    expect(f.hook.result.current.select('second', { additive: true })).toBe(true);
    expect(f.hook.result.current.select('first', { additive: true })).toBe(true);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).not.toHaveBeenCalled();
});

it('editable keyboard append preserves an already selected edge without pointer-style toggling', () => {
  const f = fixture();
  f.select();
  act(() => {
    f.hook.result.current.select('second', { additive: true, toggle: false, keyboard: true });
    f.hook.result.current.select('first', { additive: true, toggle: false, keyboard: true });
  });
  expect(f.hook.result.current.selected).toEqual(['first', 'second']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
  f.select('second', { keyboard: true, additive: false, toggle: false });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
});

it('readonly keyboard replaces even with modifiers, while pointer Ctrl/Meta can still append and toggle', () => {
  const f = fixture({ readonly: true });
  f.select();
  f.select('second', { keyboard: true, additive: true, toggle: false });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
  f.select('first', { additive: true, toggle: true });
  expect(f.hook.result.current.selected).toEqual(['second', 'first']);
  f.select('first', { additive: true, toggle: true });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
});

it('metadata-only edge clones preserve selection and do not clear selected nodes', () => {
  const f = fixture();
  f.select();
  const calls = f.clearNodeSelection.mock.calls.length;
  f.change({
    edges: [
      { ...f.first, data: { caption: 'updated' } },
      { ...f.second, style: { stroke: '#fa0' } },
    ],
  });
  expect(f.hook.result.current.selected).toEqual(['first']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(calls);
});

it('removing an edge on a rendered graph prevents a later same-ID edge from reviving its selection', () => {
  const f = fixture();
  f.select();
  f.change({ edges: [f.second] });
  expect(f.hook.result.current.selected).toEqual([]);
  f.change({ edges: [{ ...f.first, data: { incarnation: 'new' } }, f.second] });
  expect(f.hook.result.current.selected).toEqual([]);
  expect(f.select()).toBe(true);
});

it('the synchronous two-array bridge retires a deletion and reinsert even when React never renders the missing graph', () => {
  const f = fixture();
  f.select();
  const rebuilt = [{ ...f.first, data: { incarnation: 'replacement' } }, f.second];
  act(() => {
    expect(f.hook.result.current.retireMissing([f.second])).toBe(true);
    expect(f.hook.result.current.retireMissing(rebuilt)).toBe(false);
  });
  f.change({ edges: rebuilt });
  expect(f.hook.result.current.selected).toEqual([]);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
});

it('missing-edge retirement preserves other selected edges and is a no-op for metadata clones', () => {
  const f = fixture();
  f.select();
  f.select('second', { additive: true });
  act(() => {
    expect(f.hook.result.current.retireMissing([{ ...f.first }, { ...f.second }])).toBe(false);
    expect(f.hook.result.current.retireMissing([f.second])).toBe(true);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
});

it('readiness and readonly owner changes retire the prior selection and reject stale callbacks', () => {
  const f = fixture();
  f.select();
  const old = f.hook.result.current;
  f.change({ ready: false });
  expect(f.hook.result.current.selected).toEqual([]);
  expect(f.select()).toBe(false);
  f.change({ ready: true, readonly: true });
  expect(f.select('second')).toBe(true);
  act(() => {
    expect(old.clear()).toBe(false);
    expect(old.select('first')).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
});

it('reads the latest disabled gate without losing a selection or acting on a rejected edge', () => {
  let disabled = false;
  const f = fixture({ isDisabled: () => disabled });
  f.select();
  disabled = true;
  expect(f.select('second')).toBe(false);
  act(() => {
    expect(f.hook.result.current.deselect('first')).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['first']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
  disabled = false;
  expect(f.select('second')).toBe(true);
  expect(f.hook.result.current.selected).toEqual(['second']);
});

it('rejects nonexistent, hidden and unselectable IDs without clearing nodes or current selection', () => {
  const f = fixture({
    edges: [
      { id: 'first', source: 'a', target: 'b' },
      { id: 'hidden', hidden: true },
      { id: 'blocked', selectable: false },
    ],
  });
  f.select();
  act(() => {
    for (const id of ['missing', 'hidden', 'blocked', undefined, null])
      expect(f.hook.result.current.select(id)).toBe(false);
  });
  expect(f.hook.result.current.selected).toEqual(['first']);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
});

it('Escape-style deselection also clears nodes, while clearing only edges preserves node selection', () => {
  const f = fixture();
  f.select();
  f.select('second', { additive: true });
  act(() => {
    expect(f.hook.result.current.deselect('first')).toBe(true);
  });
  expect(f.hook.result.current.selected).toEqual(['second']);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
  act(() => {
    expect(f.hook.result.current.clear()).toBe(true);
  });
  expect(f.hook.result.current.selected).toEqual([]);
  expect(f.clearNodeSelection).toHaveBeenCalledTimes(2);
});

it('late callbacks after unmount do not clear nodes or create another selection', () => {
  const f = fixture();
  f.select();
  const old = f.hook.result.current;
  f.hook.unmount();
  expect(old.select('second')).toBe(false);
  expect(old.deselect('first')).toBe(false);
  expect(old.clear()).toBe(false);
  expect(old.retireMissing([])).toBe(false);
  expect(f.clearNodeSelection).toHaveBeenCalledOnce();
});
