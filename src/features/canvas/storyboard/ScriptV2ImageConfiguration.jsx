import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MantineProvider, Tooltip } from '@mantine/core';
import { Image, X } from 'lucide-react';
import { DialogFocusBoundary } from '../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import { V2GenerationSelector, V2ParameterIcon, v2Caption } from './V2GenerationSelector.jsx';
import '@mantine/core/styles/Tooltip.css';
import './ScriptV2ImageConfiguration.css';

const colorSchemeManager = {
  get: () => 'dark',
  set: () => {},
  clear: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
};
const noRootElement = () => null;
const emptyState = {
  config: { model: '', settings: {} },
  selectedIndices: new Set(),
  expandedIndices: new Set(),
};
const emptyProjection = {
  valid: false,
  options: [],
  fields: [],
  canConfirm: false,
  selectedCount: 0,
  totalCount: 0,
  allSelected: false,
  someSelected: false,
};

function ImageParameterIcon({ field }) {
  const isRatio =
    field.isAspect || field.originalField === 'aspectRatio' || field.key.startsWith('ratio');
  const isQuality = field.key === 'quality' || field.originalField === 'quality';
  if (!isRatio && !isQuality && !field.key.startsWith('resolution')) return null;
  return (
    <V2ParameterIcon
      field={{ key: field.key, storedKey: field.originalField, ratio: isRatio }}
      value={String(field.currentValue)}
    />
  );
}

