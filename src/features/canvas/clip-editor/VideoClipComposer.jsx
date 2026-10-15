import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Check, ChevronDown, FileText, Image, Film, Music, Plus, X } from 'lucide-react';
import GeneratorFrame from '../generator/GeneratorFrame.jsx';
import GeneratorSettings from '../generator/GeneratorSettings.jsx';
import NodeGeneratorPrompt from '../generator/NodeGeneratorPrompt.jsx';
import CanvasReferenceMenu from '../generator/mentions-enhanced/CanvasReferenceMenu.jsx';
import {
  collectCanvasReferenceCandidates,
  presentCanvasReferenceCandidates,
} from '../generator/mentions-enhanced/candidate-model.js';
import { listNodePromptReferences } from '../generator/node-prompt-model.js';
import { collectVideoClipIncomingData } from './domain/incoming-model.js';
import {
  getVideoComposeMode,
  getVideoComposeParameterSchema,
  patchVideoComposeParameterSettings,
  readVideoComposeComposer,
  validateVideoComposeComposer,
} from './domain/agent-composer-model.js';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import { canvasNodeSize } from '../domain/groups.js';
import VideoComposeModeIcon from './VideoComposeModeIcon.jsx';

const slotNames = {
  video: '视频',
  audio: '音频',
  image: '图片',
  text: '文字',
  productImage: '产品图',
  refVideo: '参考视频',
  generatedVideo: '生成视频',
};
const referenceIcons = { image: Image, video: Film, audio: Music, text: FileText };
const EMPTY_LIST = [];
function validationLabel(error) {
  if (error.key === 'canvas:videoComposeMissingSlot')
    return `还需添加${slotNames[error.slotKey] || error.slotKey}（至少 ${error.min} 个）`;
  if (error.key === 'canvas:videoComposeTooManySlot')
    return `${slotNames[error.slotKey] || error.slotKey}最多 ${error.max} 个`;
  if (error.key === 'canvas:videoComposeMissingUrl') return '请在输入框中粘贴产品网站链接';
  if (error.key === 'canvas:videoComposePromptRequired') return '请填写提示词';
  return '剪辑配置尚未加载';
}

