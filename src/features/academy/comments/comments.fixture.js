// Synthetic interaction fixtures; never imported by the production page or represented as public comments.
export const fixtureViewer = { uuid: 'fixture-viewer', nickName: '测试夹具用户', avatar: '' };
export const fixtureAuthor = { uuid: 'fixture-author', nickName: '测试夹具作者', avatar: '' };

export function fixtureComment(id, overrides = {}) {
  return {
    id,
    rootId: '',
    replyToId: '',
    userUuid: 'fixture-other',
    nickName: `测试夹具 ${id}`,
    avatar: '',
    content: `仅用于测试的评论 ${id}`,
    createTime: '2026-01-01T00:00:00.000Z',
    likeCount: 0,
    reactions: [],
    isTop: false,
    ...overrides,
  };
}

export function fixtureComments(count = 10) {
  return Array.from({ length: count }, (_, index) =>
    fixtureComment(`root-${index}`, {
      createTime: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }),
  );
}
