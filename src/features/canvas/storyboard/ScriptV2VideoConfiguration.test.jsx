import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScriptV2VideoConfiguration from './ScriptV2VideoConfiguration.jsx';
import {
  createScriptV2VideoConfigState,
  changeScriptV2VideoConfigState,
  projectScriptV2VideoConfig,
} from './v2-video-config-model.js';

const rows = [
  {
    id: 'r1',
    hiddenUuid: 'shot-a',
    shotNumber: 1,
    durationSeconds: 5,
    videoMotionPrompt: '角色转身，{{Image 1}} 进入画面',
  },
  {
    id: 'r2',
    hiddenUuid: 'shot-b',
    shotNumber: 2,
    durationSeconds: 10,
    plotDescription: '雨中奔跑',
  },
  { id: 'invalid', shotNumber: 3, durationSeconds: 5, plotDescription: '无 UUID 不进入此弹窗' },
];
const options = [
  { value: 'video-a', label: '视频 A', icon: '/assets/icons/icon-video.svg' },
  { value: 'video-b', label: '视频 B' },
  { value: 'disabled', label: '不可用模型', disabled: true, disabledReason: '该模型暂不可用' },
];
function setup({
  initialOpened = true,
  projection: override = {},
  state: initialState,
  onChange = vi.fn(),
  onConfirm = vi.fn(),
  onClose = vi.fn(),
  ...props
} = {}) {
  let bridge;
  function Harness() {
    const [opened, setOpened] = useState(initialOpened);
    const [state, setState] = useState(
      initialState || {
        config: {
          model: 'video-a',
          modeType: 'mixed2video',
          settings: { ratio: '16:9', resolution: 720, amount: 0.5 },
        },
        selectedHiddenUuids: new Set(['shot-a', 'shot-b']),
        perShotDurations: new Map([
          ['shot-a', 5],
          ['shot-b', 10],
        ]),
      },
    );
    const [currentProps, setProps] = useState(props);
    const [currentRows, setRows] = useState(rows);
    const constraint = override.durationConstraint || { type: 'enum', values: [5, 10] };
    const projection = {
      valid: true,
      options,
      fields: [
        {
          key: 'ratio',
          storedKey: 'ratio',
          ratio: true,
          property: { displayName: '比例', enum: ['16:9', '9:16'] },
          value: state.config.settings.ratio,
        },
        {
          key: 'resolution',
          storedKey: 'resolution',
          property: {
            displayName: '清晰度',
            enum: [
              { value: 720, displayName: '720P' },
              { value: 1080, displayName: '1080P' },
            ],
            batch: false,
            enable: false,
          },
          value: state.config.settings.resolution,
          disabledValues: new Set([720]),
        },
        {
          key: 'amount',
          storedKey: 'amount',
          property: { displayName: '强度', component: 'slider', min: 0, max: 1, step: 0.1 },
          value: state.config.settings.amount,
          override: { max: 0.8 },
        },
      ],
      durationConstraint: constraint,
      durationValidationByRow: new Map(
        currentRows
          .filter((row) => row.hiddenUuid)
          .map((row) => [
            row.hiddenUuid,
            {
              supported:
                constraint.type !== 'enum' ||
                constraint.values.includes(
                  state.perShotDurations.get(row.hiddenUuid) ?? row.durationSeconds,
                ),
              message: `脚本表格为 ${row.durationSeconds}s，请调整后再生成`,
            },
          ]),
      ),
      selectedCount: state.selectedHiddenUuids.size,
      totalCount: currentRows.filter((row) => row.hiddenUuid).length,
      allSelected:
        state.selectedHiddenUuids.size > 0 &&
        state.selectedHiddenUuids.size === currentRows.filter((row) => row.hiddenUuid).length,
      someSelected:
        state.selectedHiddenUuids.size > 0 &&
        state.selectedHiddenUuids.size < currentRows.filter((row) => row.hiddenUuid).length,
      canConfirm: state.selectedHiddenUuids.size > 0,
      ...override,
    };
    bridge = { state, setState, setProps, setOpened, setRows };
    return (
      <>
        <button type="button" onClick={() => setOpened(true)}>
          打开批量生视频
        </button>
        <ScriptV2VideoConfiguration
          opened={opened}
          rows={currentRows}
          state={state}
          projection={projection}
          getPrompt={(row) =>
            (row.videoMotionPrompt || row.plotDescription || '').replace(
              /\{\{Image (\d+)\}\}/g,
              '图片$1',
            )
          }
          onChange={(command) => {
            onChange(command);
            setState((before) => {
              const next = { ...before };
              if (command.type === 'toggleRow' || command.type === 'toggleAll') {
                next.selectedHiddenUuids = new Set(before.selectedHiddenUuids);
                if (command.type === 'toggleAll')
                  next.selectedHiddenUuids =
                    before.selectedHiddenUuids.size === projection.totalCount
                      ? new Set()
                      : new Set(
                          currentRows.filter((row) => row.hiddenUuid).map((row) => row.hiddenUuid),
                        );
                else
                  next.selectedHiddenUuids.has(command.hiddenUuid)
                    ? next.selectedHiddenUuids.delete(command.hiddenUuid)
                    : next.selectedHiddenUuids.add(command.hiddenUuid);
              }
              if (command.type === 'duration')
                next.perShotDurations = new Map(before.perShotDurations).set(
                  command.hiddenUuid,
                  command.value,
                );
              if (command.type === 'model')
                next.config = { ...before.config, model: command.value };
              if (command.type === 'setting')
                next.config = {
                  ...before.config,
                  settings: { ...before.config.settings, [command.field]: command.value },
                };
              return next;
            });
          }}
          onClose={(context) => {
            onClose(context);
            setOpened(false);
          }}
          onConfirm={onConfirm}
          {...currentProps}
        />
      </>
    );
  }
  const view = render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  return { ...view, read: () => bridge, onChange, onConfirm, onClose };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Script v2 source video configuration dialog', () => {
  it('binds the actual pure projection to originalField settings, typed enums and temporary UUID state', () => {
    const context = {
      rows,
      models: {
        default: { video: 'video-a' },
        videoModels: {
          'video-a': {
            properties: {
              modeType: { items: { mixed2video: [1, 4] } },
              ratio_16_9: {
                displayName: '比例',
                originalField: 'ratio',
                default: '16:9',
                enum: ['16:9', '9:16'],
              },
              resolution: {
                displayName: '清晰度',
                default: 720,
                enum: [
                  { value: 720, displayName: '720P' },
                  { value: 1080, displayName: '1080P' },
                ],
              },
              duration: { default: 5, enum: [5, 10] },
              enableSound: { default: 'off' },
            },
            config: { settings: ['ratio_16_9', 'resolution', 'duration', 'enableSound'] },
          },
        },
      },
      support: [{ modelKey: 'video-a', modelName: '视频 A' }],
      referenceDescription: {
        valid: true,
        refCounts: new Map([
          ['shot-a', 1],
          ['shot-b', 2],
        ]),
        assetReadiness: { ready: true },
      },
    };
    let saved;
    const submit = vi.fn();
    function ActualProjection() {
      const [state, setState] = useState(() => createScriptV2VideoConfigState(context).state);
      saved = state;
      return (
        <ScriptV2VideoConfiguration
          opened
          rows={rows}
          state={state}
          projection={projectScriptV2VideoConfig({ state, ...context })}
          onClose={vi.fn()}
          onConfirm={submit}
          onChange={(command) =>
            setState(
              (current) =>
                changeScriptV2VideoConfigState({ state: current, command, ...context }).state,
            )
          }
        />
      );
    }
    render(<ActualProjection />);
    expect(saved.config.settings.enableSound).toBe('on');
    expect(screen.queryByRole('button', { name: 'enableSound' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '比例' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '9:16' }));
    expect(saved.config.settings.ratio).toBe('9:16');
    expect(saved.config.settings.ratio_16_9).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: '清晰度' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '1080P' }));
    expect(saved.config.settings.resolution).toBe(1080);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 1' }));
    expect(saved.selectedHiddenUuids).toEqual(new Set(['shot-b']));
    fireEvent.click(screen.getByRole('button', { name: '确认并创建视频生成器组 (1)' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(rows[0].durationSeconds).toBe(5);
  });
  it('keeps the loading/error dialog visible before its controlled state and projection exist', () => {
    const retry = vi.fn();
    const view = render(
      <ScriptV2VideoConfiguration
        opened
        state={null}
        projection={null}
        rows={rows}
        catalogStatus="loading"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '批量生视频' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('正在加载视频模型…');
    expect(screen.getByRole('button', { name: '确认并创建视频生成器组 (0)' }).disabled).toBe(true);
    view.rerender(
      <ScriptV2VideoConfiguration
        opened
        state={null}
        projection={null}
        rows={rows}
        catalogStatus="error"
        onRetryCatalog={retry}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重试加载视频模型' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('视频模型加载失败');
  });
  it('shows a fallback model without enabling an empty eligible catalogue', () => {
    setup({ projection: { catalogue: { keys: [] }, options: [options[0]], canConfirm: false } });
    expect(screen.getByRole('button', { name: '选择视频模型' }).textContent).toContain('视频 A');
    expect(screen.getByRole('button', { name: '选择视频模型' }).disabled).toBe(true);
    expect(screen.getByText('当前暂无可用的视频模型，批量生视频暂不可用')).toBeTruthy();
  });
  it('shows the source centered modal, all UUID rows and count without v1 fees or a footer cancel', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: '批量生视频' });
    expect(dialog.classList.contains('cv-v2-video-dialog')).toBe(true);
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .map((input) => input.checked),
    ).toEqual([true, true, true]);
    expect(within(dialog).getByText('已选 2/2')).toBeTruthy();
    expect(screen.queryByText('无 UUID 不进入此弹窗')).toBeNull();
    expect(screen.queryByLabelText('预计积分')).toBeNull();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    expect(screen.queryByText('高级设置')).toBeNull();
    expect(screen.getByText('创建空视频生成器节点，生成服务未连接')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并创建视频生成器组 (2)' }).title).toBe(
      '创建空视频生成器节点，生成服务未连接',
    );
  });
  it('controls UUID selection, native indeterminate and all toggling independently of expansion', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 1' }));
    expect(view.read().state.selectedHiddenUuids).toEqual(new Set(['shot-b']));
    expect(screen.getByRole('checkbox', { name: '全选镜头' }).indeterminate).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '展开镜头 2 提示词' }));
    expect(view.read().state.selectedHiddenUuids).toEqual(new Set(['shot-b']));
    fireEvent.click(screen.getByRole('checkbox', { name: '全选镜头' }));
    expect(view.read().state.selectedHiddenUuids).toEqual(new Set(['shot-a', 'shot-b']));
    fireEvent.click(screen.getByRole('checkbox', { name: '全选镜头' }));
    expect(screen.getByText('请先选择镜头')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并创建视频生成器组 (0)' }).disabled).toBe(true);
  });
  it('expands a readonly four-row prompt with real reference captions and never mutates script text', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: '展开镜头 1 提示词' }));
    const input = screen.getByRole('textbox', { name: '镜头 1 视频提示词' });
    expect(input.readOnly).toBe(true);
    expect(input.rows).toBe(4);
    expect(input.value).toBe('角色转身，图片1 进入画面');
    expect(view.onChange).not.toHaveBeenCalled();
    expect(rows[0].videoMotionPrompt).toBe('角色转身，{{Image 1}} 进入画面');
    act(() => view.read().setOpened(false));
    fireEvent.click(screen.getByRole('button', { name: '打开批量生视频' }));
    expect(screen.queryByRole('textbox', { name: '镜头 1 视频提示词' })).toBeNull();
  });
  it('keeps per-shot duration temporary and offers a supported fix for an invalid single-value model', () => {
    const view = setup({
      projection: {
        durationConstraint: { type: 'enum', values: [10] },
        durationFixed: true,
        durationFixedValue: 10,
      },
    });
    expect(screen.getByRole('button', { name: '镜头 1 时长' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: '镜头 2 时长' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '镜头 1 时长' }));
    expect(screen.getByRole('menuitem', { name: '5s' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '10s' }));
    expect(view.onChange).toHaveBeenLastCalledWith({
      type: 'duration',
      hiddenUuid: 'shot-a',
      value: 10,
    });
    expect(view.read().state.perShotDurations.get('shot-a')).toBe(10);
    expect(rows[0].durationSeconds).toBe(5);
    expect(screen.getByRole('button', { name: '镜头 1 时长' }).disabled).toBe(true);
  });
  it('renders actual NumberInput duration controls and finite numeric configuration with overrides', () => {
    const view = setup({
      projection: { durationConstraint: { type: 'slider', min: 2, max: 12, step: 1 } },
    });
    const duration = screen.getByRole('textbox', { name: '镜头 1 时长' });
    expect(duration.value).toBe('5s');
    fireEvent.change(duration, { target: { value: '7s' } });
    expect(view.onChange).toHaveBeenCalledWith({
      type: 'duration',
      hiddenUuid: 'shot-a',
      value: 7,
    });
    const amount = screen.getByRole('textbox', { name: '强度' });
    fireEvent.change(amount, { target: { value: '0.7' } });
    expect(view.onChange).toHaveBeenLastCalledWith({
      type: 'setting',
      field: 'amount',
      value: 0.7,
    });
    expect(view.read().state.config.settings.amount).toBe(0.7);
  });
  it('preserves typed enum values and source normal fields regardless of batch/enable metadata', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: '清晰度' }));
    expect(screen.getByRole('menuitem', { name: '720P' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '1080P' }));
    expect(view.onChange).toHaveBeenLastCalledWith({
      type: 'setting',
      field: 'resolution',
      value: 1080,
    });
    expect(view.read().state.config.settings.resolution).toBe(1080);
    fireEvent.click(screen.getByRole('button', { name: '选择视频模型' }));
    expect(screen.getByRole('menuitem', { name: '不可用模型' }).title).toBe('该模型暂不可用');
    expect(screen.getByRole('menuitem', { name: '不可用模型' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: '视频 B' }));
    expect(view.onChange).toHaveBeenLastCalledWith({ type: 'model', value: 'video-b' });
  });
  it('locks a forced ratio with its source hint', () => {
    setup({
      projection: {
        fields: [
          {
            key: 'ratio',
            storedKey: 'ratio',
            ratio: true,
            ratioLocked: true,
            value: '16:9',
            property: { displayName: '比例', enum: ['16:9'] },
          },
        ],
        ratioHint: '该模型固定为 16:9',
      },
    });
    const button = screen.getByRole('button', { name: '比例' });
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('该模型固定为 16:9');
  });
  it('keeps enum fields as chips even with numeric bounds and omits incomplete or primitive boolean enums', () => {
    setup({
      projection: {
        fields: [
          {
            key: 'boundedEnum',
            storedKey: 'boundedEnum',
            value: 2,
            property: { displayName: '有边界枚举', min: 1, max: 3, enum: [1, 2, 3] },
          },
          {
            key: 'minOnly',
            storedKey: 'minOnly',
            value: 5,
            property: { displayName: '仅最小值', min: 0 },
          },
          {
            key: 'fallback',
            storedKey: 'fallback',
            value: '8',
            property: { displayName: '数值回退', min: 2, max: 10, default: 9 },
          },
          {
            key: 'primitiveBool',
            storedKey: 'primitiveBool',
            value: true,
            property: { displayName: '原始布尔', enum: [true, false] },
          },
          {
            key: 'objectBool',
            storedKey: 'objectBool',
            value: true,
            property: {
              displayName: '对象布尔',
              enum: [
                { value: true, label: '开启' },
                { value: false, label: '关闭' },
              ],
            },
          },
        ],
      },
    });
    expect(screen.getByRole('button', { name: '有边界枚举' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '有边界枚举' })).toBeNull();
    expect(screen.queryByLabelText('仅最小值')).toBeNull();
    expect(screen.getByRole('textbox', { name: '数值回退' }).value).toBe('2');
    expect(screen.queryByLabelText('原始布尔')).toBeNull();
    expect(screen.getByRole('button', { name: '对象布尔' }).textContent).toContain('开启');
  });
  it('uses one shared dialog owner and closes a keyboard menu before Escape closes the dialog', async () => {
    const view = setup({ initialOpened: false });
    const opener = screen.getByRole('button', { name: '打开批量生视频' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '批量生视频' });
    expect(document.activeElement).toBe(dialog);
    const model = screen.getByRole('button', { name: '选择视频模型' });
    model.focus();
    fireEvent.keyDown(model, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: '选择视频模型' });
    expect(dialog.contains(menu)).toBe(true);
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '视频 A' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '视频 B' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(model);
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(model, { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledWith({ restoreFocus: true });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('ignores the backdrop and prevents edits, close and duplicate confirm while busy', () => {
    const view = setup({ busy: true, requiresPortraitAudit: true });
    fireEvent.mouseDown(document.querySelector('.cv-v2-video-overlay'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '关闭批量生视频' }));
    expect(view.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: '选择镜头 1' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '选择视频模型' }).disabled).toBe(true);
    const submit = screen.getByRole('button', { name: '真人校验并创建中' });
    fireEvent.click(submit);
    expect(submit.disabled).toBe(true);
    expect(view.onConfirm).not.toHaveBeenCalled();
  });
  it('leaves eligibility and source warning precedence to projection, with visible errors and retry', () => {
    const retry = vi.fn();
    setup({
      catalogStatus: 'error',
      onRetryCatalog: retry,
      error: '真人审核服务未连接',
      projection: {
        canConfirm: false,
        confirmTooltip: '请先生成所有资产图后再创建视频生成器组',
        overLimitMessage: '镜头 1 的资产参考图过多',
      },
    });
    expect(screen.getByRole('button', { name: '确认并创建视频生成器组 (2)' }).disabled).toBe(true);
    expect(screen.getByText('真人审核服务未连接')).toBeTruthy();
    expect(screen.getByTestId('batch-video-over-ref-limit-banner').textContent).toBe(
      '镜头 1 的资产参考图过多',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试加载视频模型' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('keeps retry-save reachable after catalogue or source eligibility disappears and locks config', () => {
    const view = setup({
      pendingSave: true,
      catalogStatus: 'error',
      projection: { options: [], fields: [], canConfirm: false, selectedCount: 0, totalCount: 0 },
      error: '本地空间不足',
    });
    const retry = screen.getByRole('button', { name: '重试保存视频组' });
    expect(retry.disabled).toBe(false);
    expect(screen.getByRole('button', { name: '选择视频模型' }).disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: '全选镜头' }).disabled).toBe(true);
    fireEvent.click(retry);
    expect(view.onConfirm).toHaveBeenCalledTimes(1);
  });
  it('positions a narrow-screen menu below its trigger and inside the viewport', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.getAttribute('role') === 'menu')
        return { left: 0, top: 0, right: 220, bottom: 140, width: 220, height: 140 };
      return { left: 300, top: 500, right: 380, bottom: 532, width: 80, height: 32 };
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '选择视频模型' }));
    const menu = screen.getByRole('menu', { name: '选择视频模型' });
    expect(menu.style.left).toBe('162px');
    expect(menu.style.top).toBe('536px');
    expect(menu.style.maxWidth).toBe('374px');
    expect(menu.style.maxHeight).toBe('300px');
  });
  it('moves the menu above a bottom-edge trigger without overlapping the trigger', () => {
    vi.stubGlobal('innerHeight', 720);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.getAttribute('role') === 'menu')
        return { left: 0, top: 0, right: 180, bottom: 140, width: 180, height: 140 };
      return { left: 100, top: 660, right: 180, bottom: 692, width: 80, height: 32 };
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '选择视频模型' }));
    expect(screen.getByRole('menu').style.top).toBe('516px');
  });
});
