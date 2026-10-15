import { StrictMode } from 'react';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScriptCompactProgress from './ScriptCompactProgress.jsx';
import { scriptWorkflowState } from './workflow-model.js';

const stages = (shots = 'idle', assets = 'idle', prompts = 'idle', busy = {}) => ({
  shots: { id: 'shots', status: shots, isBusy: busy.shots },
  assets: { id: 'assets', status: assets, isBusy: busy.assets },
  prompts: { id: 'prompts', status: prompts, isBusy: busy.prompts },
});
const pill = (id) => screen.getByTestId(`scriptv2-stage-pill-${id}`);
const circle = (id) => screen.getByTestId(`scriptv2-stage-circle-${id}`);

describe('source ScriptV2 compact progress view (jsdom)', () => {
  it('uses the real workflow while displaying only three static labels and one open action', () => {
    const workflow = scriptWorkflowState({
      rows: [
        {
          plotDescription: '角色走进室内',
          imageGenerationPrompt: '图片提示词',
          videoMotionPrompt: '视频提示词',
        },
      ],
      assets: { characters: [{ id: 'actor', thumbnailUrl: '/actor.png' }], scenes: [], props: [] },
    });
    render(<ScriptCompactProgress workflow={workflow} onOpen={vi.fn()} />);
    const card = screen.getByTestId('scriptv2-stage-progress-compact');
    expect(['shots', 'assets', 'prompts'].map((id) => pill(id).textContent)).toEqual([
      '确认镜头',
      '准备资产',
      '合成提示词',
    ]);
    expect(
      within(card)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['打开脚本节点 →']);
    expect(screen.queryByRole('button', { name: '确认镜头' })).toBeNull();
    expect(screen.queryByRole('button', { name: '准备资产' })).toBeNull();
    expect(screen.queryByRole('button', { name: '合成提示词' })).toBeNull();
    expect(screen.queryByText('1/1')).toBeNull();
    expect(screen.queryByText('1个镜头已就绪')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('marks the first incomplete stage active while later idle stages retain their original status', () => {
    render(<ScriptCompactProgress workflow={stages('ready', 'idle', 'idle')} />);
    expect(['shots', 'assets', 'prompts'].map((id) => pill(id).dataset.visualState)).toEqual([
      'ready',
      'active',
      'idle',
    ]);
    expect(['shots', 'assets', 'prompts'].map((id) => pill(id).dataset.status)).toEqual([
      'ready',
      'idle',
      'idle',
    ]);
    expect(circle('assets').textContent).toBe('2');
    expect(circle('prompts').textContent).toBe('3');
  });

  it('keeps partial and busy later stages active without moving or navigating the first incomplete stage', () => {
    const open = vi.fn();
    render(
      <ScriptCompactProgress
        workflow={stages('idle', 'partial', 'idle', { prompts: true })}
        onOpen={open}
      />,
    );
    expect(['shots', 'assets', 'prompts'].map((id) => pill(id).dataset.visualState)).toEqual([
      'active',
      'active',
      'active',
    ]);
    fireEvent.click(pill('assets'));
    expect(open).not.toHaveBeenCalled();
  });

  it('shows three exact ready marks after all stages complete instead of highlighting a numbered final step', () => {
    render(<ScriptCompactProgress workflow={stages('ready', 'ready', 'ready')} />);
    for (const id of ['shots', 'assets', 'prompts']) {
      expect(pill(id).dataset.visualState).toBe('ready');
      expect(circle(id).textContent).toBe('');
      const mark = circle(id).querySelector('svg');
      expect(mark.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(mark.getAttribute('width')).toBe('16');
      expect(mark.getAttribute('height')).toBe('16');
      const path = mark.querySelector('path');
      expect(path.getAttribute('d')).toBe('M3.5 8.1 6.7 11.3 12.6 4.7');
      expect(path.getAttribute('stroke-width')).toBe('2');
      expect(path.getAttribute('stroke-linecap')).toBe('round');
      expect(path.getAttribute('stroke-linejoin')).toBe('round');
    }
  });

  it('completes each connector from its left stage and preserves the source fixed positions', () => {
    render(<ScriptCompactProgress workflow={stages('ready', 'idle', 'ready')} />);
    const first = screen.getByTestId('scriptv2-stage-connector-shots');
    const second = screen.getByTestId('scriptv2-stage-connector-assets');
    expect(first.dataset.complete).toBe('true');
    expect(second.dataset.complete).toBe('false');
    expect(first.style.width).toBe('55px');
    expect(second.style.width).toBe('55px');
    expect(parseFloat(first.style.left)).toBeCloseTo(67.83333333);
    expect(parseFloat(second.style.left)).toBeCloseTo(163.16666667);
    expect(screen.queryByTestId('scriptv2-stage-connector-prompts')).toBeNull();
  });

  it('uses the source four-line default icon and respects nullish custom-icon replacement', () => {
    const view = render(<ScriptCompactProgress workflow={stages()} />);
    const icon = screen.getByTestId('scriptv2-stage-progress-icon');
    expect(icon.querySelector('.cv-script-compact-default-icon').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(icon.querySelectorAll('.cv-script-compact-default-icon > span')).toHaveLength(4);
    view.rerender(
      <ScriptCompactProgress workflow={stages()} icon={<svg data-testid="custom-script-icon" />} />,
    );
    expect(screen.getByTestId('custom-script-icon')).toBeTruthy();
    expect(icon.querySelector('.cv-script-compact-default-icon')).toBeNull();
    view.rerender(<ScriptCompactProgress workflow={stages()} icon={false} />);
    expect(icon.childElementCount).toBe(0);
    view.rerender(<ScriptCompactProgress workflow={stages()} icon={null} />);
    expect(icon.querySelectorAll('.cv-script-compact-default-icon > span')).toHaveLength(4);
  });

  it('omits the open button when readonly ownership provides no callback', () => {
    const view = render(<ScriptCompactProgress workflow={stages()} />);
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<ScriptCompactProgress workflow={stages()} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '打开脚本节点 →' }).disabled).toBe(false);
    view.rerender(<ScriptCompactProgress workflow={stages()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('scriptv2-stage-progress-compact')).toBeTruthy();
  });

  it('renders only the caller actual generating label and removes it when no work is reported', () => {
    const label = '资产生成中 40%，合成提示词中 25%...';
    const view = render(<ScriptCompactProgress workflow={stages()} generatingLabel={label} />);
    expect(screen.getByTestId('scriptv2-stage-generating-label').textContent).toBe(label);
    expect(screen.queryByRole('progressbar')).toBeNull();
    view.rerender(
      <ScriptCompactProgress workflow={stages('idle', 'idle', 'idle', { assets: true })} />,
    );
    expect(screen.queryByTestId('scriptv2-stage-generating-label')).toBeNull();
  });

  it('switches the two scoped source themes without altering document state or adding inline layout hacks', () => {
    const before = document.documentElement.className;
    const view = render(<ScriptCompactProgress workflow={stages('ready')} />);
    const card = screen.getByTestId('scriptv2-stage-progress-compact');
    expect(card.classList.contains('cv-script-compact-light')).toBe(false);
    expect(card.getAttribute('style')).toBeNull();
    view.rerender(<ScriptCompactProgress workflow={stages('ready')} isCanvasLight />);
    expect(card.classList.contains('cv-script-compact-light')).toBe(true);
    expect(document.documentElement.className).toBe(before);
    expect(pill('shots').dataset.status).toBe('ready');
  });

  it('supports the existing canvas-light ancestor without a DOM theme reader or a new setting', () => {
    const css = readFileSync('src/features/canvas/storyboard/ScriptCompactProgress.css', 'utf8');
    expect(css).toMatch(/\.cv-script-compact-light,\s*\.canvas-light \.cv-script-compact\s*\{/);
    expect(css).toMatch(
      /\.cv-script-compact-light \.cv-script-compact-generating,\s*\.canvas-light \.cv-script-compact \.cv-script-compact-generating\s*\{/,
    );
    render(
      <div className="canvas-light">
        <ScriptCompactProgress workflow={stages()} />
      </div>,
    );
    expect(screen.getByTestId('scriptv2-stage-progress-compact').className).toBe(
      'cv-script-compact',
    );
  });

  it('lets the static surface reach host drag and double-click owners while isolating the button', () => {
    const pointer = vi.fn(),
      mouse = vi.fn(),
      click = vi.fn(),
      double = vi.fn(),
      open = vi.fn();
    render(
      <div onPointerDown={pointer} onMouseDown={mouse} onClick={click} onDoubleClick={double}>
        <ScriptCompactProgress workflow={stages()} onOpen={open} />
      </div>,
    );
    fireEvent.pointerDown(pill('shots'));
    fireEvent.doubleClick(pill('assets'));
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(double).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: '打开脚本节点 →' });
    fireEvent.pointerDown(button);
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(mouse).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(double).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('preserves native Space activation without bubbling into canvas shortcuts or preventing default', async () => {
    const keyboard = vi.fn(),
      open = vi.fn();
    render(
      <div onKeyDown={keyboard}>
        <ScriptCompactProgress workflow={stages()} onOpen={open} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '打开脚本节点 →' });
    button.focus();
    expect(fireEvent.keyDown(button, { key: ' ', code: 'Space' })).toBe(true);
    expect(keyboard).not.toHaveBeenCalled();
    await userEvent.setup().keyboard(' ');
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });

  it('retains native Enter activation and does not duplicate callbacks through StrictMode replay', async () => {
    const open = vi.fn();
    render(
      <StrictMode>
        <ScriptCompactProgress workflow={stages()} onOpen={open} />
      </StrictMode>,
    );
    screen.getByRole('button', { name: '打开脚本节点 →' }).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('renders no partial interactive card for an invalid descriptor', () => {
    const open = vi.fn();
    const view = render(
      <ScriptCompactProgress workflow={{ shots: { status: 'ready' } }} onOpen={open} />,
    );
    expect(view.container.childElementCount).toBe(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });
});
