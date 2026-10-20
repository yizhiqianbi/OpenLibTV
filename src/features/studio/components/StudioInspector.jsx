import React from 'react';
import {
  Plus,
  RotateCcw,
  Layers,
  Trash2,
  Copy,
  Settings2,
  Diamond,
  Search,
  Camera,
} from 'lucide-react';
import { iconFor } from '../catalog.jsx';
import { StudioEntityName, StudioOutliner } from '../outliner/StudioOutliner.jsx';
import { StudioColorPicker } from './StudioColorPicker.jsx';

function StudioMaterialControls({ active, onChange, onCommit }) {
  const values = {
    metallic: Number.isFinite(active.metallic) ? active.metallic : 0,
    roughness: Number.isFinite(active.roughness) ? active.roughness : 0.62,
    opacity: Number.isFinite(active.opacity) ? active.opacity : 1,
  };
  const setting = (key, label) => (
    <label key={key} className="cv-studio-material-slider">
      <span>{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={values[key]}
        aria-label={label}
        onChange={(event) => onChange?.({ [key]: event.target.valueAsNumber })}
        onBlur={() => onCommit?.(active.id)}
      />
      <output>{values[key].toFixed(2)}</output>
    </label>
  );
  return (
    <fieldset className="cv-studio-material-properties">
      <legend>材质</legend>
      {setting('metallic', '金属度')}
      {setting('roughness', '粗糙度')}
      {setting('opacity', '不透明度')}
      <label className="cv-studio-material-check">
        <input
          type="checkbox"
          aria-label="透明材质"
          checked={active.transparent === true}
          onChange={(event) => onChange?.({ transparent: event.target.checked })}
          onBlur={() => onCommit?.(active.id)}
        />
        透明材质
      </label>
      <label className="cv-studio-material-check">
        <input
          type="checkbox"
          aria-label="写入深度"
          checked={active.depthWrite !== false}
          onChange={(event) => onChange?.({ depthWrite: event.target.checked })}
          onBlur={() => onCommit?.(active.id)}
        />
        写入深度
      </label>
    </fieldset>
  );
}

export function StudioInspector({
  active,
  addKey,
  assetSearch,
  duplicate,
  menu,
  onMaterialCommit,
  onMaterialChange,
  onLightChange,
  outlinerRows,
  renameObject,
  toggleHidden,
  record,
  remove,
  selected,
  setAssetSearch,
  setMenu,
  setSelected,
  transform,
  viewport,
  cameraMotion,
  cameraPanel,
}) {
  return (
    <aside className="cv-studio-inspector" aria-label="项目资产">
      <h2>
        <Layers size={16} />
        项目资产{' '}
        <button
          className="cv-studio-menu-trigger"
          title="添加资产"
          onClick={() => setMenu(menu === 'add' ? null : 'add')}
        >
          <Plus size={15} />
        </button>
      </h2>
      <div className="cv-studio-asset-search">
        <Search size={13} />
        <input
          placeholder="搜索资产"
          value={assetSearch}
          onChange={(e) => setAssetSearch(e.target.value)}
        />
      </div>
      <StudioOutliner
        rows={outlinerRows}
        selected={selected}
        setSelected={setSelected}
        query={assetSearch}
        onToggleHidden={toggleHidden}
        onRename={renameObject}
        onFocus={(id) => viewport.current?.focus(id)}
      />
      {cameraPanel ||
        (active ? (
          <div className="cv-studio-properties">
            <header>
              {React.createElement(iconFor(active), { size: 15 })}
              <StudioEntityName key={active.id} row={active} always onRename={renameObject} />
              <button title="创建副本" aria-label={`创建副本 ${active.name}`} onClick={duplicate}>
                <Copy size={13} />
              </button>
              <button
                title={active.subtree ? '删除子节点' : '删除'}
                aria-label={active.subtree ? `删除子节点 ${active.name}` : `删除 ${active.name}`}
                onClick={remove}
              >
                <Trash2 size={13} />
              </button>
            </header>
            {[
              ['position', '位置'],
              ['rotation', '旋转'],
              ['scale', '缩放'],
            ].map(([property, label]) => (
              <fieldset key={property}>
                <legend>
                  {label}
                  <button
                    title="重置"
                    disabled={
                      active.animatedProperties?.includes(property) &&
                      !active.keyframeEditableProperties?.includes(property)
                    }
                    onClick={() =>
                      transform(active.id, {
                        [property]: property === 'scale' ? [1, 1, 1] : [0, 0, 0],
                      })
                    }
                  >
                    <RotateCcw size={11} />
                  </button>
                  {!active.subtree && active.type !== 'camera' && (
                    <button
                      title="添加关键帧"
                      onClick={() => {
                        record();
                        addKey(active);
                      }}
                    >
                      <Diamond size={11} />
                    </button>
                  )}
                </legend>
                <div>
                  {['X', 'Y', 'Z'].map((axis, index) => (
                    <label key={axis}>
                      <span className={axis.toLowerCase()}>{axis}</span>
                      <input
                        type="number"
                        aria-label={`${label} ${axis}`}
                        disabled={
                          active.animatedProperties?.includes(property) &&
                          !active.keyframeEditableProperties?.includes(property)
                        }
                        step={property === 'rotation' ? 1 : 0.1}
                        value={Number(active[property][index].toFixed(2))}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (Number.isFinite(value)) {
                            const next = [...active[property]];
                            next[index] = value;
                            transform(active.id, { [property]: next });
                          }
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {active.animatedProperties?.some((property) =>
              ['position', 'rotation', 'scale'].includes(property),
            ) && (
              <p className="cv-studio-animation-owned">
                {active.keyframeEditableProperties?.length
                  ? '当前时间关键帧可直接编辑；其它动画属性随片段播放。'
                  : '动画轨道控制的属性随片段播放；请先选择一个本地关键帧。'}
              </p>
            )}
            {(active.type === 'mesh' ||
              (!active.subtree && active.type !== 'camera' && active.type !== 'glb')) && (
              <StudioColorPicker
                label="颜色"
                value={active.color || '#bfc2c9'}
                onChange={(color) => onMaterialChange?.(active.id, { color })}
                onCommit={() => onMaterialCommit?.(active.id)}
              />
            )}
            {(active.type === 'mesh' ||
              (!active.subtree &&
                active.type !== 'camera' &&
                active.type !== 'light' &&
                active.type !== 'glb')) && (
              <StudioMaterialControls
                active={active}
                onChange={(changes) => onMaterialChange?.(active.id, changes)}
                onCommit={onMaterialCommit}
              />
            )}
            {active.type === 'camera' && (
              <button
                type="button"
                className="cv-studio-camera-open"
                data-camera-editor-trigger
                onClick={() => cameraMotion.openCamera(active.id)}
              >
                <Camera size={14} />
                动画设置
              </button>
            )}
            {active.type === 'light' && (
              <fieldset className="cv-studio-light-properties">
                <legend>灯光</legend>
                <label>
                  类型
                  <select
                    aria-label="灯光类型"
                    disabled={active.subtree}
                    value={active.lightType || 'point'}
                    onChange={(event) =>
                      onLightChange?.(active.id, { lightType: event.target.value })
                    }
                  >
                    <option value="directional">平行光</option>
                    <option value="point">点光</option>
                    <option value="spot">聚光</option>
                  </select>
                </label>
                <label>
                  强度
                  <input
                    aria-label="灯光强度"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={active.intensity ?? 8}
                    onChange={(event) =>
                      onLightChange?.(active.id, { intensity: event.target.valueAsNumber })
                    }
                  />
                </label>
                {active.lightType !== 'directional' && (
                  <label>
                    范围
                    <input
                      aria-label="灯光范围"
                      type="number"
                      min="0"
                      max="1000"
                      step="0.1"
                      value={active.range ?? 12}
                      onChange={(event) =>
                        onLightChange?.(active.id, { range: event.target.valueAsNumber })
                      }
                    />
                  </label>
                )}
                {active.lightType === 'spot' && (
                  <>
                    <label>
                      锥角
                      <input
                        aria-label="聚光锥角"
                        type="number"
                        min="1"
                        max="179"
                        step="1"
                        value={active.angle ?? 45}
                        onChange={(event) =>
                          onLightChange?.(active.id, { angle: event.target.valueAsNumber })
                        }
                      />
                    </label>
                    <label>
                      半影
                      <input
                        aria-label="聚光半影"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={active.penumbra ?? 0.1}
                        onChange={(event) =>
                          onLightChange?.(active.id, { penumbra: event.target.valueAsNumber })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="cv-studio-light-shadow">
                  <input
                    aria-label="灯光投射阴影"
                    type="checkbox"
                    checked={active.castShadow !== false}
                    onChange={(event) =>
                      onLightChange?.(active.id, { castShadow: event.target.checked })
                    }
                  />
                  投射阴影
                </label>
              </fieldset>
            )}
            {!active.subtree && active.type !== 'camera' && (
              <button
                className="cv-studio-key-button"
                onClick={() => {
                  record();
                  addKey(active);
                }}
              >
                <Diamond size={12} />
                新增关键帧 <kbd>K</kbd>
              </button>
            )}
          </div>
        ) : (
          <div className="cv-studio-property-empty">
            <Settings2 size={28} />
            <p>选择角色、道具或机位以查看属性</p>
          </div>
        ))}
    </aside>
  );
}
