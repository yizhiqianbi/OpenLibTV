import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoryboardPanel } from '../components/StoryboardPanel.jsx';
import { StoryboardTable } from './StoryboardTable.jsx';
import { useStoryboardTable } from './useStoryboardTable.js';

const initial = {
  id: 'script',
  type: 'script',
  data: {
    title: '测试脚本',
    rows: [
      {
        id: 'a',
        hiddenUuid: 'ha',
        shotNumber: 1,
        plotDescription: '原画面',
        durationSeconds: 5,
        unknown: { keep: true },
      },
      { id: 'b', hiddenUuid: 'hb', shotNumber: 2, plotDescription: '海边', durationSeconds: 8 },
    ],
    views: [{ id: 'default', type: 'table', extra: true }],
    unknown: 'keep',
  },
};

describe('storyboard surface and controller', () => {
  it('preserves the historical media-only caller, document order and preview node identity', async () => {
    const image = {
      id: 'i',
      type: 'image',
      data: { name: '图片', url: ['/one.webp', '/two.webp'], params: { prompt: '第一行\n第二行' } },
    };
    const video = { id: 'v', type: 'video', data: { name: '视频', url: '/video.mp4' } };
    const setDialog = vi.fn();
    const view = render(
      <StoryboardPanel
        nodes={[video, initial, { id: 'empty', type: 'image', data: { url: [] } }, image]}
        setDialog={setDialog}
        src={(url) => '/mapped' + url}
      />,
    );
    expect(screen.getByText('2 个镜头')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('img', { name: '图片' }).getAttribute('src')).toBe('/mapped/one.webp');
    expect(view.container.querySelector('video').getAttribute('src')).toBe('/mapped/video.mp4');
    expect(screen.getByText('视频').closest('button')).toBe(
      view.container.querySelector('.cv-storyboard-grid button'),
    );
    await userEvent.click(screen.getByRole('button', { name: /图片/ }));
    expect(setDialog).toHaveBeenCalledWith({ preview: image });
  });
  it('retains multiline edits and metadata on failed writes, then retries the same patch once', async () => {
    let rejected = true;
    const save = vi.fn();
    function Host() {
      const [node, setNode] = useState(initial);
      return (
        <StoryboardTable
          node={node}
          readonly={false}
          onChange={(patch) => {
            save(patch);
            if (rejected) throw new Error('容量不足');
            setNode((value) => ({ ...value, data: { ...value.data, ...patch } }));
          }}
        />
      );
    }
    render(<Host />);
    const cell = screen.getByRole('textbox', { name: '画面描述 1' });
    fireEvent.change(cell, { target: { value: '新画面\n第二行' } });
    fireEvent.blur(cell);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('容量不足'),
    );
    expect(cell.value).toBe('新画面\n第二行');
    expect(save.mock.calls[0][0].rows[0]).toMatchObject({
      id: 'a',
      hiddenUuid: 'ha',
      unknown: { keep: true },
      plotDescription: '新画面\n第二行',
    });
    rejected = false;
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  });
  it('retains a failed row draft but refuses retry or continued edits after an asset rename updates rows', async () => {
    const node = {
      ...initial,
      type: 'script-v2',
      data: {
        ...initial.data,
        type: 'script-v2',
        rows: initial.data.rows.map((row) => ({
          ...row,
          characters: [{ characterAssetId: 'person', characterName: '原角色' }],
          finalImagePromptEntityRefs: [{ assetId: 'person', text: '原角色' }],
        })),
        assets: { characters: [{ id: 'person', name: '原角色' }], scenes: [], props: [] },
      },
    };
    const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const props = { node, documentKey: 'doc', readonly: false, onChange: write };
    const hook = renderHook((value) => useStoryboardTable(value), { initialProps: props });
    await act(async () => {
      expect(await hook.result.current.edit('a', 'plotDescription', '保留的草稿')).toBe(false);
    });
    expect(write.mock.calls[0][1].expectedNode).toBe(node);
    const renamed = {
      ...node,
      data: {
        ...node.data,
        rows: node.data.rows.map((row) => ({
          ...row,
          characters: [{ characterAssetId: 'person', characterName: '新角色' }],
          finalImagePromptEntityRefs: [{ assetId: 'person', text: '新角色' }],
        })),
        assets: { ...node.data.assets, characters: [{ id: 'person', name: '新角色' }] },
      },
    };
    hook.rerender({ ...props, node: renamed });
    await act(async () => {
      expect(await hook.result.current.retry()).toBe(false);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(hook.result.current.error).toContain('已在外部更新');
    expect(hook.result.current.rows[0].plotDescription).toBe('保留的草稿');
    await act(async () => {
      expect(await hook.result.current.edit('a', 'plotDescription', '继续输入')).toBe(false);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect(hook.result.current.rows[0].plotDescription).toBe('继续输入');
    expect(hook.result.current.pending).toBe(false);
    expect(renamed.data.rows[0]).toMatchObject({
      plotDescription: '原画面',
      characters: [{ characterName: '新角色' }],
      finalImagePromptEntityRefs: [{ text: '新角色' }],
    });
  });
  it('retries a false write with its original rows baseline despite unrelated configuration changes', async () => {
    const write = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const props = { node: initial, documentKey: 'doc', readonly: false, onChange: write };
    const hook = renderHook((value) => useStoryboardTable(value), { initialProps: props });
    await act(async () => {
      expect(await hook.result.current.edit('a', 'plotDescription', '再次保存')).toBe(false);
    });
    const configured = {
      ...initial,
      data: {
        ...initial.data,
        views: [
          { ...initial.data.views[0], tableConfig: { columnVisibility: { dialogue: false } } },
        ],
        assets: { characters: [], scenes: [{ id: 'scene', name: '新场景' }], props: [] },
      },
    };
    hook.rerender({ ...props, node: configured });
    await act(async () => {
      expect(await hook.result.current.retry()).toBe(true);
    });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toEqual(write.mock.calls[0][0]);
    expect(write.mock.calls[1][1].expectedNode).toBe(configured);
    expect(hook.result.current.error).toBe('');
    expect(hook.result.current.data.views).toBe(configured.data.views);
    expect(hook.result.current.data.assets).toBe(configured.data.assets);
  });
  it('uses hiddenUuid selection across reorder and confirms deletion without changing unrelated rows', async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    function Host() {
      const [node, setNode] = useState(initial);
      return (
        <StoryboardTable
          node={node}
          readonly={false}
          onChange={(patch) => {
            save(patch);
            setNode((value) => ({ ...value, data: { ...value.data, ...patch } }));
          }}
        />
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('checkbox', { name: '选择镜头 1' }));
    await user.click(screen.getByRole('button', { name: '下移镜头 1' }));
    expect(screen.getByRole('checkbox', { name: '选择镜头 2' }).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '删除镜头 2' }));
    const dialog = screen.getByRole('dialog', { name: '删除镜头 2？' });
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(save.mock.calls.at(-1)[0].rows).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: '删除镜头 2' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '删除', exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save.mock.calls.at(-1)[0].rows).toEqual([{ ...initial.data.rows[1], shotNumber: 1 }]);
    expect(screen.getByText('已选 0')).toBeTruthy();
  });
  it('persists filter/view metadata through the controlled caller and closes fields by Escape with focus restoration', async () => {
    const user = userEvent.setup();
    let saved;
    function Host() {
      const [node, setNode] = useState(initial);
      return (
        <StoryboardTable
          node={node}
          readonly={false}
          onChange={(patch) =>
            setNode((value) => {
              saved = { ...value.data, ...patch };
              return { ...value, data: saved };
            })
          }
        />
      );
    }
    render(<Host />);
    const fields = screen.getByRole('button', { name: '字段' });
    await user.click(fields);
    await user.click(
      within(screen.getByRole('dialog', { name: '字段显示' })).getByRole('checkbox', {
        name: '对白',
      }),
    );
    expect(saved.views[0]).toMatchObject({
      extra: true,
      tableConfig: { columnVisibility: { dialogue: false } },
    });
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(fields);
    await user.click(screen.getByRole('button', { name: '筛选' }));
    await user.type(screen.getByRole('textbox', { name: '筛选值' }), '海');
    fireEvent.keyDown(screen.getByRole('textbox', { name: '筛选值' }), {
      key: 'Enter',
      keyCode: 229,
      isComposing: true,
    });
    expect(saved.views[0].tableConfig.columnFilters).toBeUndefined();
    await user.click(screen.getByRole('button', { name: '添加筛选' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: '画面描述 1' })).toBeNull();
    expect(screen.getByRole('textbox', { name: '画面描述 2' }).value).toBe('海边');
  });
  it('cancels delayed old-document completion and resets selection rather than overlaying a new document', async () => {
    let resolve;
    let context;
    const write = vi.fn((_patch, owner) => {
      context = owner;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const props = { node: initial, documentKey: 'one', readonly: false, onChange: write };
    const hook = renderHook((value) => useStoryboardTable(value), { initialProps: props });
    act(() => hook.result.current.toggle('ha'));
    let pending;
    act(() => {
      pending = hook.result.current.edit('a', 'plotDescription', 'old-draft');
    });
    const next = {
      ...initial,
      data: {
        ...initial.data,
        rows: [{ ...initial.data.rows[0], plotDescription: 'new document' }],
      },
    };
    hook.rerender({ ...props, node: next, documentKey: 'two' });
    expect(context.signal.aborted).toBe(true);
    expect(hook.result.current.selected.size).toBe(0);
    await act(async () => {
      resolve(false);
      await pending;
    });
    expect(hook.result.current.rows[0].plotDescription).toBe('new document');
    expect(hook.result.current.error).toBe('');
    hook.unmount();
  });
  it('blocks loading/readonly edits and aborts an in-flight write on disable or unmount', async () => {
    let context;
    let resolve;
    const write = vi.fn((_patch, owner) => {
      context = owner;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const props = { node: initial, documentKey: 'one', readonly: false, onChange: write };
    const hook = renderHook((value) => useStoryboardTable(value), {
      initialProps: { ...props, ready: false },
    });
    await act(async () => {
      expect(await hook.result.current.edit('a', 'plotDescription', 'blocked')).toBe(false);
    });
    expect(write).not.toHaveBeenCalled();
    hook.rerender(props);
    let pending;
    act(() => {
      pending = hook.result.current.edit('a', 'plotDescription', 'draft');
    });
    hook.rerender({ ...props, readonly: true });
    expect(context.signal.aborted).toBe(true);
    await act(async () => {
      resolve(true);
      await pending;
    });
    expect(hook.result.current.pending).toBe(false);
    hook.rerender(props);
    act(() => {
      hook.result.current.edit('a', 'plotDescription', 'again');
    });
    hook.unmount();
    expect(context.signal.aborted).toBe(true);
    resolve(false);
  });
});
