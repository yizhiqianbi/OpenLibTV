import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, storageRepository, writeStoredValue } from '../../../services/storage.ts';
import CommentSection from './CommentSection.jsx';
import { createLocalCommentSource, commentStorageKey } from './local-comment-source.js';
import { MASTERCLASS_COMMENT_CAPABILITIES } from './comment-model.js';
import {
  fixtureAuthor,
  fixtureComment,
  fixtureComments,
  fixtureViewer,
} from './comments.fixture.js';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
const asset = (value) => value;
function sourceFor(key, comments = [], options = {}) {
  writeStoredValue(commentStorageKey(key), { version: 1, comments, reports: [] });
  return createLocalCommentSource({ key, ...options });
}
function props(source, user = fixtureViewer) {
  return { source, user, asset, login: vi.fn(), toast: vi.fn() };
}
function article(id) {
  return screen.getByRole('article', { name: `测试夹具 ${id}的评论` });
}

describe('academy comment interactions', () => {
  it('uses actual masterclass configuration, gates anonymous actions, and keeps the missing public list explicit', async () => {
    const source = sourceFor('masterclass', [], {
      capabilities: MASTERCLASS_COMMENT_CAPABILITIES,
      maxLength: 200,
      baseCommentCount: 68,
    });
    const options = props(source, null);
    render(
      <CommentSection
        {...options}
        defaultSort="latest"
        maxCommentLength={200}
        unavailablePublicComments
        showSortSwitch
      />,
    );
    await screen.findByText('暂无本地评论，来说两句吧~');
    expect(screen.getByRole('heading', { name: /^评论\s*\(68\)$/ })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: '评论排序' })).toBeNull();
    expect(screen.queryByRole('button', { name: '点踩' })).toBeNull();
    expect(screen.getByText(/原公开评论正文未收录/)).toBeTruthy();
    const field = screen.getByRole('textbox', { name: '评论内容' });
    expect(field.maxLength).toBe(200);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: '匿名评论' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    expect(options.login).toHaveBeenCalledWith({ entrySource: 'comment' });
    expect(readStoredValue(source.storageKey, null).comments).toEqual([]);
  });

  it('keeps unsent text after a failed write, retries, persists across remount, and does not submit IME confirmation', async () => {
    const source = sourceFor('publish');
    const options = props(source);
    const first = render(<CommentSection {...options} />);
    await screen.findByText('还没有评论，来说两句吧~');
    const field = screen.getByRole('textbox', { name: '评论内容' });
    expect(field.maxLength).toBe(500);
    fireEvent.change(field, { target: { value: '输入法尚未确认' } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(0);
    const write = vi.spyOn(storageRepository, 'writeStoredValue').mockImplementation(() => {
      throw new Error('quota');
    });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    await screen.findByRole('alert');
    expect(field.value).toBe('输入法尚未确认');
    write.mockRestore();
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByText('输入法尚未确认');
    expect(field.value).toBe('');
    expect(options.toast).toHaveBeenCalledWith('评论已本地保存，未提交服务器');
    first.unmount();
    render(<CommentSection {...options} />);
    await screen.findByText('输入法尚未确认');
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(1);
  });

  it('sorts and paginates without duplicate rows, and retries the failed next page instead of clearing the list', async () => {
    const fixture = fixtureComments(10);
    fixture[0].likeCount = 12;
    const source = sourceFor('sorting', fixture);
    const fetch = vi.spyOn(source, 'fetchPage');
    render(<CommentSection {...props(source)} showSortSwitch />);
    await screen.findByText('仅用于测试的评论 root-0');
    expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toContain('root-0');
    fireEvent.click(screen.getByRole('button', { name: '最新' }));
    await waitFor(() =>
      expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toContain('root-9'),
    );
    fetch.mockRejectedValueOnce(new Error('fixture next-page failure'));
    fireEvent.click(screen.getByRole('button', { name: '查看更多评论' }));
    fireEvent.click(await screen.findByRole('button', { name: '评论加载失败，点击重试' }));
    await screen.findByText('没有更多评论了');
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(fetch.mock.calls.at(-1)[0].page).toBe(2);
  });

  it('shows loading/errors and ignores an earlier route response after switching the source', async () => {
    let resolve;
    const old = sourceFor('slow');
    old.fetchPage = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const newer = sourceFor('newer', [fixtureComment('newer')]);
    const initial = render(<CommentSection {...props(old)} />);
    expect(screen.getByLabelText('评论加载中')).toBeTruthy();
    initial.rerender(<CommentSection {...props(newer)} />);
    await screen.findByText('仅用于测试的评论 newer');
    await act(async () =>
      resolve({
        list: [{ ...fixtureComment('stale'), replies: [] }],
        page: 1,
        total: 1,
        commentCount: 1,
      }),
    );
    expect(screen.queryByText('仅用于测试的评论 stale')).toBeNull();
    const fetch = vi.spyOn(newer, 'fetchPage').mockRejectedValueOnce(new Error('offline'));
    initial.unmount();
    render(<CommentSection {...props(newer)} />);
    fireEvent.click(await screen.findByRole('button', { name: '评论加载失败，点击重试' }));
    await screen.findByText('仅用于测试的评论 newer');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('loads replies in pages, retries reply errors, replies to replies, and keeps new local replies visible on collapse', async () => {
    const replies = Array.from({ length: 21 }, (_, index) =>
      fixtureComment(`reply-${index}`, { rootId: 'root', replyToId: 'root' }),
    );
    const source = sourceFor('threads', [fixtureComment('root'), ...replies]);
    const fetch = vi
      .spyOn(source, 'fetchReplies')
      .mockRejectedValueOnce(new Error('fixture reply failure'));
    render(<CommentSection {...props(source)} />);
    fireEvent.click(await screen.findByRole('button', { name: '共 21 条回复，点击查看' }));
    fireEvent.click(await screen.findByRole('button', { name: '回复加载失败，点击重试' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(21));
    fireEvent.click(screen.getByRole('button', { name: '展开更多回复' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(22));
    const target = screen.getByRole('article', { name: '测试夹具 reply-0的回复' });
    fireEvent.click(within(target).getByRole('button', { name: '回复' }));
    const field = screen.getByPlaceholderText('回复 @测试夹具 reply-0');
    fireEvent.change(field, { target: { value: '测试本地嵌套回复' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await screen.findByText('测试本地嵌套回复');
    const stored = readStoredValue(source.storageKey, null).comments.at(-1);
    expect(stored).toMatchObject({
      rootId: 'root',
      replyToId: 'reply-0',
      replyToUserName: '测试夹具 reply-0',
    });
    fireEvent.click(screen.getByRole('button', { name: '收起回复' }));
    expect(screen.getByText('测试本地嵌套回复')).toBeTruthy();
    expect(screen.queryByText('仅用于测试的评论 reply-0')).toBeNull();
    expect(fetch.mock.calls.at(-1)[1].page).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: '共 22 条回复，点击查看' }));
    expect(screen.queryByRole('button', { name: '展开更多回复' })).toBeNull();
  });

  it('toggles reactions exclusively, rolls back on save failure, and keeps own/delete versus other/report permissions', async () => {
    const source = sourceFor('actions', [
      fixtureComment('other'),
      fixtureComment('own', { userUuid: fixtureViewer.uuid }),
    ]);
    render(<CommentSection {...props(source)} showDislike />);
    await screen.findByText('仅用于测试的评论 other');
    const other = article('other'),
      own = article('own');
    fireEvent.click(within(other).getByRole('button', { name: '点赞' }));
    await waitFor(() =>
      expect(within(other).getByRole('button', { name: '点赞' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    fireEvent.click(within(other).getByRole('button', { name: '点踩' }));
    await waitFor(() =>
      expect(within(other).getByRole('button', { name: '点踩' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
    expect(within(other).getByRole('button', { name: '点赞' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    vi.spyOn(source, 'setLike').mockRejectedValueOnce(new Error('fixture reaction failure'));
    fireEvent.click(within(other).getByRole('button', { name: '点赞' }));
    await screen.findByText('fixture reaction failure');
    expect(within(other).getByRole('button', { name: '点赞' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(within(other).getByRole('button', { name: '更多操作' }));
    expect(screen.queryByRole('menuitem', { name: '删除' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: '举报' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(own).getByRole('button', { name: '更多操作' }));
    expect(screen.queryByRole('menuitem', { name: '举报' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(screen.getByRole('dialog', { name: '删除评论' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(article('own')).toBeTruthy();
    fireEvent.click(within(own).getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: '测试夹具 own的评论' })).toBeNull(),
    );
  });

  it('validates optional report fields, preserves failed forms, and rejects duplicate local reports', async () => {
    const source = sourceFor('report-form', [fixtureComment('root')]);
    render(<CommentSection {...props(source)} />);
    await screen.findByText('仅用于测试的评论 root');
    const open = () => {
      fireEvent.click(within(article('root')).getByRole('button', { name: '更多操作' }));
      fireEvent.click(screen.getByRole('menuitem', { name: '举报' }));
    };
    open();
    expect(screen.getByRole('button', { name: '确认举报' }).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: '举报原因' }), {
      target: { value: 'other' },
    });
    const detail = screen.getByRole('textbox', { name: '举报具体信息' });
    expect(detail.maxLength).toBe(100);
    fireEvent.change(detail, { target: { value: '测试夹具说明' } });
    fireEvent.change(screen.getByRole('textbox', { name: '联系方式' }), {
      target: { value: 'invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认举报' }));
    expect(screen.getByRole('alert').textContent).toBe('请输入正确的手机号');
    fireEvent.change(screen.getByRole('textbox', { name: '联系方式' }), { target: { value: '' } });
    const report = vi
      .spyOn(source, 'report')
      .mockRejectedValueOnce(new Error('fixture report failure'));
    fireEvent.click(screen.getByRole('button', { name: '确认举报' }));
    await screen.findByText('fixture report failure');
    expect(detail.value).toBe('测试夹具说明');
    fireEvent.click(screen.getByRole('button', { name: '确认举报' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(report).toHaveBeenCalledTimes(2);
    open();
    fireEvent.change(screen.getByRole('combobox', { name: '举报原因' }), {
      target: { value: 'ad' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认举报' }));
    await screen.findByText('你已举报过该评论');
    expect(screen.getByRole('dialog', { name: '举报' })).toBeTruthy();
  });

  it('exposes single-root pinning only for the author and enabled source capability', async () => {
    const source = sourceFor('pinning', [fixtureComment('a'), fixtureComment('b')], {
      authorUuid: fixtureAuthor.uuid,
    });
    render(<CommentSection {...props(source, fixtureAuthor)} />);
    await screen.findByText('仅用于测试的评论 a');
    fireEvent.click(within(article('a')).getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }));
    await screen.findByText('置顶');
    fireEvent.click(within(article('b')).getByRole('button', { name: '更多操作' }));
    expect(screen.queryByRole('menuitem', { name: '置顶' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(within(article('a')).getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '取消置顶' }));
    await waitFor(() => expect(screen.queryByText('置顶')).toBeNull());
  });

  it('opens a mobile sheet with the editor at the bottom and restores scroll locking on Escape', async () => {
    const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );
    const source = sourceFor('mobile', [fixtureComment('root')]);
    render(<CommentSection {...props(source)} compactOnMobile />);
    const button = await screen.findByRole('button', { name: /评论/ });
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '评论' })).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('textbox', { name: '评论内容' })).toBeTruthy();
    await within(screen.getByRole('dialog', { name: '评论' })).findByText('仅用于测试的评论 root');
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog', { name: '评论' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    vi.unstubAllGlobals();
  });

  it('keeps delete confirmation open on failure and retries without removing the wrong comment', async () => {
    const source = sourceFor('delete-retry', [
      fixtureComment('own', { userUuid: fixtureViewer.uuid }),
      fixtureComment('other'),
    ]);
    const remove = vi
      .spyOn(source, 'remove')
      .mockRejectedValueOnce(new Error('fixture delete failure'));
    render(<CommentSection {...props(source)} />);
    await screen.findByText('仅用于测试的评论 own');
    fireEvent.click(within(article('own')).getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await screen.findByText('fixture delete failure');
    expect(screen.getByRole('dialog', { name: '删除评论' })).toBeTruthy();
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(article('other')).toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('disables composers when the source closes comments instead of claiming publish success', async () => {
    const source = sourceFor('closed', [fixtureComment('root')], { closed: true });
    const options = props(source);
    render(<CommentSection {...options} />);
    await screen.findByText('仅用于测试的评论 root');
    fireEvent.change(screen.getByRole('textbox', { name: '评论内容' }), {
      target: { value: '不能发布' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));
    await screen.findByText('评论区已关闭');
    expect(screen.queryByRole('textbox', { name: '评论内容' })).toBeNull();
    expect(within(article('root')).getByRole('button', { name: '回复' }).disabled).toBe(true);
    expect(options.toast).not.toHaveBeenCalled();
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(1);
  });
});
