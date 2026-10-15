import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanvasGroupNode } from './CanvasGroupNode.jsx';

const node = {
  id: 'group',
  type: 'group',
  position: { x: 100, y: 200 },
  width: 212,
  height: 172,
  data: {
    name: '分镜组 2 个节点',
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    storyboardManualGridCols: 2,
    storyboardManualGridRows: 2,
    childNodeIds: ['a', 'b'],
  },
};
const nodes = [
  node,
  ...['a', 'b'].map((id) => ({
    id,
    type: 'image',
    parentId: 'group',
    position: { x: 4, y: 4 },
    width: 100,
    height: 80,
    data: { name: id },
  })),
];
const props = (extra = {}) => ({
  node,
  nodes,
  position: node.position,
  selected: [],
  readonly: false,
  ready: true,
  zoom: 1,
  drag: vi.fn(),
  setSelected: vi.fn(),
  onUngroup: vi.fn(),
  onRun: vi.fn(),
  onLayout: vi.fn(),
  onStoryboardSlotClick: vi.fn(),
  ...extra,
});
afterEach(() => vi.useRealTimers());
const controlsProps = (extra = {}) =>
  props({
    controlsVisible: true,
    controlsAnchor: { x: 400, y: 250 },
    controlsPortal: document.body,
    controlsDocumentKey: 'canvas:A',
    onGroupCommand: vi.fn(),
    ...extra,
  });

