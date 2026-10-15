import React from 'react';
import PromoBanner from './PromoBanner.jsx';
import SidebarContent from './SidebarContent.jsx';
import Topbar from './Topbar.jsx';
import HelpMenu from './HelpMenu.jsx';
import NewcomerCard from './NewcomerCard.jsx';
import MobileDrawer from './MobileDrawer.jsx';

export default function AppShell({ standalone, chrome = false, path, ui, children }) {
  const { collapsed, promo, setPromo, member, drawer, user, help, setHelp, newcomer, modal } = ui;
  return (
    <>
      <div
        className={`app ${standalone ? 'standalone' : ''} ${chrome ? 'header-only' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}
      >
        {!standalone && (
          <>
            {promo && <PromoBanner onClose={() => setPromo(false)} onClick={member} />}
            {!chrome && (
              <aside className="sidebar" aria-label="侧边导航">
                <SidebarContent {...ui} path={path} />
              </aside>
            )}
          </>
        )}
        <div className="main-content">
          {!standalone && <Topbar ui={ui} chrome={chrome} />}
          {children}
        </div>
        {!standalone && (
          <button
            className="help-button round-button"
            aria-label="帮助信息"
            onClick={() => setHelp(!help)}
          >
            ?
          </button>
        )}
        {help && <HelpMenu ui={ui} />}
        {path === '/' && !user && newcomer && !modal && <NewcomerCard ui={ui} />}
      </div>
      {drawer && <MobileDrawer ui={ui} path={path} />}
    </>
  );
}
