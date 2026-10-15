import { useEffect, useRef, useState } from 'react';
import ClipEditorSideRail from './ClipEditorSideRail.jsx';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import {
  clipTransitionInspectorDuration,
  describeClipTimelineTransitions,
} from './domain/timeline-edit-model.js';
import { describeClipTransitionThumbnail } from './domain/transition-playback-model.js';
import { startTransitionInspectorPreview } from './transition-inspector-runtime.js';

const EFFECTS = [
  { type: 'fade', name: '淡入淡出', cover: '/assets/3d2a693e98207610.webp' },
  { type: 'fadeblack', name: '黑场过渡', cover: '/assets/1ea5e88d931d1469.webp' },
  { type: 'fadewhite', name: '白场过渡', cover: '/assets/6cda225001ad4a30.webp' },
];
const effectName = (type) => EFFECTS.find((effect) => effect.type === type)?.name || '像素溶解';

function TransitionTile({ type, fromUrl, toUrl, fromTime, toTime }) {
  const surface = useRef(null);
  const [state, setState] = useState({ ready: false, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const dispose = startTransitionInspectorPreview({
      host: surface.current,
      type,
      from: { url: fromUrl, time: fromTime },
      to: { url: toUrl, time: toTime },
      onState: (next) => live && setState(next),
    });
    return () => {
      live = false;
      dispose();
    };
  }, [type, fromUrl, toUrl, fromTime, toTime, attempt]);
  return (
    <div className="cv-clip-transition-tile">
      <div
        ref={surface}
        className="cv-clip-transition-tile-surface"
        aria-label="转场效果预览"
        hidden={!state.ready}
      />
      {state.error ? (
        <div role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            重试转场预览
          </button>
        </div>
      ) : !state.ready ? (
        <span role="status">正在准备转场预览…</span>
      ) : null}
    </div>
  );
}

function TransitionInspector({ selected, timeline, mediaBySourceId, src, controller, blocked }) {
  const [duration, setDuration] = useState('');
  const selectedId = selected?.rightClipId;
  const selectedDuration = selected?.duration;
  useEffect(() => {
    setDuration(selectedId ? String(Math.round(selectedDuration * 10) / 10) : '');
  }, [selectedId, selectedDuration]);
  const frames = selected ? describeClipTransitionThumbnail(timeline, selected.rightClipId) : null;
  const commit = (value) => {
    if (!selected || blocked) return;
    if (controller.onSetTransitionDuration(value, selected.rightClipId) === false) return;
    // Reset even if an already clamped value produces no document change.
    setDuration(String(clipTransitionInspectorDuration(value, selected.maximumDuration)));
  };
  return (
    <>
      <div className="cv-clip-transition-field">
        <span>名称</span>
        <p>{selected ? effectName(selected.type) : '未选择转场'}</p>
      </div>
      <div className="cv-clip-transition-field">
        <label htmlFor="clip-transition-duration">时长</label>
        {selected ? (
          <div className="cv-clip-transition-stepper">
            <button
              type="button"
              aria-label="时长 -0.1s"
              disabled={blocked}
              onClick={() => commit(selected.duration - 0.1)}
            >
              −
            </button>
            <div>
              <input
                id="clip-transition-duration"
                type="number"
                min={0.2}
                max={selected.maximumDuration}
                step={0.1}
                value={duration}
                disabled={blocked}
                onChange={(event) => setDuration(event.currentTarget.value)}
                onBlur={() => commit(Number(duration))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
              <span>s</span>
            </div>
            <button
              type="button"
              aria-label="时长 +0.1s"
              disabled={blocked}
              onClick={() => commit(selected.duration + 0.1)}
            >
              +
            </button>
          </div>
        ) : (
          <p>−</p>
        )}
      </div>
      {selected && frames && (
        <TransitionTile
          type={selected.type}
          fromUrl={src(mediaBySourceId.get(frames.fromSourceNodeId)?.url || '')}
          toUrl={src(mediaBySourceId.get(frames.toSourceNodeId)?.url || '')}
          fromTime={frames.fromTime}
          toTime={frames.toTime}
        />
      )}
      <button
        type="button"
        className="cv-clip-transition-delete"
        disabled={!selected || blocked}
        onClick={() => controller.onDeleteTransition(selected.rightClipId)}
      >
        删除
      </button>
    </>
  );
}

/** Non-modal source rails surround the same stable main preview. */
export default function ClipTransitionWorkspace({ state, controller, src, children }) {
  const root = useRef(null);
  const closeRef = useRef(null);
  const [libraryWidth, setLibraryWidth] = useState(372);
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const open = state.transitionPanelOpen && state.previewExpanded;
  const selected = describeClipTimelineTransitions(state.timeline).find(
    (entry) => entry.rightClipId === state.selectedTransitionRightClipId,
  );
  const blocked = !state.ready || state.conflicted || Boolean(state.error || state.mediaError);
  const close = () => {
    controller.onCloseTransitionPanel();
    root.current
      ?.closest('.cv-clip-editor')
      ?.querySelector('[data-testid="clip-transition-trigger"]')
      ?.focus({ preventScroll: true });
  };
  closeRef.current = close;
  useEffect(() => {
    if (!open) return undefined;
    return registerDialogChildDismissal(root.current, () => closeRef.current());
  }, [open]);
  return (
    <div ref={root} className={`cv-clip-transition-workspace${open ? ' is-open' : ''}`}>
      <main className="cv-clip-transition-main">{children}</main>
      {open && (
        <>
          <ClipEditorSideRail
            side="left"
            title="转场库"
            maximum={372}
            width={libraryWidth}
            setWidth={setLibraryWidth}
            onClose={close}
          >
            <div className="cv-clip-transition-category">基础转场</div>
            <div className="cv-clip-transition-effects">
              {EFFECTS.map((effect) => (
                <button
                  key={effect.type}
                  type="button"
                  disabled={blocked}
                  aria-pressed={selected?.type === effect.type}
                  onClick={() => controller.onAddTransition({ type: effect.type })}
                >
                  <img src={src(effect.cover)} alt="" />
                  <span>{effect.name}</span>
                </button>
              ))}
            </div>
          </ClipEditorSideRail>
          <ClipEditorSideRail
            side="right"
            title="转场"
            maximum={300}
            width={inspectorWidth}
            setWidth={setInspectorWidth}
          >
            <TransitionInspector
              selected={selected}
              timeline={state.timeline}
              mediaBySourceId={state.mediaBySourceId}
              src={src}
              controller={controller}
              blocked={blocked}
            />
          </ClipEditorSideRail>
        </>
      )}
    </div>
  );
}
