import React from 'react';
import './selector.css';
import Icon from '../Icon.jsx';
import { asset } from '../../services/assets.ts';
import { shortCount } from '../../services/presentation.js';
import { isSkillFavorite, skillTypeLabel } from '../../services/skill-presentation.js';
export default function SkillCard({
  item: i,
  favs = [],
  onOpen,
  onFavorite,
  onUse,
  useLabel,
  status,
  actions,
}) {
  const favorite = isSkillFavorite(i, favs);
  return (
    <article className="skill-card" onClick={onOpen}>
      <button
        className="skill-cover"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {i.coverUrl ? (
          <img src={asset(i.coverUrl)} alt={i.name} loading="lazy" />
        ) : (
          <div className="skill-cover-placeholder" aria-label="未设置封面">
            <Icon name="skill" size={36} />
          </div>
        )}
        <span>{skillTypeLabel(i.resultType)}</span>
        <small>/{i.skillKey?.replace(/-[a-f0-9]{32}.*$/, '')}</small>
      </button>
      <div className="skill-card-body">
        <button
          className="skill-name"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          {i.name}
        </button>
        <p>{i.description}</p>
        {status || (
          <div className="skill-author">
            {(i.ownerAvatar || i.avatar) && <img src={asset(i.ownerAvatar || i.avatar)} alt="" />}
            <span>{i.ownerName || i.nickname}</span>
            <Icon name="team" size={15} />
            {shortCount(i.useUv || i.usePv)}
          </div>
        )}
        <div className="skill-hover">
          {actions || (
            <>
              <button
                aria-label={favorite ? '取消收藏' : '收藏'}
                onClick={(event) => {
                  event.stopPropagation();
                  onFavorite();
                }}
              >
                <Icon name={favorite ? 'star-f' : 'star'} size={16} />
              </button>
              <button
                className="white-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUse();
                }}
              >
                {useLabel || (i.localDemo ? '编辑' : '使用')}
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
