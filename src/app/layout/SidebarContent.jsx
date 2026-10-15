import React from 'react';
import Icon from '../../components/Icon.jsx';
import { asset, localHref } from '../../data.js';

const navigation = [
  ['/skill', 'PenStudio Agent', 'icon-sparkles-soft'],
  ['/3d-box', 'PenStudio 3D-BOX', 'studio-3d'],
  ['/', '首页', 'home-shell'],
  ['/project', '项目', 'icon-projects'],
  ['/assets', '资产', 'assets-empty'],
  ['plugins', '插件与扩展', 'terminal'],
  ['community', '社区'],
  ['/academy', '学院', 'academy', '大师开讲'],
  ['/show', 'TV Show', 'nt-tv-shows', '全网爆款'],
  ['/activity', '创作者挑战赛', 'trophy', '王者大赛'],
];

export default function SidebarContent({
  path,
  collapsed,
  setCollapsed,
  plugins,
  setPlugins,
  config,
  bannerIndex,
  setBannerIndex,
  navigate,
  user,
  login,
}) {
  const banners = config.sidebarBanners || [];
  return (
    <>
      <button
        className="sidebar-toggle icon-button"
        aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name="sidebar-left" size={18} />
      </button>
      <button className="sidebar-logo" onClick={() => navigate('/')} aria-label="首页">
        <img src="/assets/penstudio-logo.svg" alt="PenStudio" />
      </button>
      <button
        className="sidebar-create cyan-button"
        onClick={() => (user ? navigate('/canvas') : login())}
      >
        <Icon name="add" size={18} />
        新建项目
      </button>
      <nav>
        {navigation.map(([url, label, icon, badge], i) =>
          url === 'community' ? (
            <div key={url} className="nav-section-label">
              {label}
            </div>
          ) : (
            <React.Fragment key={url}>
              {i === 2 && <div className="nav-spacer" />}
              <button
                className={`nav-link ${(url === '/' ? path === '/' : path === url || path.startsWith(url + '/')) ? 'active' : ''}`}
                onMouseEnter={() => {
                  if (url === 'plugins') setPlugins(true);
                }}
                title={label}
                onClick={() => (url === 'plugins' ? setPlugins(!plugins) : navigate(url))}
              >
                <Icon name={icon} size={18} />
                <span>{label}</span>
                {badge && <em>{badge}</em>}
                {url === 'plugins' && <Icon name="right-s" size={14} />}
              </button>
              {url === 'plugins' && plugins && (
                <div className="sidebar-plugin-menu">
                  <button onClick={() => navigate('/blender')}>
                    <Icon name="nt-sidebar-blender-plugin" /> Blender 插件
                  </button>
                  <button onClick={() => navigate('/plugin')}>
                    <Icon name="terminal" /> PenStudio CLI
                  </button>
                </div>
              )}
            </React.Fragment>
          ),
        )}
      </nav>
      <div className="sidebar-bottom">
        {banners.length > 0 && (
          <div className="sidebar-banner">
            <button
              onClick={() => navigate(localHref(banners[bannerIndex]?.url || '/activity/62'))}
            >
              <img
                src={asset(banners[bannerIndex]?.pic)}
                alt={banners[bannerIndex]?.title || 'banner'}
              />
            </button>
            <div className="banner-dots">
              {banners.map((b, i) => (
                <button
                  key={i}
                  aria-label={`${i + 1} / ${banners.length}`}
                  className={i === bannerIndex ? 'active' : ''}
                  onClick={() => setBannerIndex(i)}
                />
              ))}
            </div>
          </div>
        )}
        <button className="nav-link" onClick={() => navigate('/feature-updates')}>
          <Icon name="bulb" />
          <span>版本更新记录</span>
          <em>v1.5</em>
        </button>
      </div>
    </>
  );
}
