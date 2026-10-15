import { StudioComposer } from '.././components/StudioComposer.jsx';
import {
  ChevronDown,
  Plus,
  Camera,
  Move3D,
  RotateCcw,
  Maximize,
  Undo2,
  Redo2,
  Upload,
  MousePointer2,
  Grid2X2,
  Scissors,
} from 'lucide-react';
import StudioViewport from '.././StudioViewport.jsx';
import { lightPresets, presets } from '.././catalog.jsx';
import { useState } from 'react';
import { StudioViewNavigation } from './StudioViewNavigation.jsx';
export function StudioStage({
  active,
  animationSelection,
  onAnimations,
  onHierarchy,
  onCameraData,
  monitor,
  playing,
  cameraPaths,
  cameraTimeline,
  add,
  conversation,
  error,
  loadingModels,
  setModelLoading,
  fileInput,
  frames,
  future,
  grid,
  history,
  menu,
  messages,
  mode,
  notify,
  objects,
  prompt,
  ratio,
  redo,
  screenshot,
  selected,
  send,
  setConversation,
  setError,
  setGrid,
  setMenu,
  setMode,
  setPrompt,
  setRatio,
  setSelected,
  setTimeline,
  setViewMode,
  time,
  timeline,
  title,
  transform,
  undo,
  viewMode,
  viewport,
}) {
  const [view, setView] = useState({ label: '用户透视' });
  const navigateView = (axis) => {
    const opposite = {
      front: 'back',
      back: 'front',
      right: 'left',
      left: 'right',
      top: 'bottom',
      bottom: 'top',
    };
    setViewMode('orbit');
    viewport.current?.viewAxis(view.axis === axis ? opposite[axis] : axis);
  };
  return (
    <section className="cv-studio-stage">
      <StudioViewport
        ref={viewport}
        {...{
          objects,
          frames,
          selected,
          time,
          animationSelection,
          onAnimations,
          onHierarchy,
          onCameraData,
          monitor,
          playing,
          cameraPaths,
          cameraTimeline,
          mode,
          viewMode,
          ratio,
          grid,
        }}
        onSelect={setSelected}
        onTransform={transform}
        onError={setError}
        onModelLoading={setModelLoading}
        onViewChange={setView}
      />
      {error && (
        <div className="cv-studio-webgl-error" role="alert">
          {error}
        </div>
      )}
      {loadingModels > 0 && (
        <div className="cv-studio-model-loading" role="status">
          正在载入 {loadingModels} 个模型…
        </div>
      )}
      <div className="cv-studio-viewport-tools">
        <div>
          <button title="撤销 ⌘Z" onClick={undo} disabled={!history.current.length}>
            <Undo2 size={15} />
          </button>
          <button title="重做 ⇧⌘Z" onClick={redo} disabled={!future.current.length}>
            <Redo2 size={15} />
          </button>
        </div>
        <button title="截取当前视窗" onClick={screenshot}>
          <Camera size={16} />
        </button>
        <button
          title={timeline ? '关闭时间轴' : '打开时间轴'}
          className={timeline ? 'active' : ''}
          onClick={() => setTimeline(!timeline)}
        >
          <Scissors size={16} />
        </button>
        <button
          title="项目画幅比"
          className="cv-studio-menu-trigger"
          onClick={() => setMenu(menu === 'ratio' ? null : 'ratio')}
        >
          {ratio}
          <ChevronDown size={10} />
        </button>
      </div>
      {menu === 'ratio' && (
        <div className="cv-studio-ratio-menu cv-studio-popover">
          {['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((r) => (
            <button
              key={r}
              className={ratio === r ? 'active' : ''}
              onClick={() => {
                setRatio(r);
                setMenu(null);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <div className="cv-studio-transform-tools">
        {[
          ['select', '选择 Q', MousePointer2],
          ['translate', '位置 W', Move3D],
          ['rotate', '旋转 E', RotateCcw],
          ['scale', '缩放 R', Maximize],
        ].map(([m, label, Icon]) => (
          <button
            className={mode === m ? 'active' : ''}
            key={m}
            title={label}
            onClick={() => setMode(m)}
          >
            <Icon size={17} />
          </button>
        ))}
        <i />
        <button
          title="添加元素"
          className="cv-studio-menu-trigger"
          onClick={() => setMenu(menu === 'add' ? null : 'add')}
        >
          <Plus size={19} />
        </button>
        <button title="导入 GLB" onClick={() => fileInput.current?.click()}>
          <Upload size={17} />
        </button>
      </div>
      {menu === 'add' && (
        <div className="cv-studio-add-menu cv-studio-popover" role="menu" aria-label="添加元素">
          {[...presets.map((preset) => [...preset, null]), ...lightPresets].map(
            ([type, label, Icon, lightType], index) => (
              <button
                key={`${type}:${lightType || 'default'}:${index}`}
                onClick={() => add(type, lightType)}
              >
                <Icon size={17} />
                {label}
                <Plus size={14} />
              </button>
            ),
          )}
        </div>
      )}
      <StudioViewNavigation
        view={view}
        viewMode={viewMode}
        selectedName={active?.name}
        onAxis={navigateView}
      />
      <div className="cv-studio-ground">
        <button className={grid ? 'active' : ''} title="显示网格" onClick={() => setGrid(!grid)}>
          <Grid2X2 size={16} />
        </button>
        <button
          title="聚焦选中 F · 全部 Home"
          onClick={() => {
            setViewMode('orbit');
            viewport.current?.focus(selected);
          }}
        >
          <Maximize size={16} />
        </button>
        <button
          title="恢复透视并框选全部"
          onClick={() => {
            setViewMode('orbit');
            viewport.current?.resetView();
          }}
        >
          3D
        </button>
      </div>
      <StudioComposer
        {...{
          active,
          conversation,
          fileInput,
          menu,
          messages,
          notify,
          prompt,
          send,
          setConversation,
          setMenu,
          setPrompt,
          title,
        }}
      />
    </section>
  );
}