export default function VideoClipComposer({
  node,
  incomingData,
  presentation,
  composerController,
  documentKey,
  ready,
  readonly,
  registerDraft,
  getDocument,
  graphActions,
  onDeleteReference,
  onPreview,
  position,
  coordinateOrigin,
  zoom,
  view,
  board,
  src,
}) {
  const prompt = useRef(null);
  const latest = useRef(null);
  const [referenceMenu, setReferenceMenu] = useState(null);
  const addTrigger = useRef(null);
  const config = composerController.config;
  const state = config ? readVideoComposeComposer(node.data?.agentComposerData, config) : null;
  const disabled = readonly || !ready || presentation.agentBusy || !config;
  const schema = useMemo(() => config && getVideoComposeParameterSchema(config), [config]);
  const mode = config && getVideoComposeMode(state.modeKey, config);
  const modeMenu = useAgentToolbarPopover({
    width: 220,
    maxHeight: 300,
    offset: 4,
    openDelay: 0,
    disabled,
  });
  const references = useMemo(
    () => ({
      ...incomingData,
      imageList: (incomingData.imageList || EMPTY_LIST).map((ref) => ({
        ...ref,
        mediaType: 'image',
      })),
      videoList: (incomingData.videoList || EMPTY_LIST).map((ref) => ({
        ...ref,
        mediaType: 'video',
      })),
      audioList: (incomingData.audioList || EMPTY_LIST).map((ref) => ({
        ...ref,
        mediaType: 'audio',
      })),
    }),
    [incomingData],
  );
  latest.current = { state, disabled, getDocument, graphActions, composerController };
  const validation = validateVideoComposeComposer({
    config,
    composer: node.data?.agentComposerData,
    incomingData,
    readonly: disabled,
  });
  const options = useCallback(
    (graph) => {
      const target = graph.nodes.find((item) => item.id === node.id);
      return target
        ? listNodePromptReferences(collectVideoClipIncomingData({ node: target, ...graph }))
        : [];
    },
    [node.id],
  );
  const source = useMemo(
    () => ({
      async load({ signal } = {}) {
        const graph = latest.current.getDocument();
        const valid = () => {
          const current = latest.current.getDocument();
          return (
            current?.documentKey === documentKey &&
            current.ready &&
            !current.readonly &&
            current.nodes.some((item) => item.id === node.id && item.type === 'video-clip')
          );
        };
        if (!valid()) throw new Error('画布尚未准备好，请稍后重试');
        const collected = await collectCanvasReferenceCandidates({
          ...graph,
          targetNodeId: node.id,
          signal,
          isStale: () => !valid(),
          dependencies: {
            canAcceptMore: () => true,
            validate: (candidate) => ({
              allowed:
                latest.current.graphActions.planConnection({
                  sourceId: candidate.id,
                  targetId: node.id,
                }).valid === true,
            }),
          },
        });
        if (!collected) throw new Error('引用请求已取消');
        return presentCanvasReferenceCandidates({
          collected,
          options: options(graph),
          edges: graph.edges,
          targetNodeId: node.id,
        });
      },
    }),
    [documentKey, node.id, options],
  );
  const refreshKey = useMemo(() => ({ incomingData, graphActions }), [incomingData, graphActions]);
  const canvasMentions = {
    targetNodeId: node.id,
    source,
    refreshKey,
    connect: (sourceId, targetId) =>
      latest.current.graphActions.connectNodes({ sourceId, targetId }),
    getLatestReference: (sourceId) =>
      options(latest.current.getDocument()).find((option) => option.nodeId === sourceId),
  };
  useLayoutEffect(
    () =>
      registerDraft?.(
        documentKey,
        node.id,
        () => ({
          kind: 'clip-composer',
          basePrompt: latest.current.state?.prompt ?? '',
          value: prompt.current?.getValue(),
          writable: !latest.current.disabled,
        }),
        'clip-composer',
      ),
    [documentKey, node.id, registerDraft],
  );
  useLayoutEffect(
    () => () => {
      const graph = latest.current.getDocument();
      if (
        graph?.documentKey === documentKey &&
        graph.ready &&
        !graph.readonly &&
        graph.nodes.some((item) => item.id === node.id)
      )
        prompt.current?.flush();
      prompt.current?.cancelPending();
    },
    [documentKey, node.id],
  );
  const size = canvasNodeSize(node);
  const preview = (reference, kind) =>
    onPreview?.({
      id: reference.nodeId,
      type: kind,
      data: {
        name: reference.label || slotNames[kind],
        url: reference.url ? [reference.url] : [],
        text: reference.content || reference.text || '',
      },
    });
  const referenceRows = ['text', 'image', 'video', 'audio'].flatMap((kind) =>
    (incomingData[kind + 'List'] || EMPTY_LIST).map((reference, index) => ({
      reference,
      kind,
      index,
    })),
  );
  return (
    <GeneratorFrame
      label="智能剪辑"
      readonly={readonly}
      ready={ready}
      expandedSize={node.data?.generatorExpandedSize}
      onExpandedSizeChange={(size) => composerController.changeExpandedSize(node.id, size)}
      onBeforeTransition={() => {
        prompt.current?.flush();
      }}
      placement={{
        node,
        documentKey,
        position,
        coordinateOrigin,
        zoom,
        view,
        board,
        minimumPanelHeight: 150,
      }}
      style={{ top: size.height + 16, left: size.width / 2, transform: 'translateX(-50%)' }}
    >
      {({ portalTarget }) => (
        <div className="cv-clip-composer">
          {!config ? (
            <div role={composerController.configContent.error ? 'alert' : 'status'}>
              {composerController.configContent.error ? (
                <>
                  剪辑配置加载失败{' '}
                  <button type="button" onClick={composerController.configContent.reload}>
                    重试
                  </button>
                </>
              ) : (
                '正在加载剪辑配置…'
              )}
            </div>
          ) : (
            <>
              {!disabled && (
                <div className="cv-clip-composer-add">
                  <button
                    ref={addTrigger}
                    type="button"
                    aria-label="添加参考素材"
                    onClick={() => {
                      const rect = addTrigger.current?.getBoundingClientRect();
                      if (rect) setReferenceMenu({ left: rect.left, top: rect.bottom + 4 });
                    }}
                  >
                    <Plus size={14} />
                    添加参考
                  </button>
                </div>
              )}
              {!!referenceRows.length && (
                <div className="cv-clip-composer-references" aria-label="剪辑参考素材">
                  {referenceRows.map(({ reference, kind, index }) => {
                    const Icon = referenceIcons[kind];
                    return (
                      <div
                        className={'cv-clip-composer-reference cv-clip-composer-reference-' + kind}
                        key={`${kind}:${reference.nodeId}:${index}`}
                      >
                        <button
                          type="button"
                          title={reference.label || slotNames[kind]}
                          aria-label={`预览${slotNames[kind]}参考 ${index + 1}`}
                          onClick={() => preview(reference, kind)}
                        >
                          {kind === 'image' && reference.url ? (
                            <img src={src(reference.url)} alt="" draggable={false} />
                          ) : kind === 'video' && reference.url ? (
                            <video
                              src={src(reference.url)}
                              muted
                              playsInline
                              preload="metadata"
                              aria-hidden="true"
                            />
                          ) : (
                            <Icon size={18} />
                          )}
                          <span>{kind === 'text' ? reference.label || '文字' : index + 1}</span>
                        </button>
                        {!disabled && (
                          <button
                            className="cv-clip-composer-reference-delete"
                            type="button"
                            aria-label={`删除${slotNames[kind]}参考 ${index + 1}`}
                            onClick={() => onDeleteReference(reference.nodeId)}
                          >
                            <X size={7} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <NodeGeneratorPrompt
                ref={prompt}
                value={state.prompt}
                onChange={(value) => composerController.patch(node.id, { prompt: value })}
                sessionKey={`${documentKey}:${node.id}`}
                disabled={disabled}
                readonly={readonly}
                placeholder={
                  mode.urlInput ? '粘贴产品网站链接，并描述想要的广告效果' : '描述想剪成什么效果'
                }
                references={references}
                asset={src}
                portalTarget={portalTarget}
                canvasMentions={canvasMentions}
              />
              <div className="cv-clip-composer-footer">
                <div className="cv-clip-composer-options">
                  <button
                    {...modeMenu.triggerProps}
                    ref={modeMenu.triggerRef}
                    type="button"
                    disabled={disabled}
                    title="剪辑模式"
                    className="cv-clip-composer-mode"
                  >
                    <VideoComposeModeIcon mode={mode} />
                    <span>{mode.name}</span>
                    <ChevronDown size={12} />
                  </button>
                  <GeneratorSettings
                    params={{
                      modeType: 'text2video',
                      settings: {
                        ratio: state.params.aspectRatio,
                        duration: state.params.duration,
                        resolution: state.params.resolution,
                      },
                      ...incomingData,
                    }}
                    schema={schema}
                    disabled={disabled}
                    suppressCount
                    onChange={(next) =>
                      composerController.patch(node.id, {
                        params: patchVideoComposeParameterSettings(state.params, next.settings),
                      })
                    }
                    portalTarget={portalTarget}
                  />
                </div>
                <button
                  type="button"
                  className="cv-clip-composer-send"
                  aria-label="发送剪辑请求"
                  disabled={!validation.canSend}
                  title={
                    presentation.agentBusy
                      ? 'Agent 正在编辑，请稍后再试'
                      : validation.errors.map(validationLabel).join('；')
                  }
                  onClick={() => composerController.submit(node.id, prompt.current?.flush())}
                >
                  <ArrowUp size={13} />
                </button>
              </div>
              {modeMenu.open &&
                createPortal(
                  <div
                    {...modeMenu.popoverProps}
                    ref={modeMenu.popoverRef}
                    style={modeMenu.popoverStyle}
                    className="cv-clip-mode-menu"
                    aria-label="剪辑模式"
                  >
                    {[config.defaultMode, ...config.modes].map((item) => (
                      <button
                        key={item.modeKey}
                        type="button"
                        onClick={() => {
                          prompt.current?.flush();
                          modeMenu.close({ restoreFocus: true });
                          composerController.applyMode(node.id, item.modeKey);
                        }}
                      >
                        <VideoComposeModeIcon mode={item} />
                        <span>{item.name}</span>
                        {item.modeKey === state.modeKey && <Check size={14} />}
                      </button>
                    ))}
                  </div>,
                  portalTarget(),
                )}
              {referenceMenu &&
                createPortal(
                  <CanvasReferenceMenu
                    id={`${documentKey}:${node.id}:add`}
                    position={referenceMenu}
                    source={source}
                    sessionKey={`${documentKey}:${node.id}:add`}
                    refreshKey={refreshKey}
                    asset={src}
                    onSelect={(candidate) => {
                      if (candidate.disabledReason) return;
                      if (
                        !candidate.connected &&
                        !graphActions.connectNodes({
                          sourceId: candidate.nodeId,
                          targetId: node.id,
                        })
                      )
                        return;
                      setReferenceMenu(null);
                      prompt.current?.focus();
                    }}
                    onClose={(options) => {
                      setReferenceMenu(null);
                      if (options?.restoreEditorFocus)
                        addTrigger.current?.focus({ preventScroll: true });
                    }}
                  />,
                  portalTarget(),
                )}
            </>
          )}
        </div>
      )}
    </GeneratorFrame>
  );
}
