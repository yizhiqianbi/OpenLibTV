import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal.jsx';
import Icon from '../Icon.jsx';
import SkillCard from './PublicSkillCard.jsx';
import { filterSkills, SKILL_CATEGORIES } from '../../services/skill-presentation.js';

export default function SkillLibraryModal({
  catalogue,
  recommended,
  drafts,
  favorites,
  user,
  login,
  onSelect,
  onDetail,
  onFavorite,
  onClose,
  loading = false,
  error = null,
  onRetry,
  mineError = null,
}) {
  const [tab, setTab] = useState('Skill');
  const [category, setCategory] = useState('推荐');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const scroll = useRef();
  const tabs = useRef();
  const more = useRef();
  const search = useRef();
  const items = filterSkills({ catalogue, recommended, drafts, favorites, tab, category, query });
  useEffect(() => {
    setLimit(20);
    scroll.current?.scrollTo?.({ top: 0 });
  }, [tab, category, query]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((value) => Math.min(value + 20, items.length));
      },
      { root: scroll.current, rootMargin: '300px' },
    );
    if (more.current) observer.observe(more.current);
    return () => observer.disconnect();
  }, [items.length, limit]);
  const publicList = tab !== '我的';
  return (
    <Modal className="sk-selector-full" title="全部 Skill" onClose={onClose}>
      <div className="sk-selector-full-scroll" ref={scroll}>
        <header className="sk-selector-full-header">
          <div role="tablist" aria-label="全部 Skill 列表">
            {['Skill', '收藏', '我的'].map((value) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => {
                  if (value !== 'Skill' && !user) return login?.();
                  setTab(value);
                }}
              >
                {value}
              </button>
            ))}
          </div>
          {tab === 'Skill' && (
            <div className="sk-selector-full-filters">
              <div className="sk-selector-categories" ref={tabs}>
                {SKILL_CATEGORIES.map((value) => (
                  <button
                    type="button"
                    aria-pressed={category === value}
                    key={value}
                    onClick={() => setCategory(value)}
                  >
                    {value === '推荐' && query ? '全部' : value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="sk-selector-category-next"
                aria-label="向右滚动分类"
                onClick={() => tabs.current?.scrollBy?.({ left: 240, behavior: 'smooth' })}
              >
                <Icon name="right-s" size={14} />
              </button>
              <div className="sk-selector-search">
                <input
                  ref={search}
                  aria-label="全部搜索 Skill"
                  placeholder="搜索 Skill"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    )
                      setQuery(input.trim());
                  }}
                />
                {input && (
                  <button
                    type="button"
                    aria-label="清除全部搜索"
                    onClick={() => {
                      setInput('');
                      setQuery('');
                      search.current?.focus();
                    }}
                  >
                    <Icon name="close-s" size={14} />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="搜索全部 Skill"
                  onClick={() => setQuery(input.trim())}
                >
                  <Icon name="search" size={14} />
                </button>
              </div>
            </div>
          )}
        </header>
        {publicList && loading && (
          <p className="sk-selector-state" role="status">
            加载 Skill...
          </p>
        )}
        {publicList && error && (
          <div className="sk-selector-state" role="alert">
            Skill 加载失败{' '}
            <button type="button" onClick={onRetry}>
              重试
            </button>
          </div>
        )}
        {tab === '我的' && mineError && (
          <p className="sk-selector-state" role="alert">
            本地 Skill 未正确加载，原数据已保留。
          </p>
        )}
        <div className="sk-selector-full-grid">
          {items.slice(0, limit).map((item) => (
            <SkillCard
              key={item.templateUuid || item.skillUuid || item.skillKey}
              item={item}
              favs={favorites}
              onOpen={() => onDetail(item)}
              onFavorite={() => onFavorite(item)}
              onUse={() => onSelect(item)}
              useLabel="使用"
            />
          ))}
        </div>
        {(!publicList || (!loading && !error)) &&
          !(tab === '我的' && mineError) &&
          !items.length && (
            <p className="sk-selector-state">
              {query && tab === 'Skill' ? '未找到相关 Skill' : '暂无 Skill'}
            </p>
          )}
        <div ref={more} className="sk-selector-state">
          {limit < items.length ? (
            <button
              type="button"
              onClick={() => setLimit((value) => Math.min(value + 20, items.length))}
            >
              加载更多
            </button>
          ) : items.length > 0 ? (
            '没有更多了'
          ) : (
            ''
          )}
        </div>
      </div>
    </Modal>
  );
}
