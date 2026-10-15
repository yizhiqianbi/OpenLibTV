import { withSecondaryData } from '../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useMemo, useRef } from 'react';
import { Gift, CircleCheck } from 'lucide-react';
import { PageBack, End } from '../shared/secondary/SecondaryLayout.jsx';
import { createSnapshotActivitySource } from './activity-list-model.js';
import { useActivityList } from './useActivityList.js';

const EMPTY_ACTIVITIES = [];

function Activities({
  data,
  navigate,
  login,
  asset,
  user,
  activitySource,
  activityInitialPage,
  activityPageSize = 20,
}) {
  const activities = Array.isArray(data.activities) ? data.activities : EMPTY_ACTIVITIES;
  const source = useMemo(
    () => activitySource || createSnapshotActivitySource(activities),
    [activitySource, activities],
  );
  const initialPage = useMemo(
    () =>
      activitySource
        ? activityInitialPage
        : { list: activities.slice(0, activityPageSize), total: activities.length },
    [activitySource, activityInitialPage, activities, activityPageSize],
  );
  const list = useActivityList({ source, initialPage, pageSize: activityPageSize });
  const { hasMore, isLoading, error, items, loadMore, isLoaded } = list;
  const sentinel = useRef(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || isLoading || error || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoading, error, loadMore, items.length]);
  return (
    <div className="secondary-page activity-page">
      <PageBack name="挑战赛" navigate={navigate} />
      <div className="activity-grid">
        {items.map((item) => (
          <button
            key={item.activityId}
            className="activity-card"
            onClick={() => (user ? navigate(`/activity/${item.activityId}`) : login())}
          >
            <div className="activity-image">
              <img src={asset(item.coverUrl)} alt={item.name} />
              <div className={'activity-status ' + (item.status === 2 ? 'active' : '')}>
                {item.status === 2 ? (
                  <CircleCheck size={14} />
                ) : item.status >= 4 ? (
                  <Gift size={14} />
                ) : null}
                {{ 1: '即将开始', 2: '进行中', 3: '评审中', 4: '已颁奖' }[item.status] || '已颁奖'}
              </div>
              {item.rewardDescription && (
                <div className="activity-reward">
                  <Gift size={15} />
                  <span>{item.rewardDescription}</span>
                </div>
              )}
            </div>
            <h3>{item.name}</h3>
            {item.shortDescription && <p>{item.shortDescription}</p>}
          </button>
        ))}
      </div>
      {!items.length && (!isLoaded || isLoading) && (
        <div className="activity-grid activity-list-skeleton" aria-label="活动加载中">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="activity-card-skeleton" key={index} aria-hidden="true">
              <div />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}
      {!items.length && isLoaded && !isLoading && !error && (
        <p className="secondary-empty">暂无活动</p>
      )}
      {error && (
        <div className="activity-list-error" role="alert">
          <p>活动加载失败</p>
          <button type="button" onClick={() => void loadMore()}>
            重试
          </button>
        </div>
      )}
      {isLoading && items.length > 0 && <p className="secondary-end">加载更多…</p>}
      <div ref={sentinel} className="activity-list-sentinel" aria-hidden="true" />
      {!hasMore && isLoaded && items.length > 0 && <End />}
    </div>
  );
}

const ActivitiesPage = withSecondaryData(Activities);
export default ActivitiesPage;
