import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScriptNodeToolbar from './ScriptNodeToolbar.jsx';

let portal;
const projection = (overrides = {}) => ({
  visible: true,
  actions: Object.fromEntries(
    ['regenerate', 'image', 'video', 'download'].map((key) => [key, { enabled: true }]),
  ),
  ...overrides,
});
const options = (overrides = {}) => ({
  nodeId: 'script-v2',
  anchor: { x: 500, y: 300 },
  portal,
  projection: projection(),
  onRegenerate: vi.fn(),
  onCreateImages: vi.fn(),
  onCreateVideos: vi.fn(),
  onDownload: vi.fn(),
  ...overrides,
});
beforeEach(() => {
  portal = document.createElement('div');
  document.body.append(portal);
});
afterEach(() => {
  portal.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ScriptV2 source floating toolbar', () => {
  it('keeps the four source actions in order and passes the current node and stable opener', () => {
    const props = options({ projection: projection({ pending: true }) });
    render(<ScriptNodeToolbar {...props} />);
    const bar = screen.getByRole('toolbar', { name: '脚本操作' });
    expect(bar.getAttribute('aria-busy')).toBe('true');
    expect(bar.parentElement).toBe(portal);
    expect(bar.getAttribute('data-script-node-toolbar')).toBe('script-v2');
    expect(bar.closest('[data-node-id]')).toBeNull();
    expect(portal.querySelectorAll('[data-node-id]')).toHaveLength(0);
    const buttons = within(bar).getAllByRole('button');
    expect(
      buttons.map((button) => button.getAttribute('aria-label') || button.textContent),
    ).toEqual(['重新生成', '批量生成分镜', '批量生视频', '下载']);
    for (const [index, callback] of [
      props.onRegenerate,
      props.onCreateImages,
      props.onCreateVideos,
      props.onDownload,
    ].entries()) {
      expect(buttons[index].disabled).toBe(false);
      fireEvent.click(buttons[index]);
      expect(callback).toHaveBeenCalledExactlyOnceWith('script-v2', buttons[index]);
    }
    expect(buttons[3].title).toBe('下载');
    expect(buttons[3].textContent).toBe('');
    expect(buttons[0].querySelector('[aria-hidden="true"]').style.maskImage).toBe(
      'url("/assets/icons/refresh.svg")',
    );
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('obeys each projected action gate without providing an action for a missing callback', () => {
    const props = options({
      projection: projection({
        pending: true,
        actions: {
          regenerate: { enabled: false },
          image: { enabled: false, disabledReason: '资产尚未就绪' },
          video: { enabled: true },
          download: { enabled: false },
        },
      }),
      onCreateVideos: undefined,
    });
    render(<ScriptNodeToolbar {...props} />);
    expect(screen.getByRole('toolbar').getAttribute('aria-busy')).toBe('true');
    for (const button of screen.getAllByRole('button')) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(props.onRegenerate).not.toHaveBeenCalled();
    expect(props.onCreateImages).not.toHaveBeenCalled();
    expect(props.onDownload).not.toHaveBeenCalled();
  });

  it('shows only disabled image/video reasons immediately with the source arrow and multiline text', () => {
    const props = options({
      projection: projection({
        actions: {
          regenerate: { enabled: false, disabledReason: '重新生成不可用' },
          image: { enabled: false, disabledReason: '资产尚未就绪\n请稍后重试' },
          video: { enabled: true, disabledReason: '不应显示' },
          download: { enabled: false, disabledReason: '下载不可用' },
        },
      }),
    });
    const view = render(<ScriptNodeToolbar {...props} />);
    const image = screen.getByRole('button', { name: '批量生成分镜' });
    fireEvent.mouseEnter(image);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('资产尚未就绪\n请稍后重试');
    expect(tip.classList.contains('cv-agent-toolbar-tooltip-arrow')).toBe(true);
    expect(tip.style.maxWidth).toBe('300px');
    expect(tip.parentElement).toBe(document.body);
    fireEvent.mouseLeave(image);
    expect(screen.queryByRole('tooltip')).toBeNull();
    for (const name of ['重新生成', '批量生视频', '下载']) {
      fireEvent.mouseEnter(screen.getByRole('button', { name }));
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
    view.rerender(
      <ScriptNodeToolbar
        {...props}
        projection={projection({
          actions: { video: { enabled: false, disabledReason: '没有可用视频模型' } },
        })}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: '批量生视频' }));
    expect(screen.getByRole('tooltip').textContent).toBe('没有可用视频模型');
  });

  it('does not forward pointer/click events into the canvas or steal keyboard focus', () => {
    const pointer = vi.fn(),
      click = vi.fn(),
      key = vi.fn();
    // Canvas uses React's board handlers. Native listeners on the portal root
    // run before React's delegated listener and are a different protocol.
    render(
      <div onPointerDown={pointer} onClick={click} onKeyDown={key}>
        <ScriptNodeToolbar {...options()} />
      </div>,
    );
    const button = screen.getByRole('button', { name: '重新生成' });
    act(() => button.focus());
    const event = new Event('pointerdown', { bubbles: true, cancelable: true });
    fireEvent(button, event);
    fireEvent.click(button);
    expect(pointer).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(key).toHaveBeenCalledTimes(1);
    expect(key.mock.calls[0][0].key).toBe('Escape');
    expect(document.activeElement).toBe(button);
    expect(document.body.style.overflow).toBe('');
  });

  it('mounts safely after visibility changes and removes an open tooltip when the owner disappears', () => {
    const props = options({
      projection: projection({
        visible: false,
        actions: { image: { enabled: false, disabledReason: '资产待处理' } },
      }),
    });
    const view = render(<ScriptNodeToolbar {...props} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    view.rerender(
      <ScriptNodeToolbar {...props} projection={{ ...props.projection, visible: true }} />,
    );
    expect(screen.getByRole('toolbar').style.visibility).not.toBe('hidden');
    fireEvent.mouseEnter(screen.getByRole('button', { name: '批量生成分镜' }));
    expect(screen.getByRole('tooltip')).toBeTruthy();
    view.rerender(<ScriptNodeToolbar {...props} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.rerender(<ScriptNodeToolbar {...props} projection={null} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('uses the source 32 screen-pixel gap and clamps/reobserves a 390px board without scaling', () => {
    let width = 390;
    const callbacks = new Set(),
      disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          this.callback = callback;
          callbacks.add(callback);
        }
        observe() {}
        disconnect() {
          callbacks.delete(this.callback);
          disconnect();
        }
      },
    );
    vi.spyOn(portal, 'getBoundingClientRect').mockImplementation(() => ({ width, height: 844 }));
    const original = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('cv-script-node-toolbar')
        ? { width: 438, height: 41 }
        : original.call(this);
    });
    const view = render(
      <StrictMode>
        <ScriptNodeToolbar {...options({ anchor: { x: 380, y: 200 } })} />
      </StrictMode>,
    );
    const bar = screen.getByRole('toolbar');
    expect(bar.style.maxWidth).toBe('374px');
    expect(bar.style.left).toBe('8px');
    expect(bar.style.top).toBe('127px');
    expect(bar.style.transform).toBe('');
    width = 320;
    act(() => callbacks.forEach((callback) => callback()));
    expect(bar.style.maxWidth).toBe('304px');
    expect(bar.style.left).toBe('8px');
    view.unmount();
    expect(callbacks.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });

  it.each([null, { x: NaN, y: 0 }, { x: 0, y: Infinity }])(
    'does not present actions without a valid anchor: %j',
    (anchor) => {
      render(<ScriptNodeToolbar {...options({ anchor })} />);
      expect(screen.queryByRole('toolbar')).toBeNull();
    },
  );
});
