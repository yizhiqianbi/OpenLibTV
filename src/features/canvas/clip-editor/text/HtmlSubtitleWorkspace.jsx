import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ClipEditorSideRail from '../ClipEditorSideRail.jsx';
import ClipSubtitleTimelineRow from '../ClipSubtitleTimelineRow.jsx';
import ClipTextWorkspace from './ClipTextWorkspace.jsx';
import { readSubtitleHtml } from './html-document.js';
import { effectiveHtmlSubtitleLayers, projectHtmlSubtitleDraft } from './html-subtitle-tools.js';
import { subtitleCueInstances } from '../domain/html-subtitle-model.js';

const time = (value) => `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, '0')}`;
export function useHtmlSubtitleView(state) {
  const cache = useRef(new Map());
  const session = state?.draftSession,
    clips = state?.timeline.clips,
    subtitlesHtml = state?.timeline.subtitlesHtml,
    loaded = state?.htmlSubtitleLayers,
    draft = state?.htmlSubtitleDraft,
    nodeUrl = state?.nodeSubtitleHtmlUrl;
  const data = useMemo(() => {
    if (!session) return { layers: [], rows: [], blocks: [], subtitlesHtml };
    const input = {
      timeline: { clips, subtitlesHtml },
      nodeSubtitleHtmlUrl: nodeUrl,
      htmlSubtitleLayers: loaded,
      htmlSubtitleDraft: draft,
    };
    let timeline = input.timeline,
      error = '';
    try {
      timeline = projectHtmlSubtitleDraft(input);
    } catch (caught) {
      error = caught.message;
    }
    try {
      const layers = effectiveHtmlSubtitleLayers({ ...input, timeline }).map((layer) => {
        if (!cache.current.has(layer.html)) {
          if (cache.current.size > 32) cache.current.clear();
          cache.current.set(layer.html, readSubtitleHtml(layer.html));
        }
        return { ...layer, model: cache.current.get(layer.html) };
      });
      const blocks = layers.flatMap((layer) =>
        !layer.model.ok
          ? []
          : layer.model.cues.flatMap((cue) => {
              const instances =
                layer.model.timeBase === 'source'
                  ? subtitleCueInstances(cue, clips, layer.nodeId)
                  : [
                      {
                        clipId: cue.clipId,
                        startTime: cue.start,
                        endTime: cue.start + cue.duration,
                      },
                    ];
              return instances.map((instance) => ({
                ...cue,
                ...instance,
                id: JSON.stringify([layer.key, cue.cueId, instance.clipId]),
                identity: { key: layer.key, cueId: cue.cueId, clipId: instance.clipId },
              }));
            }),
      );
      const indexes = [
        ...new Set(layers.flatMap((layer) => (layer.model.ok ? layer.model.trackIndexes : []))),
      ].sort((a, b) => a - b);
      return {
        subtitlesHtml: timeline.subtitlesHtml,
        layers,
        blocks,
        rows: indexes.map((index) => ({
          index,
          blocks: blocks.filter((block) => block.trackIndex === index),
        })),
        error,
      };
    } catch (caught) {
      return { subtitlesHtml, layers: [], rows: [], blocks: [], error: caught.message };
    }
  }, [session, clips, subtitlesHtml, loaded, draft, nodeUrl]);
  return {
    ...data,
    timeline: state ? { ...state.timeline, subtitlesHtml: data.subtitlesHtml } : null,
  };
}

