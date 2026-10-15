import { MoreHorizontal, Music2, Download, Maximize, Settings2, Copy } from 'lucide-react';
import { CanvasConnectionHandle } from './CanvasConnectionHandle.jsx';
import { CanvasNodeConnectionFeedback } from './CanvasNodeConnectionFeedback.jsx';
import { useCanvasNodeConnectionFeedback } from '../hooks/useCanvasNodeConnectionFeedback.js';
import './canvas-node-feedback-surface.css';
import { download } from '../../editor/browser.js';
import CanvasScriptNode from '../storyboard/CanvasScriptNodeEntry.jsx';
import { isCanvasScriptNode, isScriptV2 } from '../storyboard/script-model.js';
import { projectScriptV2Card } from '../storyboard/script-card-model.js';
import { useState } from 'react';
import { canvasNodeSize } from '../domain/groups.js';
import CanvasReferencePickMask from './CanvasReferencePickMask.jsx';
import CanvasFocusSurface, {
  FocusModePlaceholder,
} from '../generator/focus/CanvasFocusSurface.jsx';
import CanvasVideoClipNode from '../clip-editor/CanvasVideoClipNode.jsx';
import VideoComposeModeIcon from '../clip-editor/VideoComposeModeIcon.jsx';
import CanvasShotBreakdownNode from './CanvasShotBreakdownNode.jsx';
export function CanvasNode({
  Icon,
  clip,
  connect,
  connection,
  connectionFeedback,
  referencePick,
  focusMode,
  markMode,
  referenceZoom = 1,
  afterContent,
  drag,
  shouldSuppressClick,
  duplicate,
  info,
  linking,
  n,
  readonly,
  selected,
  setDialog,
  setLinkPoint,
  setLinking,
  setPanel,
  setSelected,
  src,
  update,
  url,
  position = n.position,
  zIndex,
  showActions = true,
  hideTitleBar = false,
  hideTargetHandle = false,
  hideSourceHandle = false,
  storyboardShotNumber,
  script,
  nodes = [],
  edges = [],
  onShotBreakdownUpload,
  onShotBreakdownPick,
  onShotBreakdownUpdate,
  notify,
}) {
  const [scriptOpenRequest, setScriptOpenRequest] = useState(0);
  const scriptReadonly = readonly || script?.readonly;
  const scriptCard = isScriptV2(n)
    ? projectScriptV2Card({
        node: n,
        nodes: script?.nodes,
        edges: script?.edges,
        readonly: scriptReadonly,
      })
    : null;
  const scriptCanOpen = !scriptCard || (scriptCard.canOpen && script?.ready !== false);
  const nodeLabel =
    clip?.presentation?.label || scriptCard?.title || n.data?.name || info.label + '节点';
  const size = canvasNodeSize(n);
  const focusSurface = focusMode?.surfaceState(n.id);
  const markSurface = markMode?.surfaceState(n.id);
  const MarkSurface = markMode?.Surface;
  const feedback = useCanvasNodeConnectionFeedback({
    ...connectionFeedback,
    nodeId: n.id,
    frozen: readonly || connection?.disabled || connectionFeedback?.frozen,
  });
  const edit = () => {
    if (n.type === 'video-clip') {
      setSelected([n.id]);
      setPanel(null);
    } else if (isCanvasScriptNode(n)) {
      if (scriptCanOpen) setScriptOpenRequest((value) => value + 1);
    } else setPanel(n.id);
  };
  return (
    <article
      ref={feedback.elementRef}
      key={n.id}
      data-node-id={n.id}
      data-script-card-kind={scriptCard?.kind}
      data-clip-presentation={clip?.presentation?.state}
      data-ref-pick-state={referencePick?.description?.states.get(n.id)}
      className={
        'cv-node cv-node-has-feedback-surface ' +
        (selected.includes(n.id) ? 'cv-selected' : '') +
        ' cv-node-' +
        n.type
      }
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
        '--cv-clip-border-radius': clip?.presentation
          ? `${clip.presentation.borderRadius}px`
          : undefined,
      }}
      onPointerDown={(e) => {
        if (referencePick?.active) referencePick.prepareNodeClick();
        else if (!focusMode?.active && !markMode?.active) drag(e, n);
      }}
      onMouseEnter={feedback.onMouseEnter}
      onMouseLeave={feedback.onMouseLeave}
      onMouseMove={feedback.onMouseMove}
      onClick={(e) => {
        e.stopPropagation();
        if (shouldSuppressClick?.(e)) return;
        if (focusMode?.active || markMode?.active) return;
        if (referencePick?.active) {
          if (!referencePick.suppressNodeClick(e)) referencePick.pick(n.id);
          return;
        }
        if (linking) {
          connect(n.id);
          return;
        }
        // Pointer selection owns Shift toggles and group dragging. A following
        // click must not collapse that selection back to this one node.
        if (!e.shiftKey && !selected.includes(n.id)) setSelected([n.id]);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (shouldSuppressClick?.(e)) return;
        if (referencePick?.active || focusMode?.active || markMode?.active) return;
        if (isCanvasScriptNode(n)) {
          edit();
          return;
        }
        if (n.type === 'video-clip') {
          edit();
          return;
        }
        if (['image', 'video', 'audio'].includes(n.type)) setSelected([n.id]);
        else setPanel(n.id);
      }}
      tabIndex={0}
      aria-label={nodeLabel}
    >
      <div className="cv-node-feedback-surface" style={feedback.tiltStyle}>
        {!hideTitleBar && (
          <div className="cv-node-title">
            <Icon size={15} />
            <span>{nodeLabel}</span>
            <button
              title="节点设置"
              disabled={
                referencePick?.active ||
                focusMode?.active ||
                markMode?.active ||
                (isScriptV2(n) && !scriptCanOpen)
              }
              onClick={(e) => {
                e.stopPropagation();
                edit();
              }}
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
        )}
        <div className="cv-node-feedback-body">
          <div
            className="cv-node-content"
            inert={
              (referencePick?.active && n.id !== referencePick.targetId) ||
              (focusMode?.active && n.type !== 'image' && n.id !== focusMode.targetId) ||
              (markMode?.active && n.type !== 'image')
            }
          >
            {n.type === 'video-clip' && clip?.presentation ? (
              <CanvasVideoClipNode
                node={n}
                {...clip}
                mapUrl={src}
                selected={selected.includes(n.id)}
                renderModeIcon={(mode) => <VideoComposeModeIcon mode={mode} />}
              />
            ) : n.type === 'shot-breakdown' ? (
              <CanvasShotBreakdownNode
                node={n}
                nodes={nodes}
                edges={edges}
                readonly={readonly}
                update={onShotBreakdownUpdate || update}
                onUpload={onShotBreakdownUpload}
                onPickFromCanvas={onShotBreakdownPick}
                notify={notify}
              />
            ) : focusMode?.active && n.type === 'image' && (n.id === focusMode.targetId || !url) ? (
              <FocusModePlaceholder />
            ) : isCanvasScriptNode(n) ? (
              <CanvasScriptNode
                node={n}
                {...script}
                readonly={scriptReadonly}
                shouldSuppressClick={shouldSuppressClick}
                src={src}
                openRequest={scriptOpenRequest}
              />
            ) : ['text', 'reference'].includes(n.type) ? (
              <textarea
                placeholder={
                  n.type === 'reference' ? '双击输入参考说明（不参与生成）' : '双击输入文本内容'
                }
                value={n.data.text ?? n.data.content ?? n.data.params?.prompt ?? ''}
                readOnly={readonly}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (readonly) return;
                  update(n.id, {
                    text: e.target.value,
                    ...(n.type === 'text'
                      ? { params: { ...n.data.params, prompt: e.target.value } }
                      : {}),
                  });
                }}
              />
            ) : url ? (
              n.type === 'image' ? (
                <>
                  <img
                    src={src(url)}
                    alt={n.data?.name || '图片节点'}
                    draggable={false}
                    style={
                      n.data.mediaDisplaySize?.width > 0 && n.data.mediaDisplaySize?.height > 0
                        ? { objectFit: 'contain' }
                        : undefined
                    }
                  />
                  {focusSurface && (
                    <CanvasFocusSurface
                      {...focusSurface}
                      ref={focusMode.getSurfaceRef(n.id)}
                      zoom={referenceZoom}
                    />
                  )}
                  {markSurface && MarkSurface && (
                    <MarkSurface
                      {...markSurface}
                      ref={markMode.getSurfaceRef(n.id)}
                      zoom={referenceZoom}
                    />
                  )}
                </>
              ) : n.type === 'video' || n.type === 'video-clip' ? (
                <video
                  src={src(url)}
                  poster={src(n.data.coverUrl || n.data.poster || '')}
                  preload={selected.includes(n.id) ? 'metadata' : 'none'}
                  controls={selected.includes(n.id)}
                  muted={!selected.includes(n.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ) : n.type === 'audio' ? (
                <div className="cv-audio">
                  <Music2 size={42} />
                  <div className="cv-wave">
                    {Array.from({ length: 35 }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          height: 8 + Math.sin(i * 2.4) * 12 + Math.cos(i * 0.8) * 10 + 18,
                        }}
                      />
                    ))}
                  </div>
                  <audio controls src={src(url)} onPointerDown={(e) => e.stopPropagation()} />
                </div>
              ) : (
                <div className="cv-node-empty">
                  <Icon size={38} />
                  <span>{info.label}</span>
                </div>
              )
            ) : (
              <div className="cv-node-empty">
                <Icon size={38} />
                <span>{n.type === 'shot-breakdown' ? '逐帧拉片' : info.label + '生成器'}</span>
                <small>{n.data.params?.prompt || '添加提示词，开始创作'}</small>
              </div>
            )}
          </div>
          <CanvasNodeConnectionFeedback feedback={feedback} />
          {referencePick?.active &&
            !(
              n.type === 'shot-breakdown' &&
              referencePick.description.states.get(n.id) === 'connected'
            ) && (
              <CanvasReferencePickMask
                state={referencePick.description.states.get(n.id)}
                blockReason={referencePick.description.blockReasons.get(n.id)}
                label={nodeLabel}
                zoom={referenceZoom}
                onPointerDown={() => referencePick.prepareNodeClick()}
                onPick={(event) => {
                  if (shouldSuppressClick?.(event) || referencePick.suppressNodeClick(event))
                    return;
                  referencePick.pick(n.id);
                }}
                onDisconnect={
                  n.type === 'shot-breakdown'
                    ? undefined
                    : (event) => {
                        if (shouldSuppressClick?.(event) || referencePick.suppressNodeClick(event))
                          return;
                        referencePick.disconnect(n.id);
                      }
                }
              />
            )}
          {!readonly && !referencePick?.active && !focusMode?.active && !markMode?.active && (
            <>
              {!hideTargetHandle && (
                <CanvasConnectionHandle
                  nodeId={n.id}
                  handleType="target"
                  connection={connection}
                  onLegacyClick={() => connect(n.id)}
                />
              )}
              {!hideSourceHandle && (
                <CanvasConnectionHandle
                  nodeId={n.id}
                  handleType="source"
                  connection={connection}
                  onLegacyClick={() => {
                    setLinking(n.id);
                    setLinkPoint({
                      x: position.x + size.width + 90,
                      y: position.y + size.height / 2,
                    });
                  }}
                />
              )}
            </>
          )}
        </div>
        {showActions && selected.includes(n.id) && !isScriptV2(n) && n.type !== 'video-clip' && (
          <div className="cv-node-actions cv-floating" onPointerDown={(e) => e.stopPropagation()}>
            {url && (
              <button onClick={() => setDialog({ preview: n })}>
                <Maximize size={14} />
                预览
              </button>
            )}
            {!readonly && (
              <button onClick={edit}>
                <Settings2 size={14} />
                编辑
              </button>
            )}
            <button
              onClick={() => {
                if (url) {
                  const a = document.createElement('a');
                  a.href = src(url);
                  a.download = n.data.name || 'PenStudio';
                  a.target = '_blank';
                  a.click();
                } else if (isCanvasScriptNode(n)) {
                  download(
                    (n.data.name || '分镜脚本') + '.json',
                    JSON.stringify(n.data, null, 2),
                    'application/json',
                  );
                } else
                  download(
                    (n.data.name || '文本') + '.txt',
                    n.data.text || n.data.params?.prompt || '',
                    'text/plain',
                  );
              }}
            >
              <Download size={14} />
              下载
            </button>
            {!readonly && (
              <button title="复制" onClick={() => duplicate([n.id])}>
                <Copy size={14} />
              </button>
            )}
          </div>
        )}
        {storyboardShotNumber && (
          <span
            className="cv-storyboard-shot-number"
            aria-hidden="true"
            style={{ fontSize: storyboardShotNumber.fontSize }}
          >
            {storyboardShotNumber.label}
          </span>
        )}
      </div>
      {afterContent}
    </article>
  );
}
