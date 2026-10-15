import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CanvasConnectionGhost, {
  CanvasConnectionGhost as NamedGhost,
  CanvasConnectionGhostEdge,
} from './CanvasConnectionGhost.jsx';
import { canvasConnectionGhost } from '../domain/connection-ghost-model.js';

afterEach(cleanup);
const ghost = (patch = {}) =>
  canvasConnectionGhost({
    menu: {
      nodeId: 'origin',
      documentKey: 'A',
      handleType: 'source',
      point: { x: 500, y: 300 },
      ...patch,
    },
    nodes: [
      { id: 'origin', type: 'reference', position: { x: 100, y: 50 }, width: 200, height: 200 },
    ],
    ready: true,
    documentKey: 'A',
  });
const fixture = (value) => (
  <div className="cv-world">
    <svg className="cv-edges">
      <CanvasConnectionGhostEdge ghost={value} />
    </svg>
    <CanvasConnectionGhost ghost={value} />
  </div>
);

describe('readonly temporary connection views', () => {
  it('splits the HTML world endpoint and SVG path without creating interactive nodes or controls', () => {
    expect(CanvasConnectionGhost).toBe(NamedGhost);
    const value = ghost();
    const before = structuredClone(value);
    const { container } = render(fixture(value));
    const endpoint = container.querySelector('.cv-connection-ghost');
    expect(endpoint.getAttribute('aria-hidden')).toBe('true');
    expect(endpoint.style.left).toBe('500px');
    expect(endpoint.style.top).toBe('300px');
    expect(endpoint.dataset.temporaryNodeId).toBe('__temp_connection_node__');
    expect(endpoint.children).toHaveLength(2);
    expect(endpoint.querySelector('.is-source')).not.toBeNull();
    expect(endpoint.querySelector('.is-target')).not.toBeNull();
    expect(endpoint.textContent).toBe('');
    const edge = container.querySelector('.cv-connection-ghost-edge');
    expect(edge.closest('svg')).not.toBeNull();
    expect(edge.dataset.temporaryEdgeId).toBe('__temp_connection_edge__');
    expect(edge.dataset.connectionSource).toBe('origin');
    expect(edge.dataset.connectionTarget).toBe('__temp_connection_node__');
    expect(edge.getAttribute('d')).toBe(value.path);
    expect(edge.getAttribute('stroke-width')).toBe('2');
    expect(edge.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(edge.style.pointerEvents).toBe('none');
    expect(container.querySelector('[data-node-id],button,input,[tabindex],[role]')).toBeNull();
    expect(value).toEqual(before);
  });

  it('renders the reverse edge at the provided geometry rather than reversing its source and target locally', () => {
    const value = ghost({ handleType: 'target', point: { x: -200, y: 300 } });
    const { container } = render(fixture(value));
    const edge = container.querySelector('path');
    expect(edge.dataset.connectionSource).toBe('__temp_connection_node__');
    expect(edge.dataset.connectionTarget).toBe('origin');
    expect(edge.getAttribute('d')).toBe('M-196,301 C-48,301 -48,150 100,150');
  });

  it('does not add a dash to ordinary anchors', () => {
    const value = ghost();
    delete value.edge.style.strokeDasharray;
    const { container } = render(fixture(value));
    expect(container.querySelector('path').hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('removes both projections when their owner closes, without animation timers or delayed work', () => {
    const view = render(fixture(ghost()));
    expect(view.container.querySelector('.cv-connection-ghost')).not.toBeNull();
    view.rerender(fixture(null));
    expect(view.container.querySelector('.cv-connection-ghost')).toBeNull();
    expect(view.container.querySelector('path')).toBeNull();
    view.rerender(fixture(ghost({ point: undefined })));
    expect(view.container.querySelector('.cv-connection-ghost')).toBeNull();
  });

  it.each([undefined, null, {}, { node: {} }, { edge: {} }])(
    'ignores an unavailable pure projection %j',
    (value) => {
      const { container } = render(fixture(value));
      expect(container.querySelector('.cv-connection-ghost,path')).toBeNull();
    },
  );
});

describe('source temporary endpoint stylesheet', () => {
  it('keeps the source tiny border box and clips its noninteractive 6px handles while overriding old clickable edge paths', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-connection-ghost.css',
      'utf8',
    );
    document.head.append(style);
    const { container } = render(fixture(ghost()));
    const endpoint = getComputedStyle(container.querySelector('.cv-connection-ghost'));
    expect(endpoint.width).toBe('1px');
    expect(endpoint.height).toBe('1px');
    expect(endpoint.minWidth).toBe('1px');
    expect(endpoint.minHeight).toBe('1px');
    expect(endpoint.boxSizing).toBe('border-box');
    expect(endpoint.overflow).toBe('hidden');
    expect(endpoint.pointerEvents).toBe('none');
    const handles = [...container.querySelectorAll('.cv-connection-ghost-handle')];
    expect(handles.every((handle) => getComputedStyle(handle).width === '6px')).toBe(true);
    expect(handles.every((handle) => getComputedStyle(handle).pointerEvents === 'none')).toBe(true);
    const edge = getComputedStyle(container.querySelector('path'));
    expect(edge.pointerEvents).toBe('none');
    expect(edge.strokeWidth).toBe('2');
    style.remove();
  });
});
