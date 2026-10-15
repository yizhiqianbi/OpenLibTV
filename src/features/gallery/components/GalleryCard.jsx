import React, { useRef, useState } from 'react';
import Icon from '../../../components/Icon.jsx';
import { asset, shortCount } from '../../../data.js';

export default function GalleryCard({ item, navigate, login }) {
  const video = useRef();
  const [hover, setHover] = useState(false);
  const enter = () => {
    setHover(true);
    video.current?.play().catch(() => {});
  };
  const leave = () => {
    setHover(false);
    video.current?.pause();
  };
  return (
    <article className="gallery-card" onMouseEnter={enter} onMouseLeave={leave}>
      <div
        className="gallery-cover"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && e.key === 'Enter')
            navigate(`/detail/${item.templateUuid || item.id}`);
        }}
        onClick={() => navigate(`/detail/${item.templateUuid || item.id}`)}
        aria-label={`观看 ${item.name || item.title}`}
      >
        <img src={asset(item.coverUrl)} alt={item.name || item.title} loading="lazy" />
        {hover && item.finalOutput && (
          <video
            ref={video}
            src={item.finalOutput}
            muted
            playsInline
            loop
            autoPlay
            preload="none"
            poster={asset(item.coverUrl)}
          />
        )}
        {item.awardedTag?.length > 0 && (
          <span className="award-label">
            ♜ {item.tags?.find((t) => t.tagType === 5)?.tagLabel} - {item.awardedTag.join(' · ')}
          </span>
        )}
        <span className="play-indicator">
          <Icon name="play-f" size={26} />
        </span>
        <span className="gallery-overlay">
          <button
            className="white-button"
            disabled={!item.snapshotId}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/detail/${item.templateUuid || item.id}?preview=1`);
            }}
          >
            查看创作过程 <Icon name="arrow-up-right" size={14} />
          </button>
        </span>
      </div>
      <div className="gallery-meta">
        <button
          className="avatar-button"
          onClick={() => navigate(`/profile?uuid=${item.ownerUuid || ''}`)}
        >
          <img className="avatar" src={asset(item.avatar)} alt={item.nickname} />
          {item.userTags?.[0] && (
            <img
              className="avatar-badge"
              src={asset(item.userTags[0].primaryIcon)}
              alt={item.userTags[0].name}
            />
          )}
        </button>
        <div className="gallery-caption">
          <button
            className="work-title"
            onClick={() => navigate(`/detail/${item.templateUuid || item.id}`)}
          >
            {item.name || item.title}
          </button>
          <button
            className="work-author"
            onClick={() => navigate(`/profile?uuid=${item.ownerUuid || ''}`)}
          >
            {(item.tags?.find((t) => t.code?.startsWith('viral_likes'))?.tagLabel ||
              item.socialMediaLikeCount > 0) && (
              <em>
                {item.tags?.find((t) => t.code?.startsWith('viral_likes'))?.tagLabel ||
                  `全网点赞${shortCount(item.socialMediaLikeCount)}+`}
              </em>
            )}
            {item.nickname}
          </button>
        </div>
      </div>
    </article>
  );
}
