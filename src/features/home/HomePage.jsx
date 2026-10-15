import React, { useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import Gallery from '../../components/Gallery.jsx';
import { useData, asset, localHref } from '../../data.js';

export default function HomePage({ navigate, login, user }) {
  const data = useData('home', {});
  const quick = data.homeSeedance25Config?.quickActions || [];
  const features = data.homeFeatureHighlightsConfig?.quickActions || [];
  const row = useRef();
  const open = (action) => {
    if (action?.requiresLogin && !user) return login();
    navigate(localHref(action?.href || '/canvas'));
  };
  return (
    <div className="home-page page-inner">
      <button className="create-canvas" onClick={() => (user ? navigate('/canvas') : login())}>
        <span className="create-plus">
          <Icon name="add" size={34} />
        </span>
        <strong>新建画布创作</strong>
      </button>
      <div className="quick-action-wrap">
        <div className="quick-actions" ref={row}>
          {quick.map((q) => (
            <button key={q.id} className="quick-action" onClick={() => open(q.action)}>
              <span>
                <img src={asset(q.iconUrl)} alt="" />
              </span>
              <p>{q.title}</p>
            </button>
          ))}
        </div>
        <button
          className="quick-next icon-button"
          aria-label="下一张"
          onClick={() => row.current.scrollBy({ left: 320, behavior: 'smooth' })}
        >
          <Icon name="right-s" />
        </button>
      </div>
      <section className="features-section">
        <h2>最近上新</h2>
        <div className="feature-row">
          {features.map((f, i) => (
            <button
              key={f.id}
              className="feature-card"
              onClick={() => (f.id === 'activity' ? navigate('/activity/62') : open(f.action))}
              onMouseEnter={(e) =>
                e.currentTarget
                  .querySelector('video')
                  ?.play()
                  .catch(() => {})
              }
              onMouseLeave={(e) => e.currentTarget.querySelector('video')?.pause()}
            >
              <div className="feature-cover">
                <img src={asset(f.coverUrl)} alt={f.title} />
                {f.hoverVideoUrl && (
                  <video src={asset(f.hoverVideoUrl)} muted playsInline loop preload="none" />
                )}
              </div>
              <div className="feature-label">
                <span>{f.title}</span>
                <em className={i === 0 ? 'purple' : 'cyan'}>{i === 0 ? '进行中' : f.badge}</em>
              </div>
            </button>
          ))}
        </div>
      </section>
      <Gallery navigate={navigate} login={login} />
      <button
        className="scroll-show icon-button"
        title="滚动到 TV Show"
        onClick={() => document.getElementById('tv-show').scrollIntoView({ behavior: 'smooth' })}
      >
        <Icon name="down-s" />
      </button>
    </div>
  );
}
