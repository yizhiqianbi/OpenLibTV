import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ClipEditorSideRail from '../ClipEditorSideRail.jsx';
import ClipSubtitleTimelineRow from '../ClipSubtitleTimelineRow.jsx';
import ClipTextWorkspace from './ClipTextWorkspace.jsx';
import { readSubtitleHtml } from './html-document.js';
import { effectiveHtmlSubtitleLayers, projectHtmlSubtitleDraft } from './html-subtitle-tools.js';
import { subtitleCueInstances } from '../domain/html-subtitle-model.js';
import { moveTrackOrder } from '../domain/track-order-model.js';
import { subtitleStyleCompatibility } from './subtitle-style-compatibility.js';
import { describeSubtitleEditing } from '../domain/subtitle-ownership-model.js';

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
          const model = readSubtitleHtml(layer.html);
          if (model.ok) model.styleCompatibility = subtitleStyleCompatibility(model.document);
          cache.current.set(layer.html, model);
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
                readOnly: layer.model.styleCompatibility.readOnly,
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
  const trackOrder = view.rows.map((row) => row.index);
  const moveTrack = (trackIndex, direction) => {
    const position = trackOrder.indexOf(trackIndex);
    const target = direction === 'up' ? position - 1 : position + 1;
    if (position < 0 || target < 0 || target >= trackOrder.length) return;
    const order = [...trackOrder];
    [order[position], order[target]] = [order[target], order[position]];
    controller.onEditHtmlSubtitle({
      edits: view.layers
        .filter((layer) => layer.model.ok)
        .map((layer) => ({
          key: layer.key,
          patches: [
            {
              kind: 'reorderTracks',
              order: order.filter((index) => layer.model.trackIndexes.includes(index)),
            },
          ],
        })),
    });
  };
  const dropTrack = (source, target) => {
    const order = moveTrackOrder(trackOrder, source, target);
    if (!order || order.every((value, index) => value === trackOrder[index])) return;
    controller.onEditHtmlSubtitle({
      edits: view.layers
        .filter((layer) => layer.model.ok)
        .map((layer) => ({
          key: layer.key,
          patches: [
            {
              kind: 'reorderTracks',
              order: order.filter((index) => layer.model.trackIndexes.includes(index)),
            },
          ],
        })),
    });
  };
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
        blocked={!state.ready || state.conflicted || !describeSubtitleEditing(state).active}
        trackReadOnly={view.layers.some((layer) => layer.model.styleCompatibility?.readOnly)}
        trackIndex={row.index}
        trackOrder={trackOrder}
        onMoveTrack={moveTrack}
        onTrackDrop={dropTrack}
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

export default function HtmlSubtitleWorkspace({ state, controller, children, view, fontSource }) {
  const root = useRef(null);
  const listTab = useRef(null),
    styleTab = useRef(null),
    focusTab = useRef(false);
  const [width, setWidth] = useState(300),
    [query, setQuery] = useState(''),
    [presetsOpen, setPresetsOpen] = useState(false),
    [panel, setPanel] = useState('list');
  const open = Boolean(state.htmlSubtitlePanelOpen && state.previewExpanded);
  const migrationRequest = useRef(null);
  useLayoutEffect(() => {
    const request = state.htmlSubtitleStyleRequest;
    if (!open || !request || migrationRequest.current === request) return;
    if (panel !== 'style') {
      setPanel('style');
      return;
    }
    migrationRequest.current = request;
    if (request.focus && document.activeElement === document.body) {
      const input = root.current?.querySelector('textarea[aria-label="字幕内容"]');
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(
        Math.min(request.focus.start, input.value.length),
        Math.min(request.focus.end, input.value.length),
        request.focus.direction,
      );
    }
  }, [open, panel, state.htmlSubtitleStyleRequest]);
  const changePanel = (next) => {
    focusTab.current = true;
    setPanel(next);
  };
  useLayoutEffect(() => {
    if (!focusTab.current) return;
    const target = (panel === 'style' ? listTab : styleTab).current;
    if (open && !target) return;
    focusTab.current = false;
    target?.focus({ preventScroll: true });
  }, [open, panel, presetsOpen]);
  useEffect(() => {
    if (!open) setPanel('list');
  }, [open]);
  const layer = view.layers.find((layer) => layer.key === state.selectedHtmlSubtitle?.key);
  const model = layer?.model.ok ? layer.model : null;
  const aliasState = {
    ...state,
    textPanelOpen: open && panel === 'style',
    selectedTextCueId: state.selectedHtmlSubtitle?.cueId,
    textStatus: model ? 'ready' : state.htmlSubtitleStatus || 'idle',
    textError: state.htmlSubtitleError || view.error,
    textPreviewError: state.htmlSubtitlePreviewError,
    textDraft: state.htmlSubtitleDraft
      ? { ...state.htmlSubtitleDraft, cueId: state.htmlSubtitleDraft.cueId }
      : null,
    textTrackChoice: null,
    textScriptUnsupported: view.layers.some((layer) => layer.model.ok && layer.model.hasScript),
    textReadOnly: model?.styleCompatibility.readOnly,
    textStyleCompatibility: model?.styleCompatibility,
    textCanConvert: Boolean(model?.styleCompatibility.convertible),
    textConvertLosesAnimation: Boolean(
      model?.styleCompatibility.hasAnimation || model?.styleCompatibility.hasScript,
    ),
    textSourceIssues: model?.issues,
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
    onConvertText: controller.onConvertHtmlSubtitle,
  };
  const blocked = !state.ready || state.conflicted || !describeSubtitleEditing(state).canEditHtml;
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
        <button
          ref={styleTab}
          type="button"
          className="cv-clip-rail-tab"
          onClick={() => changePanel('style')}
        >
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
          disabled={
            blocked ||
            (view.layers.length > 0 &&
              view.layers.every((layer) => layer.model.styleCompatibility?.readOnly))
          }
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
      {view.layers.flatMap((layer) =>
        (layer.model.issues || []).map((issue, index) => (
          <p
            role="status"
            className="cv-clip-subtitle-note"
            key={`${layer.key}:${issue.code}:${index}`}
          >
            {issue.detail}
          </p>
        )),
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
          {state.htmlSubtitleTrackChoice.tracks.length < 4 && (
            <button
              type="button"
              onClick={() =>
                controller.onAddHtmlSubtitle({
                  ...state.htmlSubtitleTrackChoice,
                  trackIndex: Math.max(...state.htmlSubtitleTrackChoice.tracks) + 1,
                  createTrack: true,
                  force: true,
                })
              }
            >
              新建字幕轨道
            </button>
          )}
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
                disabled={blocked || block.readOnly}
                aria-label={`在字幕 ${block.cueId} 后插入`}
                onClick={() => controller.onAddHtmlSubtitle({ ...block.identity, force: true })}
              >
                <Plus size={14} />
              </button>
              <button
                type="button"
                disabled={blocked || block.readOnly}
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
        <ClipTextWorkspace
          state={aliasState}
          controller={aliasController}
          modelOverride={model}
          label="字幕"
          variant="subtitle"
          fontSource={fontSource}
          toolbarTestId="clip-toolbar-subtitle"
          fieldOwnerKey={JSON.stringify(state.selectedHtmlSubtitle)}
          onPresetsOpenChange={setPresetsOpen}
          styleHeaderAction={
            <button
              ref={listTab}
              type="button"
              className="cv-clip-rail-tab"
              onClick={() => changePanel('list')}
            >
              字幕
            </button>
          }
        >
          {children}
        </ClipTextWorkspace>
      </div>
      {open && !presetsOpen && panel === 'list' && listPanel}
    </div>
  );
}
