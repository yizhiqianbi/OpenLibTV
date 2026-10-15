import { useRef } from 'react';
import { Camera } from 'lucide-react';
import './camera.css';

export function CameraShotTrack({ shots, cameras, duration, time, onSelect, onTrim, onTrimStart }) {
  const drag = useRef(null);
  return (
    <div className="cv-studio-camera-shots" aria-label="镜头轨道">
      {shots.map((shot, index) => (
        <div
          key={`${shot.cameraId}:${index}`}
          className={`cv-studio-camera-shot${time >= shot.start && time < shot.end ? ' active' : ''}`}
          style={{
            left: `${(shot.start / duration) * 100}%`,
            width: `${((shot.end - shot.start) / duration) * 100}%`,
          }}
        >
          <button
            type="button"
            aria-label={`镜头 ${index + 1} ${cameras.find((camera) => camera.id === shot.cameraId)?.name || '机位'}`}
            onClick={() => onSelect(shot)}
          >
            <Camera size={11} />
            <span>{cameras.find((camera) => camera.id === shot.cameraId)?.name || '机位'}</span>
            <span>{(shot.end - shot.start).toFixed(1)}s</span>
          </button>
          {['start', 'end'].map((edge) => (
            <button
              type="button"
              key={edge}
              className={`cv-studio-camera-shot-handle ${edge}`}
              aria-label={`调整镜头 ${index + 1} ${edge === 'start' ? '起点' : '终点'}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget
                  .closest('.cv-studio-camera-shots')
                  .getBoundingClientRect();
                drag.current = {
                  pointerId: event.pointerId,
                  start: event.clientX,
                  value: shot[edge],
                  index,
                  edge,
                  width: rect.width,
                };
                onTrimStart?.();
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const state = drag.current;
                if (!state || state.pointerId !== event.pointerId || !state.width) return;
                event.stopPropagation();
                onTrim(
                  state.index,
                  state.edge,
                  state.value + ((event.clientX - state.start) / state.width) * duration,
                );
              }}
              onPointerUp={(event) => {
                drag.current = null;
                event.currentTarget.releasePointerCapture?.(event.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                if (
                  !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
                  event.nativeEvent.isComposing
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                onTrimStart?.();
                onTrim(index, edge, shot[edge] + (event.key === 'ArrowLeft' ? -0.1 : 0.1));
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
