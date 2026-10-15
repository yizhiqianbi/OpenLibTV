import { withSecondaryData, routeParts } from '../shared/secondary/SecondaryContent.jsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Share2, ThumbsUp } from 'lucide-react';
import WatchHeader from './components/WatchHeader.jsx';
import CoursePlayer from './player/CoursePlayer.jsx';
import WatchScrollStage from './player/WatchScrollStage.jsx';
import LandscapeTopBar from './player/LandscapeTopBar.jsx';
import LandscapeTutorialDrawer from './player/LandscapeTutorialDrawer.jsx';
import { timeLabel } from '../shared/secondary/media.js';
import CommentSection from './comments/CommentSection.jsx';
import { createLocalCommentSource } from './comments/local-comment-source.js';
import { MASTERCLASS_COMMENT_CAPABILITIES } from './comments/comment-model.js';

function VideoDetail({ id, kind, data, navigate, asset, user, login, toast }) {
  const item = data.details[kind === 'masterclass' ? 'masterclasses' : 'tutorials'][id],
    masterclass = kind === 'masterclass';
  const [liked, setLiked] = useState(false),
    [expanded, setExpanded] = useState(false);
  const pausePlayer = useRef(null);
  const registerPause = useCallback((command) => {
    pausePlayer.current = command;
  }, []);
  const closeFloating = useCallback(() => pausePlayer.current?.(), []);
  const commentSource = useMemo(
    () =>
      createLocalCommentSource({
        key: `masterclass:${id}`,
        authorUuid: item?.authorUuid || item?.authorUserUuid || '',
        baseCommentCount: item?.commentCount || 0,
        capabilities: MASTERCLASS_COMMENT_CAPABILITIES,
        maxLength: 200,
      }),
    [id, item?.authorUuid, item?.authorUserUuid, item?.commentCount],
  );
  useEffect(() => {
    setLiked(false);
    setExpanded(false);
  }, [id]);
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      toast?.('链接已复制');
    } catch {
      toast?.('复制失败，请手动复制地址栏链接');
    }
  }
  return (
    <div className="academy-video-detail">
      <WatchHeader title={masterclass ? '教程视频' : '亮点功能'} navigate={navigate} />
      {item ? (
        <div className="academy-watch-columns">
          <main>
            <WatchScrollStage
              onFloatingClose={closeFloating}
              player={
                <CoursePlayer
                  key={id}
                  item={item}
                  asset={asset}
                  user={user}
                  login={login}
                  masterclass={masterclass}
                  showFollowup={false}
                  onPauseReady={registerPause}
                  landscapeChrome={
                    !masterclass
                      ? (chrome) =>
                          chrome.landscapeMode ? (
                            <>
                              <LandscapeTopBar
                                title={item.title}
                                onBack={chrome.onExitFullscreen}
                                onOpenSettings={chrome.onOpenSettings}
                              />
                              {chrome.drawer === 'episodes' && (
                                <LandscapeTutorialDrawer
                                  tutorials={data.tutorials}
                                  currentTutorialId={id}
                                  asset={asset}
                                  onClose={chrome.closeDrawer}
                                  onSelect={(tutorialId) => {
                                    chrome.closeDrawer();
                                    pausePlayer.current?.();
                                    navigate(`/academy/tutorial/${tutorialId}`);
                                  }}
                                />
                              )}
                            </>
                          ) : null
                      : undefined
                  }
                />
              }
              meta={
                <div className="academy-video-meta">
                  <h1>{item.title}</h1>
                  {masterclass && (
                    <div className="academy-master-author">
                      <img src={asset(item.authorAvatar) || undefined} alt="" />
                      <span>
                        {item.authorName}
                        <small>{item.authorTitle}</small>
                      </span>
                      <div>
                        <button
                          aria-pressed={liked}
                          onClick={() => (user ? setLiked((v) => !v) : login())}
                        >
                          <ThumbsUp size={14} fill={liked ? 'currentColor' : 'none'} />
                          {item.likeCount + (liked ? 1 : 0)}
                        </button>
                        <button onClick={share} aria-label="分享">
                          <Share2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className={!expanded ? 'collapsed' : ''}>
                    {item.description || item.subtitle}
                  </p>
                  {masterclass && (
                    <button
                      className="academy-description-toggle"
                      onClick={() => setExpanded((v) => !v)}
                    >
                      {expanded ? '收起' : '展开'}
                      <ChevronDown size={12} />
                    </button>
                  )}
                </div>
              }
              below={
                masterclass &&
                item.commentEnabled && (
                  <CommentSection
                    key={id}
                    source={commentSource}
                    user={user}
                    login={login}
                    toast={toast}
                    asset={asset}
                    defaultSort="latest"
                    maxCommentLength={200}
                    compactOnMobile
                    unavailablePublicComments
                  />
                )
              }
            />
          </main>
          <aside>
            {masterclass ? (
              <>
                <img
                  className="academy-master-teaser"
                  src={asset(
                    'https://libtv-res.liblib.art/upload-images/976652348270470eba25b9d8ca891fda/2a8ac513018926fb6dcfefcc9041d556ecc0038a.webp',
                  )}
                  alt="强势预告：更多大师敬请期待"
                />
                <h2>学习中心</h2>
                {item.recommendArticles.map((a) => (
                  <button
                    key={a.articleUuid}
                    className="academy-thumbnail-row"
                    onClick={() => (user ? navigate(`/academy/article/${a.articleUuid}`) : login())}
                  >
                    <img src={asset(a.cover)} alt="" />
                    <span>
                      <strong>{a.title}</strong>
                      <small>{a.readingMinutes}min 阅读</small>
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <h2>更多教程视频</h2>
                {data.tutorials.map((t) => (
                  <button
                    className={`academy-thumbnail-row ${t.tutorialUuid === id ? 'active' : ''}`}
                    key={t.tutorialUuid}
                    disabled={t.tutorialUuid === id}
                    onClick={() => navigate(`/academy/tutorial/${t.tutorialUuid}`)}
                  >
                    <img src={asset(t.cover)} alt="" />
                    <span>
                      <strong>{t.title}</strong>
                      <small>{timeLabel(t.durationSec)}</small>
                    </span>
                  </button>
                ))}
              </>
            )}
          </aside>
        </div>
      ) : (
        <p className="secondary-empty">暂无内容</p>
      )}
    </div>
  );
}

const VideoPage = withSecondaryData(VideoDetail, (props) => ({
  id: props.id ?? routeParts(props.path)[3],
  kind: props.kind ?? routeParts(props.path)[2],
}));
export default VideoPage;
