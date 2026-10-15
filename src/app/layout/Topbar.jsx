import React from 'react';
import Icon from '../../components/Icon.jsx';

export default function Topbar({ ui, chrome = false }) {
  const {
    setDrawer,
    navigate,
    setModal,
    member,
    user,
    account,
    setAccount,
    setTheme,
    theme,
    login,
  } = ui;
  return (
    <header className="app-topbar">
      <div className="mobile-brand">
        {!chrome && (
          <button className="icon-button" aria-label="展开侧边栏" onClick={() => setDrawer(true)}>
            <Icon name="sidebar-left" />
          </button>
        )}
        <button onClick={() => navigate('/')}>
          <img src="/assets/penstudio-logo.svg" alt="PenStudio" />
        </button>
      </div>
      <div className="account-actions">
        <button className="header-points" onClick={() => setModal('points')}>
          <Icon name="member-store" size={15} />
          积分超市
        </button>
        <button className="header-member" onClick={member}>
          <Icon name="member-store" size={16} />
          <span>开通会员</span>
          <em>限时 45 折</em>
        </button>
        {user ? (
          <div className="popover-anchor">
            <button
              className="user-button"
              aria-label={user.localWorkspace ? '本地工作区' : '账号菜单'}
              onClick={() => setAccount(!account)}
            >
              <span>{user.name?.[0] || 'L'}</span>
            </button>
            {account && (
              <div className="popover account-menu">
                <strong>{user.name}</strong>
                {[
                  ...(!user.localWorkspace ? [['我的主页', '/profile']] : []),
                  ['我的项目', '/project'],
                  ['我的资产', '/assets'],
                ].map(([t, url]) => (
                  <button key={url} onClick={() => navigate(url)}>
                    {t}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setTheme(theme === 'dark' ? 'light' : 'dark');
                    setAccount(false);
                  }}
                >
                  模式切换
                </button>
              </div>
            )}
          </div>
        ) : (
          <button className="white-button" onClick={login}>
            注册/登录
          </button>
        )}
      </div>
    </header>
  );
}
