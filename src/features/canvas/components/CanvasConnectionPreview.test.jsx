import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CanvasConnectionPreview, {
  CanvasConnectionPreview as NamedPreview,
} from './CanvasConnectionPreview.jsx';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const origin = { id: 'a', position: { x: 100, y: 50 }, width: 200, height: 200 };
const initial = {
  documentKey: 'A',
  gestureId: 1,
  nodeId: 'a',
  handleType: 'source',
  point: { x: 450, y: 250 },
  endpoint: { x: 500, y: 150 },
  target: { nodeId: 'b' },
  status: 'valid',
  reasonLabel: '已达到参考素材数量上限',
};
const fixture = (preview, patch = {}) => (
  <svg className="cv-edges">
    <CanvasConnectionPreview origin={origin} preview={preview} {...patch} />
  </svg>
);

describe('source connection preview rendering', () => {
  it('provides both exports and renders blue double lines plus the original flowing tail at the supplied snapped endpoint', () => {
    expect(NamedPreview).toBe(CanvasConnectionPreview);
    const { container } = render(fixture(initial));
    const underlay = container.querySelector('.cv-connection-underlay');
    const line = container.querySelector('.cv-connection-line');
    expect(underlay.getAttribute('stroke')).toBe('rgba(100, 180, 255, 0.4)');
    expect(underlay.getAttribute('stroke-width')).toBe('6');
    expect(line.getAttribute('stroke')).toBe('var(--canvas-edge-hover, #c0c8d0)');
    expect(line.getAttribute('stroke-width')).toBe('2');
    expect(line.getAttribute('d')).toBe('M300,150 C400,150 400,150 500,150');
    const paths = [...container.querySelectorAll('path')];
    expect(paths).toHaveLength(10);
    expect(paths.every((path) => path.classList.contains('cv-link-preview'))).toBe(true);
    expect(paths.every((path) => path.getAttribute('d') === line.getAttribute('d'))).toBe(true);
    const flow = container.querySelector('.cv-connection-flow');
    expect(flow.hasAttribute('data-interaction-persistent')).toBe(true);
    const tail = [...flow.querySelectorAll('path')];
    expect(tail.every((path) => path.getAttribute('pathLength') === '300')).toBe(true);
    expect(tail.map((path) => path.getAttribute('stroke-width'))).toEqual([
      '12',
      '7',
      '4',
      '4',
      '4',
      '4',
      '4',
      '4',
    ]);
    expect(tail.at(-1).getAttribute('stroke-dasharray')).toBe('0 30 6 64');
    expect(tail.at(-1).getAttribute('stroke-opacity')).toBe('0.6');
    expect(screen.queryByText('无法连接')).toBeNull();
  });

  it('keeps unknown/body hover blue at the raw cursor when no snapped endpoint was supplied', () => {
    const { container } = render(fixture({ ...initial, status: 'unknown', endpoint: undefined }));
    expect(container.querySelector('.cv-connection-preview-glow')).not.toBeNull();
    expect(container.querySelector('.cv-connection-line').getAttribute('d')).toBe(
      'M300,150 C375,150 375,250 450,250',
    );
    expect(container.querySelectorAll('.cv-connection-flow-path')).toHaveLength(8);
  });

  it('draws a reverse input-initiated curve from the left edge without changing graph or preview data', () => {
    const preview = { ...initial, handleType: 'target', endpoint: { x: -100, y: 250 } };
    const before = structuredClone(preview);
    const { container } = render(fixture(preview));
    expect(container.querySelector('.cv-connection-line').getAttribute('d')).toBe(
      'M100,150 C0,150 0,250 -100,250',
    );
    expect(preview).toEqual(before);
  });

  it('uses the original curvature when the pointer is behind the initiating output', () => {
    const { container } = render(fixture({ ...initial, endpoint: { x: 200, y: 300 } }));
    expect(container.querySelector('.cv-connection-line').getAttribute('d')).toBe(
      'M300,150 C362.5,150 137.5,300 200,300',
    );
  });

  it('renders invalid gray double lines immediately without flowing or glowing paths', () => {
    const { container } = render(
      fixture({ ...initial, status: 'invalid', endpoint: initial.point }),
    );
    expect(container.querySelector('.cv-connection-underlay').getAttribute('stroke')).toBe(
      'rgba(180, 180, 180, 0.2)',
    );
    expect(container.querySelector('.cv-connection-line').getAttribute('stroke')).toBe(
      'rgba(160, 160, 160, 0.6)',
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('.cv-connection-flow')).toBeNull();
    expect(container.querySelector('.cv-connection-preview-glow')).toBeNull();
    expect(screen.queryByText('无法连接')).toBeNull();
    act(() => vi.advanceTimersByTime(599));
    expect(screen.queryByText('无法连接')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('无法连接').title).toBe(initial.reasonLabel);
  });

  it.each([null, { ...initial, endpoint: { x: NaN, y: 20 } }, { ...initial, nodeId: 'removed' }])(
    'omits a missing or stale preview %j without scheduling a tooltip',
    (preview) => {
      const { container } = render(fixture(preview));
      expect(container.querySelector('g')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('omits a preview whose origin was removed', () => {
    const { container } = render(fixture(initial, { origin: undefined }));
    expect(container.querySelector('g')).toBeNull();
  });
});

describe('invalid tooltip owner and cleanup', () => {
  it('keeps a stable 600ms deadline while its pointer moves and positions the bubble in screen-sized units', () => {
    const invalid = { ...initial, status: 'invalid' };
    const view = render(fixture(invalid, { zoom: 0.5 }));
    act(() => vi.advanceTimersByTime(400));
    view.rerender(fixture({ ...invalid, point: { x: 600, y: 300 } }, { zoom: 0.5 }));
    act(() => vi.advanceTimersByTime(200));
    const tooltip = view.container.querySelector('foreignObject');
    expect(tooltip.getAttribute('x')).toBe('504');
    expect(tooltip.getAttribute('y')).toBe('180');
    expect(tooltip.getAttribute('width')).toBe('192');
    expect(tooltip.getAttribute('height')).toBe('120');
    expect(screen.getByText('无法连接').style.transform).toBe('scale(2)');
  });

  it.each([
    { documentKey: 'B' },
    { gestureId: 2 },
    { target: { nodeId: 'c' } },
    { handleType: 'target' },
  ])(
    'restarts the deadline for a different owner %j and rejects the old pending result',
    (patch) => {
      const invalid = { ...initial, status: 'invalid' };
      const view = render(fixture(invalid));
      act(() => vi.advanceTimersByTime(400));
      view.rerender(fixture({ ...invalid, ...patch }));
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByText('无法连接')).toBeNull();
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByText('无法连接')).toBeTruthy();
    },
  );

  it('does not revive an old tooltip after document A to B to A or invalid to valid to invalid', () => {
    const invalid = { ...initial, status: 'invalid' };
    const view = render(fixture(invalid));
    act(() => vi.advanceTimersByTime(400));
    view.rerender(fixture({ ...invalid, documentKey: 'B' }));
    view.rerender(fixture(invalid));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText('无法连接')).toBeNull();
    view.rerender(fixture(initial));
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(fixture(invalid));
    act(() => vi.advanceTimersByTime(599));
    expect(screen.queryByText('无法连接')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('无法连接')).toBeTruthy();
  });

  it('cleans the timer on cancel, origin removal and StrictMode unmount', () => {
    const view = render(<StrictMode>{fixture({ ...initial, status: 'invalid' })}</StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(<StrictMode>{fixture(null)}</StrictMode>);
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<StrictMode>{fixture({ ...initial, status: 'invalid' })}</StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    view.rerender(
      <StrictMode>{fixture({ ...initial, status: 'invalid' }, { origin: undefined })}</StrictMode>,
    );
    expect(vi.getTimerCount()).toBe(0);
    view.rerender(<StrictMode>{fixture({ ...initial, status: 'invalid' })}</StrictMode>);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText('无法连接')).toBeNull();
  });
});

describe('preview stylesheet integration', () => {
  it('overrides old canvas paths and targets every animated group in reduced-motion mode', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-connection-preview.css',
      'utf8',
    );
    document.head.append(style);
    const view = render(fixture(initial));
    const rules = [...style.sheet.cssRules];
    const motion = rules.find((rule) => rule.media?.mediaText.includes('prefers-reduced-motion'));
    expect(motion).toBeTruthy();
    const stop = [...motion.cssRules].find((rule) => rule.style.animation === 'none');
    const animated = [
      ...view.container.querySelectorAll('.cv-connection-preview-glow,.cv-connection-flow'),
    ];
    expect(animated).toHaveLength(2);
    expect(animated.every((element) => element.matches(stop.selectorText))).toBe(true);
    expect(stop.style.filter).toBe('none');
    const underlay = view.container.querySelector('.cv-connection-underlay');
    const overlay = view.container.querySelector('.cv-connection-line');
    expect(getComputedStyle(underlay).strokeWidth).toBe('6');
    expect(getComputedStyle(overlay).strokeWidth).toBe('2');
    expect(getComputedStyle(underlay).strokeDasharray).toBe('none');
    expect(getComputedStyle(overlay).pointerEvents).toBe('none');
    style.remove();
  });
});
