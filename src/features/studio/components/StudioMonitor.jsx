import { useMemo } from 'react';
import { Camera, Focus, LocateFixed, Minimize2, PictureInPicture2 } from 'lucide-react';
import { MONITOR_ORBIT, MONITOR_TOP } from '../monitor/model.js';

function MonitorCard({
  monitorKey,
  label,
  frame,
  observe,
  selected,
  disabled,
  top,
  onSelect,
  onEnter,
  actions,
}) {
  const observeCard = useMemo(() => observe(monitorKey), [observe, monitorKey]);
  return (
    <div
      ref={observeCard}
      className={'cv-studio-monitor-item' + (selected ? ' active' : '')}
      data-disabled={disabled || undefined}
      onClick={
        disabled || top
          ? undefined
          : (event) => {
              if (!event.target.closest('button')) onSelect();
            }
      }
      onDoubleClick={disabled ? undefined : onEnter}
    >
      <span className="cv-studio-monitor-thumb">
        <button
          type="button"
          disabled={disabled}
          className="cv-studio-monitor-thumb-button"
          onClick={onSelect}
          title={label}
          aria-pressed={top ? undefined : selected}
        >
          {frame ? (
            <img src={frame} alt="" draggable={false} />
          ) : (
            <span className="cv-studio-monitor-empty" />
          )}
        </button>
        {actions}
      </span>
      <span className="cv-studio-monitor-label">{label}</span>
    </div>
  );
}

export function StudioMonitor({
  monitor,
  setViewMode,
  viewMode,
  selectedCameraId,
  onSelectCamera,
  onOpenPip,
  pipCameraId,
  disabled,
}) {
  const top = viewMode === 'top';
  const topAction = top ? '返回 3D 视图' : '进入俯视图';
  const selectTop = () => setViewMode(top ? 'orbit' : 'top');
  const enter = (id) => setViewMode(id);
  return (
    <aside className="cv-studio-monitor" aria-label="监视器">
      <h2>
        <Camera size={16} />
        监视器
      </h2>
      <div className="cv-studio-monitor-content" ref={monitor.scrollContainerRef}>
        <div className="cv-studio-monitor-list">
          <MonitorCard
            monitorKey={MONITOR_TOP}
            label={top ? '3D 视图' : '俯视图'}
            frame={monitor.frames[top ? MONITOR_ORBIT : MONITOR_TOP]}
            observe={monitor.observe}
            selected={top}
            disabled={disabled}
            top
            onSelect={selectTop}
            actions={
              <span className="cv-studio-monitor-actions cv-studio-monitor-top-actions">
                <button
                  type="button"
                  className={'cv-studio-monitor-enter' + (top ? ' active' : '')}
                  disabled={disabled}
                  aria-label={topAction}
                  onClick={selectTop}
                >
                  {top ? <Minimize2 size={16} /> : <Focus size={16} />}
                  <span>{topAction}</span>
                </button>
              </span>
            }
          />
          {monitor.cameras.map((camera, index) => {
            const viewing = viewMode === camera.id;
            return (
              <MonitorCard
                key={camera.id}
                monitorKey={camera.id}
                label={camera.name?.trim() || `机位 ${index + 1}`}
                frame={monitor.frames[camera.id]}
                observe={monitor.observe}
                selected={(monitor.playbackCameraId ?? selectedCameraId ?? viewMode) === camera.id}
                disabled={disabled}
                onSelect={() => onSelectCamera(camera.id)}
                onEnter={() => enter(camera.id)}
                actions={
                  <span className="cv-studio-monitor-actions">
                    <button
                      type="button"
                      className="cv-studio-monitor-locate"
                      disabled={disabled}
                      title="定位机位"
                      aria-label="定位机位"
                      onClick={() => onSelectCamera(camera.id)}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <LocateFixed size={16} />
                    </button>
                    <button
                      type="button"
                      className="cv-studio-monitor-locate"
                      disabled={disabled}
                      title={pipCameraId === camera.id ? '关闭浮动预览' : '浮动预览'}
                      aria-label={pipCameraId === camera.id ? '关闭浮动预览' : '浮动预览'}
                      aria-pressed={pipCameraId === camera.id}
                      onClick={() => onOpenPip?.(pipCameraId === camera.id ? null : camera.id)}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <PictureInPicture2 size={16} />
                    </button>
                    <button
                      type="button"
                      className={'cv-studio-monitor-enter' + (viewing ? ' active' : '')}
                      disabled={disabled}
                      aria-pressed={viewing}
                      onClick={() => setViewMode(viewing ? 'top' : camera.id)}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      <Focus size={16} />
                      <span>{viewing ? '退出机位' : '进入机位'}</span>
                    </button>
                  </span>
                }
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}
