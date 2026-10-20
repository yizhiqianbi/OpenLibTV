import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, SlidersHorizontal } from 'lucide-react';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';
import Modal from '../../../../components/Modal.jsx';
import {
  EMPTY_TEXT_PRESET_SOURCE,
  readTextPresetCatalogue,
} from '../../../../services/clip-text-presets.js';
import ClipEditorSideRail from '../ClipEditorSideRail.jsx';
import ClipSubtitleTimelineRow from '../ClipSubtitleTimelineRow.jsx';
import { SUBTITLE_FONTS } from '../domain/subtitle-model.js';
import { TEXT_NUMERIC_RULES } from '../domain/text-timing-model.js';
import { TEXT_MOTION_OPTIONS } from '../domain/text-motion-model.js';
import { effectiveTextHtml, readTextStyle, textOutputSize } from './document-model.js';
import { readTextOverlayHtml } from './html-document.js';
import TextPropertySections from './TextPropertySections.jsx';
import TextNumericSetting from './TextNumericSetting.jsx';
import TextColorSetting from './TextColorSetting.jsx';
import SubtitleHighlightSettings from './SubtitleHighlightSettings.jsx';
import { readHtmlSubtitleStyle } from './subtitle-style-document.js';
import { subtitleFieldAllowed } from './subtitle-style-compatibility.js';
import { moveTrackOrder } from '../domain/track-order-model.js';
import {
  EMPTY_TEXT_FONT_SOURCE,
  loadTextFontResources,
  readTextFontCatalogue,
} from '../../../../services/clip-text-fonts.js';
const subtitleSections = ['布局', '文字', '背景', '高亮'];

