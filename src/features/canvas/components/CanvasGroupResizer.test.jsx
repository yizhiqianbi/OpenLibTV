import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGroupResizer } from './CanvasGroupResizer.jsx';

const props = (extra = {}) => ({
  groupId: 'group',
  visible: true,
  selected: true,
  zoom: 1,
  onResizeStart: vi.fn(),
  ...extra,
});
const surface = (options, extra = {}) => (
  <article className="cv-group-node" {...extra}>
    <CanvasGroupResizer {...options} />
  </article>
);

describe('source ordinary group resizer surface', () => {
  it('renders four edge lines and four corner handles in source order', () => {
    const view = render(surface(props()));
    const controls = screen.getAllByRole('button');
    expect(controls.map((control) => control.dataset.groupResizeDirection)).toEqual([
      'top',
      'right',
      'bottom',
      'left',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    expect(view.container.querySelectorAll('.cv-group-resize-line')).toHaveLength(4);
    expect(view.container.querySelectorAll('.cv-group-resize-handle')).toHaveLength(4);
    for (const handle of view.container.querySelectorAll('.cv-group-resize-handle')) {
      expect(handle.style.width).toBe('8px');
      expect(handle.style.height).toBe('8px');
      expect(handle.style.borderRadius).toBe('2px');
      expect(handle.style.borderStyle).toBe('none');
      expect(handle.style.backgroundColor).toBe('var(--canvas-node-border-selected)');
    }
    for (const control of controls) {
      expect(control.classList.contains('nodrag')).toBe(true);
      expect(control.classList.contains('nopan')).toBe(true);
      expect(control.tabIndex).toBe(-1);
      expect(control.disabled).toBe(false);
    }
    for (const line of view.container.querySelectorAll('.cv-group-resize-line'))
      expect(line.style.borderColor).toBe('var(--canvas-node-border-selected)');
  });

  it.each([
    'top',
    'right',
    'bottom',
    'left',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ])(
    'delegates only %s pointerdown with the current group and prevents ordinary drag/selection',
    (direction) => {
      const options = props();
      const drag = vi.fn(),
        select = vi.fn(),
        mouseDown = vi.fn(),
        doubleClick = vi.fn();
      const view = render(
        surface(options, {
          onPointerDown: drag,
          onMouseDown: mouseDown,
          onClick: select,
          onDoubleClick: doubleClick,
        }),
      );
      const control = view.container.querySelector(`[data-group-resize-direction="${direction}"]`);
      const result = fireEvent.pointerDown(control, {
        pointerId: 3,
        clientX: 140,
        clientY: 80,
        button: 0,
      });
      expect(result).toBe(false);
      expect(options.onResizeStart).toHaveBeenCalledTimes(1);
      const [event, groupId, actualDirection] = options.onResizeStart.mock.calls[0];
      expect(event.defaultPrevented).toBe(true);
      expect(event.target).toBe(control);
      expect(groupId).toBe('group');
      expect(actualDirection).toBe(direction);
      fireEvent.mouseDown(control);
      fireEvent.click(control);
      fireEvent.doubleClick(control);
      expect(options.onResizeStart).toHaveBeenCalledTimes(1);
      expect(drag).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
      expect(mouseDown).not.toHaveBeenCalled();
      expect(doubleClick).not.toHaveBeenCalled();
    },
  );

  it.each([
    [0.25, '4'],
    [0.5, '2'],
    [1, '1'],
    [2, '1'],
    [0, '1'],
    [Number.NaN, '1'],
    [Number.POSITIVE_INFINITY, '1'],
  ])('auto-scales only corner handles for zoom %s', (zoom, scale) => {
    const view = render(surface(props({ zoom })));
    for (const handle of view.container.querySelectorAll('.cv-group-resize-handle'))
      expect(handle.style.scale).toBe(scale);
    for (const line of view.container.querySelectorAll('.cv-group-resize-line'))
      expect(line.style.scale).toBe('');
  });

  it('keeps lines transparent for a source visibility override on an unselected group', () => {
    const view = render(surface(props({ selected: false })));
    for (const line of view.container.querySelectorAll('.cv-group-resize-line'))
      expect(line.style.borderColor).toBe('transparent');
    expect(view.container.querySelectorAll('.cv-group-resize-handle')).toHaveLength(4);
  });

  it.each([{ disabled: true }, { onResizeStart: undefined }])(
    'disables unavailable starts without bubbling pointerdown: %j',
    (patch) => {
      const options = props(patch),
        drag = vi.fn();
      render(surface(options, { onPointerDown: drag }));
      const control = screen.getByRole('button', { name: '调整分组大小 右下角' });
      expect(control.disabled).toBe(true);
      fireEvent.pointerDown(control, { pointerId: 5, button: 0 });
      expect(drag).not.toHaveBeenCalled();
      if (options.onResizeStart) expect(options.onResizeStart).not.toHaveBeenCalled();
    },
  );

  it('unmounts hidden controls and uses fresh group/zoom/disabled props on the next visible surface', () => {
    const options = props();
    const view = render(surface(options));
    view.rerender(surface({ ...options, visible: false }));
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(surface({ ...options, groupId: 'other', zoom: 0.5 }));
    const control = screen.getByRole('button', { name: '调整分组大小 左上角' });
    fireEvent.pointerDown(control, { pointerId: 7, button: 0 });
    expect(options.onResizeStart).toHaveBeenCalledTimes(1);
    expect(options.onResizeStart.mock.calls[0].slice(1)).toEqual(['other', 'top-left']);
    expect(control.style.scale).toBe('2');
    view.rerender(surface({ ...options, groupId: 'other', disabled: true }));
    fireEvent.pointerDown(control, { pointerId: 8, button: 0 });
    expect(options.onResizeStart).toHaveBeenCalledTimes(1);
  });
});
