import { useState } from 'react';
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import GeneratorSettings from './GeneratorSettings.jsx';
import { NodeSettingsPanel } from '../components/NodeSettingsPanel.jsx';

function Host({
  schema = models.videoModels['star-video2'],
  initial = {},
  type = 'video',
  voiceSource,
  ...props
}) {
  const [params, setParams] = useState(initial);
  return (
    <>
      <GeneratorSettings
        schema={schema}
        params={params}
        type={type}
        voiceSource={voiceSource}
        inputCounts={{}}
        onChange={setParams}
        {...props}
      />
      <output aria-label="saved params">{JSON.stringify(params)}</output>
    </>
  );
}
const saved = () => JSON.parse(screen.getByLabelText('saved params').textContent);
describe('schema-driven generator settings', () => {
  it('persists a selected bar-only voice as ID plus metadata without discarding advanced decimals', async () => {
    const voice = {
      voiceId: 'qa-voice',
      name: '验收音色',
      language: '中文',
      gender: 'Female',
      voiceUrl: '/voice.mp3',
    };
    const voiceSource = { mode: 'operator', list: async () => ({ list: [voice], total: 1 }) };
    render(
      <Host
        schema={models.audioModels['speech-2.8-hd']}
        type="audio"
        voiceSource={voiceSource}
        initial={{ advancedSettings: { voice_setting_vol: 0.11 } }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '切换音色' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择 验收音色' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull());
    expect(saved().advancedSettings).toMatchObject({
      voice_setting_vol: 0.11,
      voice_setting_voice_id: 'qa-voice',
      _voice_setting_voice_id_meta: voice,
    });
  });
  it('disables an entire locked template parameter UI without inventing prompt or model locks', () => {
    const node = {
      id: 'target',
      type: 'video',
      data: {
        params: { model: 'star-video2', prompt: '描述' },
        extraConfig: {
          scene: 'test',
          models: [{ modelKey: 'star-video2' }],
          schema: { config: false },
        },
      },
    };
    render(
      <NodeSettingsPanel
        activeNode={node}
        nodes={[node]}
        edges={[]}
        models={models}
        update={vi.fn()}
        setPanel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '生成参数' }).disabled).toBe(true);
    expect(screen.getByRole('combobox', { name: '模型' }).disabled).toBe(false);
    expect(screen.getByRole('textbox', { name: '提示词' }).readOnly).toBe(false);
  });

  it('edits actual typed resolution/count/advanced keys, commits a duration once and closes by Escape', () => {
    render(<Host />);
    const trigger = screen.getByRole('button', { name: '生成参数' });
    trigger.focus();
    fireEvent.click(trigger);
    const popup = screen.getByRole('dialog', { name: '生成参数' });
    fireEvent.click(
      within(within(popup).getByRole('group', { name: '清晰度' })).getByRole('button', {
        name: '1080P',
        exact: true,
      }),
    );
    fireEvent.click(
      within(within(popup).getByRole('group', { name: '数量' })).getByRole('button', {
        name: '4',
        exact: true,
      }),
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: '视频时长数值' }), {
      target: { value: '12' },
    });
    expect(saved().settings.duration).toBe(5);
    fireEvent.blur(screen.getByRole('spinbutton', { name: '视频时长数值' }));
    fireEvent.click(screen.getByText('高级设置', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('switch', { name: '联网搜索' }));
    expect(saved()).toMatchObject({
      count: 4,
      settings: { duration: 12, resolution: '1080p' },
      advancedSettings: { search_enabled: 0 },
    });
    fireEvent.keyDown(popup, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '生成参数' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('reveals conditional options and prevents conflicting or invalid source values', () => {
    const view = render(<Host schema={models.videoModels['topaz-video-upscaler']} />);
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(screen.queryByLabelText('帧率')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '补帧模式' }), {
      target: { value: '0' },
    });
    expect(screen.getByRole('combobox', { name: '帧率' })).toBeTruthy();
    view.unmount();
    render(
      <Host
        schema={models.videoModels['MiniMax-Hailuo-2.3']}
        initial={{ modeType: 'text2video', settings: { resolution: '1080P', duration: 6 } }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    const blocked = within(screen.getByRole('group', { name: '视频时长' })).getByRole('button', {
      name: '10s',
    });
    expect(blocked.disabled).toBe(true);
    expect(blocked.title).toMatch(/1080P/);
  });
  it('uses audio mode-specific prompts/fields and keeps readonly controls immutable', () => {
    const update = vi.fn();
    function Panel() {
      const [node, setNode] = useState({
        id: 'music',
        type: 'audio',
        data: { name: '音乐', params: { model: 'mureka-8', prompt: '描述' } },
      });
      return (
        <NodeSettingsPanel
          activeNode={node}
          nodes={[node]}
          edges={[]}
          models={models}
          update={(id, data) => {
            update(id, data);
            setNode({ ...node, data: { ...node.data, ...data } });
          }}
          setPanel={vi.fn()}
        />
      );
    }
    const view = render(<Panel />);
    fireEvent.change(screen.getByRole('combobox', { name: '生成模式' }), {
      target: { value: 'lyrics2audio' },
    });
    expect(screen.getByRole('textbox', { name: '提示词' }).maxLength).toBe(3000);
    expect(update.mock.calls.at(-1)[1].params).toMatchObject({
      modeType: 'lyrics2audio',
      advancedSettings: {},
    });
    view.unmount();
    update.mockClear();
    render(
      <NodeSettingsPanel
        activeNode={{
          id: 'video',
          type: 'video',
          data: { name: '镜头', params: { model: 'star-video2', prompt: '描述' } },
        }}
        nodes={[]}
        edges={[]}
        models={models}
        readonly
        update={update}
        setPanel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '生成参数' }).disabled).toBe(true);
    expect(screen.getByRole('combobox', { name: '模型' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '从资产库添加' }).disabled).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('embeds only eligible batch advanced fields while retaining all ordinary fields and typed store keys', () => {
    const schema = {
      properties: {
        count: [1, 2],
        ordinary: {
          component: 'singleButton',
          displayName: '普通参数',
          batch: false,
          enum: [
            { value: 0, displayName: '零' },
            { value: 2, displayName: '二' },
          ],
          originalField: 'ordinary_value',
        },
        eligible: {
          component: 'switch',
          displayName: '批量参数',
          default: 0,
          batch: true,
          originalField: 'batch_value',
        },
        disabled: { component: 'switch', displayName: '已停用参数', batch: true, enable: false },
        nonBatch: { component: 'switch', displayName: '单图参数', batch: false },
        unmarked: { component: 'switch', displayName: '无批量标记' },
        hidden: { component: 'switch', displayName: '锁定隐藏', batch: true },
        bar: { component: 'switch', displayName: '工具条专用', batch: true, barOnly: true },
      },
      config: {
        settings: ['ordinary'],
        advancedSettings: ['eligible', 'disabled', 'nonBatch', 'unmarked', 'hidden', 'bar'],
      },
    };
    render(
      <Host
        schema={schema}
        embedAdvancedSettings
        embedAdvancedSettingsBatchOnly
        suppressCount
        hidePromptMentionToggle
        locks={{ hiddenKeys: ['hidden'] }}
      />,
    );
    const trigger = screen.getByRole('button', { name: '生成参数' });
    expect(trigger.textContent).not.toContain('个');
    fireEvent.click(trigger);
    const popup = screen.getByRole('dialog', { name: '生成参数' });
    expect(within(popup).queryByText('高级设置', { selector: 'summary' })).toBeNull();
    expect(within(popup).getByRole('region', { name: '高级设置' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: '数量' })).toBeNull();
    expect(screen.queryByRole('switch', { name: '智能引用 AutoLink' })).toBeNull();
    for (const name of ['已停用参数', '单图参数', '无批量标记', '锁定隐藏', '工具条专用'])
      expect(screen.queryByRole('switch', { name })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '二' }));
    fireEvent.click(screen.getByRole('switch', { name: '批量参数' }));
    expect(saved()).toMatchObject({
      settings: { ordinary_value: 2 },
      advancedSettings: { batch_value: 1 },
    });
    fireEvent.keyDown(popup, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('omits an empty embedded advanced section instead of showing a nonfunctional fold', () => {
    render(
      <Host
        schema={{
          properties: { a: { component: 'switch', displayName: '非批量', batch: false } },
          config: { advancedSettings: ['a'] },
        }}
        embedAdvancedSettings
        embedAdvancedSettingsBatchOnly
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(screen.queryByRole('region', { name: '高级设置' })).toBeNull();
    expect(screen.queryByText('高级设置')).toBeNull();
  });

  it('keeps embedded grouped advanced settings in their source group fold without a second outer fold', () => {
    render(
      <Host
        schema={{
          properties: {
            a: { component: 'switch', displayName: '批量开关', batch: true, default: 1 },
          },
          config: {
            advancedSettings: [
              { groupKey: 'checks', displayName: '检查项', collapsible: true, fields: ['a'] },
            ],
          },
        }}
        embedAdvancedSettings
        embedAdvancedSettingsBatchOnly
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(screen.getByText('检查项', { selector: 'summary' }).parentElement.open).toBe(true);
    expect(screen.queryByText('高级设置', { selector: 'summary' })).toBeNull();
    expect(screen.getByRole('switch', { name: '批量开关' }).checked).toBe(true);
  });

  it('uses the source embedded summary order, omits duplicate Auto and excludes invalid duration/count', () => {
    const schema = {
      properties: {
        count: [1, 2],
        ratio: { component: 'singleButton', enum: ['auto'], default: 'auto' },
        resolution: { component: 'singleButton', enum: ['auto'], default: 'auto' },
        duration: { component: 'slider', min: 0, max: 20, step: 0.5, default: 0.5 },
        enableSound: { component: 'singleButton', enum: ['off', 'on'], default: 'off' },
      },
      config: { settings: ['enableSound', 'resolution', 'duration', 'ratio'] },
    };
    render(<Host schema={schema} embedAdvancedSettings suppressCount />);
    expect(screen.getByRole('button', { name: '生成参数' }).textContent).toBe('auto · off');
  });

  it('resets visible embedded batch fields while retaining hidden/non-batch values and unrelated metadata', () => {
    const schema = {
      properties: {
        a: {
          component: 'switch',
          batch: true,
          default: 1,
          displayName: '可重置项',
          originalField: 'visible_a',
        },
        b: { component: 'switch', batch: false, default: 0, displayName: '非批量项' },
        c: { component: 'switch', batch: true, default: 0, displayName: '隐藏项' },
      },
      config: {
        advancedSettings: [{ groupKey: 'checks', fields: ['a', 'b', 'c'], collapsible: true }],
      },
    };
    render(
      <Host
        schema={schema}
        initial={{
          advancedSettings: { visible_a: 0, b: 1, c: 1, _voice_meta: { voiceId: 'retain' } },
        }}
        locks={{ hiddenKeys: ['c'] }}
        embedAdvancedSettings
        embedAdvancedSettingsBatchOnly
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    fireEvent.click(screen.getByRole('button', { name: '一键重置' }));
    expect(saved().advancedSettings).toMatchObject({
      visible_a: 1,
      b: 1,
      c: 1,
      _voice_meta: { voiceId: 'retain' },
    });
  });

  it('anchors embedded settings bottom-start at offset zero while preserving the default popover placement', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        if (this.classList.contains('cv-generator-trigger'))
          return { left: 150, top: 300, bottom: 332, width: 100, height: 32 };
        if (this.classList.contains('cv-generator-popover'))
          return { left: 0, top: 0, bottom: 120, width: 340, height: 120 };
        return original.call(this);
      });
    try {
      const { unmount } = render(<Host embedAdvancedSettings embedAdvancedSettingsBatchOnly />);
      fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
      const embedded = screen.getByRole('dialog', { name: '生成参数' });
      expect(embedded.style.left).toBe('150px');
      expect(embedded.style.top).toBe('332px');
      expect(embedded.style.width).toBe('340px');
      unmount();
      render(<Host />);
      fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
      const ordinary = screen.getByRole('dialog', { name: '生成参数' });
      expect(ordinary.style.left).toBe('30px');
      expect(ordinary.style.top).toBe('180px');
    } finally {
      rect.mockRestore();
    }
  });

  it('retains a source declared zero-capacity image mode for embedded settings without changing generic mode inference', () => {
    const schema = {
      properties: {
        modeType: { items: { singleImage2video: [1, 0] } },
        image: { component: 'singleButton', displayName: '图模式参数', enum: [2, 3], default: 2 },
      },
      config: { settings: ['image'] },
      settingsRules: [
        { forModeTypes: ['singleImage2video'], disable: { image: [2] }, fallback: { image: 3 } },
      ],
    };
    const { unmount } = render(
      <Host schema={schema} initial={{ modeType: 'singleImage2video' }} embedAdvancedSettings />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    expect(
      within(screen.getByRole('group', { name: '图模式参数' })).getByRole('button', { name: '2' })
        .disabled,
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole('group', { name: '图模式参数' })).getByRole('button', { name: '3' }),
    );
    expect(saved()).toMatchObject({ modeType: 'singleImage2video', settings: { image: 3 } });
    unmount();
    render(<Host schema={schema} initial={{ modeType: 'singleImage2video' }} />);
    fireEvent.click(screen.getByRole('button', { name: '生成参数' }));
    const ordinaryOption = within(screen.getByRole('group', { name: '图模式参数' })).getByRole(
      'button',
      { name: '2' },
    );
    expect(ordinaryOption.disabled).toBe(false);
    fireEvent.click(ordinaryOption);
    expect(saved()).toMatchObject({ modeType: 'text2video', settings: { image: 2 } });
  });
});
