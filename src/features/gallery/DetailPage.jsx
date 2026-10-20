import React, { useState, useEffect, lazy, Suspense } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import VideoPlayer from '../../components/VideoPlayer.jsx';
import { useContent, useLocalState, asset } from '../../data.js';
const CanvasPage = lazy(() => import('../canvas/CanvasPage.jsx'));

export default function DetailPage({ path, navigate, login, user, toast }) {
  const id = path.split('/')[2];
  const initialResource = useContent('gallery', { items: [] });
  const allResource = useContent('gallery-all', null);
  const detailResource = useContent('gallery-details/' + id, null);
  const profilesResource = useContent('profiles', {});
  const initial = initialResource.data;
  const all = allResource.data;
  const detailResponse = detailResource.data;
  const profiles = profilesResource.data;
  const [expanded, setExpanded] = useState(false),
    [share, setShare] = useState(false),
    [preview, setPreview] = useState(new URLSearchParams(location.search).get('preview') === '1');
  const [liked, setLiked] = useLocalState('libtv-liked', []);
  const list = all?.allItems || all?.items || initial.items;
  const item =
    detailResponse?.detail ||
    list.find((x) => (x.templateUuid || x.id) === id) ||
    initial.items.find((x) => (x.templateUuid || x.id) === id);
  const author = profiles[item?.ownerUuid];
  const counters = author?.extra?.counter || {};
  const recommendations = detailResponse?.recommendList?.length
    ? detailResponse.recommendList
    : initial.items;
  useEffect(() => {
    setExpanded(false);
    setPreview(new URLSearchParams(location.search).get('preview') === '1');
    window.scrollTo(0, 0);
  }, [id]);
  useEffect(() => {
    if (item) document.title = (item.name || item.title) + ' - PenStudio - 专业视频创作工具';
  }, [item]);
  const retry = () => {
    const requests = [];
    if (detailResource.error) requests.push(detailResource.reload());
    if (allResource.error) requests.push(allResource.reload());
    if (initialResource.error) requests.push(initialResource.reload());
    if (requests.length === 0) requests.push(detailResource.reload());
    void Promise.allSettled(requests);
  };
  if (!item)
    return (
      <div className="empty-state">
        {detailResource.error || allResource.error || initialResource.error ? (
          <>
            <p role="alert">作品加载失败，请重试</p>
            <button className="soft-button" onClick={retry}>
              重试
            </button>
            <button className="text-button" onClick={() => navigate('/show')}>
              返回 TV Show
            </button>
          </>
        ) : all ? (
          <>
            <p>作品不存在或已下架</p>
            <button className="soft-button" onClick={() => navigate('/show')}>
              返回 TV Show
            </button>
          </>
        ) : (
          <>
            <span className="spinner" />
            <p>加载作品...</p>
          </>
        )}
      </div>
    );
  return (
    <div className="detail-page">
      <header>
        <button className="text-button" onClick={() => navigate('/show')}>
          <Icon name="back" /> TV Show
        </button>
        <button className="white-button" onClick={login}>
          {user ? user.name : '注册/登录'}
        </button>
      </header>
      <div className="detail-layout">
        <main>
          <div className="detail-player">
            <VideoPlayer
              src={asset(item.finalOutput)}
              poster={asset(item.coverUrl)}
              autoPlay
              title={item.name || item.title}
            />
          </div>
          <div className="detail-title-row">
            <h1>{item.name || item.title}</h1>
            <div className="row">
              <button className="pill-button" onClick={() => setPreview(true)}>
                查看创作过程
              </button>
              <button
                className={`pill-button ${liked.includes(id) ? 'liked' : ''}`}
                aria-label="点赞"
                onClick={() =>
                  user
                    ? setLiked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
                    : login()
                }
              >
                <Icon name={liked.includes(id) ? 'heart-f' : 'heart'} size={22} />{' '}
                {(item.likeCount || 0) + (liked.includes(id) ? 1 : 0)}
              </button>
              <button
                className="round-button"
                aria-label="分享"
                onClick={() =>
                  navigator.clipboard
                    .writeText(location.origin + '/detail/' + id)
                    .then(() => toast('链接已复制'))
                    .catch(() => toast('请手动复制链接'))
                }
              >
                <Icon name="share" />
              </button>
            </div>
          </div>
          <div className="detail-author">
            <button
              className="row text-button"
              onClick={() => navigate('/profile?uuid=' + item.ownerUuid)}
            >
              <img className="avatar" src={asset(item.avatar)} alt={item.nickname} />
              <span>
                {item.nickname}
                <small>
                  {counters.followerCount ?? 0} 粉丝数&nbsp; {counters.followCount ?? 0} 关注
                </small>
              </span>
              {item.userTags?.[0] && (
                <img
                  className="author-badge"
                  src={asset(item.userTags[0].primaryIcon)}
                  alt={item.userTags[0].name}
                />
              )}
            </button>
            <button className="white-button follow-button" onClick={login}>
              <Icon name="add" size={14} />
              关注
            </button>
          </div>
          <div className="work-description">
            <span>作品描述</span>
            <p className={expanded ? '' : 'clamped'}>{item.description || '暂无作品描述'}</p>
            <button onClick={() => setExpanded(!expanded)}>
              {expanded ? '收起' : '展开'} <Icon name={expanded ? 'up-s' : 'down-s'} size={12} />
            </button>
            <small>更新时间: {item.createAt || '2026年09月30日'}&nbsp; 含 AI 生成内容</small>
          </div>
        </main>
        <aside className="recommendation-rail">
          <h2>精选推荐</h2>
          {recommendations.map((i) => (
            <button
              key={i.templateUuid || i.id}
              className={(i.templateUuid || i.id) === id ? 'active' : ''}
              onClick={() => navigate('/detail/' + (i.templateUuid || i.id))}
            >
              <img src={asset(i.coverUrl)} alt={i.name} />
              <div>
                <strong>{i.name || i.title}</strong>
                <small>{i.nickname}</small>
                <small>♡ {i.likeCount || 0}</small>
              </div>
            </button>
          ))}
        </aside>
      </div>
      {preview && (
        <Suspense
          fallback={
            <div className="empty-state" role="status">
              加载创作过程...
            </div>
          }
        >
          <CanvasPage
            embedded
            path="/canvas/share"
            templateUuid={id}
            onClose={() => setPreview(false)}
            navigate={navigate}
            login={login}
            user={user}
            toast={toast}
            asset={asset}
          />
        </Suspense>
      )}{' '}
      {share && (
        <Modal onClose={() => setShare(false)} title="分享作品" className="small-modal">
          <h2>分享作品</h2>
          <p>分享你的创意作品</p>
          <input className="form-input" readOnly value={location.href} />
          <button
            className="white-button full-width"
            onClick={() => {
              navigator.clipboard
                .writeText(location.href)
                .then(() => toast('链接已复制'))
                .catch(() => toast('请手动复制链接'));
            }}
          >
            复制链接
          </button>
        </Modal>
      )}
    </div>
  );
}
