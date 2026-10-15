import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ScriptAssetsView from './ScriptAssetsView.jsx';
import { planScriptAssetMutation } from './script-assets-model.js';

const initial = () => ({
  nodes: [
    {
      id: 'script',
      type: 'script-v2',
      data: { type: 'script-v2', assets: { characters: [], scenes: [], props: [] }, rows: [] },
    },
    { id: 'image', type: 'image', data: { type: 'image', name: '设定图', url: ['/image.png'] } },
  ],
  edges: [],
});
function Harness({ state = initial(), history, expose, fail = false, onNextStep }) {
  const [graph, setGraph] = useState(state);
  const current = useRef(graph);
  current.current = graph;
  if (expose)
    expose.current = (next) => {
      current.current = next;
      setGraph(next);
    };
  return (
    <ScriptAssetsView
      node={graph.nodes[0]}
      nodes={graph.nodes}
      edges={graph.edges}
      documentKey="document"
      ready
      readonly={false}
      onNextStep={onNextStep}
      getDocument={() => current.current}
      onMutateAsset={(scriptId, command, context) => {
        if (fail || context.signal.aborted || context.expectedNode !== current.current.nodes[0])
          return null;
        const plan = planScriptAssetMutation({
          ...current.current,
          scriptId,
          command,
          now: 1,
          makeId: () => (command.type === 'add' ? 'new-asset' : 'new-edge'),
        });
        if (plan.ok && plan.changed) {
          history?.(plan);
          current.current = plan;
          setGraph(plan);
        }
        return plan;
      }}
    />
  );
}

