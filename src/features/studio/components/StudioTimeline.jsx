import React from 'react';
import { Plus, RotateCcw, Play, Pause, Diamond } from 'lucide-react';
import { iconFor } from '../catalog.jsx';
import { MinusIcon } from '../catalog.jsx';
import { sameClip, STUDIO_PLAYBACK_RATES } from '../animation-model.js';
import { CameraShotTrack } from '../camera/CameraShotTrack.jsx';

export function StudioTimeline({
  addKey,
  animationTracks = [],
  animationSelection,
  selectAnimation,
  autoKey,
  duration,
  frames,
  loop,
  objects,
  playing,
  rate,
  record,
  selected,
  setAutoKey,
  setDuration,
  setFrames,
  setLoop,
  setPlaying,
  setRate,
  setSelected,
  setTime,
  setTimeline,
  time,
  cameras = [],
  cameraShots = [],
  onSelectShot,
  onTrimShot,
}) {
  const [timelineZoom, setTimelineZoom] = React.useState(1);
  const visibleClips = animationSelection
    ? animationTracks.filter((clip) => sameClip(clip, animationSelection))
    : animationTracks;
  return (
    <section className="cv-studio-timeline" aria-label="动画时间轴">
      <header>
        <div>
          <button
            title={playing ? '暂停' : '播放'}
            className="play"
            onClick={() => {
              if (time >= duration) setTime(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <select
            aria-label="播放速度"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            {STUDIO_PLAYBACK_RATES.map((n) => (
              <option key={n} value={n}>
                {n}x
              </option>
            ))}
          </select>
          <button title="循环播放" className={loop ? 'active' : ''} onClick={() => setLoop(!loop)}>
            <RotateCcw size={14} />
          </button>
          <button
            className={autoKey ? 'active' : ''}
            title="自动帧"
            onClick={() => setAutoKey(!autoKey)}
          >
            <Diamond size={14} />
          </button>
        </div>
        <span>
          {time.toFixed(2)} / {duration.toFixed(2)} 秒
        </span>
        <div>
          <label className="cv-studio-timeline-zoom">
            缩放
            <input
              type="range"
              aria-label="时间轴缩放"
              min="1"
              max="4"
              step="0.1"
              value={timelineZoom}
              onChange={(event) => setTimelineZoom(event.currentTarget.valueAsNumber)}
              onKeyDown={(event) => {
                if (
                  [
                    'ArrowLeft',
                    'ArrowRight',
                    'ArrowUp',
                    'ArrowDown',
                    'Home',
                    'End',
                    'PageUp',
                    'PageDown',
                  ].includes(event.key)
                ) {
                  event.stopPropagation();
                }
              }}
            />
          </label>
          <label>
            总时长
            <input
              type="number"
              min={0.1}
              max={600}
              value={duration}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (
                  n >= 0.1 &&
                  n <= 600 &&
                  n >= Math.max(...cameraShots.map((shot) => shot.end), 0)
                ) {
                  setDuration(n);
                  setTime((t) => Math.min(t, n));
                }
              }}
            />
          </label>
          <button onClick={() => setTimeline(false)} title="时间线最小化">
            <MinusIcon />
          </button>
        </div>
      </header>
      <div className="cv-studio-timeline-body">
        <div className="cv-studio-track-names">
          <div>动画轨道</div>
          {cameraShots.length > 0 && <div>镜头</div>}
          {objects.map((o) => (
            <div
              role="button"
              tabIndex={0}
              key={o.id}
              className={selected === o.id ? 'active' : ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSelected(o.id);
              }}
              onClick={() => setSelected(o.id)}
            >
              {React.createElement(iconFor(o), { size: 13 })}
              <span>{o.name}</span>
              <button
                title="新增关键帧"
                onClick={(e) => {
                  e.stopPropagation();
                  if (o.type !== 'camera') record();
                  addKey(o);
                }}
              >
                <Plus size={12} />
              </button>
            </div>
          ))}
          {!objects.length && <p>选中角色、道具或分组后建立轨道</p>}
          {visibleClips.map((clip) => (
            <button
              type="button"
              key={`${clip.objectId}:${clip.index}`}
              className="cv-studio-clip-name"
              aria-label={`播放片段 ${clip.name}`}
              aria-pressed={sameClip(clip, animationSelection)}
              onClick={() => selectAnimation(clip)}
            >
              <Play size={12} />
              <span>{clip.name}</span>
            </button>
          ))}
        </div>
        <div
          className="cv-studio-tracks"
          style={{
            flex: '0 0 auto',
            width: `${timelineZoom * 100}%`,
          }}
          role="slider"
          aria-label="时间轴进度"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={time}
          aria-valuetext={`${time.toFixed(1)} 秒`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey
            ) {
              return;
            }
            const step = event.shiftKey ? 1 : 0.1;
            let next;
            switch (event.key) {
              case 'ArrowLeft':
                next = Math.max(0, time - step);
                break;
              case 'ArrowRight':
                next = Math.min(duration, time + step);
                break;
              case 'Home':
                next = 0;
                break;
              case 'End':
                next = duration;
                break;
              case ' ':
                setPlaying(!playing);
                event.preventDefault();
                event.stopPropagation();
                return;
              default:
                return;
            }
            setPlaying(false);
            setTime(next);
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(e) => {
            if (e.target.closest('button')) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setPlaying(false);
            setTime(
              Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration)),
            );
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setTime(
              Math.max(0, Math.min(duration, ((e.clientX - rect.left) / rect.width) * duration)),
            );
          }}
        >
          <div className="cv-studio-ruler">
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} style={{ left: i * 10 + '%' }}>
                {((duration * i) / 10).toFixed(duration < 10 ? 1 : 0)}s
              </span>
            ))}
          </div>
          {cameraShots.length > 0 && (
            <CameraShotTrack
              shots={cameraShots}
              cameras={cameras}
              duration={duration}
              time={time}
              onSelect={onSelectShot}
              onTrim={onTrimShot}
              onTrimStart={record}
            />
          )}
          {objects.map((o) => (
            <div className="cv-studio-track" key={o.id}>
              {frames
                .filter((k) => k.objectId === o.id)
                .map((key) => (
                  <button
                    key={key.id}
                    title={'关键帧 ' + key.time + ' 秒（右键删除）'}
                    style={{ left: (key.time / duration) * 100 + '%' }}
                    onClick={() => {
                      setTime(key.time);
                      setSelected(o.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      record();
                      setFrames((f) => f.filter((x) => x.id !== key.id));
                    }}
                  >
                    <Diamond size={10} fill="currentColor" />
                  </button>
                ))}
            </div>
          ))}
          {visibleClips.map((clip) => (
            <div
              className="cv-studio-track cv-studio-clip-track"
              key={`${clip.objectId}:${clip.index}`}
            >
              <button
                type="button"
                aria-label={`选择动画片段 ${clip.name}`}
                aria-pressed={sameClip(clip, animationSelection)}
                style={{ width: `${Math.min(100, (clip.duration / duration) * 100)}%` }}
                onClick={() => selectAnimation(clip)}
              >
                {clip.name}
              </button>
            </div>
          ))}
          <div className="cv-studio-playhead" style={{ left: (time / duration) * 100 + '%' }}>
            <span>{time.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
