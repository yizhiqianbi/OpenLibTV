import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { loadContent } from '../../../services/content.ts';
import NodeCanvas from '../NodeCanvas.jsx';

vi.mock('../../../services/content.ts', () => ({ loadContent: vi.fn() }));
vi.mock('../../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) =>
    name === 'models'
      ? modelContentState
      : { data: { items: [] }, loading: false, error: null, reload: vi.fn() },
}));

const modelContentState = vi.hoisted(() => ({
  data: null,
  loading: false,
  error: null,
  reload: vi.fn(),
}));

const localUser = { name: 'local' };

function seedGenerator(projectId, model = 'MiniMax-Hailuo-2.3') {
  localStorage.setItem(
    `libtv.canvas.${projectId}`,
    JSON.stringify({
      title: '参数持久化回归',
      nodes: [
        {
          id: 'video-generator',
          type: 'video',
          width: 350,
          height: 230,
          position: { x: 100, y: 100 },
          data: { name: '视频生成器', params: { model, prompt: '', modeType: 'text2video' } },
        },
      ],
      edges: [],
      view: { x: 0, y: 0, z: 1 },
    }),
  );
}

async function openGenerator(page) {
  await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
  fireEvent.click(
    within(page.container.querySelector('.cv-node')).getByRole('button', { name: '节点设置' }),
  );
  await screen.findByRole('option', { name: models.videoModels['star-video2'].modelName });
}

function savedGenerator(projectId) {
  return JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`)).nodes[0].data;
}

beforeEach(() => {
  modelContentState.data = models;
  modelContentState.loading = false;
  modelContentState.error = null;
  modelContentState.reload.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(loadContent).mockImplementation(async (name) => {
    if (name === 'models') return models;
    throw new Error(`Unexpected content request: ${name}`);
  });
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});

describe('NodeCanvas generator persistence with the public model schema', () => {
  it('preserves all saved settings while model configuration is unavailable and exposes retry', async () => {
    const projectId = 'generator-model-load';
    seedGenerator(projectId, 'star-video2');
    const doc = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
    doc.nodes[0].data.params = {
      model: 'star-video2',
      prompt: '原提示词',
      settings: { duration: 12, resolution: '1080p' },
      advancedSettings: { search_enabled: 0 },
    };
    localStorage.setItem(`libtv.canvas.${projectId}`, JSON.stringify(doc));
    modelContentState.data = null;
    modelContentState.loading = true;
    const props = { path: `/canvas?projectId=${projectId}`, user: localUser };
    const page = render(<NodeCanvas {...props} />);
    await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '节点设置' }));
    expect(screen.getByText('模型配置加载中…')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '提示词' }).readOnly).toBe(true);
    expect(screen.getByRole('button', { name: /生成 积分/ }).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), {
      target: { value: '不可写入' },
    });
    modelContentState.loading = false;
    modelContentState.error = new Error('网络失败');
    modelContentState.reload.mockImplementation(async () => {
      modelContentState.data = models;
      modelContentState.error = null;
    });
    page.rerender(<NodeCanvas {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '重新加载模型配置' }));
    expect(modelContentState.reload).toHaveBeenCalledOnce();
    page.rerender(<NodeCanvas {...props} />);
    expect(screen.getByRole('textbox', { name: '提示词' }).value).toBe('原提示词');
    expect(screen.getByRole('textbox', { name: '提示词' }).readOnly).toBe(false);
    page.unmount();
    expect(savedGenerator(projectId).params).toEqual(doc.nodes[0].data.params);
  });

  it('saves model and typed parameters on immediate unmount and restores them in a fresh canvas', async () => {
    const projectId = 'generator-parameters';
    seedGenerator(projectId);
    const page = render(<NodeCanvas path={`/canvas?projectId=${projectId}`} user={localUser} />);
    await openGenerator(page);
    expect(screen.getByRole('combobox', { name: '模型' }).value).toBe('MiniMax-Hailuo-2.3');
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), {
      target: { value: 'star-video2' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), {
      target: { value: '固定镜头，观察海面上的日落' },
    });
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    const popup = screen.getByRole('dialog', { name: '生成参数' });
    fireEvent.click(
      within(within(popup).getByRole('group', { name: '清晰度' })).getByRole('button', {
        name: '1080P',
        exact: true,
      }),
    );
    const duration = within(popup).getByRole('spinbutton', { name: '视频时长数值' });
    fireEvent.change(duration, { target: { value: '12' } });
    fireEvent.blur(duration);
    // Unmount before the 600ms debounce: this exercises the document's final flush.
    page.unmount();
    expect(savedGenerator(projectId).params).toMatchObject({
      model: 'star-video2',
      prompt: '固定镜头，观察海面上的日落',
      modeType: 'text2video',
      settings: { resolution: '1080p', duration: 12 },
    });
    const restored = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={localUser} />,
    );
    await openGenerator(restored);
    expect(screen.getByRole('combobox', { name: '模型' }).value).toBe('star-video2');
    expect(screen.getByRole('textbox', { name: '提示词' }).value).toBe(
      '固定镜头，观察海面上的日落',
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    const restoredPopup = screen.getByRole('dialog', { name: '生成参数' });
    expect(
      within(restoredPopup).getByRole('slider', { name: '视频时长' }).getAttribute('aria-valuenow'),
    ).toBe('12');
    expect(
      within(within(restoredPopup).getByRole('group', { name: '清晰度' }))
        .getByRole('button', {
          name: '1080P',
          exact: true,
        })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('validates an empty prompt and preserves a valid prompt while reporting the disconnected generation service', async () => {
    const projectId = 'generator-validation';
    const toast = vi.fn();
    seedGenerator(projectId, 'star-video2');
    const page = render(
      <NodeCanvas path={`/canvas?projectId=${projectId}`} user={localUser} toast={toast} />,
    );
    await openGenerator(page);
    fireEvent.click(screen.getByRole('button', { name: /生成 积分/ }));
    expect(toast).toHaveBeenLastCalledWith('请输入提示词或添加参考素材');
    expect(screen.getByText('请输入提示词或添加参考素材')).toBeTruthy();
    expect(toast).not.toHaveBeenCalledWith('生成服务未连接，暂时无法生成');
    fireEvent.change(screen.getByRole('textbox', { name: '提示词' }), {
      target: { value: '一只猫走过街道' },
    });
    expect(screen.queryByText('请输入提示词或添加参考素材')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /生成 积分/ }));
    expect(toast).toHaveBeenLastCalledWith('生成服务未连接，暂时无法生成');
    expect(screen.getByText('生成服务未连接，提示词已保留。')).toBeTruthy();
    page.unmount();
    expect(savedGenerator(projectId)).toMatchObject({
      params: { model: 'star-video2', prompt: '一只猫走过街道' },
      generationError: '生成服务未连接，提示词已保留。',
    });
    expect(loadContent.mock.calls.every(([name]) => name === 'models')).toBe(true);
  });
});
