import { StrictMode, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import CanvasBatchVideoConfiguration from './CanvasBatchVideoConfiguration.jsx';

const initial = {
  model: 'star-video2',
  modeType: 'singleImage2video',
  settings: { ratio: '16:9', resolution: '720p' },
};
const bounds = { x: 100, y: 100, width: 200, height: 100 };
function Host({ onConfigChange, ...props }) {
  const board = useRef(null);
  const [config, setConfig] = useState(initial);
  return (
    <div>
      <div ref={board} data-testid="board" />
      <CanvasBatchVideoConfiguration
        board={board}
        bounds={bounds}
        view={{ x: 30, y: 40, z: 1 }}
        models={models}
        modelKeys={['star-video2', 'MiniMax-Hailuo-2.3']}
        schema={models.videoModels['star-video2']}
        config={config}
        readyCount={3}
        onSubmit={vi.fn()}
        onConfigChange={(next) => {
          setConfig(next);
          onConfigChange?.(next);
        }}
        {...props}
      />
      <output aria-label="saved video configuration">{JSON.stringify(config)}</output>
      <button type="button">外部操作</button>
    </div>
  );
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.dataset.testid === 'board')
      return { left: 100, top: 50, right: 1100, bottom: 750, width: 1000, height: 700 };
    const scale = Number(this.style.transform.match(/scale\(([^)]+)\)/)?.[1] || 1);
    const width = this.getAttribute('aria-label') === '批量视频配置' ? 600 * scale : 40;
    return { left: 0, top: 0, right: width, bottom: 42 * scale, width, height: 42 * scale };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('source v1 batch video configuration view', () => {
  it('renders the complete compact row, all-shot count and unknown fee without prompt or quantity controls', () => {
    render(<Host />);
    const bar = screen.getByRole('toolbar', { name: '批量视频配置' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭批量视频配置' }));
    const buttons = within(bar).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '关闭批量视频配置',
      '选择生成模型',
      '生成参数',
      '创建视频组',
    ]);
    expect(within(bar).getByText('全部 3 个分镜')).toBeTruthy();
    expect(screen.getByLabelText('预计积分').textContent).toBe('-');
    expect(screen.getByLabelText('预计积分').title).toBe('费用服务未连接');
    expect(screen.getByRole('button', { name: '创建视频组' }).title).toBe(
      '创建空视频节点，生成服务未连接',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(screen.getByRole('switch', { name: '自动校验素材' })).toBeTruthy();
    expect(screen.queryByRole('switch', { name: '联网搜索' })).toBeNull();
    expect(screen.queryByRole('switch', { name: '智能引用 AutoLink' })).toBeNull();
    expect(screen.queryByRole('group', { name: '数量' })).toBeNull();
    expect(screen.queryByText('高级设置', { selector: 'summary' })).toBeNull();
  });

  it('keeps typed schema settings and batch advanced values in local config and submits that exact config', () => {
    const onConfigChange = vi.fn(),
      onSubmit = vi.fn();
    render(<Host onConfigChange={onConfigChange} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: '清晰度' })).getByRole('button', {
        name: '1080P',
        exact: true,
      }),
    );
    fireEvent.click(screen.getByRole('switch', { name: '自动校验素材' }));
    const config = JSON.parse(screen.getByLabelText('saved video configuration').textContent);
    expect(config).toMatchObject({
      model: 'star-video2',
      modeType: 'singleImage2video',
      settings: { resolution: '1080p', ratio: '16:9' },
      advancedSettings: { autoCompliance: 0 },
    });
    expect(config).not.toHaveProperty('count');
    expect(config).not.toHaveProperty('prompt');
    fireEvent.keyDown(screen.getByRole('dialog', { name: '生成参数' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '创建视频组' }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(config);
    expect(onConfigChange).toHaveBeenCalledTimes(2);
  });

  it('filters the model menu by source support keys and returns focus to the model trigger after selection', async () => {
    render(<Host />);
    const trigger = screen.getByRole('button', { name: '选择生成模型' });
    fireEvent.click(trigger);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.click(screen.getByRole('option', { name: 'Hailuo-2.3' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(JSON.parse(screen.getByLabelText('saved video configuration').textContent)).toEqual({
      ...initial,
      model: 'MiniMax-Hailuo-2.3',
    });
  });

  it.each(['生成参数', '选择生成模型'])(
    'lets the %s popup consume the first Escape, then closes the floating view on the second',
    (name) => {
      const onClose = vi.fn();
      render(<Host onClose={onClose} />);
      const trigger = screen.getByRole('button', { name });
      fireEvent.click(trigger);
      const popup =
        name === '生成参数' ? screen.getByRole('dialog', { name }) : screen.getByRole('listbox');
      fireEvent.keyDown(popup, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
      fireEvent.keyDown(trigger, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledExactlyOnceWith({ restoreFocus: true });
    },
  );

  it('closes the inner menu on external pointer/focus without taking the newly focused control', () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    const outside = screen.getByRole('button', { name: '外部操作' });
    fireEvent.pointerDown(outside);
    act(() => outside.focus());
    expect(screen.queryByRole('dialog', { name: '生成参数' })).toBeNull();
    expect(document.activeElement).toBe(outside);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not let queued model-trigger restoration steal an explicitly transferred focus', async () => {
    render(
      <Host onConfigChange={() => screen.getByRole('button', { name: '外部操作' }).focus()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择生成模型' }));
    fireEvent.click(screen.getByRole('option', { name: 'Hailuo-2.3' }));
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '外部操作' }));
  });

  it('uses already scaled total fees in source primary/slash/original order and hides equal or unknown original fees', () => {
    const { rerender } = render(
      <Host feeState={{ status: 'ready', cost: 30, originalCost: 60 }} />,
    );
    const fee = screen.getByLabelText('预计积分');
    expect(fee.textContent).toBe('30/60');
    expect(fee.querySelector('del').textContent).toBe('60');
    rerender(<Host feeState={{ status: 'ready', cost: '30', originalCost: 30 }} />);
    expect(fee.textContent).toBe('30');
    expect(fee.querySelector('del')).toBeNull();
    rerender(
      <Host
        feeState={{
          status: 'unavailable',
          cost: 0,
          originalCost: 10,
          reason: '未连接运营费用服务',
        }}
      />,
    );
    expect(fee.textContent).toBe('-');
    expect(fee.title).toBe('未连接运营费用服务');
  });

  it('shows loading failure and retry while keeping close accessible and unavailable configuration immutable', () => {
    const onRetry = vi.fn(),
      onClose = vi.fn(),
      onSubmit = vi.fn();
    render(
      <Host
        schema={null}
        disabledReason="视频支持目录读取失败"
        onRetry={onRetry}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    expect(
      within(screen.getByRole('toolbar', { name: '批量视频配置' })).getByRole('status').textContent,
    ).toContain('视频支持目录读取失败');
    expect(screen.getByRole('button', { name: '选择生成模型' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '创建视频组' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '创建视频组' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重试加载视频配置' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '关闭批量视频配置' }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith({ restoreFocus: true });
  });

  it('keeps pending-save parameters frozen while allowing an explicit retry of the same configuration', () => {
    const onSubmit = vi.fn();
    render(
      <Host
        pendingSave
        submitLabel="重试保存"
        error="本地空间不足，视频组尚未保存"
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('本地空间不足，视频组尚未保存');
    expect(screen.getByRole('button', { name: '选择生成模型' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '生成参数' }).disabled).toBe(true);
    const retry = screen.getByRole('button', { name: '重试保存' });
    expect(retry.disabled).toBe(false);
    expect(retry.title).toBe('重试保存已创建的视频组');
    fireEvent.click(retry);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it('lets an already committed group retry persistence without source shots or a loaded catalogue', () => {
    const onSubmit = vi.fn();
    render(
      <Host
        pendingSave
        submitLabel="重试保存"
        schema={null}
        readyCount={0}
        error="已创建的视频组尚未保存"
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByRole('button', { name: '选择生成模型' }).disabled).toBe(true);
    const retry = screen.getByRole('button', { name: '重试保存' });
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it.each([{ busy: true }, { disabledReason: '当前画布不可编辑' }])(
    'retains lifecycle and busy guards for pending persistence: %j',
    (guard) => {
      const onSubmit = vi.fn();
      render(
        <Host
          pendingSave
          submitLabel="重试保存"
          schema={null}
          readyCount={0}
          onSubmit={onSubmit}
          {...guard}
        />,
      );
      const retry = screen.getByRole('button', { name: '重试保存' });
      expect(retry.disabled).toBe(true);
      fireEvent.click(retry);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('blocks repeated action and config edits during actual work without blocking close', () => {
    const onSubmit = vi.fn();
    render(<Host busy onSubmit={onSubmit} />);
    for (const name of ['创建视频组', '选择生成模型', '生成参数'])
      expect(screen.getByRole('button', { name }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '关闭批量视频配置' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: '创建视频组' }).getAttribute('aria-busy')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '创建视频组' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('places below the source group bounds and preserves the exact effective-zoom scale/gap', () => {
    const { rerender } = render(<Host />);
    const bar = screen.getByRole('toolbar', { name: '批量视频配置' });
    expect(bar.style.transform).toBe('scale(1)');
    expect(bar.style.left).toBe('30px');
    expect(bar.style.top).toBe('300px');
    rerender(<Host view={{ x: 30, y: 40, z: 0.25 }} />);
    expect(bar.style.transform).toBe('scale(0.5)');
    expect(bar.style.top).toBe('145px');
    expect(bar.style.left).toBe('30px');
    rerender(<Host view={{ x: 30, y: 40, z: 2 }} />);
    expect(bar.style.transform).toBe('scale(1)');
    expect(bar.style.top).toBe('500px');
    expect(bar.style.left).toBe('230px');
  });

  it('clamps the panel to 8px narrow-screen margins and leaves its row scrollable rather than clipping actions', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 720);
    render(<Host bounds={{ x: 1000, y: 1000, width: 200, height: 100 }} />);
    const bar = screen.getByRole('toolbar', { name: '批量视频配置' });
    expect(bar.style.maxWidth).toBe('374px');
    expect(bar.style.left).toBe('8px');
    expect(bar.style.top).toBe('670px');
    expect(bar.querySelector('.cv-batch-video-configuration-row')).toBeTruthy();
    expect(screen.getByRole('button', { name: '创建视频组' })).toBeTruthy();
  });

  it('repositions on board resize and removes the observer when unmounted', async () => {
    let notify;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          notify = callback;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );
    const { unmount } = render(<Host />);
    const bar = screen.getByRole('toolbar', { name: '批量视频配置' });
    screen.getByTestId('board').getBoundingClientRect = () => ({
      left: 300,
      top: 60,
      width: 1000,
      height: 700,
    });
    act(() => notify());
    await waitFor(() => expect(bar.style.left).toBe('230px'));
    expect(bar.style.top).toBe('310px');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate callbacks in StrictMode and disables submitting an empty ready-shot set', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <StrictMode>
        <Host readyCount={0} onSubmit={onSubmit} />
      </StrictMode>,
    );
    const submit = screen.getByRole('button', { name: '创建视频组' });
    expect(submit.disabled).toBe(true);
    rerender(
      <StrictMode>
        <Host readyCount={2} onSubmit={onSubmit} />
      </StrictMode>,
    );
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it('does not borrow text-mode advanced settings when the source image mode has no advanced branch', () => {
    const schema = {
      properties: {
        modeType: { items: { singleImage2video: [1, 1] } },
        textOnly: { component: 'switch', displayName: '文本模式高级项', batch: true },
      },
      config: { advancedSettings: { text2video: ['textOnly'] } },
    };
    render(<Host schema={schema} />);
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(screen.queryByRole('switch', { name: '文本模式高级项' })).toBeNull();
    expect(screen.queryByRole('region', { name: '高级设置' })).toBeNull();
  });
});
