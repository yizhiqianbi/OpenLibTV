import { createRef, StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import GeneratorFrame from '../generator/GeneratorFrame.jsx';
import { resolveScriptV2Generator } from './script-generator-model.js';
import ScriptV2GeneratorView from './ScriptV2GeneratorView.jsx';

const script = { id: 'script-a', type: 'script-v2', data: {} };
function projection(
  incoming = {},
  params = { model: 'aurora-3-prime', prompt: '描述夜景', count: 3, modeType: 'legacy' },
) {
  return resolveScriptV2Generator({
    node: { ...script, data: { params } },
    nodes: [script],
    edges: [],
    models,
    support: support.items,
    incomingData: { textList: [], imageList: [], videoList: [], audioList: [], ...incoming },
  });
}
const props = (override = {}) => ({
  projection: projection(),
  readonly: false,
  ready: true,
  catalogStatus: 'ready',
  promptRef: createRef(),
  sessionKey: 'doc-a:script-a',
  onModelChange: vi.fn(),
  onPromptChange: vi.fn(() => true),
  onSubmit: vi.fn(() => false),
  onReferenceDelete: vi.fn(),
  onReferenceReorder: vi.fn(),
  onAddReference: vi.fn(),
  ...override,
});
const textbox = () => screen.getByRole('textbox', { name: '提示词' });
const addButton = () => screen.getByRole('button', { name: '添加参考图' });
const submit = () => screen.getByRole('button', { name: '生成分镜脚本' });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('dedicated ScriptV2 generator content view (jsdom)', () => {
  it('uses real script projection and catalog metadata without ordinary settings, count or mode controls', () => {
    const value = props();
    expect(value.projection.valid).toBe(true);
    render(<ScriptV2GeneratorView {...value} />);
    expect(screen.getByTestId('scriptv2-generator-view').dataset.generatorType).toBe('script');
    expect(addButton().textContent).toBe('参考图');
    expect(textbox().textContent).toBe('描述夜景');
    expect(textbox().getAttribute('aria-placeholder')).toBe('描述剧情片段、故事，为你生成分镜脚本');
    expect(screen.getByRole('button', { name: '选择生成模型' }).textContent).toBe('GVLM 3.1');
    expect(screen.queryByRole('button', { name: /高级|参数设置|模式/ })).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(value.projection.params.count).toBe(3);
    expect(value.onPromptChange).not.toHaveBeenCalled();
  });
  it('renders text references before media with source 200-character preview and delete only', () => {
    const text = '剧'.repeat(210);
    const value = props({
      projection: projection({
        textList: [{ nodeId: 'text-a', content: ['  开场  ', '   ', text] }],
        imageList: [{ nodeId: 'image-a', url: '/a.png' }],
      }),
    });
    render(<ScriptV2GeneratorView {...value} />);
    const card = screen.getByTestId('scriptv2-generator-text-reference');
    expect(card.title).toBe(`  开场  \n${text}`.slice(0, 200));
    expect(card.draggable).toBe(false);
    expect(card.querySelector('.cv-script-generator-text-index').textContent).toBe('1');
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).queryByRole('button', { name: /引用|预览/ })).toBeNull();
    const strip = card.closest('.cv-script-generator-reference-strip');
    expect(strip.firstElementChild.contains(card)).toBe(true);
    fireEvent.click(within(card).getByRole('button'));
    expect(value.onReferenceDelete).toHaveBeenCalledExactlyOnceWith('text-a');
    expect(value.onReferenceReorder).not.toHaveBeenCalled();
    expect(textbox().textContent).toBe('描述夜景');
  });
  it.each(['canvas', 'upload', 'assets'])(
    'delegates the %s reference entry without doing file or service I/O',
    async (kind) => {
      const value = props();
      render(<ScriptV2GeneratorView {...value} />);
      await userEvent.setup().click(addButton());
      const items = screen.getAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual([
        '在当前画布中添加参考',
        '本地上传',
        '个人资产库',
      ]);
      fireEvent.click(items[['canvas', 'upload', 'assets'].indexOf(kind)]);
      expect(value.onAddReference).toHaveBeenCalledExactlyOnceWith(kind);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.querySelector('input[type="file"]')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
  it('blocks add entries independently and closes the menu after losing readiness', async () => {
    const value = props({ disabledReferenceActions: { upload: true, assets: true } });
    const view = render(<ScriptV2GeneratorView {...value} />);
    await userEvent.setup().click(addButton());
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.disabled)).toEqual([false, true, true]);
    fireEvent.click(items[1]);
    expect(value.onAddReference).not.toHaveBeenCalled();
    view.rerender(<ScriptV2GeneratorView {...value} ready={false} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(addButton().disabled).toBe(true);
  });
  it('shows only the three source script models and actual icons, then dispatches a model change', async () => {
    const value = props({ asset: (url) => `mapped:${url}` });
    render(<ScriptV2GeneratorView {...value} />);
    const trigger = screen.getByRole('button', { name: '选择生成模型' });
    expect(trigger.querySelector('img').getAttribute('src')).toBe(
      `mapped:${support.items[0].icon}`,
    );
    expect(trigger.querySelector('img').getAttribute('width')).toBe('16');
    await userEvent.setup().click(trigger);
    const menu = screen.getByRole('listbox', { name: '生成模型' });
    const options = within(menu).getAllByRole('option');
    expect(options.map((item) => item.querySelector('strong').textContent)).toEqual(
      support.items.map((item) => item.modelName),
    );
    expect(options[2].querySelector('img').getAttribute('height')).toBe('16');
    fireEvent.click(options[2]);
    expect(value.onModelChange).toHaveBeenCalledExactlyOnceWith('aurora-3-lite');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(value.onPromptChange).not.toHaveBeenCalled();
  });
  it('does not dispatch an already selected or explicitly disabled support model', async () => {
    const actual = projection();
    const value = props({
      projection: {
        ...actual,
        modelList: actual.modelList.map((item, index) =>
          index === 2 ? { ...item, disabled: true, disabledReason: '模型暂不可用' } : item,
        ),
      },
    });
    render(<ScriptV2GeneratorView {...value} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '选择生成模型' }));
    fireEvent.click(screen.getAllByRole('option')[2]);
    fireEvent.click(screen.getAllByRole('option')[0]);
    expect(value.onModelChange).not.toHaveBeenCalled();
  });
  it('uses the shared 150ms prompt protocol and keeps native Space entry away from canvas shortcuts', async () => {
    vi.useFakeTimers();
    const key = vi.fn(),
      value = props();
    render(
      <div onKeyDown={key}>
        <ScriptV2GeneratorView {...value} />
      </div>,
    );
    const editor = textbox();
    editor.focus();
    editor.textContent = '新的故事';
    fireEvent.input(editor, { inputType: 'insertText' });
    expect(fireEvent.keyDown(editor, { key: ' ', code: 'Space' })).toBe(true);
    expect(key).not.toHaveBeenCalled();
    expect(value.onPromptChange).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(150));
    expect(value.onPromptChange).toHaveBeenCalledExactlyOnceWith('新的故事');
  });
  it('inserts an image mention via the real ref without script ghost suggestions', () => {
    const value = props({
      projection: projection(
        { imageList: [{ nodeId: 'image-a', url: '/a.png' }] },
        { model: 'aurora-3-prime', prompt: '' },
      ),
    });
    render(<ScriptV2GeneratorView {...value} />);
    fireEvent.click(screen.getByRole('button', { name: '引用参考素材 1' }));
    expect(value.promptRef.current.getValue()).toBe('{{Image 1}}');
    expect(textbox().querySelector('[data-prompt-token="{{Image 1}}"]')).toBeTruthy();
    expect(textbox().querySelector('[data-mention-suggest]')).toBeNull();
  });
  it('dispatches typed media reorder without rewriting tokens or allowing text drag', () => {
    const value = props({
      projection: projection(
        {
          textList: [{ nodeId: 'text-a', content: ['故事'] }],
          imageList: [
            { nodeId: 'image-a', url: '/a.png' },
            { nodeId: 'image-b', url: '/b.png' },
          ],
        },
        { model: 'aurora-3-prime', prompt: '{{Image 1}} 夜景' },
      ),
    });
    render(<ScriptV2GeneratorView {...value} />);
    const cards = document.querySelectorAll('.cv-inline-reference');
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(cards[0], { dataTransfer });
    fireEvent.drop(cards[1], { dataTransfer });
    expect(value.onReferenceReorder).toHaveBeenCalledExactlyOnceWith('image', [
      'image-b',
      'image-a',
    ]);
    expect(value.promptRef.current.getValue()).toBe('{{Image 1}} 夜景');
    expect(screen.getByTestId('scriptv2-generator-text-reference').draggable).toBe(false);
  });
  it('hides readonly write controls but preserves refs and the copyable prompt', () => {
    const value = props({
      readonly: true,
      projection: projection({
        textList: [{ nodeId: 'text-a', content: ['故事'] }],
        imageList: [{ nodeId: 'image-a', url: '/a.png' }],
      }),
    });
    render(<ScriptV2GeneratorView {...value} />);
    expect(screen.queryByRole('button', { name: '添加参考图' })).toBeNull();
    expect(screen.queryByRole('button', { name: '生成分镜脚本' })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除|引用|选择生成模型/ })).toBeNull();
    expect(textbox().getAttribute('contenteditable')).toBe('false');
    expect(textbox().getAttribute('data-readonly-allow')).toBe('true');
    expect(screen.getByTestId('scriptv2-generator-text-reference')).toBeTruthy();
  });
  it('starts each source typed media badge at one and inserts the matching video token', () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const value = props({
      projection: projection(
        {
          imageList: [{ nodeId: 'image-a', url: '/a.png' }],
          videoList: [{ nodeId: 'video-a', url: '/a.mp4' }],
          audioList: [{ nodeId: 'audio-a', url: '/a.mp3' }],
        },
        { model: 'aurora-3-prime', prompt: '' },
      ),
    });
    const view = render(<ScriptV2GeneratorView {...value} />);
    const cards = document.querySelectorAll('.cv-inline-reference');
    expect(
      [...cards].map((card) => card.querySelector('.cv-inline-reference-index').textContent),
    ).toEqual(['1', '1', '1']);
    fireEvent.click(within(cards[1]).getByRole('button', { name: '引用参考素材 1' }));
    expect(value.promptRef.current.getValue()).toBe('{{Video 1}}');
    expect(textbox().querySelector('[data-prompt-token="{{Video 1}}"]')).toBeTruthy();
    view.unmount();
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });
  it('blocks loading/error writes while keeping catalog retry and preserved prompt reachable', () => {
    const retry = vi.fn(),
      value = props({ catalogStatus: 'loading', onRetryCatalog: retry });
    const view = render(<ScriptV2GeneratorView {...value} />);
    expect(screen.getByRole('status').textContent).toBe('正在加载脚本模型…');
    expect(textbox().textContent).toBe('描述夜景');
    expect(textbox().getAttribute('contenteditable')).toBe('false');
    expect(submit().disabled).toBe(true);
    view.rerender(<ScriptV2GeneratorView {...value} catalogStatus="error" />);
    fireEvent.click(screen.getByRole('button', { name: '重试加载脚本模型' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(value.onPromptChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('原参数已保留');
  });
  it('does not lock pending-save prompt editing and dispatches only save retry without fake success', () => {
    const retry = vi.fn(() => false),
      value = props({ pendingSave: true, onRetrySave: retry, error: '本机保存失败' });
    render(<ScriptV2GeneratorView {...value} />);
    expect(textbox().getAttribute('contenteditable')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '重试保存脚本参数' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('本机保存失败');
    expect(screen.queryByText(/已保存|保存成功/)).toBeNull();
  });
  it('allows valid generation intent to reach its controller without claiming an unconfigured task completed', () => {
    const value = props();
    render(<ScriptV2GeneratorView {...value} />);
    expect(submit().disabled).toBe(false);
    expect(submit().title).toContain('美术风格');
    fireEvent.click(submit());
    expect(value.onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/生成成功|已提交任务/)).toBeNull();
    expect(screen.getByRole('button', { name: '翻译提示词' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '翻译提示词' }).title).toBe('翻译服务尚未接入');
    expect(screen.queryByRole('button', { name: '语音输入' })).toBeNull();
  });
  it('dispatches explicitly injected translate/voice capabilities and honors source required inputs', () => {
    const translate = vi.fn(),
      voice = vi.fn();
    const value = props({
      projection: projection({}, { model: 'aurora-3-prime', prompt: '' }),
      onTranslate: translate,
      voiceAvailable: true,
      onVoiceStart: voice,
    });
    render(<ScriptV2GeneratorView {...value} />);
    expect(submit().disabled).toBe(true);
    fireEvent.click(submit());
    expect(value.onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '翻译提示词' }));
    fireEvent.click(screen.getByRole('button', { name: '语音输入' }));
    expect(translate).toHaveBeenCalledTimes(1);
    expect(voice).toHaveBeenCalledTimes(1);
  });
  it('keeps nested menu Escape in an expanded frame, restores the opener, then closes the shared dialog', async () => {
    const value = props();
    render(
      <GeneratorFrame label="脚本生成器" readonly={false} ready>
        {({ expanded, portalTarget }) => (
          <ScriptV2GeneratorView {...value} expanded={expanded} portalTarget={portalTarget} />
        )}
      </GeneratorFrame>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '展开生成器' }));
    const dialog = screen.getByRole('dialog');
    await user.click(addButton());
    expect(dialog.contains(screen.getByRole('menu'))).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(document.activeElement).toBe(addButton());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('isolates pointer, portal double-click and Space while preserving native button activation and explicit light theme', async () => {
    const pointer = vi.fn(),
      double = vi.fn(),
      key = vi.fn(),
      value = props({ isCanvasLight: true });
    const before = document.documentElement.className;
    render(
      <div onPointerDown={pointer} onDoubleClick={double} onKeyDown={key}>
        <ScriptV2GeneratorView {...value} />
      </div>,
    );
    fireEvent.pointerDown(textbox());
    fireEvent.doubleClick(textbox());
    submit().focus();
    expect(fireEvent.keyDown(submit(), { key: ' ', code: 'Space' })).toBe(true);
    await userEvent.setup().keyboard(' ');
    expect(value.onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(screen.getByRole('button', { name: '选择生成模型' }));
    fireEvent.doubleClick(screen.getByRole('listbox'));
    expect(screen.getByRole('listbox').classList.contains('is-light')).toBe(true);
    expect(pointer).not.toHaveBeenCalled();
    expect(double).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    expect(document.documentElement.className).toBe(before);
  });
  it('does not write during StrictMode replay or from a missing catalog projection', () => {
    const value = props();
    const view = render(
      <StrictMode>
        <ScriptV2GeneratorView {...value} />
      </StrictMode>,
    );
    expect(value.onModelChange).not.toHaveBeenCalled();
    expect(value.onPromptChange).not.toHaveBeenCalled();
    expect(value.onSubmit).not.toHaveBeenCalled();
    view.rerender(<ScriptV2GeneratorView {...value} projection={null} catalogStatus="error" />);
    expect(submit().disabled).toBe(true);
    expect(textbox().getAttribute('contenteditable')).toBe('false');
  });
});
