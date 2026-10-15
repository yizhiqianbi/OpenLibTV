import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasMultiConnectionPreview from './CanvasMultiConnectionPreview.jsx';

const nodes = [
  { id: 'group', type: 'group', position: { x: 100, y: 50 }, width: 500, height: 400 },
  {
    id: 'child',
    type: 'image',
    parentId: 'group',
    position: { x: 20, y: 30 },
    width: 160,
    height: 100,
    data: { action: 'image_resource' },
  },
  {
    id: 'other',
    type: 'audio',
    position: { x: -40, y: 180 },
    width: 100,
    height: 60,
    data: { action: 'audio_resource' },
  },
  { id: 'target', type: 'text', position: { x: 590, y: 320 }, width: 160, height: 100 },
];
// The source collection may be stale or differently ordered; live document geometry wins.
const sources = [
  { ...nodes[2], position: { x: 999, y: 999 } },
  { ...nodes[1], position: { x: 777, y: 777 }, width: 1 },
  nodes[1],
  { id: 'removed', position: { x: 20, y: 20 } },
];
const endpoint = { x: 360, y: 240 };
const defaultView = { x: 12, y: -6, z: 0.5 };
const hosts = [];
let style;

beforeEach(() => {
  vi.useFakeTimers();
  style = document.createElement('style');
  style.textContent = [
    'canvas-selection-overlay.css',
    'canvas-connection-preview.css',
    'canvas-multi-connection-preview.css',
  ]
    .map((name) => readFileSync(`src/features/canvas/components/${name}`, 'utf8'))
    .join('\n');
  document.head.append(style);
});
afterEach(() => {
  cleanup();
  hosts.splice(0).forEach((host) => host.remove());
  style.remove();
  vi.useRealTimers();
});

function setup({ dialog = false, light = false, ...patch } = {}) {
  const host = document.createElement('section');
  if (dialog) host.setAttribute('role', 'dialog');
  const element = document.createElement('div');
  element.className = `cv-board${light ? ' canvas-light' : ''}`;
  element.getBoundingClientRect = vi.fn(() => new DOMRect(40, 80, 900, 700));
  host.append(element);
  document.body.append(host);
  hosts.push(host);
  const board = { current: element };
  const defaults = { sources, nodes, endpoint, board, view: defaultView, ...patch };
  const view = render(<CanvasMultiConnectionPreview {...defaults} />);
  return {
    ...view,
    host,
    board,
    update: (next) => view.rerender(<CanvasMultiConnectionPreview {...defaults} {...next} />),
    portal: () => document.querySelector('.cv-multi-connection-portal'),
  };
}

