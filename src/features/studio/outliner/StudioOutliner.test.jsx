import { useMemo, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StudioOutliner } from './StudioOutliner.jsx';
import { patchStudioRow, studioNameError, studioOutlinerRows } from './model.js';

const initial = [
  {
    id: 'root',
    name: 'Scene',
    type: 'glb',
    visible: true,
    subtree: [
      { path: [0], name: 'Branch', type: 'group', visible: true },
      { path: [0, 0], name: 'Leaf', type: 'mesh', visible: true },
      { path: [1], name: 'Other', type: 'mesh', visible: true },
    ],
  },
];
function Harness({ onFocus = () => {} }) {
  const [objects, setObjects] = useState(initial),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState('');
  const rows = useMemo(() => studioOutlinerRows(objects), [objects]);
  return (
    <>
      <input aria-label="搜索树" value={query} onChange={(event) => setQuery(event.target.value)} />
      <StudioOutliner
        rows={rows}
        selected={selected}
        setSelected={setSelected}
        query={query}
        onFocus={onFocus}
        onToggleHidden={(id) =>
          setObjects((objects) =>
            patchStudioRow(objects, id, {
              visible: rows.find((row) => row.id === id).visible === false,
            }),
          )
        }
        onRename={(id, name) => {
          const error = studioNameError(rows, id, name);
          if (!error) setObjects((objects) => patchStudioRow(objects, id, { name: name.trim() }));
          return error;
        }}
      />
      <output data-testid="selected">{selected}</output>
    </>
  );
}
const row = (id) =>
  screen.getAllByRole('treeitem').find((element) => element.dataset.outlinerId === id);
describe('actual source tree navigation', () => {
  it('navigates parents/siblings with roving focus, recursively folds with Alt and reveals search ancestors', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    row('root').focus();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(row('root:node:0.0')).toBe(document.activeElement);
    expect(screen.getByTestId('selected').textContent).toBe('root:node:0.0');
    await user.keyboard('{ArrowLeft}');
    expect(row('root:node:0')).toBe(document.activeElement);
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(screen.getAllByRole('treeitem')).toHaveLength(3);
    await user.keyboard('{Home}{Alt>}{ArrowLeft}{/Alt}');
    expect(screen.getAllByRole('treeitem')).toHaveLength(1);
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(screen.getAllByRole('treeitem')).toHaveLength(4);
    await user.type(screen.getByRole('textbox', { name: '搜索树' }), 'lEaF');
    expect(screen.getAllByRole('treeitem').map((element) => element.dataset.outlinerId)).toEqual([
      'root',
      'root:node:0',
      'root:node:0.0',
    ]);
    await user.clear(screen.getByRole('textbox', { name: '搜索树' }));
    row('root').focus();
    await user.keyboard('{End}');
    expect(row('root:node:1')).toBe(document.activeElement);
  });
  it('toggles actual hidden state with H and lets an inherited-hidden child reveal its hiding parent', async () => {
    const user = userEvent.setup(),
      focus = vi.fn();
    render(<Harness onFocus={focus} />);
    await user.click(row('root:node:0'));
    await user.keyboard('h');
    expect(row('root:node:0.0').dataset.hidden).toBe('true');
    await user.click(screen.getByRole('button', { name: '选择隐藏的上级 Branch' }));
    expect(row('root:node:0')).toBe(document.activeElement);
    await user.keyboard('H');
    expect(row('root:node:0.0').dataset.hidden).toBe('false');
    await user.dblClick(row('root:node:0.0'));
    expect(focus).toHaveBeenLastCalledWith('root:node:0.0');
  });
  it('keeps invalid rename input, cancels with Escape and commits once without reopening on the new name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '重命名 Leaf' }));
    const input = screen.getByRole('textbox', { name: '对象名称 Leaf' });
    await user.clear(input);
    await user.type(input, 'Leaf.bad');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alert').textContent).toContain('名称不能包含');
    expect(input).toBe(document.activeElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: '对象名称 Leaf' })).toBeNull();
    expect(row('root:node:0.0')).toBe(document.activeElement);
    await user.click(screen.getByRole('button', { name: '重命名 Leaf' }));
    const next = screen.getByRole('textbox', { name: '对象名称 Leaf' });
    await user.clear(next);
    await user.type(next, 'New Leaf');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '重命名 New Leaf' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '对象名称 New Leaf' })).toBeNull();
    fireEvent.keyDown(row('root:node:0.0'), { key: 'h', isComposing: true });
    expect(row('root:node:0.0').dataset.hidden).toBe('false');
  });
});
