import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import ClipEditorSideRail from './ClipEditorSideRail.jsx';
import { subtitleStyle, SUBTITLE_FONTS, SUBTITLE_PRESETS } from './domain/subtitle-model.js';
import { effectiveSubtitleTimeline } from './domain/subtitle-document-model.js';
import {
  EMPTY_TEXT_FONT_SOURCE,
  loadTextFontResources,
  readTextFontCatalogue,
} from '../../../services/clip-text-fonts.js';

const time = (value) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`;

function SubtitleInspector({ state, controller, selected, blocked, fonts, fontResourceError }) {
  const style = subtitleStyle(state.timeline.subtitles);
  const sourceHeight =
    [...state.mediaBySourceId.values()].find((entry) => entry.metadata?.height > 0)?.metadata
      .height || 1080;
  const displayStyle = {
    ...style,
    fontSizePx:
      style.fontSizeVh != null
        ? Math.max(1, Math.round((style.fontSizeVh / 100) * sourceHeight))
        : style.fontSizePx,
  };
  const text =
    state.subtitleTextDraft && state.subtitleTextDraft.cueId === selected?.id
      ? state.subtitleTextDraft.text
      : selected?.text || '';
  const numeric = (label, key, min, max, step = 1) => (
    <label className="cv-clip-subtitle-setting">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={!selected || blocked}
        value={displayStyle[key] ?? (key === 'strokeOpacity' ? 100 : key === 'lineHeight' ? '' : 0)}
        onChange={(event) => {
          if (event.currentTarget.value !== '')
            controller.onEditSubtitle({
              kind: 'style',
              style: { [key]: Number(event.currentTarget.value) },
            });
        }}
      />
    </label>
  );
  return (
    <div className="cv-clip-subtitle-inspector">
      <textarea
        ref={controller.subtitleInputRef}
        aria-label="字幕文本"
        placeholder="输入字幕文本"
        disabled={!selected || blocked}
        value={text}
        rows={3}
        onChange={(event) => controller.onSubtitleTextChange(selected.id, event.target.value)}
        onBlur={() => controller.onCommitSubtitleText()}
      />
      <label className="cv-clip-subtitle-setting">
        <span>字体</span>
        <select
          aria-label="字幕字体"
          disabled={!selected || blocked}
          value={style.fontFamily}
          onChange={(event) =>
            controller.onEditSubtitle({ kind: 'style', style: { fontFamily: event.target.value } })
          }
        >
          {[
            ...SUBTITLE_FONTS.map((family) => ({ id: `fallback:${family}`, name: family, family })),
            ...fonts,
            ...(style.fontFamily && !fonts.some((font) => font.family === style.fontFamily)
              ? [
                  {
                    id: `current:${style.fontFamily}`,
                    name: style.fontFamily,
                    family: style.fontFamily,
                  },
                ]
              : []),
          ]
            .filter(
              (font, index, all) => all.findIndex((item) => item.family === font.family) === index,
            )
            .map((font) => (
              <option key={font.id} value={font.family}>
                {font.name}
              </option>
            ))}
        </select>
      </label>
      {fontResourceError && <p role="status">{fontResourceError}</p>}
      {numeric('字号', 'fontSizePx', 12, 72)}
      {numeric('字重', 'fontWeight', 100, 900, 100)}
      {numeric('行高', 'lineHeight', 0.5, 3, 0.1)}
      <label className="cv-clip-subtitle-setting">
        <span>字体颜色</span>
        <input
          type="color"
          aria-label="字体颜色"
          disabled={!selected || blocked}
          value={/^#[a-f0-9]{6}$/i.test(style.color) ? style.color : '#FFFFFF'}
          onChange={(event) =>
            controller.onEditSubtitle({ kind: 'style', style: { color: event.target.value } })
          }
        />
      </label>
      {numeric('字间距', 'letterSpacingPx', 0, 100)}
      <div className="cv-clip-subtitle-presets" role="group" aria-label="预设样式">
        {SUBTITLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.name}
            aria-label={preset.name}
            disabled={!selected || blocked}
            aria-pressed={
              style.color.toLowerCase() === preset.color.toLowerCase() &&
              (style.strokeWidthPx || 0) === (preset.strokeColor ? 2 : 0) &&
              (!preset.strokeColor ||
                style.strokeColor?.toLowerCase() === preset.strokeColor.toLowerCase())
            }
            style={{
              color: preset.color,
              textShadow: preset.strokeColor
                ? `1px 1px ${preset.strokeColor}, -1px -1px ${preset.strokeColor}`
                : undefined,
            }}
            onClick={() =>
              controller.onEditSubtitle({
                kind: 'style',
                style: {
                  ...preset,
                  presetId: preset.id,
                  strokeWidthPx: preset.strokeColor ? 2 : 0,
                  strokeOpacity: 100,
                },
              })
            }
          >
            字
          </button>
        ))}
      </div>
      {numeric('描边粗细', 'strokeWidthPx', 0, 20, 0.1)}
      <label className="cv-clip-subtitle-setting">
        <span>描边颜色</span>
        <input
          type="color"
          aria-label="描边颜色"
          disabled={!selected || blocked}
          value={/^#[a-f0-9]{6}$/i.test(style.strokeColor) ? style.strokeColor : '#FFFFFF'}
          onChange={(event) =>
            controller.onEditSubtitle({ kind: 'style', style: { strokeColor: event.target.value } })
          }
        />
      </label>
      {numeric('描边不透明度', 'strokeOpacity', 0, 100)}
      <button
        type="button"
        className="cv-clip-subtitle-apply"
        disabled={!selected || blocked}
        onClick={() => controller.onEditSubtitle({ kind: 'apply-all' })}
      >
        应用到全部字幕
      </button>
      {!selected && <p>请先选择一条字幕</p>}
    </div>
  );
}

export default function ClipSubtitleWorkspace({
  state,
  controller,
  children,
  fontSource = EMPTY_TEXT_FONT_SOURCE,
}) {
  const root = useRef(null),
    closeRef = useRef(null);
  const [width, setWidth] = useState(372),
    [inspectorWidth, setInspectorWidth] = useState(300);
  const [query, setQuery] = useState('');
  const [fontCatalogue, setFontCatalogue] = useState({ fonts: [] });
  const [fontState, setFontState] = useState('idle');
  const [fontError, setFontError] = useState('');
  const [fontRetry, setFontRetry] = useState(0);
  const open = state.subtitlePanelOpen && state.previewExpanded;
  useEffect(() => {
    if (!open) return undefined;
    const abort = new AbortController();
    let live = true;
    setFontState('loading');
    setFontError('');
    Promise.resolve()
      .then(() => fontSource.load({ signal: abort.signal }))
      .then((result) => {
        if (!live) return;
        setFontCatalogue(readTextFontCatalogue(result));
        setFontState('ready');
      })
      .catch((caught) => {
        if (!live || caught.name === 'AbortError') return;
        setFontState('error');
        setFontError(caught.message || '字体目录加载失败');
      });
    return () => {
      live = false;
      abort.abort();
    };
  }, [open, fontSource, fontRetry]);
  useEffect(() => {
    const remote = fontCatalogue.fonts.filter((font) => font.src);
    if (!remote.length) return undefined;
    const abort = new AbortController();
    let live = true;
    let faces = [];
    loadTextFontResources(remote, { signal: abort.signal })
      .then((result) => {
        if (!live) return;
        faces = result.faces;
        if (result.status === 'unsupported')
          setFontError('当前浏览器不支持字体资源加载，已保留 fallback 字体');
        else if (result.failed.length)
          setFontError(`部分字体资源加载失败：${result.failed.map((item) => item.id).join('、')}`);
      })
      .catch((caught) => {
        if (live && caught.name !== 'AbortError')
          setFontError(caught.message || '字体资源加载失败');
      });
    return () => {
      live = false;
      abort.abort();
      for (const face of faces) globalThis.document?.fonts?.delete?.(face);
    };
  }, [fontCatalogue.fonts]);
  const timeline = effectiveSubtitleTimeline(state);
  const track = timeline.subtitles;
  const selected = track?.cues?.find((cue) => cue.id === state.selectedSubtitleId);
  const blocked =
    !state.ready ||
    state.conflicted ||
    state.subtitleStatus !== 'ready' ||
    Boolean(state.error || state.mediaError);
  const close = () => {
    if (controller.onCloseSubtitlePanel() === false) return;
    root.current
      ?.closest('.cv-clip-editor')
      ?.querySelector('[data-testid="clip-toolbar-subtitle"]')
      ?.focus({ preventScroll: true });
  };
  closeRef.current = close;
  useEffect(
    () => (open ? registerDialogChildDismissal(root.current, () => closeRef.current()) : undefined),
    [open],
  );
  return (
    <div ref={root} className={`cv-clip-transition-workspace${open ? ' is-open' : ''}`}>
      <div className="cv-clip-transition-main">{children}</div>
      {open && (
        <>
          <ClipEditorSideRail
            side="left"
            title="字幕"
            maximum={372}
            width={width}
            setWidth={setWidth}
            onClose={close}
          >
            <div className="cv-clip-subtitle-search">
              <input
                aria-label="搜索字幕"
                placeholder="搜索字幕"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                disabled={blocked}
                onClick={() => controller.onAddSubtitle({ force: true })}
              >
                <Plus size={14} />
                添加字幕
              </button>
            </div>
            {state.subtitleStatus === 'loading' && (
              <p role="status" className="cv-clip-subtitle-note">
                正在加载字幕…
              </p>
            )}
            {state.subtitleError && (
              <div role="alert" className="cv-clip-subtitle-note">
                {state.subtitleError}
                <button type="button" onClick={controller.onRetrySubtitles}>
                  重试读取字幕
                </button>
              </div>
            )}
            {state.subtitleMigrationPhase === 'pending' && (
              <p role="status">字幕正在准备，当前编辑已保存。</p>
            )}
            {state.subtitleMigrationError && <p role="status">{state.subtitleMigrationError}</p>}
            {fontState === 'loading' && <p role="status">字体目录加载中…</p>}
            {fontError && (
              <div role="alert" className="cv-clip-subtitle-note">
                {fontError}
                <button type="button" onClick={() => setFontRetry((value) => value + 1)}>
                  重试字体目录
                </button>
              </div>
            )}
            {state.subtitleStatus === 'ready' && !track?.cues?.length && (
              <p className="cv-clip-subtitle-note">暂无字幕</p>
            )}
            {track?.cues
              ?.filter((cue) => cue.text.toLowerCase().includes(query.toLowerCase()))
              .map((cue, index) => (
                <div
                  key={cue.id}
                  className={`cv-clip-subtitle-list-row${selected?.id === cue.id ? ' is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="cv-clip-subtitle-select"
                    aria-label={`选择字幕 ${cue.id}`}
                    aria-pressed={selected?.id === cue.id}
                    onClick={() => controller.onSelectSubtitle(cue.id)}
                    onDoubleClick={() => controller.onSeekSubtitle(cue.id)}
                  >
                    <span>
                      {index + 1} {time(cue.startTime)} - {time(cue.endTime)}
                    </span>
                    <p>
                      {state.subtitleTextDraft?.cueId === cue.id
                        ? state.subtitleTextDraft.text
                        : cue.text || '默认文本'}
                    </p>
                  </button>
                  <div className="cv-clip-subtitle-row-actions">
                    <button
                      type="button"
                      aria-label={`在字幕 ${cue.id} 后插入`}
                      disabled={blocked}
                      onClick={() => controller.onAddSubtitle({ afterId: cue.id })}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除字幕 ${cue.id}`}
                      disabled={blocked}
                      onClick={() => controller.onEditSubtitle({ kind: 'delete', cueId: cue.id })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </ClipEditorSideRail>
          <ClipEditorSideRail
            side="right"
            title="字幕样式"
            maximum={300}
            width={inspectorWidth}
            setWidth={setInspectorWidth}
          >
            <SubtitleInspector
              state={{ ...state, timeline }}
              controller={controller}
              selected={selected}
              blocked={blocked}
              fonts={fontCatalogue.fonts}
              fontResourceError={fontError}
            />
          </ClipEditorSideRail>
        </>
      )}
    </div>
  );
}
