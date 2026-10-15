import React from 'react';
import { ChevronLeft } from 'lucide-react';

function PageBack({ name, navigate, to = '/' }) {
  return (
    <div className="secondary-back">
      <button onClick={() => navigate(to)}>
        <ChevronLeft size={16} />
        返回
      </button>
      <span />
      <strong>{name}</strong>
    </div>
  );
}

function End() {
  return <p className="secondary-end">没有更多了</p>;
}

function SecondaryLoading() {
  return (
    <div className="secondary-page secondary-loading" aria-label="加载中">
      <span />
      <span />
      <span />
    </div>
  );
}

function SecondaryLoadError({ reload }) {
  return (
    <div className="secondary-page secondary-empty" role="alert">
      <p>内容加载失败</p>
      <button className="soft-button" onClick={() => void reload().catch(() => undefined)}>
        重试
      </button>
    </div>
  );
}

export { PageBack, End, SecondaryLoading, SecondaryLoadError };
