import React, { useState } from 'react';
import { Check, List, Maximize, Minimize, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { formatPlayerTime } from './player-model.js';

function ChoiceMenu({ values, current, onChange }) {
  return (
    <div className="academy-player-choice" role="menu">
      {values.map((value) => (
        <button
          key={value.key}
          role="menuitemradio"
          aria-checked={current === value.key}
          onClick={() => onChange(value.key)}
        >
          <span>{value.label}</span>
          {current === value.key && <Check size={13} />}
        </button>
      ))}
    </div>
  );
}

export default function PlayerControls({
  media,
  markers,
  marks,
  mobile,
  onGoPracticeMark,
  preferences,
  qualities,
  quality,
  popup,
  setPopup,
  rateOptions,
  qualityOptions,
  changeQuality,
  changeRate,
  fullscreen,
  toggleFullscreen,
  showControls,
  showEpisodes,
  onOpenEpisodes,
}) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  return (
    <div className="academy-player-controls" onMouseEnter={showControls}>
      <div className="academy-player-progress-wrap">
        <div
          className="academy-player-buffered"
          style={{ width: `${media.duration ? (media.buffered / media.duration) * 100 : 0}%` }}
        />
        <input
          aria-label="视频播放进度"
          className="academy-player-timeline"
          type="range"
          min="0"
          max={media.duration}
          step=".1"
          value={media.elapsed}
          style={{
            '--progress': `${media.duration ? (media.elapsed / media.duration) * 100 : 0}%`,
          }}
          onChange={(event) => media.seek(Number(event.target.value))}
        />
        {onGoPracticeMark &&
          media.duration > 0 &&
          markers.map((marker, index) => (
            <button
              key={`${marker.timeSec}-${index}`}
              className="academy-player-mark"
              aria-label={marker.title || '去跟练室实战一下吧～'}
              style={{
                left: `${Math.min(100, Math.max(0, (marker.timeSec / media.duration) * 100))}%`,
              }}
              onClick={() => marks.tap(index)}
              onPointerEnter={!mobile ? () => marks.hover(index) : undefined}
              onPointerLeave={!mobile ? marks.leave : undefined}
            />
          ))}
        {marks.popup !== null && markers[marks.popup] && (
          <div
            className="academy-player-mark-popup"
            style={{
              '--mark-left': `${Math.min(100, Math.max(0, (markers[marks.popup].timeSec / Math.max(1, media.duration)) * 100))}%`,
            }}
            onPointerEnter={marks.keep}
            onPointerLeave={marks.leave}
          >
            <button aria-label="关闭练习标记" onClick={marks.close}>
              <X size={13} />
            </button>
            <h4>{markers[marks.popup].title || '去跟练室实战一下吧～'}</h4>
            <p>
              {markers[marks.popup].desc ||
                '这里的技法很重要，练习室已为您准备好对应素材，快去练习～'}
            </p>
            <button
              onClick={() => {
                const marker = markers[marks.popup];
                media.pause();
                marks.close();
                onGoPracticeMark(marker);
              }}
            >
              去跟练 →
            </button>
          </div>
        )}
      </div>
      <div className="academy-player-control-row">
        <button onClick={media.toggle} aria-label={media.playing ? '暂停' : '播放'}>
          {media.playing ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>
        <span>
          {formatPlayerTime(media.elapsed)} / {formatPlayerTime(media.duration)}
        </span>
        <div
          className="academy-player-volume"
          onMouseEnter={() => setVolumeOpen(true)}
          onMouseLeave={() => setVolumeOpen(false)}
          onFocus={() => setVolumeOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setVolumeOpen(false);
          }}
        >
          <button onClick={media.toggleMute} aria-label={media.muted ? '取消静音' : '静音'}>
            {media.muted || !media.volume ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {volumeOpen && (
            <div className="academy-player-volume-popover">
              <span aria-hidden="true">{Math.round((media.muted ? 0 : media.volume) * 100)}</span>
              <input
                aria-label="音量"
                type="range"
                min="0"
                max="1"
                step=".01"
                value={media.muted ? 0 : media.volume}
                onChange={(event) => media.changeVolume(Number(event.target.value))}
              />
            </div>
          )}
        </div>
        <div className="academy-player-spacer" />
        {showEpisodes && (
          <button aria-label="选集" onClick={onOpenEpisodes}>
            <List size={16} />
          </button>
        )}
        <div className="academy-player-menu academy-player-desktop-choice">
          <button
            aria-haspopup="menu"
            aria-expanded={popup === 'rate'}
            aria-label="倍速"
            onClick={() => setPopup((value) => (value === 'rate' ? null : 'rate'))}
          >
            {preferences.rate === 1 ? '倍速' : `${preferences.rate}x`}
          </button>
          {popup === 'rate' && (
            <ChoiceMenu values={rateOptions} current={preferences.rate} onChange={changeRate} />
          )}
        </div>
        {qualities.length > 1 && (
          <div className="academy-player-menu academy-player-desktop-choice">
            <button
              aria-haspopup="menu"
              aria-expanded={popup === 'quality'}
              aria-label="清晰度"
              onClick={() => setPopup((value) => (value === 'quality' ? null : 'quality'))}
            >
              {quality.height ? `${quality.height}P` : quality.label}
            </button>
            {popup === 'quality' && (
              <ChoiceMenu
                values={qualityOptions}
                current={quality.height}
                onChange={changeQuality}
              />
            )}
          </div>
        )}
        <button
          onClick={() => void toggleFullscreen()}
          aria-label={fullscreen ? '退出全屏' : '全屏'}
        >
          {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  );
}
