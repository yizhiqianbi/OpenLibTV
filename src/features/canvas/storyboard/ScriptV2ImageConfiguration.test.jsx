import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from '../../../components/Modal.jsx';
import ScriptV2ImageConfiguration from './ScriptV2ImageConfiguration.jsx';
import {
  buildScriptV2ImageConfirmPayload,
  changeScriptV2ImageConfigState,
  createScriptV2ImageConfigState,
  projectScriptV2ImageConfig,
  reconcileScriptV2ImageConfigState,
} from './v2-image-config-model.js';

function fixture() {
  const properties = {
    modeType: { items: { image2image: [1, 4] } },
    ratio_source: { default: '16:9', originalField: 'aspectRatio', enum: ['16:9', '1:1'] },
    precision: {
      default: 1,
      originalField: 'resolution',
      enum: [
        { value: 1, label: '数值一' },
        { value: '1', label: '文本一' },
        { value: 2, displayName: '数值二' },
      ],
    },
    flag: {
      default: false,
      enum: [
        { value: false, label: '关闭选项' },
        { value: true, label: '开启选项' },
      ],
    },
    single: { default: 'only', enum: ['only'] },
    empty: { default: 'keep', enum: [] },
    quality: { default: 'high', enum: ['high', 'medium'] },
  };
  return {
    rows: [
      {
        id: 'row-b',
        hiddenUuid: 'b',
        shotNumber: 30,
        imageGenerationPrompt: '第一行提示词\n第二行提示词',
      },
      { id: 'row-a', hiddenUuid: 'a', shotNumber: 10, imageGenerationPrompt: '角色看向远方' },
    ],
    models: {
      default: { image: 'alpha' },
      imageModels: {
        alpha: {
          properties,
          config: { settings: ['ratio_source', 'precision', 'flag', 'single', 'empty'] },
        },
        beta: { properties, config: { settings: ['quality'] } },
        object: { properties, config: { settings: { text2image: ['ratio_source'] } } },
        disabled: { properties, config: { settings: ['quality'] } },
      },
    },
    support: [
      { modelKey: 'alpha', modelName: '图片 A', icon: '/source-a.svg' },
      { modelKey: 'beta', modelName: '图片 B' },
      { modelKey: 'object', modelName: '对象设置模型' },
      { modelKey: 'disabled', modelName: '不可用模型', disable: { zh: '暂不可用' } },
    ],
    refCounts: new Map([
      [0, 1],
      [1, 1],
    ]),
  };
}

