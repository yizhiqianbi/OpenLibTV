import { withSecondaryData } from '../shared/secondary/SecondaryContent.jsx';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { End } from '../shared/secondary/SecondaryLayout.jsx';
import { localHref } from '../../data.js';
import { productCopy } from '../shared/secondary/text.js';
import { createSnapshotFeatureUpdatesSource } from './feature-updates-model.js';
import { useFeatureUpdatesList } from './useFeatureUpdatesList.js';

function FeatureUpdates({ data, login, asset, user, featureUpdatesSource }) {
  const source = useMemo(
    () => featureUpdatesSource || createSnapshotFeatureUpdatesSource(data.versions),
    [data.versions, featureUpdatesSource],
  );
  const {
    items: versions,
    hasMore,
    isLoaded,
    isLoading,
    error,
    loadMore,
  } = useFeatureUpdatesList({ source });
  const observerRef = useRef(null);
  const loaderState = useRef({ hasMore, isLoading, loadMore });
  loaderState.current = { hasMore, isLoading, loadMore };

  const sentinelRef = useCallback((element) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        const current = loaderState.current;
        if (current.hasMore && !current.isLoading) void current.loadMore();
      },
      { rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(element);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  function openFeature(feature) {
    if (!feature.linkUrl) return;
    const target = localHref(feature.linkUrl);
    if (!user) {
      login({
        redirectUrl: target,
        entrySource: 'feature_updates',
        buttonName: feature.buttonText,
      });
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }
  return (
    <div className="secondary-page feature-updates-page">
      <h1>版本更新记录</h1>
      {!isLoaded && isLoading && (
        <p className="secondary-loading" role="status">
          加载中
        </p>
      )}
      {versions.map((version) => (
        <section className="feature-version" key={version.id}>
          <div className="feature-version-meta">
            <span>v{version.versionNo}</span>
            <p>
              {version.releaseDate.replace(
                /^(\d+)-(\d+)-(\d+)$/,
                (_, y, m, d) => `${y} 年 ${+m} 月 ${+d} 日`,
              )}
            </p>
          </div>
          <div className="feature-version-content">
            <h2>{productCopy(version.summary)}</h2>
            <div className="feature-list">
              {version.features.map((feature) => (
                <article className="feature-item" key={feature.id}>
                  <div className="feature-media">
                    {feature.mediaType === 1 ? (
                      <img src={asset(feature.mediaUrl)} alt={productCopy(feature.name)} />
                    ) : (
                      <video
                        src={asset(feature.mediaUrl)}
                        muted
                        autoPlay
                        loop
                        playsInline
                        preload="metadata"
                        aria-label={productCopy(feature.name)}
                      />
                    )}
                  </div>
                  <div className="feature-item-copy">
                    <h3>{productCopy(feature.name)}</h3>
                    <p>{productCopy(feature.description)}</p>
                    {feature.linkUrl && (
                      <button onClick={() => openFeature(feature)}>
                        {feature.buttonText || '去体验'}
                        <ChevronRight size={18} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {version.otherOptimizations.length > 0 && (
              <div className="feature-optimizations">
                <h3>{productCopy(version.optimizationTitle)}</h3>
                <ul>
                  {version.otherOptimizations.map((line, i) => (
                    <li key={i}>{productCopy(line)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      ))}
      <div ref={sentinelRef} aria-hidden="true" className="feature-updates-sentinel" />
      {error && (
        <div className="feature-updates-retry" role="alert">
          <span>版本更新加载失败</span>
          <button type="button" className="soft-button" onClick={() => void loadMore()}>
            重试
          </button>
        </div>
      )}
      {isLoading && versions.length > 0 && (
        <p className="secondary-end" role="status">
          加载中…
        </p>
      )}
      {!hasMore && versions.length > 0 ? <End /> : null}
      {!isLoaded && !isLoading && (
        <p className="secondary-empty">{data.commonLocale.featureUpdatesEmpty || '暂无版本更新'}</p>
      )}
    </div>
  );
}

const FeatureUpdatesPage = withSecondaryData(FeatureUpdates);
export default FeatureUpdatesPage;
