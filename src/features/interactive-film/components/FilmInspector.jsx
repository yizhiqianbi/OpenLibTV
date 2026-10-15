import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X, Film, GitBranch, Braces, MousePointer2, Zap, Flag } from 'lucide-react';
import { createFilmMediaUrls } from '../../../services/interactive-film/media.ts';
import { resolveFilmInheritedBackground } from '../../../services/interactive-film/presentation.ts';
import { FILM_LABELS } from './FilmGraph.jsx';
const NODE_ICONS = {
  start: Flag,
  play: Film,
  choice: GitBranch,
  set: Braces,
  condition: GitBranch,
  hotspot: MousePointer2,
  qte: Zap,
  ending: Flag,
};

function MediaPreview({ media, node, change, onDrawStart, inheritedFrame }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  const area = useRef(null),
    drawing = useRef(null),
    video = useRef(null);
  const previewTime = inheritedFrame?.frameTime ?? node.trimIn ?? 0;
  const seekPreview = () => {
    if (video.current)
      video.current.currentTime = Math.max(
        0,
        Math.min(previewTime, (media.duration ?? Infinity) - 0.001),
      );
  };
  useEffect(() => {
    const abort = new AbortController();
    let dispose;
    createFilmMediaUrls([media], { signal: abort.signal })
      .then((result) => {
        dispose = result.dispose;
        if (abort.signal.aborted) dispose();
        else {
          setUrl(result.urls[media.id]);
          setError('');
        }
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setError(reason.message);
      });
    return () => {
      abort.abort();
      dispose?.();
    };
  }, [media]);
  const normalized = (event) => {
    const bounds = area.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const start = (event) => {
    if (node.kind !== 'hotspot' || event.button !== 0) return;
    event.preventDefault();
    const point = normalized(event);
    drawing.current = {
      x: Math.min(point.x, 0.99),
      y: Math.min(point.y, 0.99),
      pointerId: event.pointerId,
    };
    onDrawStart?.();
    area.current.setPointerCapture(event.pointerId);
  };
  const move = (event) => {
    if (!drawing.current || drawing.current.pointerId !== event.pointerId) return;
    const point = normalized(event),
      a = drawing.current;
    change(
      {
        region: {
          x: Math.min(a.x, point.x),
          y: Math.min(a.y, point.y),
          width: Math.min(1 - Math.min(a.x, point.x), Math.max(0.01, Math.abs(a.x - point.x))),
          height: Math.min(1 - Math.min(a.y, point.y), Math.max(0.01, Math.abs(a.y - point.y))),
        },
      },
      { history: false },
    );
  };
  const stop = (event) => {
    if (drawing.current?.pointerId !== event.pointerId) return;
    move(event);
    drawing.current = null;
    if (area.current.hasPointerCapture?.(event.pointerId))
      area.current.releasePointerCapture(event.pointerId);
  };
  return (
    <>
      <div
        ref={area}
        className="film-media-preview"
        style={{
          aspectRatio: media.width && media.height ? `${media.width}/${media.height}` : '16/9',
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={() => {
          drawing.current = null;
        }}
      >
        {url &&
          (media.type === 'image' ? (
            <img src={url} alt={media.name} />
          ) : media.type === 'video' ? (
            <video
              ref={video}
              src={url}
              controls={node.kind !== 'hotspot' && !inheritedFrame}
              preload="metadata"
              playsInline
              onLoadedMetadata={seekPreview}
            />
          ) : (
            <audio src={url} controls />
          ))}
        {['choice', 'qte'].includes(node.kind) && (
          <div className="film-inspector-overlay" aria-hidden="true">
            {node.prompt && <p>{node.prompt}</p>}
            {node.kind === 'choice' ? (
              (node.choices || []).slice(0, 3).map((option) => (
                <span className="film-node-choice-preview" key={option.id}>
                  {option.text}
                </span>
              ))
            ) : (
              <span className="film-inspector-qte">
                <kbd>Space</kbd> 点击或按空格
              </span>
            )}
          </div>
        )}
        {node.kind === 'hotspot' && node.region && (
          <div
            className="film-region"
            style={{
              left: `${node.region.x * 100}%`,
              top: `${node.region.y * 100}%`,
              width: `${node.region.width * 100}%`,
              height: `${node.region.height * 100}%`,
            }}
          />
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {node.kind === 'hotspot' && (
        <p className="film-help">在画面上拖动绘制热点，也可编辑下方坐标。</p>
      )}
      {media.type === 'video' && (
        <button className="film-text-button" onClick={seekPreview}>
          {inheritedFrame ? '预览继承末帧' : '预览片段起点'}
        </button>
      )}
    </>
  );
}
const number = (event) => Number(event.target.value);
export default function FilmInspector({
  doc,
  node,
  change,
  onClose,
  containerRef,
  drawer,
  onDrawStart,
}) {
  if (!node)
    return (
      <aside
        ref={containerRef}
        className="film-inspector"
        role={drawer ? 'dialog' : undefined}
        aria-modal={drawer ? true : undefined}
        aria-label="节点属性"
        tabIndex={-1}
      >
        <header>
          <strong>节点属性</strong>
          <button aria-label="关闭属性面板" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="film-inspector-empty">选中节点，编辑片段与互动规则。</div>
      </aside>
    );
  const media = doc.media.find((item) => item.id === node.mediaId),
    variable = doc.variables.find((item) => item.id === node.variableId);
  const interaction = ['choice', 'hotspot', 'qte'].includes(node.kind);
  const inheritedFrame =
    interaction && !media ? resolveFilmInheritedBackground(doc, node.id) : undefined;
  const previewMedia = media || inheritedFrame?.media;
  const variableNode = ['set', 'condition'].includes(node.kind);
  return (
    <aside
      ref={containerRef}
      className="film-inspector"
      role={drawer ? 'dialog' : undefined}
      aria-modal={drawer ? true : undefined}
      aria-label="节点属性"
      tabIndex={-1}
    >
      <header>
        <div>
          {React.createElement(NODE_ICONS[node.kind], { size: 17 })}
          <strong>{FILM_LABELS[node.kind]} · 设置</strong>
        </div>
        <button aria-label="关闭属性面板" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="film-inspector-fields">
        <label>
          节点名称
          <input
            aria-label="节点名称"
            value={node.title}
            onChange={(event) => change({ title: event.target.value })}
          />
        </label>
        {(node.kind === 'play' || interaction) && (
          <>
            <label>
              {interaction ? '背景片段' : '播放素材'}
              <select
                aria-label="节点素材"
                value={node.mediaId || ''}
                onChange={(event) => {
                  const item = doc.media.find((value) => value.id === event.target.value);
                  change({
                    mediaId: item?.id,
                    trimIn: item ? 0 : undefined,
                    trimOut: item?.duration,
                    displaySeconds:
                      item?.type === 'image'
                        ? Math.max(
                            node.displaySeconds || 5,
                            node.windowEnd || node.windowStart || 0,
                          )
                        : node.displaySeconds,
                  });
                }}
              >
                <option value="">{interaction ? '继承上一节点末帧' : '请选择素材'}</option>
                {doc.media
                  .filter((item) => node.kind !== 'hotspot' || item.type !== 'audio')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            {previewMedia && (
              <MediaPreview
                key={`${node.id}:${previewMedia.id}:${inheritedFrame?.frameTime ?? 'own'}`}
                media={previewMedia}
                node={node}
                change={change}
                onDrawStart={onDrawStart}
                inheritedFrame={inheritedFrame}
              />
            )}
            {interaction && !media && (
              <p className="film-help">
                {inheritedFrame
                  ? '预览上一片段的确定末帧；运行时继承玩家实际经过的画面。'
                  : '上一画面取决于玩家路径或点击时刻，请在试玩中检查，或指定背景片段后绘制热点。'}
              </p>
            )}
            {media && media.type !== 'image' && (
              <div className="film-field-pair">
                <label>
                  起点（秒）
                  <input
                    aria-label="片段起点"
                    type="number"
                    min="0"
                    step="0.1"
                    value={node.trimIn ?? 0}
                    onChange={(event) => change({ trimIn: number(event) })}
                  />
                </label>
                <label>
                  终点（秒）
                  <input
                    aria-label="片段终点"
                    type="number"
                    min="0"
                    step="0.1"
                    value={node.trimOut ?? media.duration ?? 0}
                    onChange={(event) => change({ trimOut: number(event) })}
                  />
                </label>
              </div>
            )}
            {media?.type === 'image' && (
              <label>
                显示时长（秒）
                <input
                  type="number"
                  aria-label="图片显示时长"
                  min="0.1"
                  step="0.1"
                  value={node.displaySeconds ?? 5}
                  onChange={(event) => change({ displaySeconds: number(event) })}
                />
              </label>
            )}
            {media && (
              <p className="film-help">
                {media.name} · {(media.bytes / 1024 / 1024).toFixed(2)} MB
                {media.duration ? ` · ${media.duration.toFixed(1)} 秒` : ''}
              </p>
            )}
          </>
        )}
        {interaction && (
          <>
            <label>
              互动提示
              <textarea
                aria-label="互动提示"
                rows={3}
                value={node.prompt || ''}
                onChange={(event) => change({ prompt: event.target.value })}
              />
            </label>
            <label>
              出现时间（片段内秒数）
              <input
                aria-label="互动开始时间"
                type="number"
                min="0"
                step="0.1"
                value={node.windowStart ?? 0}
                onChange={(event) => change({ windowStart: number(event) })}
              />
            </label>
            {node.kind === 'choice' && (
              <label className="film-check">
                <input
                  type="checkbox"
                  checked={node.windowEnd !== undefined}
                  onChange={(event) =>
                    change({
                      windowEnd: event.target.checked
                        ? Math.max((node.windowStart || 0) + 3, 3)
                        : undefined,
                    })
                  }
                />
                启用选择超时出口
              </label>
            )}
            {(node.kind !== 'choice' || node.windowEnd !== undefined) && (
              <label>
                截止时间（秒）
                <input
                  aria-label="互动截止时间"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={node.windowEnd ?? 3}
                  onChange={(event) => change({ windowEnd: number(event) })}
                />
              </label>
            )}
            <p className="film-help">
              {node.kind === 'choice' && node.windowEnd === undefined
                ? '背景结束后冻结画面，等待玩家选择。'
                : '到达截止时间进入失败或超时出口；暂停时计时停止。'}
            </p>
          </>
        )}
        {node.kind === 'choice' && (
          <section className="film-choice-editor">
            <h3>选择</h3>
            {(node.choices || []).map((option) => (
              <div key={option.id}>
                <input
                  aria-label="选项文本"
                  value={option.text}
                  onChange={(event) =>
                    change({
                      choices: node.choices.map((item) =>
                        item.id === option.id ? { ...item, text: event.target.value } : item,
                      ),
                    })
                  }
                />
                <button
                  aria-label={`删除选项 ${option.text}`}
                  onClick={() =>
                    change({ choices: node.choices.filter((item) => item.id !== option.id) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                change({
                  choices: [...(node.choices || []), { id: crypto.randomUUID(), text: '新选项' }],
                })
              }
            >
              <Plus size={14} />
              添加选项
            </button>
          </section>
        )}
        {variableNode && (
          <>
            <label>
              变量
              <select
                aria-label="节点变量"
                value={node.variableId || ''}
                onChange={(event) => {
                  const item = doc.variables.find((value) => value.id === event.target.value);
                  change({
                    variableId: item?.id,
                    value: item?.type === 'boolean' ? false : 0,
                    operation: 'set',
                    comparator: 'eq',
                  });
                }}
              >
                <option value="">请选择变量</option>
                {doc.variables.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {node.kind === 'set' ? (
              <label>
                修改方式
                <select
                  value={node.operation || 'set'}
                  onChange={(event) => change({ operation: event.target.value })}
                >
                  <option value="set">设为</option>
                  {variable?.type === 'number' && <option value="add">增加（负数表示减少）</option>}
                </select>
              </label>
            ) : (
              <label>
                比较
                <select
                  value={node.comparator || 'eq'}
                  onChange={(event) => change({ comparator: event.target.value })}
                >
                  <option value="eq">等于</option>
                  <option value="ne">不等于</option>
                  {variable?.type === 'number' && (
                    <>
                      <option value="gt">大于</option>
                      <option value="gte">大于等于</option>
                      <option value="lt">小于</option>
                      <option value="lte">小于等于</option>
                    </>
                  )}
                </select>
              </label>
            )}
            <label>
              值
              {variable?.type === 'boolean' ? (
                <select
                  value={String(node.value ?? false)}
                  onChange={(event) => change({ value: event.target.value === 'true' })}
                >
                  <option value="false">否</option>
                  <option value="true">是</option>
                </select>
              ) : (
                <input
                  aria-label="变量操作值"
                  type="number"
                  value={typeof node.value === 'number' ? node.value : 0}
                  onChange={(event) => change({ value: number(event) })}
                />
              )}
            </label>
          </>
        )}
        {node.kind === 'hotspot' && (
          <section>
            <h3>热点区域（0–1）</h3>
            <div className="film-field-pair">
              {['x', 'y', 'width', 'height'].map((key) => (
                <label key={key}>
                  {{ x: '横向位置', y: '纵向位置', width: '宽度', height: '高度' }[key]}
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={node.region?.[key] ?? 0}
                    onChange={(event) =>
                      change({ region: { ...node.region, [key]: number(event) } })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        )}
        {node.kind === 'ending' && (
          <label>
            结局正文
            <textarea
              aria-label="结局正文"
              rows={6}
              value={node.endingText || ''}
              onChange={(event) => change({ endingText: event.target.value })}
            />
          </label>
        )}
        {node.kind === 'start' && (
          <p className="film-help">试玩从此节点开始；初始变量在左侧变量面板编辑。</p>
        )}
      </div>
    </aside>
  );
}