describe('ScriptV2 prepare-assets workflow', () => {
  it('shows the source empty-assets completion footer and next step without creating assets', async () => {
    const user = userEvent.setup();
    const onNextStep = vi.fn(),
      history = vi.fn();
    render(<Harness history={history} onNextStep={onNextStep} />);
    expect(
      screen.getByText('资产已生成，如再次生成将会覆盖之前的图片/场景/道具等资产'),
    ).toBeTruthy();
    expect(screen.queryByText('暂无资产可生成')).toBeNull();
    await user.click(screen.getByRole('button', { name: '→ 下一步：合成提示词' }));
    expect(onNextStep).toHaveBeenCalledOnce();
    expect(history).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /资产：/ })).toBeNull();
  });
  it('keeps an added pending asset on cancel, then selects a current image in one graph history entry', async () => {
    const user = userEvent.setup();
    const history = vi.fn();
    render(<Harness history={history} />);
    await user.click(screen.getByRole('button', { name: '新增角色' }));
    const picker = screen.getByRole('dialog', { name: '新增角色' });
    await user.click(within(picker).getByRole('button', { name: '关闭' }));
    expect(screen.getByRole('button', { name: '角色资产：，待创建' })).toBeTruthy();
    expect(history).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText('更多操作 角色'));
    await user.click(screen.getByRole('button', { name: '选择图片', exact: true }));
    await user.click(screen.getByRole('button', { name: '选择图片 设定图' }));
    expect(history).toHaveBeenCalledTimes(2);
    expect(history.mock.calls[1][0]).toMatchObject({
      edges: [{ source: 'image', target: 'script' }],
    });
    expect(screen.queryByRole('dialog', { name: '选择图片' })).toBeNull();
    expect(screen.getByRole('button', { name: '角色资产：，已就绪' })).toBeTruthy();
  });

  it('previews rename text, saves description on blur and deletes refs without deleting image or text', async () => {
    const user = userEvent.setup();
    const state = initial();
    state.nodes[0].data.assets.characters = [
      {
        id: 'asset',
        role: 'character',
        name: 'Alice',
        description: 'Old description',
        status: 'ready',
        linkedNodeId: 'image',
        thumbnailUrl: '/image.png',
      },
    ];
    state.nodes[0].data.rows = [
      {
        id: 'row',
        plotDescription: 'Alice walks',
        imageGenerationPrompt: '@Alice',
        characters: [{ characterAssetId: 'asset', characterName: 'Alice' }],
        finalImagePromptEntityRefs: [{ assetId: 'asset', text: 'Alice' }],
      },
    ];
    state.edges = [{ id: 'edge', source: 'image', target: 'script' }];
    const history = vi.fn();
    render(<Harness state={state} history={history} />);
    await user.click(screen.getByRole('button', { name: '角色资产：Alice，已就绪' }));
    const drawer = screen.getByRole('dialog', { name: '编辑角色' });
    const name = within(drawer).getByRole('textbox', { name: '角色名称' });
    await user.clear(name);
    await user.type(name, 'Bob');
    await user.click(within(drawer).getByRole('button', { name: '保存角色名称' }));
    const confirmation = screen.getByRole('dialog', { name: '同步替换分镜文本？' });
    expect(within(confirmation).getByText('Alice walks')).toBeTruthy();
    expect(within(confirmation).getByText('Bob walks')).toBeTruthy();
    await user.click(within(confirmation).getByRole('button', { name: '同步替换并保存' }));
    expect(history.mock.calls[0][0].nodes[0].data.rows[0].imageGenerationPrompt).toBe('@Bob');
    const description = within(drawer).getByRole('textbox', { name: '角色描述' });
    await user.clear(description);
    await user.type(description, 'New description');
    fireEvent.blur(description);
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(history.mock.calls[1][0].nodes[0].data.assets.characters[0].description).toBe(
      'New description',
    );
    await user.click(within(drawer).getByLabelText('更多操作 Bob'));
    await user.click(screen.getByRole('button', { name: '删除', exact: true }));
    const deletion = screen.getByRole('dialog', { name: '删除资产' });
    await user.click(within(deletion).getByRole('radio', { name: /同时从分镜角色列表中移除/ }));
    await user.click(within(deletion).getByRole('button', { name: '删除', exact: true }));
    const result = history.mock.calls[2][0];
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toEqual([]);
    expect(result.nodes[0].data.rows[0]).toMatchObject({
      characters: [],
      plotDescription: 'Bob walks',
      imageGenerationPrompt: '@Bob',
      finalImagePromptEntityRefs: [],
    });
  });

  it('rejects an external description change and preserves the editor draft', async () => {
    const user = userEvent.setup();
    const state = initial();
    state.nodes[0].data.assets.characters = [
      { id: 'asset', role: 'character', name: 'Alice', description: 'Original', status: 'pending' },
    ];
    const expose = { current: null },
      history = vi.fn();
    render(<Harness state={state} history={history} expose={expose} />);
    await user.click(screen.getByRole('button', { name: '角色资产：Alice，待创建' }));
    const description = screen.getByRole('textbox', { name: '角色描述' });
    await user.clear(description);
    await user.type(description, 'My draft');
    const next = {
      ...state,
      nodes: [
        {
          ...state.nodes[0],
          data: {
            ...state.nodes[0].data,
            assets: {
              ...state.nodes[0].data.assets,
              characters: [
                {
                  ...state.nodes[0].data.assets.characters[0],
                  description: 'External',
                  updatedAt: 2,
                },
              ],
            },
          },
        },
        state.nodes[1],
      ],
    };
    act(() => expose.current(next));
    fireEvent.blur(description);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some((element) => element.textContent.includes('资产已被更新')),
      ).toBe(true),
    );
    expect(description.value).toBe('My draft');
    expect(history).not.toHaveBeenCalled();
  });

  it('keeps the selection dialog and reports a rejected graph write', async () => {
    const user = userEvent.setup();
    const state = initial();
    state.nodes[0].data.assets.characters = [
      { id: 'asset', role: 'character', name: 'Alice', status: 'pending' },
    ];
    render(<Harness state={state} fail />);
    await user.click(screen.getByLabelText('更多操作 Alice'));
    await user.click(screen.getByRole('button', { name: '选择图片', exact: true }));
    await user.click(screen.getByRole('button', { name: '选择图片 设定图' }));
    const dialog = screen.getByRole('dialog', { name: '选择图片（Alice）' });
    expect(within(dialog).getByRole('alert').textContent).toBe('资产修改未保存，请重试');
    expect(within(dialog).getByRole('button', { name: '选择图片 设定图' }).disabled).toBe(false);
  });

  it('aborts a pending write when the document changes and ignores its late result', async () => {
    const user = userEvent.setup();
    const state = initial();
    let context, resolve;
    const onMutateAsset = vi.fn((id, command, owner) => {
      context = owner;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const props = {
      node: state.nodes[0],
      nodes: state.nodes,
      edges: [],
      ready: true,
      readonly: false,
      onMutateAsset,
    };
    const view = render(<ScriptAssetsView {...props} documentKey="first" />);
    await user.click(screen.getByRole('button', { name: '新增角色' }));
    expect(context.signal.aborted).toBe(false);
    view.rerender(<ScriptAssetsView {...props} documentKey="second" />);
    expect(context.signal.aborted).toBe(true);
    await act(async () => resolve({ ok: true, assetId: 'late', nodes: state.nodes, edges: [] }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '新增角色' }).disabled).toBe(false);
  });

  it('dismisses the source card menu on outside pointer/focus and lets Escape close it before the drawer', async () => {
    const user = userEvent.setup();
    const state = initial();
    state.nodes[0].data.assets.characters = [
      { id: 'asset', role: 'character', name: 'Alice', status: 'pending' },
    ];
    render(<Harness state={state} />);
    const card = screen.getByRole('button', { name: '角色资产：Alice，待创建' });
    const trigger = within(card).getByLabelText('更多操作 Alice');
    fireEvent.contextMenu(card);
    expect(screen.getByRole('group', { name: '资产卡操作菜单' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group', { name: '资产卡操作菜单' })).toBeNull();
    await user.click(trigger);
    const outside = screen.getByRole('button', { name: '新增场景' });
    act(() => outside.focus());
    expect(screen.queryByRole('group', { name: '资产卡操作菜单' })).toBeNull();
    expect(document.activeElement).toBe(outside);
    await user.click(card);
    const drawer = screen.getByRole('dialog', { name: '编辑角色' });
    const drawerTrigger = within(drawer).getByLabelText('更多操作 Alice');
    fireEvent.keyDown(drawerTrigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('group', { name: '资产卡操作菜单' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('button', { name: '选择图片', exact: true }),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: '资产卡操作菜单' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '编辑角色' })).toBe(drawer);
    expect(document.activeElement).toBe(drawerTrigger);
  });
});
