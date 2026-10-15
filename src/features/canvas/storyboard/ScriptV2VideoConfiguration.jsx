import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MantineProvider, NumberInput, Tooltip } from '@mantine/core';
import { ChevronDown, Clapperboard, X } from 'lucide-react';
import { DialogFocusBoundary } from '../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import {
  V2GenerationSelector as Selector,
  V2ParameterIcon as ParameterIcon,
  v2Caption as caption,
} from './V2GenerationSelector.jsx';
import '@mantine/core/styles/Input.css';
import '@mantine/core/styles/NumberInput.css';
import '@mantine/core/styles/Tooltip.css';
import './ScriptV2VideoConfiguration.css';

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
  selectedHiddenUuids: new Set(),
  perShotDurations: new Map(),
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
function ConfigField({ field, onChange, disabled, ratioHint, isCanvasLight, portal }) {
  const property = field.property;
  const label = caption(property.displayName || property.label || field.key);
  if (
    property.component === 'slider' ||
    (property.min !== undefined && property.max !== undefined && !property.enum)
  ) {
    const min = field.override?.min ?? property.min ?? 0;
    const max = field.override?.max ?? property.max ?? 100;
    const step = field.override?.step ?? property.step ?? 1;
    const value = Math.min(
      max,
      Math.max(min, typeof field.value === 'number' ? field.value : Number(property.min ?? 0)),
    );
    return (
      <NumberInput
        aria-label={label}
        title={label}
        className="cv-v2-video-parameter-number"
        classNames={{
          input: 'cv-v2-video-number-input',
          controls: 'cv-v2-video-number-controls',
          control: 'cv-v2-video-number-control',
        }}
        value={value}
        min={min}
        max={max}
        step={step}
        size="xs"
        allowDecimal={step < 1}
        disabled={disabled}
        onChange={(next) => {
          if (next === '' || next == null || !Number.isFinite(Number(next))) return;
          onChange({
            type: 'setting',
            field: field.key,
            value: Math.min(max, Math.max(min, Number(next))),
          });
        }}
      />
    );
  }
  const options = (property.enum || []).flatMap((option) => {
    const raw = option && typeof option === 'object' ? option.value : option;
    if (typeof option === 'boolean') return [];
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return [];
    return [
      {
        value: raw,
        label:
          typeof option === 'object'
            ? caption(option.displayName || option.label) || String(raw)
            : String(raw),
        disabled: field.disabledValues?.has(raw),
      },
    ];
  });
  if (!options.length) return null;
  return (
    <Selector
      label={label}
      portal={portal}
      testId={`batch-video-config-chip-${field.key}`}
      value={field.value}
      options={options}
      isCanvasLight={isCanvasLight}
      title={field.ratio ? ratioHint : undefined}
      disabled={disabled || (field.ratio && field.ratioLocked)}
      icon={<ParameterIcon field={field} value={String(field.value)} />}
      renderIcon={(option) => <ParameterIcon field={field} value={String(option.value)} />}
      onChange={(value) => onChange({ type: 'setting', field: field.key, value })}
    />
  );
}
function OpenConfiguration({
  rows = [],
  state,
  projection,
  onChange,
  onClose,
  onConfirm,
  busy = false,
  pendingSave = false,
  error = '',
  catalogStatus = 'ready',
  onRetryCatalog,
  getPrompt,
  isCanvasLight = false,
  requiresPortraitAudit = false,
}) {
  const dialog = useRef(null),
    all = useRef(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [portal, setPortal] = useState(null);
  const attachDialog = useCallback((element) => {
    dialog.current = element;
    setPortal(element);
  }, []);
  const close = () => {
    if (!busy) onClose?.({ restoreFocus: true });
  };
  useDialogBehavior(dialog, { onClose: close, closeOnEscape: !busy });
  useEffect(() => {
    if (all.current) all.current.indeterminate = projection.someSelected;
  }, [projection.someSelected]);
  const locked =
    busy || pendingSave || catalogStatus !== 'ready' || projection.valid === false || !onChange;
  const constraint = projection.durationConstraint;
  const availableRows = rows.filter((row) => row.hiddenUuid);
  const sourceTitle =
    projection.confirmTooltip || '创建视频生成器组后，可在画布中整组执行批量生视频';
  const submitDisabled =
    busy || !onConfirm || (!pendingSave && (catalogStatus !== 'ready' || !projection.canConfirm));
  const sourceOptions = projection.options || [];
  const hasAvailableModels = (projection.catalogue?.keys ?? sourceOptions).length > 0;
  const modelIcon = (option) =>
    typeof option?.icon === 'string' && option.icon ? (
      <img src={option.icon} alt="" width={14} height={14} />
    ) : (
      <Clapperboard size={14} aria-hidden="true" />
    );
  const modelOption = sourceOptions.find((option) => option.value === state.config.model);
  return createPortal(
    <MantineProvider
      forceColorScheme={isCanvasLight ? 'light' : 'dark'}
      colorSchemeManager={colorSchemeManager}
      getRootElement={noRootElement}
    >
      <div
        className={`cv-v2-video-overlay${isCanvasLight ? ' cv-v2-video-light cv-v2-generation-light' : ''}`}
      >
        <section
          ref={attachDialog}
          className="cv-v2-video-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="批量生视频"
          tabIndex={-1}
          aria-busy={busy}
        >
          <DialogFocusBoundary edge="start" />
          <header className="cv-v2-video-header">
            <h2>批量生视频</h2>
            <button type="button" aria-label="关闭批量生视频" disabled={busy} onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="cv-v2-video-body">
            {catalogStatus === 'loading' && (
              <div className="cv-v2-video-warning" role="status">
                正在加载视频模型…
              </div>
            )}
            {catalogStatus === 'error' && (
              <div className="cv-v2-video-warning" role="alert">
                视频模型加载失败
                {onRetryCatalog && (
                  <button type="button" disabled={busy || pendingSave} onClick={onRetryCatalog}>
                    重试加载视频模型
                  </button>
                )}
              </div>
            )}
            {catalogStatus === 'ready' && !hasAvailableModels && (
              <div className="cv-v2-video-warning">当前暂无可用的视频模型，批量生视频暂不可用</div>
            )}
            {projection.overLimitMessage && (
              <div className="cv-v2-video-warning" data-testid="batch-video-over-ref-limit-banner">
                {projection.overLimitMessage}
              </div>
            )}
            <div className="cv-v2-video-info">
              会优先使用已生成的角色、场景和道具参考图，让视频更贴合分镜内容
            </div>
            <div className="cv-v2-video-hint">
              音频已默认开启，品质跟随视频品质。每镜时长为本次生成临时值，不写回脚本表格。
              {projection.durationFixed &&
                projection.durationFixedValue != null &&
                `当前模型仅支持 ${projection.durationFixedValue}s。`}
            </div>
            <div className="cv-v2-video-rows">
              {availableRows.map((row) => {
                const uuid = row.hiddenUuid;
                const value = state.perShotDurations.get(uuid) ?? row.durationSeconds;
                const validation = projection.durationValidationByRow?.get(uuid);
                const supported = validation?.supported !== false;
                const rowLocked = locked || (projection.durationFixed && supported);
                const prompt = row.videoMotionPrompt || row.plotDescription || '';
                return (
                  <div key={uuid} className="cv-v2-video-row">
                    <div className="cv-v2-video-row-main">
                      <input
                        type="checkbox"
                        aria-label={`选择镜头 ${row.shotNumber}`}
                        checked={state.selectedHiddenUuids.has(uuid)}
                        disabled={locked}
                        onChange={() => onChange({ type: 'toggleRow', hiddenUuid: uuid })}
                      />
                      <button
                        type="button"
                        className="cv-v2-video-row-title"
                        aria-expanded={expanded.has(uuid)}
                        aria-label={`展开镜头 ${row.shotNumber} 提示词`}
                        onClick={() =>
                          setExpanded((before) => {
                            const next = new Set(before);
                            next.has(uuid) ? next.delete(uuid) : next.add(uuid);
                            return next;
                          })
                        }
                      >
                        <span>
                          镜头 {row.shotNumber}
                          <ChevronDown
                            size={12}
                            style={{ transform: expanded.has(uuid) ? 'rotate(180deg)' : undefined }}
                            aria-hidden="true"
                          />
                        </span>
                        {!expanded.has(uuid) && (
                          <small title={prompt}>
                            {prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt}
                          </small>
                        )}
                      </button>
                      <div className="cv-v2-video-row-duration">
                        {constraint?.type === 'enum' ? (
                          <Selector
                            portal={portal}
                            label={`镜头 ${row.shotNumber} 时长`}
                            testId={`batch-video-row-${uuid}-duration-chip`}
                            value={value}
                            options={[
                              ...(!supported
                                ? [{ value, label: `${value}s`, disabled: true }]
                                : []),
                              ...constraint.values.map((duration) => ({
                                value: duration,
                                label: `${duration}s`,
                              })),
                            ]}
                            isCanvasLight={isCanvasLight}
                            disabled={rowLocked}
                            onChange={(duration) =>
                              onChange({
                                type: 'duration',
                                hiddenUuid: uuid,
                                value: Number(duration),
                              })
                            }
                          />
                        ) : constraint?.type === 'slider' ? (
                          <NumberInput
                            aria-label={`镜头 ${row.shotNumber} 时长`}
                            className="cv-v2-video-duration-number"
                            classNames={{
                              input: 'cv-v2-video-number-input',
                              controls: 'cv-v2-video-number-controls',
                              control: 'cv-v2-video-number-control',
                            }}
                            value={value}
                            min={constraint.min}
                            max={constraint.max}
                            step={constraint.step}
                            size="xs"
                            allowDecimal={false}
                            suffix="s"
                            disabled={rowLocked}
                            onChange={(duration) => {
                              if (
                                duration !== '' &&
                                duration != null &&
                                Number.isFinite(Number(duration))
                              )
                                onChange({
                                  type: 'duration',
                                  hiddenUuid: uuid,
                                  value: Number(duration),
                                });
                            }}
                          />
                        ) : (
                          <span>{value}s</span>
                        )}
                        {!supported && validation?.message && (
                          <Tooltip
                            label={validation.message}
                            withinPortal
                            zIndex={2000}
                            multiline
                            w={240}
                          >
                            <span
                              className="cv-v2-video-invalid-duration"
                              aria-label={validation.message}
                              tabIndex={0}
                            >
                              !
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {expanded.has(uuid) && (
                      <textarea
                        aria-label={`镜头 ${row.shotNumber} 视频提示词`}
                        rows={4}
                        readOnly
                        value={getPrompt?.(row) ?? prompt}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <footer className="cv-v2-video-footer">
              <div className="cv-v2-video-footer-left" data-testid="batch-video-footer-controls">
                <div className="cv-v2-video-selection" data-testid="batch-video-footer-left">
                  <label>
                    <input
                      ref={all}
                      type="checkbox"
                      checked={projection.allSelected}
                      disabled={locked || !availableRows.length}
                      onChange={() => onChange({ type: 'toggleAll' })}
                      aria-label="全选镜头"
                    />
                    <span>
                      已选 {projection.selectedCount}/{projection.totalCount}
                    </span>
                  </label>
                  {!projection.selectedCount && <span>请先选择镜头</span>}
                </div>
                <div className="cv-v2-video-config" data-testid="batch-video-generator-config">
                  <Selector
                    portal={portal}
                    label="选择视频模型"
                    value={state.config.model}
                    options={sourceOptions}
                    onChange={(model) => onChange({ type: 'model', value: model })}
                    disabled={locked || catalogStatus !== 'ready' || !hasAvailableModels}
                    isCanvasLight={isCanvasLight}
                    icon={modelIcon(modelOption)}
                    renderIcon={modelIcon}
                    testId="batch-video-config-chip-model"
                    title={!hasAvailableModels ? '未发现支持多图参考的视频模型' : undefined}
                  />
                  {(projection.fields || []).map((field) => (
                    <ConfigField
                      key={field.key}
                      portal={portal}
                      field={field}
                      onChange={onChange}
                      disabled={locked || catalogStatus !== 'ready'}
                      ratioHint={projection.ratioHint}
                      isCanvasLight={isCanvasLight}
                    />
                  ))}
                </div>
              </div>
              <Tooltip
                label={pendingSave ? '重试保存已创建的视频组，不重复创建节点' : sourceTitle}
                position="top-end"
                withArrow
                openDelay={0}
                closeDelay={0}
                withinPortal
                portalProps={{ target: portal }}
                zIndex={2000}
                multiline
                w={280}
              >
                <span className="cv-v2-video-submit-anchor">
                  <button
                    type="button"
                    className="cv-v2-video-submit"
                    disabled={submitDisabled}
                    title={
                      pendingSave
                        ? '重试保存已创建的视频组'
                        : '创建空视频生成器节点，生成服务未连接'
                    }
                    onClick={() => {
                      if (!submitDisabled) onConfirm();
                    }}
                  >
                    {busy ? (
                      <>
                        <span className="cv-v2-video-spinner" aria-hidden="true" />
                        {pendingSave
                          ? '保存中'
                          : requiresPortraitAudit
                            ? '真人校验并创建中'
                            : '创建中'}
                      </>
                    ) : pendingSave ? (
                      '重试保存视频组'
                    ) : (
                      `确认并创建视频生成器组 (${projection.selectedCount})`
                    )}
                  </button>
                </span>
              </Tooltip>
            </footer>
            <div className="cv-v2-video-boundary">创建空视频生成器节点，生成服务未连接</div>
            {error && (
              <div className="cv-v2-video-error" role="alert">
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

export default function ScriptV2VideoConfiguration({ opened, ...props }) {
  return opened ? (
    <OpenConfiguration
      {...props}
      state={props.state || emptyState}
      projection={{ ...emptyProjection, ...props.projection }}
    />
  ) : null;
}
