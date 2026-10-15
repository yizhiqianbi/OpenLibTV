import './selector.css';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { asset } from '../../services/assets.ts';
import { displaySkillKey, filterPickerSkills } from '../../services/skill-presentation.js';
import SkillCreateMenu from './SkillCreateMenu.jsx';

export default function SkillPicker({
  catalogue,
  recommended,
  drafts,
  favorites,
  commonIds,
  user,
  login,
  onSelect,
  onDetail,
  onAll,
  onCreate,
  triggerRef,
  loading = false,
  error = null,
  onRetry,
  mineError = null,
}) {
  const [tab, setTab] = useState('通用');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({});
  const [preview, setPreview] = useState(null);
  const search = useRef();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  useLayoutEffect(() => {
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(450, window.innerWidth - 24);
      const height = Math.min(400, window.innerHeight - 24);
      setPosition({
        width,
        height,
        left: Math.max(
          12,
          Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12),
        ),
        top: Math.max(
          12,
          Math.min(
            rect.top >= height + 8 ? rect.top - height - 8 : rect.bottom + 8,
            window.innerHeight - height - 12,
          ),
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [triggerRef]);
  const items = filterPickerSkills({
    catalogue,
    recommended,
    drafts,
    favorites,
    commonIds,
    tab,
    query,
  });
  const publicList = query || tab !== '我的';
  return (
    <div className="sk-selector-picker" style={position} role="dialog" aria-label="Skill 选择器">
      <header>
        <strong>Skill</strong>
        <SkillCreateMenu onCreate={onCreate} />
        <button type="button" onClick={onAll}>
          全部
        </button>
      </header>
      <div className="sk-selector-picker-filters">
        <div role="tablist" aria-label="选择器列表">
          {['通用', '收藏', '我的'].map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === value}
              key={value}
              onClick={() => {
                if (value !== '通用' && !user) return login?.();
                setTab(value);
                setInput('');
                setQuery('');
                setPreview(null);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="sk-selector-search">
          <Icon name="search" size={14} />
          <input
            ref={search}
            aria-label="选择器搜索 Skill"
            placeholder="搜索 Skill"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          {input && (
            <button
              type="button"
              aria-label="清除选择器搜索"
              onClick={() => {
                setInput('');
                setQuery('');
                search.current?.focus();
              }}
            >
              <Icon name="close-s" size={12} />
            </button>
          )}
        </label>
      </div>
      <div className="sk-selector-picker-list">
        {tab === '我的' && mineError && (
          <p className="sk-selector-state" role="alert">
            本地 Skill 未正确加载，原数据已保留。
          </p>
        )}
        {publicList && loading && (
          <p className="sk-selector-state" role="status">
            加载中...
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
        {(!publicList || (!loading && !error)) &&
          !(tab === '我的' && mineError) &&
          !items.length && (
            <p className="sk-selector-state">{query ? '未找到匹配的 Skill' : '暂无 Skill'}</p>
          )}
        {items.map((item) => (
          <div
            className="sk-selector-row"
            key={item.templateUuid || item.skillUuid || item.skillKey}
            role="button"
            tabIndex={0}
            aria-label={'添加 ' + item.name}
            onClick={() => onSelect(item)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                onSelect(item);
              }
            }}
            onMouseEnter={() => setPreview(item)}
            onMouseLeave={() => setPreview(null)}
            onFocus={() => setPreview(item)}
            onBlur={() => setPreview(null)}
          >
            <span className="sk-selector-glyph">
              <Icon name="skill" size={16} />
            </span>
            <div className="sk-selector-row-body">
              <div>
                <strong>{item.name}</strong>
                <span title={item.skillKey}>{displaySkillKey(item)}</span>
              </div>
              <p>{item.description}</p>
              <button
                type="button"
                className="sk-selector-row-detail"
                aria-label={'查看 ' + item.name + ' 详情'}
                onClick={(event) => {
                  event.stopPropagation();
                  onDetail(item);
                }}
              >
                详情
              </button>
            </div>
          </div>
        ))}
        {tab === '通用' && !query && items.length > 0 && (
          <button type="button" className="sk-selector-view-all" onClick={onAll}>
            没找到合适的？查看全部 Skill <Icon name="right-s" size={14} />
          </button>
        )}
      </div>
      {preview && (
        <aside className="sk-selector-preview" aria-hidden="true">
          <img src={asset(preview.coverUrl)} alt="" />
          <div>
            <strong>{preview.name}</strong>
            <p>{preview.description}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
