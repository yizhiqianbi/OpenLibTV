import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../../../components/Icon.jsx';
import { useContent } from '../../../data.js';
import GalleryCard from './GalleryCard.jsx';
import { selectGallerySource, filterGalleryItems } from '../domain/gallery-filter.js';

function GalleryView({
  navigate,
  login,
  title = 'TV Show',
  items: override,
  compact = false,
  initial = null,
  all = null,
  categories = [],
  loading = false,
  error = null,
  onRetry,
}) {
  const [selected, setSelected] = useState(0),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [limit, setLimit] = useState(20);
  const tabs = useRef(),
    load = useRef();
  const source = useMemo(
    () => selectGallerySource({ initial, all, categories, override, selected }),
    [initial, all, categories, override, selected],
  );
  const filtered = useMemo(
    () => filterGalleryItems({ source, search, all, override, selected }),
    [source, search, all, override, selected],
  );
  useEffect(() => {
    setLimit(20);
  }, [selected, search]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting) setLimit((n) => Math.min(n + 20, filtered.length));
      },
      { rootMargin: '200px' },
    );
    if (load.current) ob.observe(load.current);
    return () => ob.disconnect();
  }, [filtered.length]);
  return (
    <section className={`gallery-section ${compact ? 'compact-gallery' : ''}`} id="tv-show">
      <h2>{title}</h2>
      {!override && (
        <div className="gallery-controls">
          <div className="tab-scroll-wrap">
            <div className="gallery-tabs" ref={tabs} role="tablist">
              <button
                role="tab"
                aria-selected={!selected}
                className={!selected ? 'active' : ''}
                onClick={() => setSelected(0)}
              >
                全部
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={selected === c.id}
                  className={selected === c.id ? 'active' : ''}
                  onClick={() => setSelected(c.id)}
                >
                  {c.tagLabel === '全网爆款' && <span className="fire">🔥 </span>}
                  {c.tagLabel}
                </button>
              ))}
            </div>
            <button
              className="tab-next icon-button"
              aria-label="向右滚动"
              onClick={() => tabs.current.scrollBy({ left: 300, behavior: 'smooth' })}
            >
              <Icon name="right-s" size={16} />
            </button>
          </div>
          <form
            className="search-field"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query);
            }}
          >
            <input
              aria-label="搜索作品"
              placeholder="请输入搜索内容"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setSearch('');
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => {
                  setQuery('');
                  setSearch('');
                }}
              >
                <Icon name="close-s" size={14} />
              </button>
            )}
            <button aria-label="搜索" type="submit">
              <Icon name="search" size={18} />
            </button>
          </form>
        </div>
      )}
      {error && (
        <div className="empty-state" role="alert">
          <p>作品加载失败，请重试</p>
          <button className="soft-button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}
      <div className="gallery-grid">
        {filtered.slice(0, limit).map((item, i) => (
          <GalleryCard
            key={`${item.templateUuid || item.id}-${i}`}
            item={item}
            navigate={navigate}
            login={login}
          />
        ))}
      </div>
      {filtered.length === 0 && loading && (
        <div className="empty-state" role="status">
          <span className="spinner" />
          <p>加载作品...</p>
        </div>
      )}
      {filtered.length === 0 && !loading && !error && (
        <div className="empty-state">
          <Icon name="file-search" size={56} />
          <p>{search ? '没有找到相关作品' : '暂无作品'}</p>
        </div>
      )}
      <div ref={load} className="load-more">
        {limit < filtered.length ? (
          <>
            <span className="spinner" /> 加载中...
          </>
        ) : filtered.length > 20 ? (
          '已经到底了'
        ) : (
          ''
        )}
      </div>
    </section>
  );
}

function CatalogueGallery(props) {
  const gallery = useContent('gallery', null);
  const all = useContent('gallery-all', null);
  const categories = useContent('gallery-categories', null);
  const resources = [gallery, all, categories];
  return (
    <GalleryView
      {...props}
      initial={gallery.data}
      all={all.data}
      categories={categories.data || []}
      loading={resources.some((resource) => resource.loading)}
      error={resources.find((resource) => resource.error)?.error}
      onRetry={() =>
        Promise.allSettled(
          resources.filter((resource) => resource.error).map((resource) => resource.reload()),
        )
      }
    />
  );
}

export default function Gallery(props) {
  return props.items ? <GalleryView {...props} /> : <CatalogueGallery {...props} />;
}