/** Real pure rules drive this view; this fixture does not replace menu or dialog owners. */
function setup({
  context: initialContext = fixture(),
  initialOpened = true,
  parentDialog = false,
  onChange = vi.fn(),
  onConfirm = vi.fn(),
  onClose = vi.fn(),
  onParentClose = vi.fn(),
  onDoubleClick = vi.fn(),
  onPointerDown = vi.fn(),
  ...initialProps
} = {}) {
  let bridge;
  function Harness() {
    const [context, setContext] = useState(initialContext);
    const [state, setState] = useState(() => createScriptV2ImageConfigState(context).state);
    const [opened, setOpened] = useState(initialOpened);
    const [parentOpened, setParentOpened] = useState(true);
    const [props, setProps] = useState(initialProps);
    const projection = projectScriptV2ImageConfig({ ...context, state });
    bridge = {
      state,
      context,
      projection,
      setProps,
      updateRows(rows) {
        const next = { ...context, rows };
        setContext(next);
        setState((before) => reconcileScriptV2ImageConfigState({ ...next, state: before }).state);
      },
    };
    const children = (
      <>
        <button
          type="button"
          onClick={() => {
            setState(createScriptV2ImageConfigState(context).state);
            setOpened(true);
          }}
        >
          打开分镜图片配置
        </button>
        <ScriptV2ImageConfiguration
          opened={opened}
          rows={context.rows}
          state={state}
          projection={projection}
          onChange={(command) => {
            onChange(command);
            setState(
              (before) =>
                changeScriptV2ImageConfigState({ ...context, state: before, command }).state,
            );
          }}
          onClose={(closeContext) => {
            onClose(closeContext);
            setOpened(false);
          }}
          onConfirm={() => onConfirm(buildScriptV2ImageConfirmPayload({ ...context, state }))}
          {...props}
        />
      </>
    );
    return (
      <div onDoubleClick={onDoubleClick} onPointerDown={onPointerDown}>
        {parentDialog
          ? parentOpened && (
              <Modal
                title="脚本表格编辑器"
                onClose={() => {
                  onParentClose();
                  setParentOpened(false);
                }}
              >
                {children}
              </Modal>
            )
          : children}
      </div>
    );
  }
  const view = render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
  return {
    ...view,
    read: () => bridge,
    onChange,
    onConfirm,
    onClose,
    onParentClose,
    onDoubleClick,
    onPointerDown,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Script v2 image configuration view with real pure rules (jsdom)', () => {
  it('keeps focus on the same UUID row after reordering while selection and expansion remain raw-index based', () => {
    const view = setup();
    const firstRow = view.read().context.rows[0];
    const detail = screen.getByRole('button', { name: '镜头 30 详情' });
    detail.focus();
    fireEvent.click(detail);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 30' }));
    detail.focus();
    act(() => view.read().updateRows([view.read().context.rows[1], firstRow]));
    expect(screen.getByRole('button', { name: '镜头 30 详情' })).toBe(detail);
    expect(document.activeElement).toBe(detail);
    expect(detail.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: '镜头 10 详情' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('checkbox', { name: '选择镜头 30' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: '选择镜头 10' }).checked).toBe(false);
  });

  it('renders source raw shot numbers, all-selected rows and the local empty-generator boundary', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: '分镜批量生图' });
    expect(dialog.classList.contains('cv-v2-image-dialog')).toBe(true);
    expect(screen.getByRole('checkbox', { name: '选择镜头 30' }).checked).toBe(true);
    expect(screen.getByRole('checkbox', { name: '选择镜头 10' }).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: '选择镜头 1' })).toBeNull();
    expect(screen.getByText('已选 2/2')).toBeTruthy();
    expect(
      screen.getByText('会优先使用已生成的角色、场景和道具参考图，让画面更贴合分镜内容'),
    ).toBeTruthy();
    expect(screen.getByText('创建空分镜图生成器；生成服务未连接')).toBeTruthy();
    expect(screen.queryByLabelText('预计积分')).toBeNull();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
    expect(screen.queryByRole('button', { name: '开始生成' })).toBeNull();
  });

  it('controls raw-index selection, indeterminate and expansion independently', () => {
    const view = setup();
    const prompt = screen.getByText('第一行提示词 第二行提示词');
    expect(prompt.title).toBe('第一行提示词\n第二行提示词');
    fireEvent.click(screen.getByRole('button', { name: '镜头 30 详情' }));
    expect(screen.getByRole('button', { name: '镜头 30 详情' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(prompt.hasAttribute('title')).toBe(false);
    expect(view.read().state.selectedIndices).toEqual(new Set([0, 1]));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 10' }));
    expect(view.read().state.selectedIndices).toEqual(new Set([0]));
    expect(view.read().state.expandedIndices).toEqual(new Set([0]));
    expect(screen.getByRole('checkbox', { name: '全选镜头' }).indeterminate).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '全选镜头' }));
    expect(view.read().state.selectedIndices).toEqual(new Set([0, 1]));
    fireEvent.click(screen.getByRole('checkbox', { name: '全选镜头' }));
    expect(screen.getByText('请先选择镜头')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并创建生成器组 (0)' }).disabled).toBe(true);
    expect(view.read().state.expandedIndices).toEqual(new Set([0]));
  });

  it('preserves strict numeric/string menu selection and submits typed values under the schema key', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'precision' }));
    const numeric = screen.getByRole('menuitem', { name: '数值一' });
    const text = screen.getByRole('menuitem', { name: '文本一' });
    expect(numeric.dataset.selected).toBe('true');
    expect(text.dataset.selected).toBe('false');
    fireEvent.click(text);
    expect(view.read().state.config.settings.precision).toBe('1');
    expect(screen.getByRole('button', { name: 'precision' }).textContent).toContain('文本一');
    fireEvent.click(screen.getByRole('button', { name: 'precision' }));
    expect(screen.getByRole('menuitem', { name: '数值一' }).dataset.selected).toBe('false');
    expect(screen.getByRole('menuitem', { name: '文本一' }).dataset.selected).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: '数值二' }));
    expect(view.onChange).toHaveBeenLastCalledWith({
      type: 'setting',
      field: 'precision',
      value: 2,
    });
    fireEvent.click(screen.getByRole('button', { name: 'ratio_source' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '1:1' }));
    fireEvent.click(screen.getByRole('button', { name: 'flag' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '开启选项' }));
    fireEvent.click(screen.getByRole('button', { name: '确认并创建生成器组 (2)' }));
    expect(view.onConfirm).toHaveBeenCalledWith({
      selectedIndices: [0, 1],
      config: {
        model: 'alpha',
        modeType: 'text2image',
        settings: { ratio_source: '1:1', precision: 2, flag: true, single: 'only', empty: 'keep' },
      },
    });
    expect(view.read().state.config.settings).not.toHaveProperty('aspectRatio');
    expect(view.read().state.config.settings).not.toHaveProperty('resolution');
  });

  it('changes the model with real defaults while preserving selection and blocking disabled choices', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 30' }));
    fireEvent.click(screen.getByRole('button', { name: '选择图片模型' }));
    const disabled = screen.getByRole('menuitem', { name: '不可用模型' });
    expect(disabled.disabled).toBe(true);
    expect(disabled.title).toBe('暂不可用');
    fireEvent.click(disabled);
    expect(view.read().state.config.model).toBe('alpha');
    fireEvent.click(screen.getByRole('menuitem', { name: '图片 B' }));
    expect(view.read().state.config).toEqual({
      model: 'beta',
      modeType: 'text2image',
      settings: { quality: 'high' },
    });
    expect(view.read().state.selectedIndices).toEqual(new Set([1]));
    expect(screen.queryByRole('button', { name: 'precision' })).toBeNull();
    expect(screen.getByRole('button', { name: 'quality' }).textContent).toContain('high');
  });

  it('keeps empty and single enum fields as operable chips rather than hiding them', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'empty' }));
    expect(
      screen.getByRole('menu', { name: 'empty' }).querySelectorAll('[role="menuitem"]'),
    ).toHaveLength(0);
    fireEvent.keyDown(screen.getByRole('button', { name: 'empty' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'single' }));
    const only = screen.getByRole('menuitem', { name: 'only' });
    expect(only.disabled).toBe(false);
    fireEvent.click(only);
    expect(view.onChange).toHaveBeenLastCalledWith({
      type: 'setting',
      field: 'single',
      value: 'only',
    });
  });

  it('shows the safe mode-object settings adapter without flattening it into video fields', () => {
    const view = setup();
    fireEvent.click(screen.getByRole('button', { name: '选择图片模型' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '对象设置模型' }));
    expect(screen.getByText('当前模型参数暂不支持编辑，可使用默认值或切换模型。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ratio_source' })).toBeNull();
    expect(screen.getByRole('button', { name: '确认并创建生成器组 (2)' }).disabled).toBe(false);
    expect(view.read().state.config.settings).toEqual({ ratio_source: '16:9' });
  });

  it('keeps no-candidate state visible and refuses a commit instead of adding a fallback model', () => {
    const context = fixture();
    context.refCounts = new Map([
      [0, 9],
      [1, 9],
    ]);
    const view = setup({ context });
    expect(view.read().state.config.model).toBe('alpha');
    expect(screen.getByText('当前暂无支持这些参考图的图片模型，请调整选择或参考图。')).toBeTruthy();
    const submit = screen.getByRole('button', { name: '确认并创建生成器组 (2)' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(view.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '选择图片模型' }));
    expect(within(screen.getByRole('menu')).queryAllByRole('menuitem')).toHaveLength(0);
  });

  it('uses source falsy prompt gating and plot fallback without treating plot as a generation prompt', () => {
    const context = fixture();
    context.rows[0] = {
      ...context.rows[0],
      imageGenerationPrompt: '',
      plotDescription: '剧情回退',
    };
    context.rows[1] = { ...context.rows[1], imageGenerationPrompt: ' ' };
    const view = setup({ context });
    expect(screen.getByText('剧情回退')).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并创建生成器组 (2)' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 30' }));
    expect(view.read().projection.emptyPromptIndices).toEqual([]);
    expect(screen.getByRole('button', { name: '确认并创建生成器组 (1)' }).disabled).toBe(false);
  });

  it('retains raw stale index sets on live row changes and filters payload by current row indices', () => {
    const context = fixture();
    context.rows.push({ id: 'row-c', shotNumber: 50, imageGenerationPrompt: '第三镜头' });
    const view = setup({ context });
    fireEvent.click(screen.getByRole('button', { name: '镜头 50 详情' }));
    act(() => view.read().updateRows(context.rows.slice(0, 2)));
    expect(view.read().state.selectedIndices).toEqual(new Set([0, 1, 2]));
    expect(view.read().state.expandedIndices).toEqual(new Set([2]));
    expect(screen.getByText('已选 3/2')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '选择镜头 50' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认并创建生成器组 (3)' }));
    expect(view.onConfirm.mock.calls[0][0].selectedIndices).toEqual([0, 1]);
  });

  it('resets the real form on a new open while closing does not edit source rows', () => {
    const view = setup();
    const original = structuredClone(view.read().context.rows);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择镜头 30' }));
    fireEvent.click(screen.getByRole('button', { name: '镜头 10 详情' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭分镜批量生图' }));
    expect(view.onClose).toHaveBeenCalledWith({ restoreFocus: true });
    fireEvent.click(screen.getByRole('button', { name: '打开分镜图片配置' }));
    expect(view.read().state.selectedIndices).toEqual(new Set([0, 1]));
    expect(view.read().state.expandedIndices).toEqual(new Set());
    expect(view.read().context.rows).toEqual(original);
  });

  it('closes a nested selector before its image dialog, restores the opener and preserves the parent', async () => {
    const view = setup({ initialOpened: false, parentDialog: true });
    const parent = screen.getByRole('dialog', { name: '脚本表格编辑器' });
    const opener = screen.getByRole('button', { name: '打开分镜图片配置' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '分镜批量生图' });
    expect(document.activeElement).toBe(dialog);
    const model = screen.getByRole('button', { name: '选择图片模型' });
    model.focus();
    fireEvent.keyDown(model, { key: 'ArrowDown' });
    const menu = screen.getByRole('menu', { name: '选择图片模型' });
    expect(dialog.contains(menu)).toBe(true);
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '图片 A' }));
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(within(menu).getByRole('menuitem', { name: '图片 B' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(model);
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(model, { key: 'Escape' });
    expect(view.onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('dialog', { name: '分镜批量生图' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '脚本表格编辑器' })).toBe(parent);
    expect(view.onParentClose).not.toHaveBeenCalled();
  });

  it('ignores interior clicks and closes on the actual backdrop with opener focus restoration', async () => {
    const view = setup({ initialOpened: false });
    const opener = screen.getByRole('button', { name: '打开分镜图片配置' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByText('角色看向远方'));
    expect(view.onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.cv-v2-image-overlay'));
    expect(view.onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('stops portal pointer and double-click events from reaching the canvas ancestor', () => {
    const view = setup();
    const prompt = screen.getByText('角色看向远方');
    fireEvent.pointerDown(prompt);
    fireEvent.doubleClick(prompt);
    expect(view.onPointerDown).not.toHaveBeenCalled();
    expect(view.onDoubleClick).not.toHaveBeenCalled();
    expect(view.onClose).not.toHaveBeenCalled();
  });

  it('keeps loading and error views available before any model state exists and exposes reload', () => {
    const retry = vi.fn();
    const view = render(
      <ScriptV2ImageConfiguration
        opened
        rows={fixture().rows}
        state={null}
        projection={null}
        catalogStatus="loading"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('正在加载图片模型…');
    expect(screen.getByRole('button', { name: '选择图片模型' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '确认并创建生成器组 (0)' }).disabled).toBe(true);
    view.rerender(
      <ScriptV2ImageConfiguration
        opened
        rows={fixture().rows}
        state={null}
        projection={null}
        catalogStatus="error"
        onRetryCatalog={retry}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('图片模型加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重试加载图片模型' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('locks edits and duplicate confirm while busy and ignores all close paths', () => {
    const view = setup({ busy: true });
    fireEvent.click(document.querySelector('.cv-v2-image-overlay'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '关闭分镜批量生图' }));
    fireEvent.click(screen.getByRole('button', { name: '确认并创建生成器组 (2)' }));
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('checkbox', { name: '选择镜头 30' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '镜头 30 详情' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '选择图片模型' }).disabled).toBe(true);
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.onConfirm).not.toHaveBeenCalled();
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it('keeps quota retry-save reachable despite a failed catalogue while locking form mutations', () => {
    const retry = vi.fn();
    const view = setup({
      pendingSave: true,
      catalogStatus: 'error',
      error: '分镜图组已添加，但本机保存失败。释放空间后重试保存。',
      onRetryCatalog: retry,
    });
    expect(screen.getByText('分镜图组已添加，但本机保存失败。释放空间后重试保存。')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '全选镜头' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '选择图片模型' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '重试加载图片模型' }).disabled).toBe(true);
    const save = screen.getByRole('button', { name: '重试保存分镜图组' });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(view.onConfirm).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('applies the explicit light theme only within the image dialog and its selector portal', () => {
    const before = document.documentElement.getAttribute('data-mantine-color-scheme');
    setup({ isCanvasLight: true });
    expect(
      document.querySelector('.cv-v2-image-overlay').classList.contains('cv-v2-image-light'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '选择图片模型' }));
    expect(screen.getByRole('menu').classList.contains('cv-v2-generation-light')).toBe(true);
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe(before);
  });

  it('keeps the selector within a mocked 390px viewport without claiming native layout coverage', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 844);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.getAttribute('role') === 'menu')
        return { left: 0, top: 0, right: 220, bottom: 140, width: 220, height: 140 };
      return { left: 300, top: 500, right: 380, bottom: 532, width: 80, height: 32 };
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '选择图片模型' }));
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('162px');
    expect(menu.style.top).toBe('536px');
    expect(menu.style.maxWidth).toBe('374px');
    expect(menu.style.maxHeight).toBe('300px');
  });
});
