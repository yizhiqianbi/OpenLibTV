import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Loader2, X, Zap } from 'lucide-react';
import GeneratorModelMenu from '../generator/GeneratorModelMenu.jsx';
import GeneratorSettings from '../generator/GeneratorSettings.jsx';
import { storyboardBatchVideoSettingsSchema } from '../storyboard/batch-video-config-model.js';
import '../generator/inline-generator.css';
import './CanvasBatchVideoConfiguration.css';

function useConfigurationPosition(bounds, view, board, ref) {
  const zoom = Number.isFinite(view?.z) && view.z > 0 ? view.z : 1;
  const effectiveZoom = Math.max(zoom, 0.5);
  const scale = zoom * Math.min(1 / effectiveZoom, 2);
  const x = bounds?.x ?? 0,
    y = bounds?.y ?? 0,
    width = bounds?.width ?? 0,
    height = bounds?.height ?? 0,
    viewX = view?.x ?? 0,
    viewY = view?.y ?? 0;
  const [position, setPosition] = useState({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const element = board?.current || board;
    if (!element || !ref.current) return;
    let frame,
      alive = true;
    const place = () => {
      if (!alive) return;
      const rect = element.getBoundingClientRect();
      const maxWidth = Math.max(1, window.innerWidth - 16);
      const panel = ref.current.getBoundingClientRect();
      const panelWidth = Math.min(
        maxWidth,
        panel.width || ref.current.scrollWidth * scale || maxWidth,
      );
      const panelHeight = panel.height || 42 * scale;
      setPosition({
        left: Math.max(
          8,
          Math.min(
            rect.left + viewX + (x + width / 2) * zoom - panelWidth / 2,
            window.innerWidth - panelWidth - 8,
          ),
        ),
        top: Math.max(
          8,
          Math.min(
            rect.top + viewY + (y + height) * zoom + (10 * zoom) / effectiveZoom,
            window.innerHeight - panelHeight - 8,
          ),
        ),
      });
    };
    const schedule = () => {
      if (!alive) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    observer?.observe(ref.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [board, ref, x, y, width, height, viewX, viewY, zoom, effectiveZoom, scale]);
  return {
    ...position,
    maxWidth: Math.max(1, window.innerWidth - 16) / scale,
    transform: `scale(${scale})`,
  };
}

export default function CanvasBatchVideoConfiguration({
  bounds,
  view,
  board,
  modelKeys,
  models,
  config,
  schema,
  onConfigChange,
  onClose,
  onSubmit,
  onRetry,
  busy = false,
  readyCount = 0,
  feeState,
  disabledReason = '',
  pendingSave = false,
  submitLabel = '创建视频组',
  error = '',
}) {
  const host = useRef(null);
  const closeButton = useRef(null);
  useLayoutEffect(() => {
    closeButton.current?.focus();
  }, []);
  const position = useConfigurationPosition(bounds, view, board, host);
  const catalogue = models?.videoModels || models || {};
  const unavailable = disabledReason || (!schema && !pendingSave ? '视频模型配置尚未就绪' : '');
  const controlsDisabled = busy || pendingSave || !!unavailable;
  const submitDisabled = busy || !!unavailable || (!pendingSave && readyCount < 1) || !onSubmit;
  const fee = ['error', 'unavailable'].includes(feeState?.status) ? '-' : (feeState?.cost ?? '-');
  const originalFee = feeState?.originalCost;
  const feeTitle =
    feeState?.reason ||
    (feeState?.status === 'loading'
      ? '费用估算中'
      : feeState?.status === 'ready'
        ? '预计积分'
        : '费用服务未连接');
  const settingsParams = {
    prompt: '',
    model: config?.model || '',
    modeType: config?.modeType,
    count: 1,
    settings: config?.settings || {},
    advancedSettings: config?.advancedSettings || {},
  };
  const settingsSchema = storyboardBatchVideoSettingsSchema(schema, config?.modeType);
  return createPortal(
    <div
      ref={host}
      role="toolbar"
      aria-label="批量视频配置"
      className="cv-batch-video-configuration nodrag nopan nowheel"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          onClose?.({ restoreFocus: true });
        }
      }}
    >
      <div className="cv-batch-video-configuration-row">
        <button
          type="button"
          ref={closeButton}
          className="cv-batch-video-close"
          aria-label="关闭批量视频配置"
          onClick={() => onClose?.({ restoreFocus: true })}
        >
          <X size={12} />
        </button>
        <span className="cv-batch-video-divider" aria-hidden="true" />
        <GeneratorModelMenu
          model={config?.model}
          models={catalogue}
          modelKeys={modelKeys}
          disabled={controlsDisabled}
          onChange={(model) => {
            const trigger = host.current?.querySelector('[aria-label="选择生成模型"]');
            const focused = document.activeElement;
            onConfigChange?.({ ...config, model });
            queueMicrotask(() => {
              if (
                trigger?.isConnected &&
                (document.activeElement === focused || document.activeElement === document.body)
              )
                trigger.focus();
            });
          }}
        />
        <span className="cv-batch-video-divider" aria-hidden="true" />
        <GeneratorSettings
          params={settingsParams}
          schema={settingsSchema}
          type="video"
          inputCounts={{ imageList: 0, videoList: 0, audioList: 0 }}
          embedAdvancedSettings
          embedAdvancedSettingsBatchOnly
          suppressCount
          hidePromptMentionToggle
          disabled={controlsDisabled}
          onChange={(params) =>
            onConfigChange?.({
              ...config,
              settings: { ...config?.settings, ...params.settings },
              advancedSettings: params.advancedSettings,
            })
          }
        />
        <span className="cv-batch-video-count">全部 {readyCount} 个分镜</span>
        <span className="cv-batch-video-divider" aria-hidden="true" />
        <span className="cv-batch-video-fee" aria-label="预计积分" title={feeTitle}>
          <Zap width={10} height={14} aria-hidden="true" />
          <span className="cv-batch-video-fee-value">
            <span>{fee}</span>
            {fee !== '-' && originalFee != null && String(originalFee) !== String(fee) && (
              <>
                <span className="cv-batch-video-fee-separator">/</span>
                <del>{originalFee}</del>
              </>
            )}
          </span>
        </span>
        <button
          type="button"
          className="cv-batch-video-submit"
          aria-label={submitLabel}
          aria-busy={busy}
          disabled={submitDisabled}
          title={
            busy
              ? '处理中...'
              : pendingSave
                ? '重试保存已创建的视频组'
                : unavailable || '创建空视频节点，生成服务未连接'
          }
          onClick={() => onSubmit?.(config)}
        >
          {busy ? <Loader2 size={12} className="cv-batch-video-loading" /> : <ArrowUp size={12} />}
        </button>
      </div>
      {(unavailable || error) && (
        <div className="cv-batch-video-message" role={error ? 'alert' : 'status'}>
          <span>{error || unavailable}</span>
          {unavailable && onRetry && (
            <button type="button" disabled={busy} aria-label="重试加载视频配置" onClick={onRetry}>
              重试
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
