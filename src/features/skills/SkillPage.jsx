import React, { useState, useRef, useEffect } from 'react';
import Icon from '../../components/Icon.jsx';
import { useContent, useLocalState } from '../../data.js';
import SkillCard from './components/SkillCard.jsx';
import SkillDetailModal from '../../components/skills/SkillDetailModal.jsx';
import SkillAssetPicker from './components/SkillAssetPicker.jsx';
import SkillLibraryModal from '../../components/skills/SkillLibraryModal.jsx';
import SkillCreateMenu from '../../components/skills/SkillCreateMenu.jsx';
import AgentReferencePreview from '../../components/agent/AgentReferencePreview.jsx';
import { pickerCatalogue } from '../../services/skill-presentation.js';
import SkillComposer from './components/SkillComposer.jsx';
import { useSkillComposer } from './hooks/useSkillComposer.js';
import './selector.css';
import { useSkillMine } from './mine/useSkillMine.js';
import SkillMineDialogs, { SkillMineDeleted } from './mine/SkillMineDialogs.jsx';
import {
  filterSkills,
  resolveSkillDetail,
  SKILL_CATEGORIES,
  isSkillFavorite,
  toggleSkillFavorite,
} from './domain/skill-filter.js';

export default function SkillPage({
  navigate,
  login,
  user,
  toast,
  search = location.search,
  assetSource,
}) {
  const catalogueResource = useContent('skills', null);
  const recommendedResource = useContent('skills-recommended', null);
  const detailResource = useContent('skill-details', {});
  const data = catalogueResource.data || { items: [], tags: [] };
  const recommended = recommendedResource.data;
  const skillDetails = detailResource.data;
  const mine = useSkillMine({ user, login, navigate, toast });
  const drafts = mine.skills;
  const [tab, setTab] = useState(
      new URLSearchParams(search).get('tab') === 'mine' ? '我的' : 'Skill',
    ),
    [category, setCategory] = useState('推荐'),
    [query, setQuery] = useState(''),
    [searchInput, setSearchInput] = useState(''),
    [detail, setDetail] = useState(null);
  const [favs, setFavs] = useLocalState('libtv-skill-favorites', []);
  const [limit, setLimit] = useState(40);
  const loader = useRef();
  const tabs = useRef();
  const searchField = useRef();
  const composer = useSkillComposer({ search, user, login, navigate, toast });
  const {
    menu,
    setMenu,
    skillTrigger,
    selectSkill,
    createSkill,
    preview,
    setPreview,
    allSkills,
    setAllSkills,
    assetPicker,
    setAssetPicker,
    pickAssets,
  } = composer;
  const visibleDetail = detail && resolveSkillDetail(detail, skillDetails);
  const items = filterSkills({
    catalogue: data.items,
    recommended,
    drafts,
    tab,
    category,
    query,
    favorites: favs,
  });
  const categories = SKILL_CATEGORIES;
  const toggleFavorite = (skill) => {
    if (!user) return login();
    if (!setFavs((favorites) => toggleSkillFavorite(skill, favorites)))
      toast?.('本地保存失败，请检查浏览器存储空间');
  };
  const openDetail = (item) => {
    if (menu === 'skill') skillTrigger.current?.focus();
    setMenu(null);
    setDetail(resolveSkillDetail(item, skillDetails));
  };
  const needsPublicData = tab !== '我的';
  const needsRecommendations = tab === 'Skill' && category === '推荐' && !query;
  const listResources = needsPublicData
    ? [catalogueResource, ...(needsRecommendations ? [recommendedResource] : [])]
    : [];
  const listLoading = listResources.some((resource) => resource.loading && !resource.data);
  const listErrors = listResources.filter((resource) => resource.error);
  const retry = () => Promise.allSettled(listErrors.map((resource) => resource.reload()));
  useEffect(() => {
    if (new URLSearchParams(search).get('tab') === 'mine') setTab('我的');
  }, [search]);
  useEffect(() => {
    setLimit(40);
  }, [category, query, tab]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const o = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setLimit((n) => Math.min(n + 40, items.length));
      },
      { rootMargin: '200px' },
    );
    if (loader.current) o.observe(loader.current);
    return () => o.disconnect();
  }, [items.length, limit]);
  return (
    <div className="skill-page page-inner">
      <SkillComposer
        controller={composer}
        catalogueResource={catalogueResource}
        data={data}
        recommended={recommended}
        drafts={drafts}
        favs={favs}
        openDetail={openDetail}
        user={user}
        login={login}
        toast={toast}
      />
      <section id="skill-list" className="skill-list">
        <div className="skill-main-tabs">
          {['Skill', '收藏', '我的'].map((t) => (
            <button
              className={tab === t ? 'active' : ''}
              onClick={() => {
                if (t !== 'Skill' && !user) return login();
                setTab(t);
              }}
              key={t}
            >
              {t}
            </button>
          ))}
          {tab === '我的' && <SkillCreateMenu primary onCreate={createSkill} />}
        </div>
        {tab === 'Skill' && (
          <div className="skill-filters">
            <div className="skill-categories" ref={tabs}>
              {categories.map((c) => (
                <button
                  className={category === c ? 'active' : ''}
                  onClick={() => setCategory(c)}
                  key={c}
                >
                  {c === '推荐' && query ? '全部' : c}
                </button>
              ))}
            </div>
            <button
              className="skill-next icon-button"
              onClick={() => tabs.current.scrollBy({ left: 280, behavior: 'smooth' })}
              aria-label="向右滚动"
            >
              <Icon name="right-s" />
            </button>
            <div className="search-field">
              <input
                aria-label="搜索 Skill"
                ref={searchField}
                placeholder="搜索 Skill"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) setQuery(searchInput.trim());
                }}
              />
              {searchInput && (
                <button
                  aria-label="清除搜索"
                  onClick={() => {
                    setSearchInput('');
                    setQuery('');
                    searchField.current?.focus();
                  }}
                >
                  <Icon name="close-s" size={14} />
                </button>
              )}
              <button aria-label="搜索" onClick={() => setQuery(searchInput.trim())}>
                <Icon name="search" />
              </button>
            </div>
          </div>
        )}
        {listLoading && (
          <div role="status" className="empty-state">
            加载 Skill...
          </div>
        )}
        {listErrors.length > 0 && (
          <div role="alert" className="empty-state">
            <p>Skill 加载失败</p>
            <button className="soft-button" onClick={retry}>
              重试
            </button>
          </div>
        )}
        {tab === '我的' && mine.error && (
          <div role="alert" className="empty-state">
            我的 Skill 未正确加载，原数据已保留。
          </div>
        )}
        <div className="skill-grid">
          {items.slice(0, limit).map((i) => (
            <SkillCard
              key={i.skillUuid}
              item={i}
              favs={favs}
              onOpen={() => openDetail(i)}
              onFavorite={() => toggleFavorite(i)}
              mineActions={
                tab === '我的'
                  ? mine.cardActions(i, {
                      onDetail: () => openDetail(i),
                      onAdd: () => selectSkill(i),
                    })
                  : undefined
              }
              onUse={() =>
                i.localDemo ? navigate('/skill/create?skillUuid=' + i.skillUuid) : selectSkill(i)
              }
            />
          ))}
        </div>
        {!listLoading && !listErrors.length && items.length === 0 && (
          <div className="empty-state">
            <Icon name="assets-empty" size={72} />
            <p>
              {tab === '我的'
                ? '还没有发布 Skill'
                : tab === '收藏'
                  ? '暂无收藏'
                  : '未找到相关 Skill'}
            </p>
          </div>
        )}
        {tab === '我的' && mine.deletedSkills.length > 0 && <SkillMineDeleted controller={mine} />}
      </section>
      <SkillMineDialogs controller={mine} categories={data.tags} />
      {preview && <AgentReferencePreview reference={preview} onClose={() => setPreview(null)} />}
      <div ref={loader} className="load-more">
        {limit < items.length ? '加载中...' : ''}
      </div>
      {allSkills && (
        <SkillLibraryModal
          catalogue={pickerCatalogue(data.items, recommended)}
          recommended={recommended}
          drafts={drafts}
          favorites={favs}
          user={user}
          login={login}
          onSelect={selectSkill}
          onDetail={openDetail}
          onFavorite={toggleFavorite}
          onClose={() => setAllSkills(false)}
          loading={catalogueResource.loading && !catalogueResource.data}
          error={catalogueResource.error}
          onRetry={() => void catalogueResource.reload().catch(() => undefined)}
        />
      )}
      {detail && (
        <SkillDetailModal
          key={detail.skillUuid || detail.templateUuid}
          detail={visibleDetail}
          favorite={isSkillFavorite(visibleDetail, favs)}
          onFavorite={() => toggleFavorite(visibleDetail)}
          onUse={selectSkill}
          onClose={() => setDetail(null)}
          toast={toast}
          loading={!detail.localDemo && detailResource.loading}
          error={!detail.localDemo && detailResource.error}
          onRetry={() => void detailResource.reload().catch(() => undefined)}
        />
      )}
      {assetPicker && (
        <SkillAssetPicker
          onClose={() => setAssetPicker(false)}
          onPickAssets={pickAssets}
          assetSource={assetSource}
        />
      )}
    </div>
  );
}