export function useTextModel(state, override) {
  const html = effectiveTextHtml(state);
  return useMemo(
    () => (override !== undefined ? override : html ? readTextOverlayHtml(html) : null),
    [html, override],
  );
}
function Presets({ source, controller, cueId, selectedPreset, blocked }) {
  const [data, setData] = useState({ categories: [], presets: [] }),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    let live = true;
    setLoading(true);
    setError('');
    setData({ categories: [], presets: [] });
    Promise.resolve()
      .then(() => source.load({ signal: abort.signal }))
      .then((result) => {
        if (!live) return;
        setData(readTextPresetCatalogue(result));
      })
      .catch((caught) => {
        if (live && caught.name !== 'AbortError') setError(caught.message || '预设样式加载失败');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [source, retry]);
  return (
    <div className="cv-clip-text-presets">
      <input
        type="search"
        aria-label="搜索预设样式"
        placeholder="搜索预设样式"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="tablist" aria-label="预设分类">
        <button type="button" role="tab" aria-selected={!category} onClick={() => setCategory('')}>
          全部
        </button>
        {data.categories.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={category === item.id}
            key={item.id}
            onClick={() => setCategory(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {error ? (
        <div role="alert">
          {error}
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : loading ? (
        <p role="status">加载中…</p>
      ) : (
        <div className="cv-clip-text-preset-grid">
          {data.presets
            .filter(
              (item) =>
                (!category || item.categoryId === category) &&
                item.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((item) => (
              <button
                type="button"
                aria-label={item.name}
                aria-pressed={selectedPreset === item.id}
                key={item.id}
                disabled={blocked || !cueId}
                onClick={() => controller.onEditText({ preset: item })}
              >
                <span
                  style={{
                    color: item.fields.color || '#FFFFFF',
                    fontFamily: item.fields.fontFamily,
                  }}
                >
                  字
                </span>
                {item.name}
              </button>
            ))}
        </div>
      )}
      {!loading &&
        !error &&
        !data.presets.filter(
          (item) =>
            (!category || item.categoryId === category) &&
            item.name.toLowerCase().includes(query.toLowerCase()),
        ).length && <p>未找到预设样式</p>}
    </div>
  );
}
export default function ClipTextWorkspace({
  state,
  controller,
  children,
  presetSource = EMPTY_TEXT_PRESET_SOURCE,
  modelOverride,
  label = '文本',
  toolbarTestId = 'clip-toolbar-text',
  motionOptions = TEXT_MOTION_OPTIONS,
  fieldOwnerKey,
  onPresetsOpenChange,
  variant = 'text',
  styleHeaderAction,
  fontSource = EMPTY_TEXT_FONT_SOURCE,
}) {
  const root = useRef(null),
    closeRef = useRef(null),
    styleTrigger = useRef(null),
    deleteTrigger = useRef(null);
  const [width, setWidth] = useState(300),
    [libraryWidth, setLibraryWidth] = useState(372),
    [presetsOpen, setPresetsOpenState] = useState(false),
    [fontCatalogue, setFontCatalogue] = useState({ fonts: [] }),
    [fontDirectoryState, setFontDirectoryState] = useState('idle'),
    [fontDirectoryError, setFontDirectoryError] = useState(''),
    [fontDirectoryRetry, setFontDirectoryRetry] = useState(0),
    [fontResourceState, setFontResourceState] = useState('idle'),
    [fontResourceError, setFontResourceError] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const setPresetsOpen = (value) => {
    setPresetsOpenState(value);
    onPresetsOpenChange?.(value);
  };
  const model = useTextModel(state, modelOverride),
    selected = model?.ok && model.cues.find((cue) => cue.cueId === state.selectedTextCueId);
  const open = state.textPanelOpen && state.previewExpanded;
  useEffect(() => {
    if (!open && presetsOpen) {
      setPresetsOpenState(false);
      onPresetsOpenChange?.(false);
    }
  }, [open, presetsOpen, onPresetsOpenChange]);
  useEffect(() => {
    if (!open) return undefined;
    const abort = new AbortController();
    let live = true;
    setFontDirectoryState('loading');
    setFontDirectoryError('');
    Promise.resolve()
      .then(() => fontSource.load({ signal: abort.signal }))
      .then((result) => {
        if (!live) return;
        setFontCatalogue(readTextFontCatalogue(result));
        setFontDirectoryState('ready');
      })
      .catch((caught) => {
        if (!live || caught.name === 'AbortError') return;
        setFontDirectoryState('error');
        setFontDirectoryError(caught.message || '字体目录加载失败');
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [open, fontSource, fontDirectoryRetry]);
  useEffect(() => {
    const remote = fontCatalogue.fonts.filter((font) => font.src);
    if (!remote.length) {
      setFontResourceState('ready');
      setFontResourceError('');
      return undefined;
    }
    const abort = new AbortController();
    let live = true;
    setFontResourceState('loading');
    setFontResourceError('');
    let faces = [];
    loadTextFontResources(remote, { signal: abort.signal })
      .then((result) => {
        if (!live) return;
        faces = result.faces;
        setFontResourceState(result.status);
        setFontResourceError(
          result.failed?.length
            ? `部分字体资源加载失败：${result.failed.map((item) => item.id).join('、')}`
            : result.status === 'unsupported'
              ? '当前浏览器不支持字体资源加载，已保留 fallback 字体'
              : '',
        );
      })
      .catch((caught) => {
        if (live && caught.name !== 'AbortError') {
          setFontResourceState('error');
          setFontResourceError(caught.message || '字体资源加载失败');
        }
      });
    return () => {
      live = false;
      abort.abort();
      for (const face of faces) globalThis.document?.fonts?.delete?.(face);
    };
  }, [fontCatalogue.fonts]);
  const fontOptions = [
    ...SUBTITLE_FONTS.map((family) => ({ id: `fallback:${family}`, name: family, family })),
    ...fontCatalogue.fonts,
  ].filter((font, index, all) => all.findIndex((item) => item.family === font.family) === index);
  const blocked =
    !state.ready ||
    state.conflicted ||
    state.textStatus !== 'ready' ||
    state.textPending ||
    state.textReadOnly ||
    Boolean(state.error || state.mediaError);
  const fieldBlocked = (field) =>
    blocked ||
    !selected ||
    (variant === 'subtitle' && !subtitleFieldAllowed(state.textStyleCompatibility, field));
  const style = selected
    ? (variant === 'subtitle' ? readHtmlSubtitleStyle : readTextStyle)(
        model,
        selected.cueId,
        textOutputSize(state),
      )
    : {};
  const fieldOwner = useMemo(
    () => ({ session: state.draftSession, cueId: selected?.cueId, key: fieldOwnerKey }),
    [state.draftSession, selected?.cueId, fieldOwnerKey],
  );
  const draft =
    state.textDraft?.cueId === selected?.cueId && state.textDraft ? state.textDraft : null;
  const close = () => {
    if (presetsOpen) {
      setPresetsOpen(false);
      styleTrigger.current?.focus();
      return;
    }
    if (controller.onCloseTextPanel() !== false)
      root.current
        ?.closest('.cv-clip-editor')
        ?.querySelector(`[data-testid="${toolbarTestId}"]`)
        ?.focus({ preventScroll: true });
  };
  closeRef.current = close;
  useEffect(
    () => (open ? registerDialogChildDismissal(root.current, () => closeRef.current()) : undefined),
    [open],
  );
  const numeric = (fieldLabel, key, step = 1) => {
    const [min, max] = TEXT_NUMERIC_RULES[key];
    return (
      <TextNumericSetting
        key={key}
        label={fieldLabel.replace('（%）', '')}
        ariaLabel={`${label}${fieldLabel}`}
        min={min}
        max={max}
        step={step}
        disabled={fieldBlocked(key)}
        value={draft?.fields?.[key] ?? style[key]}
        owner={fieldOwner}
        suffix={key.endsWith('Pct') ? '%' : key.endsWith('Px') ? 'px' : undefined}
        onInteractionStart={(options) => controller.onBeginTextStyle?.({ ...options, field: key })}
        onValueChange={controller.onPreviewTextStyle}
        onInteractionEnd={controller.onEndTextStyle}
        onInteractionCancel={controller.onCancelTextStyle}
      />
    );
  };
  const color = (fieldLabel, key) => (
    <TextColorSetting
      label={fieldLabel}
      ariaLabel={`${label}${fieldLabel}`}
      value={style[key]}
      showOpacity={key !== 'backgroundColor'}
      disabled={fieldBlocked(key)}
      owner={fieldOwner}
      onInteractionStart={(options) => controller.onBeginTextStyle?.({ ...options, field: key })}
      onValueChange={controller.onPreviewTextStyle}
      onInteractionEnd={controller.onEndTextStyle}
      onInteractionCancel={controller.onCancelTextStyle}
    />
  );
  return (
    <div
      ref={root}
      className={`cv-clip-transition-workspace cv-clip-text-workspace${open ? ' is-open' : ''}${presetsOpen ? ' has-presets' : ''}`}
    >
      <div className="cv-clip-transition-main">{children}</div>
      {open && (
        <>
          {presetsOpen && (
            <ClipEditorSideRail
              side="left"
              title="预设样式"
              width={libraryWidth}
              maximum={372}
              setWidth={setLibraryWidth}
              onClose={() => {
                setPresetsOpen(false);
                styleTrigger.current?.focus();
              }}
            >
              <Presets
                source={presetSource}
                controller={controller}
                cueId={selected?.cueId}
                selectedPreset={selected?.element.getAttribute('data-libtv-text-preset-id')}
                blocked={blocked}
              />
            </ClipEditorSideRail>
          )}
          <ClipEditorSideRail
            side="right"
            title={`${label}样式`}
            width={width}
            maximum={300}
            setWidth={setWidth}
            onClose={close}
            leading={styleHeaderAction}
            actions={
              <button
                type="button"
                aria-label={`删除${label}`}
                ref={deleteTrigger}
                disabled={blocked || !selected}
                onClick={() => controller.onDeleteText()}
              >
                <Trash2 size={14} />
              </button>
            }
            footer={
              <div className="cv-clip-text-apply">
                <button
                  type="button"
                  disabled={blocked || !selected}
                  onClick={controller.onApplyTextToAll}
                >
                  应用到所有
                </button>
              </div>
            }
          >
            <div className="cv-clip-subtitle-inspector cv-clip-text-inspector">
              {state.textStatus === 'loading' && <p role="status">正在加载{label}…</p>}
              {(state.textError || state.textPreviewError) && (
                <div role="alert">
                  {state.textError || state.textPreviewError}
                  <button type="button" onClick={controller.onRetryText}>
                    重试读取{label}
                  </button>
                </div>
              )}
              {fontDirectoryError && (
                <div role="alert">
                  {fontDirectoryError}
                  <button type="button" onClick={() => setFontDirectoryRetry((value) => value + 1)}>
                    重试字体目录
                  </button>
                </div>
              )}
              {fontDirectoryState === 'loading' && <p role="status">字体目录加载中…</p>}
              {fontResourceState === 'loading' && <p role="status">字体资源加载中…</p>}
              {fontResourceError && (
                <p
                  role={
                    fontResourceState === 'partial' || fontResourceState === 'error'
                      ? 'alert'
                      : 'status'
                  }
                >
                  {fontResourceError}
                </p>
              )}
              {state.textScriptUnsupported && (
                <p role="status">自定义脚本动画尚未支持，原HTML已保留。</p>
              )}
              {state.textSourceIssues?.map((issue, index) => (
                <p role="status" key={`${issue.code}:${index}`}>
                  {issue.detail}
                </p>
              ))}
              {state.textReadOnly ? (
                <>
                  <p role="status">当前字幕样式无法注入，已保留原内容并以只读方式预览。</p>
                  {variant === 'subtitle' && state.textCanConvert && (
                    <button type="button" onClick={() => setConvertOpen(true)}>
                      转为可编辑字幕
                    </button>
                  )}
                </>
              ) : state.textStyleCompatibility?.level === 'L1' ? (
                <p role="status">部分字幕样式无法注入，对应属性暂不可编辑。</p>
              ) : null}
              {!!state.textTrackChoice?.length && (
                <div role="group" aria-label="选择文本轨道">
                  {state.textTrackChoice.map((index) => (
                    <button
                      type="button"
                      key={index}
                      onClick={() => controller.onAddText({ trackIndex: index, force: true })}
                    >
                      文本轨 {index + 1}
                    </button>
                  ))}
                  {state.textTrackChoice.length < 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        controller.onAddText({
                          trackIndex: Math.max(...state.textTrackChoice) + 1,
                          createTrack: true,
                          force: true,
                        })
                      }
                    >
                      新建文本轨道
                    </button>
                  )}
                </div>
              )}
              <textarea
                aria-label={`${label}内容`}
                rows={2}
                placeholder={label === '字幕' ? '默认文本' : '输入文本'}
                disabled={blocked || !selected}
                value={draft?.text ?? selected?.text ?? ''}
                onChange={(event) => controller.onTextChange(selected.cueId, event.target.value)}
                onBlur={(event) => {
                  if (event.relatedTarget !== deleteTrigger.current) controller.onCommitText();
                }}
              />
              <div className="cv-clip-text-style-actions">
                <button type="button" ref={styleTrigger} onClick={() => setPresetsOpen(true)}>
                  <span aria-hidden="true">T</span>
                  <span>默认样式</span>
                  <SlidersHorizontal size={18} aria-hidden="true" />
                </button>
              </div>
              <TextPropertySections
                sections={variant === 'subtitle' ? subtitleSections : undefined}
                label={variant === 'subtitle' ? '字幕属性' : '文本属性'}
              >
                <div>
                  {numeric('X', 'xPct', 0.1)}
                  {numeric('Y', 'yPct', 0.1)}
                  {numeric('最大宽度', 'widthPct')}
                  {numeric('缩放', 'scalePct')}
                </div>
                <div>
                  <label className="cv-clip-subtitle-setting">
                    <span>字体</span>
                    <select
                      aria-label={`${label}字体`}
                      disabled={fieldBlocked('fontFamily')}
                      value={style.fontFamily || ''}
                      onChange={(event) =>
                        controller.onEditText({ fields: { fontFamily: event.target.value } })
                      }
                    >
                      {[
                        ...fontOptions,
                        ...(style.fontFamily &&
                        !fontOptions.some((font) => font.family === style.fontFamily)
                          ? [
                              {
                                id: `current:${style.fontFamily}`,
                                name: style.fontFamily,
                                family: style.fontFamily,
                              },
                            ]
                          : []),
                      ].map((font) => (
                        <option key={font.id} value={font.family}>
                          {font.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cv-clip-subtitle-setting">
                    <span>字重</span>
                    <select
                      aria-label={`${label}字重`}
                      disabled={fieldBlocked('fontWeight')}
                      value={style.fontWeight ?? 600}
                      onChange={(event) =>
                        controller.onEditText({
                          fields: { fontWeight: Number(event.target.value) },
                        })
                      }
                    >
                      {[
                        ...new Set(
                          [100, 200, 300, 400, 500, 600, 700, 800, 900, style.fontWeight].filter(
                            Number.isFinite,
                          ),
                        ),
                      ]
                        .sort((a, b) => a - b)
                        .map((weight) => (
                          <option key={weight} value={weight}>
                            {[
                              'Thin',
                              'ExtraLight',
                              'Light',
                              'Regular',
                              'Medium',
                              'SemiBold',
                              'Bold',
                              'ExtraBold',
                              'Black',
                            ][weight / 100 - 1] || weight}
                          </option>
                        ))}
                    </select>
                  </label>
                  {numeric('字号', 'fontSizePx')}
                  {numeric('字间距', 'letterSpacingPx')}
                  {numeric('行高（%）', 'lineHeightPct', 10)}
                  {color('文字颜色', 'color')}
                  {color('描边颜色', 'strokeColor')}
                  {numeric('描边大小', 'strokeWidthPx')}
                </div>
                <div>
                  {color('背景颜色', 'backgroundColor')}
                  {numeric('背景不透明度', 'backgroundOpacityPct')}
                  {numeric('圆角', 'cornerRadiusPx')}
                  {numeric('背景模糊', 'backgroundBlurPx')}
                </div>
                {variant === 'subtitle' ? (
                  <SubtitleHighlightSettings
                    style={style}
                    disabled={blocked || !selected}
                    owner={fieldOwner}
                    controller={controller}
                    label={label}
                  />
                ) : (
                  <label className="cv-clip-subtitle-setting">
                    <span>动画类型</span>
                    <select
                      aria-label={`${label}动画类型`}
                      disabled={blocked || !selected}
                      value={style.animationType || 'none'}
                      onChange={(event) =>
                        controller.onEditText({ fields: { animationType: event.target.value } })
                      }
                    >
                      {motionOptions.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </TextPropertySections>
              {!selected && <p>请先选择{label}</p>}
            </div>
          </ClipEditorSideRail>
        </>
      )}
      {convertOpen && (
        <Modal title="转为可编辑字幕" onClose={() => setConvertOpen(false)}>
          <div className="cv-clip-text-convert-confirm">
            <h2>转为可编辑字幕</h2>
            <p>
              当前字幕包含无法直接改写的样式{state.textConvertLosesAnimation ? '或脚本动画' : ''}。
              转换会保留正文、时间和布局，可能移除动画效果，并写入一次本地撤销历史。
            </p>
            <div className="cv-clip-text-convert-actions">
              <button type="button" onClick={() => setConvertOpen(false)}>
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (controller.onConvertText?.()) setConvertOpen(false);
                }}
              >
                确认转为可编辑
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function ClipTextTimelineRows({ state, controller }) {
  const model = useTextModel(state);
  if (!model?.ok) return null;
  const trackOrder = model.trackIndexes;
  const moveTrack = (trackIndex, direction) => {
    const position = trackOrder.indexOf(trackIndex);
    const target = direction === 'up' ? position - 1 : position + 1;
    if (position < 0 || target < 0 || target >= trackOrder.length) return;
    const order = [...trackOrder];
    [order[position], order[target]] = [order[target], order[position]];
    controller.onEditText({ patches: [{ kind: 'reorderTracks', order }] });
  };
  const dropTrack = (source, target) => {
    const order = moveTrackOrder(trackOrder, source, target);
    if (!order || order.every((value, index) => value === trackOrder[index])) return;
    controller.onEditText({ patches: [{ kind: 'reorderTracks', order }] });
  };
  return model.trackIndexes.map((trackIndex) => {
    const cues = model.cues.filter((cue) => cue.trackIndex === trackIndex),
      hidden = cues.every((cue) => cue.trackHidden);
    return (
      <ClipSubtitleTimelineRow
        key={trackIndex}
        label={`文本轨 ${trackIndex + 1}`}
        kind="text"
        emptyLabel="输入文本"
        timeline={{
          ...state.timeline,
          subtitles: {
            visible: !hidden,
            cues: cues.map((cue) => ({
              id: cue.cueId,
              startTime: cue.start,
              endTime: cue.start + cue.duration,
              text: cue.text,
              hidden: cue.hidden,
            })),
          },
        }}
        selectedSubtitleId={state.selectedTextCueId}
        blocked={
          !state.ready || state.conflicted || state.textStatus !== 'ready' || state.textPending
        }
        trackIndex={trackIndex}
        trackOrder={trackOrder}
        onMoveTrack={moveTrack}
        onTrackDrop={dropTrack}
        draftSession={state.draftSession}
        onSelectSubtitle={controller.onSelectText}
        onEditSubtitle={() =>
          controller.onEditText({
            patches: [{ kind: 'trackVisible', trackIndex, visible: hidden }],
          })
        }
        onBeginEdit={controller.onBeginEdit}
        onEditPreview={(_operation, options) => controller.onEditPreview('text-overlay', options)}
        onEndEdit={controller.onEndEdit}
        onCancelEdit={controller.onCancelEdit}
      />
    );
  });
}
