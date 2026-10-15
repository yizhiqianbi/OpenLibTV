import * as THREE from 'three';
import { ArrowLeft, Plus, Trash2, Camera, Diamond } from 'lucide-react';
import { cameraPathSpan, cameraWaypointStates } from './model.js';
import { CAMERA_EASING_PRESETS, CAMERA_PRESETS, activeCameraEasingPreset } from './presets.js';
import './camera.css';

function PresetGraphic({ path }) {
  return (
    <svg viewBox="0 0 80 40" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="8" cy="32" r="2.5" fill="currentColor" />
      <circle r="3" fill="currentColor">
        <animateMotion dur="2.4s" repeatCount="indefinite" path={path} />
      </circle>
    </svg>
  );
}
export function CameraMotionPanel({ motion, camera, rows, onCameraChange }) {
  const { activeRig: rig, editor } = motion;
  if (!rig || !camera) return null;
  const state = rig.waypoints.find((item) => item.id === editor.stateId) || rig;
  const positions = state.transform.position;
  const rotation = rig.fixedRotation
    ? new THREE.Euler()
        .setFromQuaternion(new THREE.Quaternion().fromArray(rig.fixedRotation))
        .toArray()
        .slice(0, 3)
        .map(THREE.MathUtils.radToDeg)
    : camera.rotation;
  const close = () => {
    motion.close();
    queueMicrotask(() => document.querySelector('[data-camera-editor-trigger]')?.focus());
  };
  return (
    <section className="cv-studio-camera-panel" aria-label="动画设置">
      <header>
        <button type="button" aria-label="关闭动画设置" onClick={close}>
          <ArrowLeft size={16} />
        </button>
        <span>00:00 – {cameraPathSpan(rig.settings).toFixed(1)}s</span>
        {editor.view !== 'easing' && (
          <button
            type="button"
            aria-label={editor.stateId ? '删除运镜关键帧' : '添加运镜关键帧'}
            disabled={editor.stateId && rig.waypoints.length <= 2}
            onClick={editor.stateId ? motion.removeState : motion.addState}
          >
            {editor.stateId ? <Trash2 size={14} /> : <Plus size={14} />}
          </button>
        )}
      </header>
      {editor.view !== 'easing' && (
        <>
          <div className="cv-studio-camera-states">
            <div>
              <Camera size={13} />
              {camera.name}
            </div>
            {cameraWaypointStates(rig).map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={`状态 ${item.index + 1} ${item.time.toFixed(1)}s`}
                aria-pressed={item.id === editor.stateId}
                onClick={() => motion.selectState(item)}
              >
                <Diamond size={12} />
                <span>状态 {item.index + 1}</span>
                <span>{item.time.toFixed(1)}s</span>
              </button>
            ))}
          </div>
          <label>
            片段时长
            <input
              aria-label="运镜片段时长"
              type="number"
              min={0.1}
              max={Math.max(30, cameraPathSpan(rig.settings))}
              step={0.1}
              value={cameraPathSpan(rig.settings)}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (
                  Number.isFinite(value) &&
                  value >= 0.1 &&
                  value <= Math.max(30, cameraPathSpan(rig.settings))
                )
                  motion.patchSettings({ duration: value / (rig.settings.bounce ? 2 : 1) });
              }}
            />
            <span>s</span>
          </label>
          <label>
            视野
            <input
              aria-label="相机视野"
              type="range"
              min={10}
              max={150}
              step={1}
              value={camera.fov || 45}
              onChange={(event) => onCameraChange(camera.id, { fov: event.target.valueAsNumber })}
            />
            <output>{Math.round(camera.fov || 45)}°</output>
          </label>
          <label>
            注视
            <select
              aria-label="相机注视目标"
              value={rig.settings.targetName || ''}
              onChange={(event) =>
                motion.patchSettings({
                  targetName: event.target.value || null,
                  aim: event.target.value ? 'target' : 'tangent',
                })
              }
            >
              <option value="">沿路径朝向</option>
              {rows
                .filter(
                  (row) =>
                    row.name &&
                    !['camera', 'light', 'path', 'waypoint', 'aim', 'focus'].includes(row.type),
                )
                .map((row) => (
                  <option key={row.id} value={row.name}>
                    {row.name}
                  </option>
                ))}
              {rig.aim && <option value={rig.aim.name}>{rig.aim.name}</option>}
            </select>
          </label>
          <h3>轨迹预设</h3>
          <div className="cv-studio-camera-presets">
            {CAMERA_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.id}
                title={preset.description}
                aria-label={`运镜预设 ${preset.label}`}
                aria-pressed={preset.id === rig.settings.presetId}
                onClick={() => motion.preset(preset.id)}
              >
                <PresetGraphic path={preset.path} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3>
        <button
          type="button"
          aria-label="编辑运镜过渡"
          onClick={() =>
            motion.setEditor({ ...editor, view: editor.view === 'easing' ? 'clip' : 'easing' })
          }
        >
          过渡
        </button>
      </h3>
      {editor.view === 'easing' && (
        <div className="cv-studio-camera-transition">
          <PresetGraphic
            path={
              CAMERA_EASING_PRESETS.find(
                (item) => item.id === activeCameraEasingPreset(rig.settings.easing),
              ).path
            }
          />
        </div>
      )}
      <div className="cv-studio-camera-presets">
        {CAMERA_EASING_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            aria-label={`运镜缓动 ${preset.label}`}
            aria-pressed={preset.id === activeCameraEasingPreset(rig.settings.easing)}
            onClick={() => motion.patchSettings({ easing: preset.easing })}
          >
            <PresetGraphic path={preset.path} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
      {editor.view !== 'easing' && (
        <div className="cv-studio-camera-transform">
          <h3>{editor.stateId ? state.name : '路径'} · 位置</h3>
          {['X', 'Y', 'Z'].map((axis, index) => (
            <label key={axis}>
              {axis}
              <input
                aria-label={`运镜位置 ${axis}`}
                type="number"
                step={0.1}
                value={Number(positions[index].toFixed(2))}
                onChange={(event) => {
                  if (!Number.isFinite(event.target.valueAsNumber)) return;
                  const position = [...positions];
                  position[index] = event.target.valueAsNumber;
                  motion.patchEntity(state.id, { position });
                }}
              />
            </label>
          ))}
        </div>
      )}
      {editor.view !== 'easing' && (
        <div className="cv-studio-camera-transform">
          <h3>相机 · 旋转</h3>
          {['X', 'Y', 'Z'].map((axis, index) => (
            <label key={axis}>
              {axis}
              <input
                aria-label={`运镜旋转 ${axis}`}
                type="number"
                step={1}
                disabled={rig.settings.aim !== 'fixed'}
                value={Number(rotation[index].toFixed(2))}
                onChange={(event) => {
                  if (!Number.isFinite(event.target.valueAsNumber)) return;
                  const next = [...rotation];
                  next[index] = event.target.valueAsNumber;
                  motion.patchRotation(next);
                }}
              />
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