export function HtmlSubtitleTimelineRows({ state, controller, view }) {
  return view.rows.map((row) => {
    const hidden = row.blocks.length > 0 && row.blocks.every((block) => block.trackHidden);
    const selected = row.blocks.find(
      (block) =>
        block.identity.key === state.selectedHtmlSubtitle?.key &&
        block.cueId === state.selectedHtmlSubtitle?.cueId &&
        (!state.selectedHtmlSubtitle.clipId || block.clipId === state.selectedHtmlSubtitle.clipId),
    );
    const blockFor = (id) => row.blocks.find((block) => block.id === id);
    return (
      <ClipSubtitleTimelineRow
        key={row.index}
        label={`字幕轨 ${row.index + 1}`}
        kind="html-subtitle"
        timeline={{
          ...state.timeline,
          subtitles: {
            visible: !hidden,
            cues: row.blocks.map((block) => ({
              ...block,
              hidden: block.hidden || block.trackHidden,
            })),
          },
        }}
        selectedSubtitleId={selected?.id}
        blocked={!state.ready || state.conflicted || state.htmlSubtitleStatus !== 'ready'}
        draftSession={state.draftSession}
        onSelectSubtitle={(id) => controller.onSelectHtmlSubtitle(blockFor(id).identity)}
        onEditSubtitle={() => {
          controller.onEditHtmlSubtitle({
            edits: view.layers
              .filter((layer) => layer.model.ok && layer.model.trackIndexes.includes(row.index))
              .map((layer) => ({
                key: layer.key,
                patches: [{ kind: 'trackVisible', trackIndex: row.index, visible: hidden }],
              })),
          });
        }}
        onBeginEdit={controller.onBeginEdit}
        onEditPreview={(_operation, options) =>
          controller.onEditPreview('html-subtitle', {
            ...options,
            clipId: blockFor(options.cueId)?.clipId,
          })
        }
        onEndEdit={controller.onEndEdit}
        onCancelEdit={controller.onCancelEdit}
      />
    );
  });
}

