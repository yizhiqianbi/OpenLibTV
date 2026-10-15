import { createViewportCommands } from './viewport-commands.js';
import { useViewportCamera } from './hooks/useViewportCamera.js';
import { useViewportSelection } from './hooks/useViewportSelection.js';
import { useViewportEntities } from './hooks/useViewportEntities.js';
import { useViewportScene } from './hooks/useViewportScene.js';
import React, { forwardRef, useRef, useImperativeHandle } from 'react';

const EMPTY_PATHS = [];
export default forwardRef(function StudioViewport(
  {
    objects,
    frames,
    selected,
    onSelect,
    onTransform,
    time,
    animationSelection,
    onAnimations,
    onHierarchy,
    onCameraData,
    cameraPaths = EMPTY_PATHS,
    cameraTimeline = null,
    mode,
    viewMode,
    ratio = '16:9',
    grid = true,
    onError,
    onModelLoading,
    monitor,
    playing = false,
    onViewChange,
  },
  ref,
) {
  const host = useRef(),
    runtime = useRef(),
    latest = useRef({
      objects,
      frames,
      selected,
      onSelect,
      onTransform,
      time,
      animationSelection,
      onAnimations,
      onHierarchy,
      onCameraData,
      cameraPaths,
      cameraTimeline,
      mode,
      viewMode,
      ratio,
      grid,
      onError,
      onModelLoading,
      monitor,
      playing,
      onViewChange,
    });
  latest.current = {
    objects,
    frames,
    selected,
    onSelect,
    onTransform,
    time,
    animationSelection,
    onAnimations,
    onHierarchy,
    onCameraData,
    cameraPaths,
    cameraTimeline,
    mode,
    viewMode,
    ratio,
    grid,
    onError,
    onModelLoading,
    monitor,
    playing,
    onViewChange,
  };
  useViewportScene({ host, latest, runtime });
  useViewportEntities({ objects, cameraPaths, cameraTimeline, runtime });
  useViewportSelection({ mode, objects, runtime, selected });
  useViewportCamera({ objects, runtime, viewMode });
  useImperativeHandle(ref, () => createViewportCommands(runtime), []);
  return <div ref={host} className="cv-studio-webgl" aria-label="动画预演编辑器" />;
});
