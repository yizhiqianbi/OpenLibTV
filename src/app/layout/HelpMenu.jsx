import React from 'react';
import Icon from '../../components/Icon.jsx';

export default function HelpMenu({ ui }) {
  const { navigate, setModal, setHelp, setTheme, theme } = ui;
  return (
    <div className="popover help-menu">
      {[
        ['使用教程', 'academy', '/academy'],
        ['版本更新记录', 'bulb', '/feature-updates'],
        ['插件与扩展', 'terminal', '/plugin'],
      ].map(([t, i, u]) => (
        <button onClick={() => navigate(u)} key={u}>
          <Icon name={i} />
          {t}
        </button>
      ))}
      <button
        onClick={() => {
          setModal('contact');
          setHelp(false);
        }}
      >
        <Icon name="contact" /> 联系客服
      </button>
      <button
        onClick={() => {
          setTheme(theme === 'dark' ? 'light' : 'dark');
          setHelp(false);
        }}
      >
        <Icon name="light-dark" /> 模式切换 <span>{theme === 'dark' ? '浅色' : '深色'}</span>
      </button>
    </div>
  );
}