describe('multiple-source viewport connection preview', () => {
  it('uses current nested world geometry in graph order and draws one raw-cursor curve per existing source', () => {
    const beforeNodes = structuredClone(nodes);
    const beforeSources = structuredClone(sources);
    const view = setup();
    const portal = view.portal();
    expect(portal.parentElement).toBe(document.body);
    expect(view.container.contains(portal)).toBe(false);
    const groups = [...portal.querySelectorAll('[data-multi-source-id]')];
    expect(groups.map((group) => group.getAttribute('data-multi-source-id'))).toEqual([
      'child',
      'other',
    ]);
    expect(groups.map((group) => group.querySelector('path').getAttribute('d'))).toEqual([
      'M192,139 C276,139 276,240 360,240',
      'M82,179 C221,179 221,240 360,240',
    ]);
    for (const group of groups) {
      const path = group.querySelector('path').getAttribute('d');
      expect(
        [...group.querySelectorAll('path')].every((item) => item.getAttribute('d') === path),
      ).toBe(true);
    }
    expect(nodes).toEqual(beforeNodes);
    expect(sources).toEqual(beforeSources);
    expect(portal.querySelector('.cv-connection-ghost,.cv-node,[data-node-id]')).toBeNull();
  });

  it('scales all source stroke widths with zoom while retaining the blue six-segment flow at any target', () => {
    const view = setup();
    const child = () => view.portal().querySelector('[data-multi-source-id="child"]');
    expect(child().querySelector('path').getAttribute('stroke-width')).toBe('1');
    expect(
      [...child().querySelectorAll('.cv-connection-flow-path')].map((path) =>
        path.getAttribute('stroke-width'),
      ),
    ).toEqual(['6', '3.5', '2', '2', '2', '2', '2', '2']);
    view.update({ view: { ...defaultView, z: 2 } });
    expect(child().querySelector('path').getAttribute('d')).toBe(
      'M612,334 C738,334 234,240 360,240',
    );
    expect(child().querySelector('path').getAttribute('stroke-width')).toBe('4');
    const flow = child().querySelector('.cv-connection-flow');
    expect(flow.hasAttribute('data-interaction-persistent')).toBe(true);
    const paths = [...flow.querySelectorAll('path')];
    expect(paths.map((path) => path.getAttribute('stroke-width'))).toEqual([
      '24',
      '14',
      '8',
      '8',
      '8',
      '8',
      '8',
      '8',
    ]);
    expect(paths.every((path) => path.getAttribute('stroke') === 'rgb(100, 180, 255)')).toBe(true);
    expect(paths.every((path) => path.getAttribute('pathLength') === '300')).toBe(true);
    expect(paths.at(-1).getAttribute('stroke-dasharray')).toBe('0 30 6 64');
    expect(paths.at(-1).getAttribute('stroke-opacity')).toBe('0.6');
    expect(view.portal().querySelector('.is-invalid,.cv-connection-invalid-tooltip')).toBeNull();
    expect(screen.queryByText('无法连接')).toBeNull();
    expect(getComputedStyle(flow).animation).toBe('cv-connection-travel 3s linear infinite');
    expect(getComputedStyle(paths[0]).animation).toBe('none');
    expect(getComputedStyle(paths[0]).strokeDashoffset).toBe(
      getComputedStyle(flow).strokeDashoffset,
    );
    const flowRule = [...style.sheet.cssRules].find(
      (rule) => rule.selectorText === '.cv-multi-connection-preview path.cv-connection-flow-path',
    );
    expect(flowRule.style.getPropertyValue('stroke-dashoffset')).toBe('inherit');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('centers the passive 24-pixel plus on the cursor instead of applying the right-port offset', () => {
    const view = setup();
    const portal = view.portal();
    const plus = portal.querySelector('.cv-selection-add-static');
    expect(plus.classList.contains('is-centered')).toBe(true);
    expect(plus.style.left).toBe('360px');
    expect(plus.style.top).toBe('240px');
    expect(getComputedStyle(plus).transform).toBe('translate(-50%, -50%)');
    expect(getComputedStyle(plus).width).toBe('24px');
    expect(getComputedStyle(plus).height).toBe('24px');
    const glyph = plus.querySelector('.cv-selection-add-indicator');
    expect(getComputedStyle(glyph).transform).toBe('none');
    expect(plus.querySelector('svg').getAttribute('width')).toBe('14');
    expect(plus.querySelector('path').getAttribute('stroke-width')).toBe('1.6');
    expect(plus.getAttribute('aria-hidden')).toBe('true');
    expect(plus.querySelector('button,[tabindex]')).toBeNull();
    expect(portal.getAttribute('aria-hidden')).toBe('true');
    expect(getComputedStyle(portal).position).toBe('fixed');
    expect(getComputedStyle(portal).pointerEvents).toBe('none');
    expect(
      getComputedStyle(portal.querySelector('.cv-multi-connection-preview')).pointerEvents,
    ).toBe('none');
    expect(screen.queryByRole('button')).toBeNull();
    view.update({ endpoint: { x: 200, y: 160 } });
    expect(portal.querySelector('.cv-selection-add-static')).toBe(plus);
    expect(plus.style.left).toBe('200px');
    expect(plus.style.top).toBe('160px');
    expect(portal.querySelector('[data-multi-source-id="child"] > path').getAttribute('d')).toBe(
      'M192,139 C232,139 160,160 200,160',
    );
  });

  it('portals into the active editor dialog and carries the light controls theme without creating another dialog', () => {
    const view = setup({ dialog: true, light: true });
    const portal = view.portal();
    expect(portal.parentElement).toBe(view.host);
    expect(view.host.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(portal.classList.contains('canvas-light')).toBe(true);
    expect(
      getComputedStyle(portal.querySelector('.cv-selection-add-indicator')).backgroundColor,
    ).toBe('rgba(0, 0, 0, 0)');
    expect(document.body.style.overflow).toBe('');
  });

  it('removes deleted sources and their curves rather than projecting stale source snapshots', () => {
    const view = setup();
    const portal = view.portal();
    view.update({ nodes: nodes.filter((node) => node.id !== 'child') });
    expect(portal.querySelector('[data-multi-source-id="child"]')).toBeNull();
    expect(portal.querySelectorAll('[data-multi-source-id]')).toHaveLength(1);
    view.update({ nodes: nodes.filter((node) => !['child', 'other'].includes(node.id)) });
    expect(portal.querySelectorAll('[data-multi-source-id]')).toHaveLength(0);
    expect(portal.querySelector('.cv-connection-ghost,[data-node-id]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ endpoint: null }, { board: { current: null } }])(
    'omits the viewport view when its required geometry is missing: %j',
    (patch) => {
      const view = setup(patch);
      expect(view.portal()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not render malformed coordinates as SVG or as a passive cursor glyph', () => {
    const view = setup({ endpoint: { x: Number.NaN, y: 120 } });
    expect(view.portal().querySelectorAll('[data-multi-source-id]')).toHaveLength(0);
    expect(view.portal().querySelector('.cv-selection-add-static')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no portal, interactive surface or delayed paint work after StrictMode cleanup', () => {
    const view = setup();
    view.rerender(
      <StrictMode>
        <CanvasMultiConnectionPreview
          sources={sources}
          nodes={nodes}
          endpoint={endpoint}
          board={view.board}
          view={defaultView}
        />
      </StrictMode>,
    );
    expect(document.querySelectorAll('.cv-multi-connection-portal')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
    expect(view.portal()).toBeNull();
    expect(document.querySelector('.cv-selection-add-hit,.cv-selection-add-static')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });
});
