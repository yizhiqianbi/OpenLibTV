import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CanvasNodeConnectionFeedback from './CanvasNodeConnectionFeedback.jsx';

describe('source node connection decoration', () => {
  it('shows the three white eligible layers without a hit overlay or wrapper', () => {
    const view = render(<CanvasNodeConnectionFeedback feedback={{ isConnectionTarget: true }} />);
    expect(view.container.children).toHaveLength(3);
    expect(view.container.querySelector('.cv-node-connection-ambient')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-diffuse')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-border')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-frosted')).toBeNull();
    expect(
      [...view.container.children].every((child) => child.getAttribute('aria-hidden') === 'true'),
    ).toBe(true);
  });
  it('replaces eligible white spin with the invalid pulse and content-blocking mask', () => {
    const view = render(
      <CanvasNodeConnectionFeedback
        feedback={{ isConnectionTarget: true, isConnectionInvalid: true }}
      />,
    );
    expect(view.container.children).toHaveLength(2);
    expect(view.container.querySelector('.cv-node-connection-invalid')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-frosted')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-border')).toBeNull();
  });
  it('uses only the frosted mask for an origin or already directly connected node', () => {
    const view = render(<CanvasNodeConnectionFeedback feedback={{ isConnectionBlocked: true }} />);
    expect(view.container.children).toHaveLength(1);
    expect(view.container.querySelector('.cv-node-connection-frosted')).not.toBeNull();
    expect(view.container.querySelector('.cv-node-connection-invalid')).toBeNull();
  });
  it('clears every layer when no connection node is hovered', () => {
    const view = render(<CanvasNodeConnectionFeedback feedback={{ isConnectionTarget: true }} />);
    view.rerender(<CanvasNodeConnectionFeedback feedback={null} />);
    expect(view.container.children).toHaveLength(0);
  });
});

describe('connection decoration CSS integration', () => {
  it('keeps original layer bounds, white warm gradients, masked ring and content-only hit blocking', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-node-connection-feedback.css',
      'utf8',
    );
    document.head.append(style);
    const view = render(<CanvasNodeConnectionFeedback feedback={{ isConnectionTarget: true }} />);
    const ambient = getComputedStyle(view.container.querySelector('.cv-node-connection-ambient'));
    const diffuse = getComputedStyle(view.container.querySelector('.cv-node-connection-diffuse'));
    const border = getComputedStyle(view.container.querySelector('.cv-node-connection-border'));
    expect(ambient.filter).toBe('blur(4px)');
    expect(ambient.opacity).toBe('0.6');
    expect(ambient.inset).toBe('-4px');
    expect(ambient.pointerEvents).toBe('none');
    expect(diffuse.filter).toBe('blur(6px)');
    expect(diffuse.inset).toBe('-2px');
    expect(diffuse.padding).toBe('4px');
    expect(border.maskComposite).toBe('exclude');
    expect(border.padding).toBe('1px');
    expect(border.animation).toContain('1.2s linear infinite');
    const rules = [...style.sheet.cssRules];
    const borderRule = rules.find((rule) => rule.selectorText === '.cv-node-connection-border');
    expect(borderRule.style.background).toContain('conic-gradient');
    expect(borderRule.style.background).toContain('#fffdf8d9 44%');
    view.rerender(<CanvasNodeConnectionFeedback feedback={{ isConnectionInvalid: true }} />);
    const mask = getComputedStyle(view.container.querySelector('.cv-node-connection-frosted'));
    const invalid = getComputedStyle(view.container.querySelector('.cv-node-connection-invalid'));
    expect(mask.backgroundColor).toBe('rgba(0, 0, 0, 0.35)');
    expect(mask.backdropFilter).toBe('blur(6px)');
    expect(mask.pointerEvents).toBe('all');
    expect(mask.zIndex).toBe('50');
    expect(invalid.animation).toContain('1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite');
    style.remove();
  });
  it('stops each decorative animation and visual-shell rotation with reduced motion', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(
      'src/features/canvas/components/canvas-node-connection-feedback.css',
      'utf8',
    );
    document.head.append(style);
    const view = render(<CanvasNodeConnectionFeedback feedback={{ isConnectionTarget: true }} />);
    const motion = [...style.sheet.cssRules].find((rule) =>
      rule.media?.mediaText.includes('reduce'),
    );
    const stop = [...motion.cssRules].find((rule) => rule.style.animation === 'none');
    const layers = [
      ...view.container.querySelectorAll('.cv-node-connection-diffuse,.cv-node-connection-border'),
    ];
    expect(layers.every((layer) => layer.matches(stop.selectorText))).toBe(true);
    const surface = [...motion.cssRules].find(
      (rule) => rule.selectorText === '.cv-node-feedback-surface',
    );
    expect(surface.style.transform).toBe('none');
    expect(surface.style.getPropertyPriority('transform')).toBe('important');
    expect(surface.style.transition).toBe('none');
    style.remove();
  });
});
