import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageRepository, readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import {
  MASTERCLASS_COMMENT_CAPABILITIES,
  commentText,
  commentTime,
  validateReport,
} from './comment-model.js';
import { createLocalCommentSource, commentStorageKey } from './local-comment-source.js';
import {
  fixtureAuthor,
  fixtureComment,
  fixtureComments,
  fixtureViewer,
} from './comments.fixture.js';

beforeEach(() => {
  localStorage.clear();
});
function seed(key, comments) {
  writeStoredValue(commentStorageKey(key), { version: 1, comments, reports: [] });
}

describe('local academy comment repository', () => {
  it('keeps actual masterclass limits/capabilities and never invents missing public comments', async () => {
    const source = createLocalCommentSource({
      key: 'masterclass:sample',
      baseCommentCount: 68,
      capabilities: MASTERCLASS_COMMENT_CAPABILITIES,
      maxLength: 200,
    });
    expect(await source.fetchPage({})).toMatchObject({ list: [], total: 0, commentCount: 68 });
    await expect(source.publish({ content: '文'.repeat(201) }, fixtureViewer)).rejects.toThrow(
      '200',
    );
    await source.publish({ content: '文'.repeat(200) }, fixtureViewer);
    expect((await source.fetchPage({})).commentCount).toBe(69);
    expect(
      (await createLocalCommentSource({ key: 'masterclass:other' }).fetchPage({})).list,
    ).toEqual([]);
    await expect(source.setTop('anything', true, fixtureAuthor)).rejects.toThrow('评论不存在');
  });

  it('supports generic 500-character content, pinned/hottest/latest order and independent page/reply pagination', async () => {
    const comments = fixtureComments(10);
    comments[0].likeCount = 20;
    comments[1].isTop = true;
    const replies = Array.from({ length: 21 }, (_, index) =>
      fixtureComment(`reply-${index}`, { rootId: 'root-0', replyToId: 'root-0' }),
    );
    seed('pages', [...comments, ...replies]);
    const source = createLocalCommentSource({ key: 'pages' });
    const hottest = await source.fetchPage({ page: 1, pageSize: 8, sort: 'hottest' });
    expect(hottest.list.slice(0, 2).map((item) => item.id)).toEqual(['root-1', 'root-0']);
    expect(hottest.list[1].replyCount).toBe(21);
    expect((await source.fetchPage({ page: 1, sort: 'latest' })).list[1].id).toBe('root-9');
    expect((await source.fetchPage({ page: 2, pageSize: 8 })).list).toHaveLength(2);
    expect((await source.fetchReplies('root-0', { page: 1 })).list).toHaveLength(20);
    expect((await source.fetchReplies('root-0', { page: 2 })).list).toHaveLength(1);
    await source.publish({ content: '文'.repeat(500) }, fixtureViewer);
    await expect(source.publish({ content: '文'.repeat(501) }, fixtureViewer)).rejects.toThrow(
      '500',
    );
  });

  it('keeps likes and dislikes mutually exclusive per viewer and never corrupts aggregate counts', async () => {
    seed('reaction', [fixtureComment('root')]);
    const source = createLocalCommentSource({ key: 'reaction' });
    expect(await source.setLike('root', true, fixtureViewer)).toMatchObject({
      liked: true,
      disliked: false,
      likeCount: 1,
    });
    expect(await source.setLike('root', true, fixtureViewer)).toMatchObject({ likeCount: 1 });
    expect(await source.setDislike('root', true, fixtureViewer)).toMatchObject({
      liked: false,
      disliked: true,
      likeCount: 0,
    });
    expect(await source.setDislike('root', false, fixtureViewer)).toMatchObject({
      liked: false,
      disliked: false,
      likeCount: 0,
    });
    await source.setLike('root', true, fixtureAuthor);
    expect((await source.fetchPage({ viewer: fixtureViewer })).list[0]).toMatchObject({
      liked: false,
      likeCount: 1,
    });
  });

  it('enforces author-only single-root pinning and own-comment deletion at the repository boundary', async () => {
    seed('permission', [
      fixtureComment('own', { userUuid: fixtureViewer.uuid }),
      fixtureComment('other'),
      fixtureComment('reply', { rootId: 'own', replyToId: 'own' }),
    ]);
    const source = createLocalCommentSource({ key: 'permission', authorUuid: fixtureAuthor.uuid });
    await expect(source.setTop('own', true, fixtureViewer)).rejects.toThrow('置顶权限');
    await source.setTop('own', true, fixtureAuthor);
    await expect(source.setTop('other', true, fixtureAuthor)).rejects.toThrow('其他置顶');
    await expect(source.setTop('reply', true, fixtureAuthor)).rejects.toThrow('置顶权限');
    await source.setTop('own', false, fixtureAuthor);
    await source.setTop('other', true, fixtureAuthor);
    await expect(source.remove('other', fixtureViewer)).rejects.toThrow('自己的评论');
    await source.remove('own', fixtureViewer);
    expect((await source.fetchPage({})).commentCount).toBe(1);
    expect(readStoredValue(source.storageKey, null).comments.map((item) => item.id)).toEqual([
      'other',
    ]);
    const restricted = createLocalCommentSource({
      key: 'permission',
      authorUuid: fixtureAuthor.uuid,
      capabilities: MASTERCLASS_COMMENT_CAPABILITIES,
    });
    await expect(restricted.setTop('other', false, fixtureAuthor)).rejects.toThrow('置顶权限');
  });

  it('retains reply-to identity while flattening replies and reattaches replies when their target is deleted', async () => {
    seed('replies', [fixtureComment('root')]);
    const source = createLocalCommentSource({ key: 'replies' });
    const first = await source.publish(
      { content: '第一条回复', rootId: 'root', replyToId: 'root' },
      fixtureViewer,
    );
    const second = await source.publish(
      { content: '回复这条回复', rootId: 'root', replyToId: first.id },
      fixtureAuthor,
    );
    expect(second).toMatchObject({
      rootId: 'root',
      replyToId: first.id,
      replyToUserName: fixtureViewer.nickName,
    });
    await source.remove(first.id, fixtureViewer);
    expect((await source.fetchReplies('root', {})).list[0]).toMatchObject({
      id: second.id,
      replyToId: 'root',
      replyToUserName: '',
    });
  });

  it('validates reports exactly, rejects self/duplicate reports, and saves them locally without claiming review', async () => {
    seed('reports', [
      fixtureComment('root'),
      fixtureComment('own', { userUuid: fixtureViewer.uuid }),
    ]);
    const source = createLocalCommentSource({ key: 'reports' });
    await expect(
      source.report('root', { reason: 'other', phone: 'wrong' }, fixtureViewer),
    ).rejects.toThrow('正确的手机号');
    expect(validateReport({ reason: 'other' })).toEqual({ reason: 'other' });
    expect(validateReport({ reason: 'ad', detail: 'ignored' })).toEqual({ reason: 'ad' });
    await source.report('root', { reason: 'other', detail: '测试夹具投诉' }, fixtureViewer);
    await expect(source.report('root', { reason: 'ad' }, fixtureViewer)).rejects.toThrow('已举报');
    await expect(source.report('own', { reason: 'ad' }, fixtureViewer)).rejects.toThrow(
      '自己的评论',
    );
    expect(readStoredValue(source.storageKey, null).reports[0]).toMatchObject({
      reason: 'other',
      detail: '测试夹具投诉',
      commentId: 'root',
      userUuid: fixtureViewer.uuid,
    });
  });

  it('preserves stored content on read/write failure and permits a retry after quota rejection', async () => {
    seed('failures', [fixtureComment('original')]);
    const source = createLocalCommentSource({ key: 'failures' });
    const write = vi.spyOn(storageRepository, 'writeStoredValue').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(source.publish({ content: '尚未保存' }, fixtureViewer)).rejects.toThrow(
      '本地保存失败',
    );
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(1);
    write.mockRestore();
    await source.publish({ content: '再次尝试' }, fixtureViewer);
    expect(readStoredValue(source.storageKey, null).comments).toHaveLength(2);
    localStorage.setItem(source.storageKey, '{broken');
    await expect(source.fetchPage({})).rejects.toThrow('读取失败');
    expect(localStorage.getItem(source.storageKey)).toBe('{broken');
  });

  it('renders legacy paragraph text safely and handles source time labels', () => {
    expect(commentText('<p>A&amp;B</p><p>&lt;script&gt;<br/>第二行</p>')).toBe(
      'A&B\n<script>\n第二行',
    );
    expect(commentText('<script>not HTML</script>')).toBe('<script>not HTML</script>');
    expect(commentTime('2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:05:00Z'))).toBe('5分钟前');
  });
});
