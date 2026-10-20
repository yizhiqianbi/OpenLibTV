import React from 'react';
import Icon from '../../components/Icon.jsx';
import Gallery from '../../components/Gallery.jsx';
import { useContent, asset } from '../../data.js';

export default function ProfilePage({ navigate, login, user, toast }) {
  const uuid = new URLSearchParams(location.search).get('uuid');
  const allResource = useContent('gallery-all', null);
  const initialResource = useContent('gallery', { items: [] });
  const profilesResource = useContent('profiles', {});
  const configResource = useContent('shell-config', {});
  const all = allResource.data;
  const initial = initialResource.data;
  const profiles = profilesResource.data;
  const config = configResource.data;
  const list = all?.allItems || all?.items || initial.items;
  const profile = profiles[uuid] || {};
  const works = profile.works?.list || list.filter((i) => i.ownerUuid === uuid);
  const first = works[0];
  const hasProfile = Boolean(uuid ? profiles[uuid] : user || first);
  const resources = [allResource, initialResource, profilesResource, configResource];
  const hasError = resources.some((resource) => resource.error);
  const isLoading = resources.some((resource) => resource.loading);
  const retry = () => {
    const failed = resources.filter((resource) => resource.error);
    const requests = (failed.length ? failed : [allResource]).map((resource) => resource.reload());
    void Promise.allSettled(requests);
  };
  if (hasError && !hasProfile) {
    return (
      <div className="empty-state">
        <p role="alert">用户主页加载失败，请重试</p>
        <button className="soft-button" onClick={retry}>
          重试
        </button>
      </div>
    );
  }
  if (isLoading && !hasProfile && !first) {
    return (
      <div className="empty-state" role="status">
        <span className="spinner" />
        <p>加载用户主页...</p>
      </div>
    );
  }
  const counters = profile.extra?.counter || {};
  const description = profile.person?.userDetail?.personalSpaceInformation?.briefIntroduction;
  let hash = 5381;
  for (const c of uuid || '') hash = ((hash << 5) + hash + c.charCodeAt(0)) | 0;
  const cover =
    profile.person?.userDetail?.personalSpaceInformation?.coverImage ||
    profile.extra?.userDetail?.backgroundImage ||
    config.profileDefaultCovers?.[Math.abs(hash) % 3];
  return (
    <div className="profile-page">
      <div
        className="profile-cover"
        style={cover ? { backgroundImage: `url(${asset(cover)})`, backgroundSize: 'cover' } : {}}
      />
      <div className="profile-content">
        <img className="profile-avatar" src={asset(profile.avatar || first?.avatar)} alt="" />
        <div className="profile-info">
          <h1>{uuid ? profile.name || first?.nickname : user?.name || '我的主页'}</h1>
          <p className="muted">{description || profile.tags?.userTagList?.[0]?.desc || ''}</p>
          <div className="profile-stats">
            <span>
              <b>{counters.followerCount ?? 0}</b>粉丝数
            </span>
            <span>
              <b>{counters.followCount ?? 0}</b>关注
            </span>
            <span>
              <b>{(counters.viewCreationProcessCount ?? 0).toLocaleString()}</b>创作过程被查看
            </span>
            <span>
              <b>{(counters.copyCanvasCount ?? 0).toLocaleString()}</b>画布被复制
            </span>
          </div>
          <div className="row">
            <button className="white-button" onClick={login}>
              <Icon name="add" size={14} /> 关注
            </button>
            <button
              className="soft-button"
              onClick={() =>
                navigator.clipboard.writeText(location.href).then(() => toast('链接已复制'))
              }
            >
              <Icon name="share" /> 分享
            </button>
          </div>
        </div>
        <Gallery title="发布" items={works} navigate={navigate} login={login} />
      </div>
    </div>
  );
}
