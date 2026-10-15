import React, { useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import SidebarContent from './SidebarContent.jsx';
import { useDialogBehavior } from '../../hooks/useDialogBehavior.js';

export default function MobileDrawer({ ui, path }) {
  const { setDrawer, setTheme, theme } = ui;
  const ref = useRef(null);
  useDialogBehavior(ref, {
    onClose: () => {
      setDrawer(false);
      // The shared dialog stops key propagation, so retain the shell's Escape menu cleanup.
      ui.setPlugins(false);
      ui.setHelp(false);
      ui.setAccount(false);
    },
  });

  return (
    <div
      ref={ref}
      className="mobile-drawer"
      role="dialog"
      aria-label="侧边栏"
      aria-modal="true"
      tabIndex={-1}
    >
      <button
        aria-label="关闭侧边栏"
        className="icon-button drawer-close"
        onClick={() => setDrawer(false)}
      >
        <Icon name="close" />
      </button>
      <SidebarContent {...ui} path={path} />
      <div className="drawer-footer">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          模式切换 <Icon name="light-dark" />
        </button>
        <div className="social-links">
          <a
            target="_blank"
            rel="noreferrer"
            href="https://www.xiaohongshu.com/user/profile/5fe24c55000000000101cd56"
          >
            小红书
          </a>
          <a target="_blank" rel="noreferrer" href="https://space.bilibili.com/482619845">
            bilibili
          </a>
        </div>
        <p>
          <a href="https://www.liblib.art/activities/468ad794ccc7408d81757fd91be003ec">
            《用户协议》
          </a>{' '}
          |{' '}
          <a href="https://www.liblib.art/activities/7a354f41ead34f719eb49576e5292d00">
            《隐私政策》
          </a>
        </p>
        <p>2026 © 哩布哩布AI</p>
        <p>上海哩布哩布科技有限公司</p>
        <p>地址: 上海市徐汇区丰谷路315弄24号1-3层</p>
        <p>电话: 010-62020220</p>
        <p>沪ICP备2025147903号-7</p>
      </div>
    </div>
  );
}
