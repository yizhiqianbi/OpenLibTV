import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentAssetPicker from './AgentAssetPicker.jsx';
import { writeStoredValue } from '../../services/storage.ts';
import { agentAssetText } from '../../services/agent-assets.ts';
vi.mock('../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));
beforeEach(() => localStorage.clear());
const image = (id, name, folderId = null, tags = []) => ({
  id,
  name,
  folderId,
  tags,
  type: 'image',
  mimeType: 'image/png',
  url: `/media/${id}.png`,
  createdAt: 1,
});
const page = (items) => ({ items, total: items.length, hasMore: false });
const save = (value) => writeStoredValue('libtv-asset-library', value, { version: 1 });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('shared asset selector source-backed branches', () => {
  it('uses the caller first-item preview and leaves unsupported asset previews closed', async () => {
    const user = userEvent.setup();
    save({
      assets: [image('valid', '首项媒体'), image('unsupported', '首项不是媒体')],
      folders: [],
      tags: [],
    });
    render(
      <AgentAssetPicker
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
        getPreviewAsset={(item) =>
          item.id === 'unsupported' ? null : { ...item, url: '/first-item.png' }
        }
      />,
    );
    await user.click(screen.getByRole('button', { name: '预览 首项不是媒体' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '预览 首项媒体' }));
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(2);
    expect(document.querySelector('img[src="/first-item.png"]')).toBeTruthy();
  });
  it('keeps the first-item video poster in the nested media preview', async () => {
    const user = userEvent.setup();
    save({
      assets: [
        {
          ...image('video', '首项视频'),
          type: 'video',
          mimeType: 'video/mp4',
          url: '/library.mp4',
        },
      ],
      folders: [],
      tags: [],
    });
    render(
      <AgentAssetPicker
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
        getPreviewAsset={(item) => ({
          ...item,
          url: '/first-item.mp4',
          poster: '/first-poster.png',
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: '预览 首项视频' }));
    const video = document.querySelector('video[src="/first-item.mp4"]');
    expect(video?.getAttribute('poster')).toBe('/first-poster.png');
    await user.click(
      within(screen.getByRole('dialog', { name: '首项视频' })).getByRole('button', {
        name: '关闭',
      }),
    );
    expect(screen.getByRole('dialog', { name: '从资产库添加' })).toBeTruthy();
  });
  it('notifies caller policy refusals without changing selection and always lets a chosen asset be unchecked', async () => {
    const user = userEvent.setup();
    save({
      assets: [
        image('first', '第一张图片'),
        image('second', '第二张图片'),
        {
          id: 'text',
          name: '节点不支持的正文',
          type: 'document',
          mimeType: 'text/plain',
          url: '',
          content: '真实正文',
          createdAt: 1,
        },
      ],
      folders: [],
      tags: [],
    });
    const onSelectDisabledAsset = vi.fn();
    const isAssetDisabled = vi.fn((item, selected) =>
      item.mediaType === 'text'
        ? '此节点仅支持媒体素材'
        : selected.length >= 1
          ? '最多选择一项素材'
          : false,
    );
    render(
      <AgentAssetPicker
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
        isAssetDisabled={isAssetDisabled}
        onSelectDisabledAsset={onSelectDisabledAsset}
      />,
    );
    const first = screen.getByRole('checkbox', { name: '选择 第一张图片' });
    const second = screen.getByRole('checkbox', { name: '选择 第二张图片' });
    const text = screen.getByRole('checkbox', { name: '选择 节点不支持的正文' });
    expect(text.getAttribute('aria-disabled')).toBe('true');
    expect(text.title).toBe('此节点仅支持媒体素材');
    await user.click(text);
    expect(onSelectDisabledAsset).toHaveBeenCalledTimes(1);
    expect(onSelectDisabledAsset.mock.calls[0][0]).toMatchObject({ id: 'text', mediaType: 'text' });
    expect(text.checked).toBe(false);
    expect(screen.getByRole('button', { name: '添加' }).disabled).toBe(true);
    await user.click(first);
    expect(first.checked).toBe(true);
    expect(first.getAttribute('aria-disabled')).toBeNull();
    expect(second.getAttribute('aria-disabled')).toBe('true');
    expect(second.title).toBe('最多选择一项素材');
    expect(isAssetDisabled.mock.calls.at(-1)[1].map((item) => item.id)).toEqual(['first']);
    second.focus();
    await user.keyboard(' ');
    expect(onSelectDisabledAsset).toHaveBeenCalledTimes(2);
    expect(onSelectDisabledAsset.mock.calls[1][0].id).toBe('second');
    expect(second.checked).toBe(false);
    expect(screen.getByRole('button', { name: '添加 (1)' }).disabled).toBe(false);
    await user.click(first);
    expect(first.checked).toBe(false);
    expect(second.getAttribute('aria-disabled')).toBeNull();
    expect(onSelectDisabledAsset).toHaveBeenCalledTimes(2);
    await user.click(second);
    expect(second.checked).toBe(true);
  });

  it('keeps ordinary Agent text and media selection available without a policy and falls back from an empty footer', async () => {
    const user = userEvent.setup();
    save({
      assets: [
        image('media', '普通图片'),
        {
          id: 'text',
          name: '普通正文',
          type: 'document',
          mimeType: 'text/plain',
          url: '',
          content: '真实正文',
          createdAt: 1,
        },
      ],
      folders: [],
      tags: [],
    });
    const onPickAssets = vi.fn();
    render(
      <AgentAssetPicker
        onClose={vi.fn()}
        onPickAssets={onPickAssets}
        selectionFooter={() => null}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: '选择 普通图片' }));
    await user.click(screen.getByRole('checkbox', { name: '选择 普通正文' }));
    await user.click(screen.getByRole('button', { name: '添加 (2)' }));
    await waitFor(() => expect(onPickAssets).toHaveBeenCalledTimes(1));
    expect(onPickAssets.mock.calls[0][0].map((item) => item.id)).toEqual(['media', 'text']);
    expect(agentAssetText(onPickAssets.mock.calls[0][0][1].assetData)).toBe('真实正文');
  });

  it('supplies selection, submission and close actions to an injected footer while preserving errors for retry', async () => {
    const user = userEvent.setup();
    save({ assets: [image('image', '自定义入口图片')], folders: [], tags: [] });
    const request = deferred();
    const onPickAssets = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(true);
    const onClose = vi.fn();
    const selectionFooter = vi.fn(({ selected, submitting, submit, onClose }) => (
      <>
        <span>{selected.map((item) => item.name).join('、') || '未选择'}</span>
        <button disabled={!selected.length || submitting} onClick={submit}>
          {submitting ? '引用处理中' : '引用选择'}
        </button>
        <button onClick={onClose}>关闭自定义入口</button>
      </>
    ));
    render(
      <AgentAssetPicker
        onClose={onClose}
        onPickAssets={onPickAssets}
        selectionFooter={selectionFooter}
      />,
    );
    expect(screen.queryByRole('button', { name: '添加' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: '选择 自定义入口图片' }));
    expect(selectionFooter.mock.calls.at(-1)[0].selected[0].id).toBe('image');
    await user.click(screen.getByRole('button', { name: '引用选择' }));
    expect(screen.getByRole('button', { name: '引用处理中' }).disabled).toBe(true);
    expect(selectionFooter.mock.calls.at(-1)[0].submitting).toBe(true);
    await act(async () => request.reject(new Error('节点引用写入失败')));
    expect(screen.getByRole('alert').textContent).toBe('节点引用写入失败');
    expect(screen.getByRole('checkbox', { name: '选择 自定义入口图片' }).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '引用选择' }));
    await waitFor(() => expect(onPickAssets).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '关闭自定义入口' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('loads missing text through the injected detail adapter and retries without losing a hidden choice', async () => {
    const source = {
      list: vi.fn(async (filters) =>
        page(
          filters.type === 'text'
            ? [{ id: 'text', name: '文本详情', type: 'text' }]
            : [image('image', '已选图片')],
        ),
      ),
      get: vi
        .fn()
        .mockRejectedValueOnce(new Error('详情连接失败'))
        .mockResolvedValueOnce({ id: 'text', name: '文本详情', type: 'text', content: '真实正文' }),
    };
    const onPickAssets = vi.fn();
    render(<AgentAssetPicker assetSource={source} onClose={vi.fn()} onPickAssets={onPickAssets} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 已选图片' }));
    fireEvent.click(screen.getByRole('button', { name: '文本' }));
    expect((await screen.findByRole('alert')).textContent).toContain('详情连接失败');
    expect(screen.getByRole('button', { name: '添加 (1)' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 文本详情' }));
    fireEvent.click(screen.getByRole('button', { name: '添加 (2)' }));
    await waitFor(() => expect(onPickAssets).toHaveBeenCalledTimes(1));
    expect(agentAssetText(onPickAssets.mock.calls[0][0][1].assetData)).toBe('真实正文');
    expect(source.get).toHaveBeenCalledTimes(2);
    expect(source.get.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('aborts late metadata detail reads when the type changes, even if the adapter ignores the signal', async () => {
    const late = deferred();
    const source = {
      list: vi
        .fn()
        .mockResolvedValueOnce(page([{ id: 'text', name: '迟到正文', type: 'text' }]))
        .mockResolvedValueOnce(page([image('current', '当前图片')])),
      get: vi.fn().mockReturnValue(late.promise),
    };
    render(<AgentAssetPicker assetSource={source} onClose={vi.fn()} onPickAssets={vi.fn()} />);
    await waitFor(() => expect(source.get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    await screen.findByRole('checkbox', { name: '选择 当前图片' });
    expect(source.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      late.resolve({ id: 'text', name: '迟到正文', type: 'text', content: '不能复活' });
      await late.promise;
    });
    expect(screen.queryByRole('checkbox', { name: '选择 迟到正文' })).toBeNull();
  });

  it('navigates nested folders, searches globally and preserves selections and renamed breadcrumbs', async () => {
    const value = {
      assets: [
        image('root', '根图片'),
        image('inside', '目录图片', 'folder'),
        image('deep', '深层图片', 'child'),
      ],
      folders: [
        { id: 'folder', name: '一级', parentId: null, createdAt: 1 },
        { id: 'child', name: '二级', parentId: 'folder', createdAt: 2 },
      ],
      tags: [],
    };
    save(value);
    const onPickAssets = vi.fn();
    render(<AgentAssetPicker onClose={vi.fn()} onPickAssets={onPickAssets} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 根图片' }));
    expect(screen.queryByRole('checkbox', { name: '选择 目录图片' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹 一级' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 目录图片' }));
    fireEvent.click(screen.getByRole('button', { name: '打开文件夹 二级' }));
    expect(screen.getByRole('checkbox', { name: '选择 深层图片' })).toBeTruthy();
    act(() =>
      save({
        ...value,
        folders: value.folders.map((folder) =>
          folder.id === 'child' ? { ...folder, name: '更新二级' } : folder,
        ),
      }),
    );
    expect(
      within(screen.getByRole('navigation', { name: '资产文件夹' })).getByRole('button', {
        name: '更新二级',
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索资产' }), {
      target: { value: '根图片' },
    });
    expect(screen.getByRole('checkbox', { name: '选择 根图片' }).checked).toBe(true);
    expect(screen.queryByRole('button', { name: /打开文件夹/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加 (2)' }));
    await waitFor(() => expect(onPickAssets).toHaveBeenCalledTimes(1));
    expect(onPickAssets.mock.calls[0][0].map((item) => item.id)).toEqual(['root', 'inside']);
  });
  it('uses filter draft cancel/reset/apply and restores focus one layer at a time', async () => {
    const user = userEvent.setup();
    save({
      assets: [image('role', '角色图片', 'folder', ['角色']), image('other', '其它图片')],
      folders: [{ id: 'folder', name: '目录', parentId: null, createdAt: 1 }],
      tags: [],
    });
    render(<AgentAssetPicker onClose={vi.fn()} onPickAssets={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '打开文件夹 目录' }));
    const trigger = screen.getByRole('button', { name: '筛选' });
    await user.click(trigger);
    let dialog = screen.getByRole('dialog', { name: '筛选资产' });
    await user.click(within(dialog).getByRole('button', { name: '角色' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '筛选资产' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole('button', { name: '清除筛选' })).toBeNull();
    await user.click(trigger);
    dialog = screen.getByRole('dialog', { name: '筛选资产' });
    await user.click(within(dialog).getByRole('button', { name: '角色' }));
    await user.click(within(dialog).getByRole('button', { name: '应用' }));
    expect(
      within(screen.getByRole('navigation', { name: '资产文件夹' })).queryByRole('button', {
        name: '目录',
      }),
    ).toBeNull();
    expect(screen.getByRole('checkbox', { name: '选择 角色图片' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '选择 其它图片' })).toBeNull();
    await user.click(trigger);
    dialog = screen.getByRole('dialog', { name: '筛选资产' });
    await user.click(within(dialog).getByRole('button', { name: '重置' }));
    await user.click(within(dialog).getByRole('button', { name: '应用' }));
    expect(screen.getByRole('checkbox', { name: '选择 其它图片' })).toBeTruthy();
  });
  it('previews standalone text, returns real v2 text data and keeps selection on callback failure', async () => {
    const user = userEvent.setup();
    save({
      assets: [
        {
          id: 'text',
          name: '独立分镜',
          type: 'document',
          mimeType: 'text/plain',
          url: '',
          content: ['第一行', '第二行'],
          createdAt: 1,
        },
      ],
      folders: [],
      tags: [],
    });
    const onPickAssets = vi
      .fn()
      .mockRejectedValueOnce(new Error('写入失败'))
      .mockResolvedValueOnce(true);
    render(<AgentAssetPicker onClose={vi.fn()} onPickAssets={onPickAssets} />);
    await user.click(screen.getByRole('button', { name: '文本' }));
    const preview = screen.getByRole('button', { name: '预览 独立分镜' });
    await user.click(preview);
    expect(
      within(screen.getByRole('dialog', { name: '独立分镜' })).getByText('第一行 第二行'),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(preview);
    await user.click(screen.getByRole('checkbox', { name: '选择 独立分镜' }));
    await user.click(screen.getByRole('button', { name: '添加 (1)' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '写入失败');
    expect(screen.getByRole('checkbox', { name: '选择 独立分镜' }).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: '添加 (1)' }));
    await waitFor(() => expect(onPickAssets).toHaveBeenCalledTimes(2));
    expect(agentAssetText(onPickAssets.mock.calls[1][0][0].assetData)).toBe('第一行\n第二行');
  });
  it('does not leak personal local assets into unavailable teams, nor accept late previous-scope pages', async () => {
    save({ assets: [image('local', '私人本地')], folders: [], tags: [] });
    const late = deferred();
    const source = {
      list: vi
        .fn()
        .mockReturnValueOnce(late.promise)
        .mockResolvedValueOnce(page([image('team', '团队图片')])),
    };
    const view = render(
      <AgentAssetPicker
        scope="personal"
        assetSource={source}
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
      />,
    );
    view.rerender(
      <AgentAssetPicker
        scope="team"
        teamId="team-1"
        assetSource={source}
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
      />,
    );
    await screen.findByRole('checkbox', { name: '选择 团队图片' });
    expect(source.list.mock.calls[0][1].signal.aborted).toBe(true);
    expect(source.list.mock.calls[1][0]).toMatchObject({ scope: 'team', teamId: 'team-1' });
    await act(async () => {
      late.resolve(page([image('late', '旧私人结果')]));
      await late.promise;
    });
    expect(screen.queryByRole('checkbox', { name: '选择 旧私人结果' })).toBeNull();
    view.rerender(
      <AgentAssetPicker scope="team" assetSource={null} onClose={vi.fn()} onPickAssets={vi.fn()} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('缺少团队信息');
    expect(screen.queryByRole('checkbox', { name: '选择 私人本地' })).toBeNull();
  });
  it('retains loaded asset choices when the separate folder feed fails, and retries only that feed', async () => {
    const failure = deferred();
    const source = {
      list: vi.fn().mockResolvedValue(page([image('root', '已载入图片')])),
      listFolders: vi
        .fn()
        .mockReturnValueOnce(failure.promise)
        .mockResolvedValueOnce(
          page([{ kind: 'folder', id: 'folder', name: '重试目录', parentId: null }]),
        ),
    };
    render(<AgentAssetPicker assetSource={source} onClose={vi.fn()} onPickAssets={vi.fn()} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择 已载入图片' }));
    await act(async () => failure.reject(new Error('目录连接失败')));
    expect(screen.getByRole('alert').textContent).toContain('目录连接失败');
    expect(screen.getByRole('checkbox', { name: '选择 已载入图片' }).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByRole('button', { name: '打开文件夹 重试目录' });
    expect(source.list).toHaveBeenCalledTimes(1);
    expect(source.listFolders).toHaveBeenCalledTimes(2);
  });
  it('renders only the current remote folder level when a folder feed returns mixed ancestors', async () => {
    const user = userEvent.setup();
    const folders = [
      { kind: 'folder', id: 'root', name: '根目录', parentId: null, createdAt: 1 },
      { kind: 'folder', id: 'sibling', name: '同级目录', parentId: null, createdAt: 2 },
      { kind: 'folder', id: 'child', name: '子目录', parentId: 'root', createdAt: 3 },
      { kind: 'folder', id: 'grandchild', name: '孙目录', parentId: 'child', createdAt: 4 },
    ];
    const source = {
      list: vi.fn().mockResolvedValue(page([])),
      listFolders: vi.fn().mockResolvedValue(page(folders)),
    };
    render(<AgentAssetPicker assetSource={source} onClose={vi.fn()} onPickAssets={vi.fn()} />);

    expect(await screen.findByRole('button', { name: '打开文件夹 根目录' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开文件夹 同级目录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文件夹 子目录' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '打开文件夹 根目录' }));
    expect(await screen.findByRole('button', { name: '打开文件夹 子目录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文件夹 同级目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '打开文件夹 孙目录' })).toBeNull();
    expect(source.listFolders.mock.calls.at(-1)[0]).toMatchObject({ folderId: 'root' });
  });
  it('consumes operator-provided team members without inventing a roster or enabling subject writes', async () => {
    const user = userEvent.setup();
    const source = {
      list: vi.fn().mockResolvedValue(page([image('team', '团队图片')])),
      tags: [{ name: '场景', assetType: 2 }],
      members: [{ id: 'member', name: '实际成员' }],
    };
    render(
      <AgentAssetPicker
        scope="team"
        teamId="team-id"
        assetSource={source}
        onClose={vi.fn()}
        onPickAssets={vi.fn()}
      />,
    );
    await screen.findByRole('checkbox', { name: '选择 团队图片' });
    await user.click(screen.getByRole('button', { name: '筛选' }));
    const filters = screen.getByRole('dialog', { name: '筛选资产' });
    await user.click(within(filters).getByRole('checkbox', { name: '实际成员' }));
    await user.click(within(filters).getByRole('button', { name: '应用' }));
    await waitFor(() =>
      expect(source.list.mock.calls.at(-1)[0]).toMatchObject({
        memberUserIds: ['member'],
        teamId: 'team-id',
      }),
    );
    expect(screen.queryByText('可灵主体库')).toBeNull();
    expect(screen.queryByRole('button', { name: '创建主体' })).toBeNull();
  });
});