/** Source r3: independent index selection and enum chips; no fee, duration or run action. */
export default function ScriptV2ImageConfiguration({
  opened,
  rows = [],
  state: inputState,
  projection: inputProjection,
  onChange,
  onClose,
  onConfirm,
  busy = false,
  pendingSave = false,
  error = '',
  catalogStatus = 'ready',
  onRetryCatalog,
  isCanvasLight = false,
  src = (url) => url,
}) {
  const state = inputState || emptyState,
    projection = inputProjection || emptyProjection;
  const dialog = useRef(null),
    all = useRef(null);
  const [portal, setPortal] = useState(null);
  const attachDialog = useCallback((element) => {
    dialog.current = element;
    setPortal(element);
  }, []);
  const close = () => {
    if (!busy) onClose?.({ restoreFocus: true });
  };
  useDialogBehavior(dialog, { enabled: opened, onClose: close, closeOnEscape: !busy });
  useEffect(() => {
    if (all.current) all.current.indeterminate = projection.someSelected;
  }, [projection.someSelected]);
  if (!opened) return null;
  const locked =
    busy || pendingSave || catalogStatus !== 'ready' || projection.valid === false || !onChange;
  const submitDisabled =
    busy || !onConfirm || (!pendingSave && (catalogStatus !== 'ready' || !projection.canConfirm));
  const tooltip = projection.confirmTooltip || '创建分镜图生成器组后，可在画布中整组执行批量生图';
  const options = projection.options || [];
  const modelIcon = (option) =>
    typeof option?.icon === 'string' && option.icon ? (
      <img src={src(option.icon)} alt="" width={14} height={14} />
    ) : (
      <Image size={14} aria-hidden="true" />
    );
  const modelOption = options.find((option) => option.value === state.config.model);
  return createPortal(
    <MantineProvider
      forceColorScheme={isCanvasLight ? 'light' : 'dark'}
      colorSchemeManager={colorSchemeManager}
      getRootElement={noRootElement}
    >
      <div
        className={`cv-v2-image-overlay${isCanvasLight ? ' cv-v2-image-light cv-v2-generation-light' : ''}`}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (event.target === event.currentTarget) close();
        }}
      >
        <section
          ref={attachDialog}
          className="cv-v2-image-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="分镜批量生图"
          tabIndex={-1}
          aria-busy={busy}
        >
          <DialogFocusBoundary edge="start" />
          <header className="cv-v2-image-header">
            <h2>分镜批量生图</h2>
            <button type="button" aria-label="关闭分镜批量生图" disabled={busy} onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="cv-v2-image-body">
            {catalogStatus === 'loading' && (
              <div className="cv-v2-image-warning" role="status">
                正在加载图片模型…
              </div>
            )}
            {catalogStatus === 'error' && (
              <div className="cv-v2-image-warning" role="alert">
                图片模型加载失败
                {onRetryCatalog && (
                  <button type="button" disabled={busy || pendingSave} onClick={onRetryCatalog}>
                    重试加载图片模型
                  </button>
                )}
              </div>
            )}
            {catalogStatus === 'ready' && !projection.catalogue?.keys?.length && (
              <div className="cv-v2-image-warning" role="status">
                当前暂无支持这些参考图的图片模型，请调整选择或参考图。
              </div>
            )}
            {projection.visibleSettingsSupported === false && (
              <div className="cv-v2-image-warning" role="status">
                当前模型参数暂不支持编辑，可使用默认值或切换模型。
              </div>
            )}
            <div className="cv-v2-image-info">
              会优先使用已生成的角色、场景和道具参考图，让画面更贴合分镜内容
            </div>
            <div className="cv-v2-image-rows">
              {rows.map((row, index) => {
                const expanded = state.expandedIndices.has(index);
                const prompt = row.imageGenerationPrompt || row.plotDescription || '（空）';
                return (
                  <div
                    className={`cv-v2-image-row${expanded ? ' cv-v2-image-row-expanded' : ''}`}
                    key={row.hiddenUuid ?? index}
                  >
                    <div className="cv-v2-image-row-label">
                      <input
                        type="checkbox"
                        aria-label={`选择镜头 ${row.shotNumber}`}
                        checked={state.selectedIndices.has(index)}
                        disabled={locked}
                        onChange={() => onChange({ type: 'toggleRow', index })}
                      />
                      <span>镜头{row.shotNumber}</span>
                    </div>
                    <span
                      className="cv-v2-image-prompt"
                      title={expanded ? undefined : String(prompt)}
                    >
                      {String(prompt)}
                    </span>
                    <button
                      type="button"
                      aria-label={`镜头 ${row.shotNumber} 详情`}
                      aria-expanded={expanded}
                      disabled={locked}
                      onClick={() => onChange({ type: 'toggleExpanded', index })}
                    >
                      {expanded ? '收起' : '详情'}
                    </button>
                  </div>
                );
              })}
            </div>
            <footer className="cv-v2-image-footer">
              <div
                className="cv-v2-image-footer-left"
                data-testid="batch-storyboard-footer-controls"
              >
                <div className="cv-v2-image-selection" data-testid="batch-storyboard-footer-left">
                  <label>
                    <input
                      ref={all}
                      type="checkbox"
                      aria-label="全选镜头"
                      checked={projection.allSelected}
                      disabled={locked || !rows.length}
                      onChange={() => onChange({ type: 'toggleAll' })}
                    />
                    已选 {projection.selectedCount}/{projection.totalCount}
                  </label>
                  {!projection.selectedCount && <span>请先选择镜头</span>}
                </div>
                <div className="cv-v2-image-config">
                  <V2GenerationSelector
                    label="选择图片模型"
                    testId="batch-storyboard-config-model"
                    value={state.config.model}
                    options={options}
                    disabled={locked}
                    isCanvasLight={isCanvasLight}
                    portal={portal}
                    strictValues
                    icon={modelIcon(modelOption)}
                    renderIcon={modelIcon}
                    onChange={(value) => onChange({ type: 'model', value })}
                  />
                  {(projection.fields || []).map((field) => (
                    <V2GenerationSelector
                      key={field.key}
                      label={v2Caption(
                        field.displayName ||
                          field.label ||
                          projection.schema?.properties?.[field.key]?.displayName ||
                          field.key,
                      )}
                      testId={`batch-storyboard-config-${field.key}`}
                      value={field.currentValue}
                      options={field.values}
                      disabled={locked}
                      portal={portal}
                      isCanvasLight={isCanvasLight}
                      strictValues
                      icon={<ImageParameterIcon field={field} />}
                      onChange={(value) => onChange({ type: 'setting', field: field.key, value })}
                    />
                  ))}
                </div>
              </div>
              <Tooltip
                label={tooltip}
                position="top-end"
                withArrow
                openDelay={0}
                multiline
                w={280}
                zIndex={2000}
                withinPortal={false}
              >
                <span className="cv-v2-image-submit-anchor">
                  <button
                    type="button"
                    className="cv-v2-image-submit"
                    disabled={submitDisabled}
                    onClick={onConfirm}
                  >
                    {pendingSave
                      ? '重试保存分镜图组'
                      : projection.confirmLabel ||
                        `确认并创建生成器组 (${projection.selectedCount})`}
                  </button>
                </span>
              </Tooltip>
            </footer>
            <div className="cv-v2-image-boundary">创建空分镜图生成器；生成服务未连接</div>
            {error && (
              <div className="cv-v2-image-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <DialogFocusBoundary edge="end" />
        </section>
      </div>
    </MantineProvider>,
    document.body,
  );
}
