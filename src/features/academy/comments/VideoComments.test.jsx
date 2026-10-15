import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import VideoPage from '../VideoPage.jsx';
import { readStoredValue } from '../../../services/storage.ts';
import { commentStorageKey } from './local-comment-source.js';
import { fixtureViewer } from './comments.fixture.js';

vi.mock('../../../data.js', () => ({
  asset: (value) => value,
  useContent: () => ({
    data: {
      uiAssets: {},
      tutorials: [],
      details: {
        tutorials: {},
        masterclasses: {
          'fixture-class': {
            title: '仅用于测试的大师课',
            authorName: '测试讲师',
            authorAvatar: '',
            authorTitle: '测试夹具',
            description: '仅用于页面组件回归测试',
            likeCount: 0,
            commentCount: 68,
            commentEnabled: true,
            recommendArticles: [],
          },
        },
      },
    },
    loading: false,
    error: null,
  }),
}));
vi.mock('../player/CoursePlayer.jsx', () => ({
  default: () => <div>测试播放器边界</div>,
}));
beforeEach(() => {
  localStorage.clear();
});

it('connects the real masterclass comment configuration without changing the player or inventing public bodies', async () => {
  const toast = vi.fn();
  render(
    <VideoPage
      path="/academy/masterclass/fixture-class"
      user={fixtureViewer}
      toast={toast}
      navigate={vi.fn()}
      login={vi.fn()}
      asset={(value) => value}
    />,
  );
  expect(screen.getByText('测试播放器边界')).toBeTruthy();
  const field = await screen.findByRole('textbox', { name: '评论内容' });
  await waitFor(() => expect(field.disabled).toBe(false));
  expect(field.maxLength).toBe(200);
  expect(screen.queryByRole('button', { name: '最热' })).toBeNull();
  expect(screen.queryByRole('button', { name: '点踩' })).toBeNull();
  expect(screen.queryByRole('menuitem', { name: '置顶' })).toBeNull();
  expect(screen.getByText(/原公开评论正文未收录/)).toBeTruthy();
  fireEvent.change(field, { target: { value: '页面本地评论' } });
  fireEvent.click(screen.getByRole('button', { name: '发布' }));
  await screen.findByText('页面本地评论');
  expect(
    readStoredValue(commentStorageKey('masterclass:fixture-class'), null).comments,
  ).toHaveLength(1);
  expect(toast).toHaveBeenCalledWith('评论已本地保存，未提交服务器');
});
