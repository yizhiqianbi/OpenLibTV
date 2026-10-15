import React from 'react';

export function AcademyState({ loading, children, retry, label = '加载中' }) {
  return (
    <div
      className="academy-route-state"
      role={loading ? 'status' : undefined}
      aria-label={loading ? label : undefined}
    >
      {loading ? (
        <span className="spinner" />
      ) : (
        <>
          <p>{children}</p>
          {retry && <button onClick={retry}>重试</button>}
        </>
      )}
    </div>
  );
}

export function WatchPlaceholder() {
  return (
    <div className="academy-course-placeholder" aria-label="暂无可播放课程">
      <div />
    </div>
  );
}
