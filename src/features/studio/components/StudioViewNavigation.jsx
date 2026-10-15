import { Quaternion, Vector3 } from 'three';

const axes = [
  { key: 'x', name: 'X', view: 'right', label: '右视图', vector: [1, 0, 0] },
  { key: '-x', name: '', view: 'left', label: '左视图', vector: [-1, 0, 0] },
  { key: 'y', name: 'Y', view: 'top', label: '顶视图', vector: [0, 1, 0] },
  { key: '-y', name: '', view: 'bottom', label: '底视图', vector: [0, -1, 0] },
  { key: 'z', name: 'Z', view: 'front', label: '前视图', vector: [0, 0, 1] },
  { key: '-z', name: '', view: 'back', label: '后视图', vector: [0, 0, -1] },
];

export function StudioViewNavigation({ view, viewMode, selectedName, onAxis }) {
  const rotation = new Quaternion().fromArray(view.quaternion || [0, 0, 0, 1]).invert();
  const projected = axes.map((axis) => ({
    ...axis,
    point: new Vector3().fromArray(axis.vector).applyQuaternion(rotation),
  }));
  const isCamera = viewMode !== 'orbit' && viewMode !== 'top' && viewMode !== 'front';
  const label = isCamera ? '相机预演' : viewMode === 'top' ? '俯视图' : view.label || '用户透视';
  return (
    <>
      <div className="cv-studio-view-info">
        <span>
          {label}
          {view.axis && !isCamera ? ' · 透视' : ''}
        </span>
        {selectedName && <span className="cv-studio-view-selection">{selectedName}</span>}
        <small>中键旋转 · Shift 中键平移 · 滚轮缩放</small>
      </div>
      <div className="cv-studio-axis" role="group" aria-label="视图方向">
        <svg viewBox="0 0 88 88" aria-hidden="true">
          {projected
            .filter((axis) => axis.name)
            .map((axis) => (
              <line
                key={axis.key}
                className={axis.key}
                x1="44"
                y1="44"
                x2={44 + axis.point.x * 29}
                y2={44 - axis.point.y * 29}
              />
            ))}
        </svg>
        {projected.map((axis) => (
          <button
            key={axis.key}
            type="button"
            className={`${axis.key.replace('-', '')} ${axis.name ? 'positive' : 'negative'}`}
            title={axis.label}
            aria-label={axis.label}
            aria-pressed={!isCamera && view.axis === axis.view}
            style={{
              left: `${50 + axis.point.x * 33}%`,
              top: `${50 - axis.point.y * 33}%`,
              zIndex: Math.round((axis.point.z + 1) * 10) + 1,
              opacity: axis.point.z < -0.1 ? 0.5 : 1,
            }}
            onClick={() => onAxis(axis.view)}
          >
            {axis.name}
          </button>
        ))}
      </div>
    </>
  );
}