export default function HtmlSubtitleWorkspace({ state, controller, children, view }) {
  const root = useRef(null);
  const [width, setWidth] = useState(372),
    [query, setQuery] = useState(''),
    [presetsOpen, setPresetsOpen] = useState(false),
    [panel, setPanel] = useState('list');
  const open = Boolean(state.htmlSubtitlePanelOpen && state.previewExpanded);
  useEffect(() => {
    if (!open) setPanel('list');
  }, [open]);
  const layer = view.layers.find((layer) => layer.key === state.selectedHtmlSubtitle?.key);
  const model = layer?.model.ok ? layer.model : null;
  const aliasState = {
    ...state,
    textPanelOpen: open,
    selectedTextCueId: state.selectedHtmlSubtitle?.cueId,
    textStatus: state.htmlSubtitleStatus || 'idle',
    textError: state.htmlSubtitleError || view.error,
    textPreviewError: state.htmlSubtitlePreviewError,
    textDraft: state.htmlSubtitleDraft
      ? { ...state.htmlSubtitleDraft, cueId: state.htmlSubtitleDraft.cueId }
      : null,
    textTrackChoice: null,
    textScriptUnsupported: view.layers.some((layer) => layer.model.ok && layer.model.hasScript),
  };
  const aliasController = {
    ...controller,
    onTextChange: (_cueId, text) => controller.onHtmlSubtitleTextChange(text),
    onCommitText: controller.onCommitHtmlSubtitle,
    onEditText: (options) => controller.onEditHtmlSubtitle(options),
    onDeleteText: controller.onDeleteHtmlSubtitle,
    onCloseTextPanel: controller.onCloseHtmlSubtitles,
    onRetryText: controller.onRetryHtmlSubtitles,
    onBeginTextStyle: controller.onBeginHtmlSubtitleStyle,
    onPreviewTextStyle: controller.onPreviewHtmlSubtitleStyle,
    onEndTextStyle: controller.onEndHtmlSubtitleStyle,
    onCancelTextStyle: controller.onCancelHtmlSubtitleStyle,
    onApplyTextToAll: controller.onApplyHtmlSubtitleToAll,
  };
  const blocked = !state.ready || state.conflicted || state.htmlSubtitleStatus !== 'ready';
  const close = () => {
    if (controller.onCloseHtmlSubtitles() !== false)
      root.current
        ?.closest('.cv-clip-editor')
        ?.querySelector('[data-testid="clip-toolbar-subtitle"]')
        ?.focus();
  };
  const listPanel = (
    <ClipEditorSideRail
      side="right"
      title="字幕"
      width={width}
      maximum={300}
      setWidth={setWidth}
      leading={
        <button type="button" className="cv-clip-rail-tab" onClick={() => setPanel('style')}>
          样式
        </button>
      }
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
          onClick={() => controller.onAddHtmlSubtitle({ force: true })}
        >
          <Plus size={14} />
          添加字幕
        </button>
      </div>
      {state.htmlSubtitleStatus === 'loading' && <p role="status">正在加载字幕…</p>}
      {state.htmlSubtitleError && (
        <div role="alert">
          {state.htmlSubtitleError}
          <button type="button" onClick={controller.onRetryHtmlSubtitles}>
            重试读取字幕
          </button>
        </div>
      )}
      {state.htmlSubtitleTrackChoice && (
        <div role="group" aria-label="选择字幕轨道">
          {state.htmlSubtitleTrackChoice.tracks.map((index) => (
            <button
              type="button"
              key={index}
              onClick={() =>
                controller.onAddHtmlSubtitle({
                  ...state.htmlSubtitleTrackChoice,
                  trackIndex: index,
                  force: true,
                })
              }
            >
              字幕轨 {index + 1}
            </button>
          ))}
        </div>
      )}
      {view.blocks
        ?.filter((block) => block.text.toLowerCase().includes(query.toLowerCase()))
        .map((block) => (
          <div
            key={block.id}
            className={`cv-clip-subtitle-list-row${block.identity.key === state.selectedHtmlSubtitle?.key && block.cueId === state.selectedHtmlSubtitle?.cueId ? ' is-selected' : ''}`}
          >
            <button
              type="button"
              className="cv-clip-subtitle-select"
              aria-label={`选择字幕 ${block.cueId}`}
              onClick={() => controller.onSelectHtmlSubtitle(block.identity)}
              onDoubleClick={() => {
                controller.onSeekHtmlSubtitle(block.identity);
                setPanel('style');
              }}
            >
              <span>
                {time(block.startTime)} - {time(block.endTime)}
              </span>
              <p>{block.text || '默认文本'}</p>
            </button>
            <div className="cv-clip-subtitle-row-actions">
              <button
                type="button"
                disabled={blocked}
                aria-label={`在字幕 ${block.cueId} 后插入`}
                onClick={() => controller.onAddHtmlSubtitle({ ...block.identity, force: true })}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                disabled={blocked}
                aria-label={`删除字幕 ${block.cueId}`}
                onClick={() => controller.onDeleteHtmlSubtitle(block.identity)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      {state.htmlSubtitleStatus === 'ready' && !view.blocks?.length && (
        <p className="cv-clip-subtitle-note">暂无字幕</p>
      )}
    </ClipEditorSideRail>
  );
  return (
    <div
      ref={root}
      className={`cv-clip-transition-workspace cv-clip-html-subtitle-workspace${open ? ' is-open' : ''}`}
    >
      <div className="cv-clip-transition-main">
        {panel === 'style' ? (
          <ClipTextWorkspace
            state={aliasState}
            controller={aliasController}
            modelOverride={model}
            label="字幕"
            variant="subtitle"
            toolbarTestId="clip-toolbar-subtitle"
            fieldOwnerKey={JSON.stringify(state.selectedHtmlSubtitle)}
            onPresetsOpenChange={setPresetsOpen}
            styleHeaderAction={
              <button type="button" className="cv-clip-rail-tab" onClick={() => setPanel('list')}>
                字幕
              </button>
            }
          >
            {children}
          </ClipTextWorkspace>
        ) : (
          children
        )}
      </div>
      {open && !presetsOpen && panel === 'list' && listPanel}
    </div>
  );
}
