import { useMemo, useRef } from 'react';
import { Film, Plus, Upload, X } from 'lucide-react';
import {
  collectShotBreakdownSource,
  getShotBreakdownDimensions,
} from '../domain/shot-breakdown-model.js';

const DIMENSIONS = [
  { id: 'storyboard', label: '分镜' },
  { id: 'cameraMoves', label: '动态' },
  { id: 'musicRef', label: '音乐' },
];

/**
 * The source ShotBreakdownNode is a dedicated card, rather than the generic
 * generator placeholder.  Generation/upload stays an injected host action;
 * this component owns the local, reviewable controls and graph projection.
 */
export default function CanvasShotBreakdownNode({
  node,
  nodes = [],
  edges = [],
  readonly = false,
  update,
  onUpload,
  onPickFromCanvas,
  notify,
}) {
  const input = useRef(null);
  const source = useMemo(() => {
    const value = collectShotBreakdownSource({ node, nodes, edges });
    if (!value) return null;
    const sourceNode = nodes.find((item) => item.id === value.nodeId);
    return { ...value, poster: sourceNode?.data?.poster || '' };
  }, [edges, node, nodes]);
  const dimensions = getShotBreakdownDimensions(node.data);
  const task = node.data?.taskInfo;
  const busy = task?.loading === true;
  const disabled = readonly || busy;
  const sourceReady = source && !source.url.startsWith('blob:');
  const toggleDimension = (id) => {
    if (disabled) return;
    const next = dimensions.includes(id)
      ? dimensions.filter((value) => value !== id)
      : [...dimensions, id];
    update?.(node.id, { dimensions: next });
  };
  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onUpload?.(file);
  };
  return (
    <div className="cv-shot-breakdown" data-testid="shot-breakdown-node">
      <div className="cv-shot-breakdown-heading">
        <Film size={19} />
        <span>逐帧拉片</span>
        <span className="cv-shot-breakdown-badge">SD 2.5</span>
      </div>
      <div className="cv-shot-breakdown-section-label">视频素材</div>
      {source ? (
        <div className="cv-shot-breakdown-source">
          <video
            src={source.url}
            poster={source.poster || undefined}
            muted
            playsInline
            preload="metadata"
          />
          <div className="cv-shot-breakdown-source-meta">
            <span title={source.label}>{source.label}</span>
            {!disabled && (
              <>
                <button type="button" aria-label="替换素材" onClick={() => input.current?.click()}>
                  <Upload size={13} />
                </button>
                <button
                  type="button"
                  aria-label="从画布选择素材"
                  onClick={() => onPickFromCanvas?.(node.id)}
                >
                  <Plus size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="cv-shot-breakdown-empty">
          <Plus size={21} />
          <span>上传视频后开始</span>
          <div className="cv-shot-breakdown-empty-actions">
            <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
              上传视频
            </button>
            <button
              type="button"
              disabled={disabled || !onPickFromCanvas}
              onClick={() => onPickFromCanvas?.(node.id)}
            >
              从画布选择
            </button>
          </div>
        </div>
      )}
      <div className="cv-shot-breakdown-section-label">拆解维度</div>
      <div className="cv-shot-breakdown-dimensions" role="group" aria-label="拆解维度">
        {DIMENSIONS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={dimensions.includes(item.id)}
            disabled={disabled}
            onClick={() => toggleDimension(item.id)}
          >
            {dimensions.includes(item.id) ? <X size={12} /> : <Plus size={12} />}
            {item.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cv-shot-breakdown-start"
        disabled={disabled || !sourceReady || dimensions.length === 0}
        onClick={() =>
          notify?.(
            source && source.url.startsWith('blob:')
              ? '视频仍在上传，请稍后重试'
              : '逐帧拉片服务尚未连接，已保留视频与拆解维度',
          )
        }
      >
        {busy ? '拉片中' : '开始拉片'}
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept="video/*"
        disabled={disabled}
        onChange={chooseFile}
      />
    </div>
  );
}