describe('standalone storyboard group surface', () => {
  it.each([
    { data: { name: '普通组' }, allowed: true },
    { data: { name: '普通视频组', storyboardGroupType: 'video' }, allowed: true },
    { data: { name: '角色组', characterAsset: { roleName: '角色' } }, allowed: true },
    {
      data: { name: '脚本图片组', sourceScriptNodeId: 'script', storyboardGroupType: 'image' },
      allowed: true,
    },
    {
      data: { name: '脚本视频组', sourceScriptNodeId: 'script', storyboardGroupType: 'video' },
      allowed: false,
    },
    { data: node.data, allowed: false },
    { data: { ...node.data, standaloneStoryboardImageGrid: 'true' }, allowed: false },
  ])('applies the exact ordinary resizer subtype gates for $data.name', ({ data, allowed }) => {
    const group = { ...node, data };
    const options = props({
      node: group,
      selected: ['group'],
      resizeVisible: true,
      onResizeStart: vi.fn(),
    });
    const view = render(<CanvasGroupNode {...options} />);
    expect(view.container.querySelectorAll('[data-group-resize-direction]')).toHaveLength(
      allowed ? 8 : 0,
    );
    if (!allowed) return;
    const handle = screen.getByRole('button', { name: '调整分组大小 右下角' });
    fireEvent.pointerDown(handle, { pointerId: 61, button: 0 });
    expect(options.onResizeStart).toHaveBeenCalledTimes(1);
    expect(options.onResizeStart.mock.calls[0].slice(1)).toEqual(['group', 'bottom-right']);
    fireEvent.click(handle);
    expect(options.drag).not.toHaveBeenCalled();
    expect(options.setSelected).not.toHaveBeenCalled();
  });

  it('uses the owner visibility gate independently of toolbar/editing and hides resizers in readonly', () => {
    const ordinary = { ...node, data: { name: '普通组' } };
    const options = controlsProps({
      node: ordinary,
      selected: ['group'],
      resizeVisible: false,
      onResizeStart: vi.fn(),
    });
    const view = render(<CanvasGroupNode {...options} />);
    expect(view.container.querySelector('[data-group-resize-direction]')).toBeNull();
    view.rerender(<CanvasGroupNode {...options} resizeVisible controlsVisible={false} />);
    expect(view.container.querySelectorAll('[data-group-resize-direction]')).toHaveLength(8);
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分组' }));
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(view.container.querySelectorAll('[data-group-resize-direction]')).toHaveLength(8);
    view.rerender(<CanvasGroupNode {...options} resizeVisible readonly />);
    expect(view.container.querySelector('[data-group-resize-direction]')).toBeNull();
  });

  it.each([{ ready: false }, { groupControlBusy: true }])(
    'disables visible resize gestures while locally unavailable: %j',
    (patch) => {
      const ordinary = { ...node, data: { name: '普通组' } };
      const options = props({
        node: ordinary,
        selected: ['group'],
        resizeVisible: true,
        onResizeStart: vi.fn(),
        ...patch,
      });
      render(<CanvasGroupNode {...options} />);
      const handle = screen.getByRole('button', { name: '调整分组大小 左上角' });
      expect(handle.disabled).toBe(true);
      fireEvent.pointerDown(handle, { pointerId: 62, button: 0 });
      expect(options.onResizeStart).not.toHaveBeenCalled();
      expect(options.drag).not.toHaveBeenCalled();
    },
  );

  it('uses measured-only ordinary geometry for the shell, matching the viewport anchor adapter', () => {
    const ordinary = {
      ...node,
      width: undefined,
      height: undefined,
      measured: { width: 600, height: 420 },
      data: { name: '旧文档组' },
    };
    const view = render(<CanvasGroupNode {...controlsProps({ node: ordinary, zoom: 0.5 })} />);
    const shell = screen.getByRole('article');
    expect(shell.style.width).toBe('600px');
    expect(shell.style.height).toBe('420px');
    expect(view.container.querySelector('.cv-group-external-title').style.maxWidth).toBe('300px');
    expect(screen.getByRole('toolbar', { name: '分组操作' })).toBeTruthy();
  });

  it.each(['true', 1])(
    'does not downgrade an invalid truthy standalone flag %s to dead General commands',
    (flag) => {
      const declared = { ...node, data: { ...node.data, standaloneStoryboardImageGrid: flag } };
      const options = controlsProps({ node: declared });
      const view = render(<CanvasGroupNode {...options} />);
      expect(screen.queryByRole('toolbar')).toBeNull();
      expect(view.container.querySelector('.cv-storyboard-grid-slot')).toBeNull();
      expect(screen.getByRole('article').style.background).toBe(
        'var(--storyboard-group-shell-bg, #212121)',
      );
      expect(options.onGroupCommand).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      subtype: 'image',
      version: 'v1',
      label: '重新生成',
      shell: 'var(--canvas-group-bg, #ffffff1a)',
    },
    {
      subtype: 'video',
      version: 'v1',
      label: '重新生成',
      shell: 'var(--storyboard-group-shell-bg, #212121)',
    },
    {
      subtype: 'image',
      version: 'v2',
      label: '整组执行',
      shell: 'var(--canvas-group-bg, #ffffff1a)',
    },
    {
      subtype: 'video',
      version: 'v2',
      label: '整组执行',
      shell: 'var(--storyboard-group-shell-bg, #212121)',
    },
  ])(
    'renders the linked $subtype/$version General source branch without ordinary toolbox actions',
    ({ subtype, version, label, shell }) => {
      const linked = {
        ...node,
        data: {
          name: '脚本关联组',
          sourceScriptNodeId: 'script',
          sourceScriptVersion: version,
          storyboardGroupType: subtype,
          taskInfo: { running: true },
        },
      };
      const options = controlsProps({ node: linked });
      const view = render(<CanvasGroupNode {...options} />);
      const toolbar = screen.getByRole('toolbar', { name: '分组操作' });
      expect(within(toolbar).getByRole('button', { name: label })).toBeTruthy();
      expect(screen.queryByRole('button', { name: '添加到工具箱' })).toBeNull();
      expect(screen.queryByRole('button', { name: '转分镜组' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^停止/ })).toBeNull();
      expect(screen.getByRole('article').style.background).toBe(shell);
      fireEvent.click(within(toolbar).getByRole('button', { name: label }));
      expect(options.onRun).toHaveBeenCalledExactlyOnceWith('group');
      view.rerender(
        <CanvasGroupNode
          {...options}
          groupServiceState={{ running: true, pipelineProgress: '3/6' }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: '停止 (3/6)' }));
      expect(options.onRun).toHaveBeenCalledTimes(2);
    },
  );

  it('derives the v2 cue from current direct-child URLs and not other groups or task flags', () => {
    const linked = {
      ...node,
      data: { name: '新组', sourceScriptNodeId: 'script', sourceScriptVersion: 'v2' },
    };
    const currentNodes = [
      linked,
      { ...nodes[1], data: { url: ['  ', null], isTaskFinished: true } },
      { ...nodes[2], parentId: 'other', data: { url: ['https://example.test/other.png'] } },
    ];
    const options = controlsProps({ node: linked, nodes: currentNodes });
    const view = render(<CanvasGroupNode {...options} />);
    const run = screen.getByRole('button', { name: '整组执行' });
    expect(run.querySelector('.cv-general-group-hand-cue')).toBeTruthy();
    view.rerender(
      <CanvasGroupNode
        {...options}
        nodes={[linked, { ...nodes[1], data: { url: ['https://example.test/current.png'] } }]}
      />,
    );
    expect(run.querySelector('.cv-general-group-hand-cue')).toBeNull();
    view.rerender(
      <CanvasGroupNode
        {...options}
        nodes={[linked, { ...nodes[1], data: { url: 'https://example.test/current.png' } }]}
      />,
    );
    expect(run.querySelector('.cv-general-group-hand-cue')).toBeNull();
  });

  it('keeps character assets in the General branch and delegates only valid ordinary conversion', () => {
    const ordinary = { ...node, data: { characterAsset: { roleName: '角色一' } } };
    const options = controlsProps({ node: ordinary });
    const view = render(<CanvasGroupNode {...options} />);
    expect(screen.getByRole('article').getAttribute('aria-label')).toBe('角色一');
    const convert = screen.getByRole('button', { name: '转分镜组' });
    expect(convert.disabled).toBe(false);
    fireEvent.click(convert);
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'convertToStoryboard',
    });
    view.rerender(
      <CanvasGroupNode {...options} nodes={[ordinary, { ...nodes[1], type: 'text' }]} />,
    );
    expect(convert.disabled).toBe(true);
    view.rerender(<CanvasGroupNode {...options} nodes={[ordinary]} />);
    expect(convert.disabled).toBe(true);
    view.rerender(<CanvasGroupNode {...options} controlsVisible={false} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('allows ordinary title drag before editing and trims one inline rename with source screen geometry', async () => {
    const ordinary = {
      ...node,
      measured: { width: 450, height: 172 },
      data: { name: '普通组', groupColor: '#E74C3C' },
    };
    const options = controlsProps({ node: ordinary, zoom: 0.5 });
    const view = render(<CanvasGroupNode {...options} />);
    const title = screen.getByRole('button', { name: '重命名分组' });
    expect(title.classList.contains('cv-group-title-label')).toBe(true);
    const surface = view.container.querySelector('.cv-group-external-title');
    expect(surface.style.maxWidth).toBe('225px');
    expect(surface.style.transform).toBe('scale(2)');
    expect(surface.style.height).toBe('24px');
    fireEvent.pointerDown(title, { pointerId: 51, button: 0 });
    expect(options.drag).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(title);
    const input = screen.getByRole('textbox', { name: '分组名称' });
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.pointerDown(input, { pointerId: 52, button: 0 });
    expect(options.drag).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: '  新普通组  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'rename',
      value: '新普通组',
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('article'));
  });

  it('isolates ordinary menus and rename across same-ID document transitions and readonly changes', () => {
    const ordinary = { ...node, data: { name: '普通组' } };
    const options = controlsProps({ node: ordinary });
    const view = render(<CanvasGroupNode {...options} />);
    fireEvent.click(screen.getByRole('button', { name: '分组颜色' }));
    const oldItem = screen.getByRole('menuitem', { name: '分组颜色 #E74C3C' });
    view.rerender(<CanvasGroupNode {...options} controlsDocumentKey="canvas:B" />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(oldItem);
    view.rerender(<CanvasGroupNode {...options} />);
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分组' }));
    const oldInput = screen.getByRole('textbox');
    fireEvent.change(oldInput, { target: { value: '迟到编辑' } });
    view.rerender(<CanvasGroupNode {...options} readonly />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.blur(oldInput);
    view.rerender(<CanvasGroupNode {...options} />);
    expect(options.onGroupCommand).not.toHaveBeenCalled();
  });

  it('renders actual empty slots inside the source shell and places the screen-sized title above it', () => {
    const options = props({ zoom: 0.25 });
    const before = structuredClone(nodes);
    const view = render(<CanvasGroupNode {...options} />);
    const article = screen.getByRole('article', { name: '分镜组 2 个节点' });
    expect(article.classList.contains('cv-storyboard-grid-node')).toBe(true);
    expect(article.dataset.storyboardGroupType).toBe('image');
    expect(article.style.background).toBe('var(--storyboard-group-shell-bg, #212121)');
    const title = view.container.querySelector('.cv-storyboard-grid-title');
    expect(title.style.position).toBe('absolute');
    expect(title.style.bottom).toBe('calc(100% + 8px)');
    expect(title.style.transform).toBe('scale(4)');
    expect(title.style.transformOrigin).toBe('bottom left');
    expect(title.style.padding).toBe('0px');
    expect(title.style.maxWidth).toBe('53px');
    expect(title.querySelector('svg')).toBeNull();
    const slots = screen.getAllByRole('button');
    expect(slots).toHaveLength(2);
    expect(slots.map((button) => button.dataset.storyboardSlot)).toEqual(['2', '3']);
    expect(slots[0].style.left).toBe('4px');
    expect(slots[0].style.top).toBe('88px');
    expect(slots[0].style.width).toBe('100px');
    expect(slots[0].style.height).toBe('80px');
    expect(slots[0].textContent).toBe('+');
    expect(nodes).toEqual(before);
    expect(options.setSelected).not.toHaveBeenCalled();
  });

  it('honors stored shell background/border and presents ordinary titles outside the source shell', () => {
    const custom = {
      ...node,
      width: undefined,
      height: undefined,
      measured: { width: 212, height: 172 },
      style: { background: '#123456', border: '2px solid red' },
    };
    const options = props({ node: custom });
    const view = render(<CanvasGroupNode {...options} />);
    const article = screen.getByRole('article');
    expect(article.style.width).toBe('212px');
    expect(article.style.height).toBe('172px');
    expect(article.style.background).toBe('rgb(18, 52, 86)');
    expect(article.style.border).toBe('2px solid red');
    view.rerender(<CanvasGroupNode {...options} node={{ ...node, data: { name: '普通组' } }} />);
    expect(screen.getByRole('article').classList.contains('cv-storyboard-grid-node')).toBe(false);
    expect(view.container.querySelector('.cv-group-title').style.position).toBe('absolute');
    expect(view.container.querySelector('.cv-group-title svg')).toBeNull();
    expect(view.container.querySelector('.cv-storyboard-grid-slot')).toBeNull();
    expect(screen.getByRole('article').style.background).toBe('var(--canvas-group-bg, #ffffff1a)');
  });

  it('selects the group and delegates the exact slot and stable opener while suppressing group drag', () => {
    const options = props();
    render(<CanvasGroupNode {...options} />);
    const slot = screen.getByRole('button', { name: '向分镜组第 3 格添加图片' });
    fireEvent.pointerDown(slot, { pointerId: 1 });
    fireEvent.mouseDown(slot);
    fireEvent.click(slot);
    expect(options.drag).not.toHaveBeenCalled();
    expect(options.setSelected).toHaveBeenCalledExactlyOnceWith(['group']);
    expect(options.onStoryboardSlotClick).toHaveBeenCalledExactlyOnceWith('group', 2, slot);
  });

  it.each([{ ready: false }, { onStoryboardSlotClick: undefined }])(
    'keeps the visual empty slots disabled when their action is unavailable',
    (patch) => {
      const options = props(patch);
      render(<CanvasGroupNode {...options} />);
      const slot = screen.getByRole('button', { name: '向分镜组第 3 格添加图片' });
      expect(slot.disabled).toBe(true);
      fireEvent.pointerDown(slot, { pointerId: 1 });
      fireEvent.click(slot);
      expect(options.drag).not.toHaveBeenCalled();
      if (options.onStoryboardSlotClick)
        expect(options.onStoryboardSlotClick).not.toHaveBeenCalled();
    },
  );

  it('hides insertion controls in readonly while keeping the source title and shell', () => {
    const view = render(<CanvasGroupNode {...props({ readonly: true, selected: ['group'] })} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(view.container.querySelector('.cv-storyboard-grid-title')).toBeTruthy();
    expect(view.container.querySelector('.cv-group-toolbar')).toBeNull();
  });

  it('delegates ordinary group actions from the screen-sized source toolbar and guards readiness', () => {
    const ordinary = { ...node, data: { name: '普通组' } };
    const options = controlsProps({ node: ordinary, selected: ['group'], zoom: 0.5 });
    const view = render(<CanvasGroupNode {...options} />);
    const toolbar = screen.getByRole('toolbar', { name: '分组操作' });
    expect(toolbar.style.transform).toBe('');
    expect(view.container.contains(toolbar)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '分组布局' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '宫格排列' }));
    fireEvent.click(screen.getByRole('button', { name: '整组执行' }));
    fireEvent.click(screen.getByRole('button', { name: '解组' }));
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'layout',
      mode: 'grid',
    });
    expect(options.onRun).toHaveBeenCalledExactlyOnceWith('group');
    expect(options.onUngroup).toHaveBeenCalledExactlyOnceWith('group');
    view.rerender(<CanvasGroupNode {...options} ready={false} />);
    expect(screen.getByRole('button', { name: '分组布局' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '整组执行' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '解组' }).disabled).toBe(true);
  });

  it('shows aggregate incoming hover colors on empty slots and removes them without persisting graph state', () => {
    const options = props();
    const view = render(<CanvasGroupNode {...options} storyboardHoverCount={1} />);
    const slot = screen.getByRole('button', { name: '向分镜组第 3 格添加图片' });
    expect(slot.dataset.storyboardHover).toBe('true');
    expect(slot.style.background).toBe('var(--cv-storyboard-slot-current-bg, #5DDCFF1F)');
    expect(slot.style.color).toBe('var(--cv-storyboard-slot-current-color, #5DDCFF)');
    expect(
      screen.getByRole('button', { name: '向分镜组第 4 格添加图片' }).dataset.storyboardHover,
    ).toBeUndefined();
    view.rerender(<CanvasGroupNode {...options} storyboardHoverCount={0} zoom={2} />);
    expect(screen.getByRole('button', { name: '向分镜组第 3 格添加图片' })).toBe(slot);
    expect(slot.dataset.storyboardHover).toBeUndefined();
    expect(slot.style.background).toBe('var(--cv-storyboard-slot-current-bg, #FFFFFF0D)');
    expect(view.container.querySelector('.cv-storyboard-grid-title').style.bottom).toBe(
      'calc(100% + 4px)',
    );
    expect(node.data).not.toHaveProperty('storyboardMultiDragHoverCount');
  });

  it('does not invoke insertion after the pointer owner suppresses its compatibility click', () => {
    const options = props({ shouldSuppressClick: vi.fn(() => true) });
    render(<CanvasGroupNode {...options} />);
    fireEvent.click(screen.getByRole('button', { name: '向分镜组第 3 格添加图片' }));
    expect(options.onStoryboardSlotClick).not.toHaveBeenCalled();
    expect(options.setSelected).not.toHaveBeenCalled();
  });

  it('renders the dedicated standalone toolbar for the supplied single-selection gate', () => {
    const options = controlsProps({
      selected: ['a'],
      nodes: [node, { ...nodes[1], data: { params: { settings: { ratio: '4:3' } } } }, nodes[2]],
    });
    const view = render(<CanvasGroupNode {...options} />);
    const toolbar = screen.getByRole('toolbar', { name: '分镜组操作' });
    expect(within(toolbar).getByRole('button', { name: '4:3' })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: '宫格 2×2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '整组执行' })).toBeNull();
    expect(view.container.querySelector('.cv-group-toolbar')).toBeNull();
    fireEvent.click(within(toolbar).getByRole('button', { name: '序号' }));
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'toggleShotNumbers',
    });
    expect(options.drag).not.toHaveBeenCalled();
    view.rerender(<CanvasGroupNode {...options} controlsVisible={false} />);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('renders the script-linked standalone source branch with locked ratio and fixed regeneration', () => {
    const options = controlsProps({
      node: {
        ...node,
        data: { ...node.data, sourceScriptNodeId: 'script', sourceScriptVersion: 'v2' },
      },
    });
    render(<CanvasGroupNode {...options} />);
    expect(screen.getByRole('toolbar', { name: '分镜组操作' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '16:9' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '转普通组' })).toBeNull();
    expect(screen.queryByText('整组执行')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));
    expect(options.onRun).toHaveBeenCalledExactlyOnceWith('group');
  });

  it('hides readonly controls and disables mutation commands before readiness or while busy', () => {
    const options = controlsProps();
    const view = render(<CanvasGroupNode {...options} readonly />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('button', { name: '重命名分镜组' })).toBeNull();
    view.rerender(<CanvasGroupNode {...options} ready={false} />);
    expect(screen.getByRole('button', { name: '清空' }).disabled).toBe(true);
    view.rerender(<CanvasGroupNode {...options} groupControlBusy />);
    expect(screen.getByRole('toolbar').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: '解组' }).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '重命名分镜组' })).toBeNull();
    expect(options.onGroupCommand).not.toHaveBeenCalled();
  });

  it('renames inline once, trims the name and restores the group after Enter', async () => {
    vi.useFakeTimers();
    const options = controlsProps();
    render(<CanvasGroupNode {...options} />);
    const title = screen.getByRole('button', { name: '重命名分镜组' });
    fireEvent.doubleClick(title);
    const input = screen.getByRole('textbox', { name: '分镜组名称' });
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(node.data.name.length);
    expect(screen.queryByRole('toolbar')).toBeNull();
    fireEvent.change(input, { target: { value: '  新分镜组  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'rename',
      value: '新分镜组',
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(screen.getByRole('article'));
    expect(screen.queryByRole('toolbar')).toBeNull();
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByRole('toolbar')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('toolbar')).toBeTruthy();
    expect(options.drag).not.toHaveBeenCalled();
  });

  it('bubbles non-editing title pointerdown into group drag and blocks it only inside the name input', () => {
    const options = controlsProps();
    render(<CanvasGroupNode {...options} />);
    const title = screen.getByRole('button', { name: '重命名分镜组' });
    fireEvent.pointerDown(title, { pointerId: 41, clientX: 180, clientY: 190, button: 0 });
    expect(options.drag).toHaveBeenCalledTimes(1);
    const [event, dragged] = options.drag.mock.calls[0];
    expect(event.target).toBe(title);
    expect(dragged).toBe(node);
    fireEvent.doubleClick(title);
    const input = screen.getByRole('textbox', { name: '分镜组名称' });
    fireEvent.pointerDown(input, { pointerId: 42, clientX: 180, clientY: 190, button: 0 });
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    expect(options.drag).toHaveBeenCalledTimes(1);
    expect(options.setSelected).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'empty'])('cancels inline rename without changing the graph: %s', (kind) => {
    const options = controlsProps();
    render(<CanvasGroupNode {...options} />);
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分镜组' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: kind === 'empty' ? '   ' : '不要保存' } });
    fireEvent.keyDown(input, { key: kind === 'empty' ? 'Enter' : 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(node.data.name)).toBeTruthy();
    expect(options.onGroupCommand).not.toHaveBeenCalled();
  });

  it('does not commit a composition Enter and commits a later final Enter', () => {
    const options = controlsProps();
    render(<CanvasGroupNode {...options} />);
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分镜组' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文名称' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(screen.getByRole('textbox')).toBe(input);
    expect(options.onGroupCommand).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'rename',
      value: '中文名称',
    });
  });

  it('commits on outside blur while preserving the new focus', async () => {
    const options = controlsProps();
    render(
      <>
        <CanvasGroupNode {...options} />
        <button>画布外操作</button>
      </>,
    );
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分镜组' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '失焦名称' } });
    const outside = screen.getByRole('button', { name: '画布外操作' });
    act(() => outside.focus());
    await act(async () => {
      await Promise.resolve();
    });
    expect(options.onGroupCommand).toHaveBeenCalledExactlyOnceWith('group', {
      type: 'rename',
      value: '失焦名称',
    });
    expect(document.activeElement).toBe(outside);
  });

  it.each(['document', 'readonly', 'ready', 'externalRename'])(
    'isolates an old rename draft after its owner changes: %s',
    (change) => {
      const options = controlsProps();
      const view = render(<CanvasGroupNode {...options} />);
      fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分镜组' }));
      const old = screen.getByRole('textbox');
      fireEvent.change(old, { target: { value: '旧文档迟到名称' } });
      const patch =
        change === 'document'
          ? { controlsDocumentKey: 'canvas:B' }
          : change === 'readonly'
            ? { readonly: true }
            : change === 'ready'
              ? { ready: false }
              : { node: { ...node, data: { ...node.data, name: '远端已改名' } } };
      view.rerender(<CanvasGroupNode {...options} {...patch} />);
      expect(screen.queryByRole('textbox')).toBeNull();
      fireEvent.blur(old);
      fireEvent.keyDown(old, { key: 'Enter' });
      view.rerender(<CanvasGroupNode {...options} />);
      expect(options.onGroupCommand).not.toHaveBeenCalled();
    },
  );

  it('destroys open menus across A to B to A document transitions with the same group ID', () => {
    const options = controlsProps();
    const view = render(<CanvasGroupNode {...options} />);
    fireEvent.click(screen.getByRole('button', { name: '16:9' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    view.rerender(<CanvasGroupNode {...options} controlsDocumentKey="canvas:B" />);
    expect(screen.queryByRole('menu')).toBeNull();
    view.rerender(<CanvasGroupNode {...options} />);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(options.onGroupCommand).not.toHaveBeenCalled();
  });

  it('uses the existing source group color as a readable title chip without adding a color action', () => {
    const colored = { ...node, data: { ...node.data, groupColor: '#FF3B30' } };
    const view = render(<CanvasGroupNode {...controlsProps({ node: colored })} />);
    const title = view.container.querySelector('.cv-storyboard-grid-title');
    expect(title.style.height).toBe('24px');
    expect(title.style.fontSize).toBe('12px');
    expect(title.style.backgroundColor).toBe('var(--nt-red-1000, #4e1714)');
    expect(screen.queryByRole('button', { name: /颜色/ })).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: '重命名分镜组' }));
    expect(title.style.height).toBe('');
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
