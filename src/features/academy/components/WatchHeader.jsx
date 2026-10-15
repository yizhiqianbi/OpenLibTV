import React from 'react';

function WatchHeader({ title, navigate, children }) {
  return (
    <header className="academy-watch-header">
      <button onClick={() => navigate('/academy')}>
        <img src="/assets/penstudio-logo.svg" alt="PenStudio" />
        <strong>学院</strong>
      </button>
      <span>｜</span>
      <p>{title}</p>
      {children && <div className="academy-watch-header-actions">{children}</div>}
    </header>
  );
}

export default WatchHeader;
