import { useLayoutEffect, useRef, useMemo } from 'react';
import { ArrowUp } from 'lucide-react';
import { useNodeGenerator } from './useNodeGenerator.js';
import { generatorPrompt } from './schema.js';
import { generatorReferenceLists } from './reference-lists.js';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import GeneratorModelMenu from './GeneratorModelMenu.jsx';
import GeneratorSettings from './GeneratorSettings.jsx';
import './inline-generator.css';
import GeneratorFrame from './GeneratorFrame.jsx';
import GeneratorReferences from './GeneratorReferences.jsx';
import { createCanvasMentionSource } from './mentions-enhanced/canvas-reference-source.js';
import { listNodePromptReferences } from './node-prompt-model.js';
import { resolveNodeGenerator } from './node-generator.js';
import { usesMixedGeneratorReferences } from './reference-actions-model.js';
import { resolvePromptAssetCandidate } from './mentions-enhanced/asset-reference-model.js';
import FocusAttachment from './focus/FocusAttachment.jsx';
import MarkAttachment from './mark/MarkAttachment.jsx';
import { ShieldCheck } from 'lucide-react';
import { useCanvasRoleLibrary } from './roles/useCanvasRoleLibrary.js';
import RoleLibraryDialog from './roles/RoleLibraryDialog.jsx';

const audioLabel = {
  text2audio: '描述生音乐',
  lyrics2audio: '歌词生音乐',
  image2audio: '图片生音频',
  audio2audio: '音频参考',
};
export default function CanvasNodeInlineGenerator({
  node,
  nodes,
  edges,
  models,
  modelContent,
  asset,
  readonly,
  ready,
  update,
  generateNode,
  voiceSource,
  roleLibrarySource,
  roleImageReader,
  flushGraph,
  cancelOtherGestures,
  notify,
  position,
  coordinateOrigin,
  zoom,
  onPreview,
  onHistoryBoundary,
  documentKey,
  getDocument,
  registerDraft,
  graphActions,
  onFocusReference,
  view,
  board,
  focusMode,
  markMode,
}) {
  const promptRef = useRef(null);
  const latest = useRef(null);
  const roleLibrary = useCanvasRoleLibrary({
    node,
    documentKey,
    source: roleLibrarySource,
    readonly,
    ready,
    getDocument,
    getPrompt: () => promptRef.current?.getValue(),
    onAcceptedPrompt: (value) => promptRef.current?.acceptCommittedValue?.(value),
    graphActions,
    flushGraph,
    asset,
    readImageDimensions: roleImageReader,
    cancelOtherGestures,
  });
  const state = useNodeGenerator({
    node,
    nodes,
    edges,
    models,
    asset,
    readonly,
    ready,
    update,
    getDocument,
    documentKey,
  });
  const {
    schema,
    params,
    modelList,
    model,
    inputCounts,
    mediaModes,
    mediaValidation,
    locks,
    changeParams,
    mediaProbe,
  } = state;
  const prompt = generatorPrompt(schema, params.modeType);
  const references = generatorReferenceLists(node, state.inputMedia);
  const mixed = usesMixedGeneratorReferences(params.modeType, model, schema);
  const mentionConfig = schema?.properties?.mention;
  const mentionEnabled =
    ['image', 'video'].includes(node.type) ||
    mentionConfig === true ||
    mentionConfig?.[params.modeType] === true;
  const modeSelectable =
    node.type === 'video' ||
    (node.type === 'audio' &&
      schema?.config?.textModes?.length > 1 &&
      !Object.values(inputCounts).some(Boolean));
  const blocked = readonly || !ready || !schema;
  latest.current = { params, changeParams, getDocument, graphActions, writable: !blocked };
  const optionsFromGraph = (graph, targetId) => {
    const target = graph?.nodes.find((item) => item.id === targetId);
    if (!target) return [];
    const resolved = resolveNodeGenerator(target, graph.nodes, graph.edges, graph.models);
    return listNodePromptReferences(generatorReferenceLists(target, resolved.inputMedia), {
      mentionListType: usesMixedGeneratorReferences(
        resolved.params.modeType,
        resolved.model,
        resolved.schema,
      )
        ? 'mixed'
        : 'separate',
    });
  };
  const mentionSource = useMemo(
    () =>
      createCanvasMentionSource({
        documentKey,
        targetNodeId: node.id,
        getGraph: () => latest.current.getDocument?.(),
        getOptions: optionsFromGraph,
        localResourceActions: true,
      }),
    [documentKey, node.id],
  );
  const referenceRevision = useMemo(() => ({ nodes, edges, models }), [nodes, edges, models]);
  const canvasMentions = graphActions
    ? {
        targetNodeId: node.id,
        source: mentionSource,
        refreshKey: referenceRevision,
        connect: (sourceId, targetId) =>
          latest.current.graphActions.connectMention(sourceId, targetId, {
            promptOverride: promptRef.current?.getValue(),
          }),
        getLatestReference: (sourceId) =>
          optionsFromGraph(latest.current.getDocument?.(), node.id).find(
            (option) => option.nodeId === sourceId,
          ),
        onConnectFailed: () => latest.current.graphActions.notifyReferenceFailure?.(),
        importAssets: (items, context) => {
          if (!latest.current.writable) return null;
          const result = latest.current.graphActions.importAssetReferences?.(
            node.id,
            items,
            context,
          );
          if (!result) return null;
          const options = optionsFromGraph(latest.current.getDocument?.(), node.id);
          return {
            ...result,
            options: result.nodeIds
              .map((id) => options.find((option) => option.nodeId === id))
              .filter(Boolean),
          };
        },
        isAssetDisabled: (item, selected) => {
          const candidate = latest.current.graphActions.evaluateAssetSelection?.(
            node.id,
            item,
            selected,
          );
          return candidate?.ok
            ? false
            : candidate?.reason === 'limit'
              ? '超出资产引用上限'
              : '无法添加为参考';
        },
        getAssetCapacity: (selected) =>
          latest.current.graphActions.getAssetCapacity?.(node.id, selected) || [],
        getPreviewAsset: (item) => {
          const candidate = resolvePromptAssetCandidate(item);
          return candidate?.item &&
            candidate.url &&
            ['image', 'video', 'audio'].includes(candidate.kind)
            ? {
                ...item,
                mediaType: candidate.kind,
                url: candidate.url,
                ...(candidate.poster ? { poster: candidate.poster } : {}),
              }
            : null;
        },
        onSelectDisabledAsset: (item, selected) => {
          const actions = latest.current.graphActions;
          const result = actions.evaluateAssetSelection?.(node.id, item, selected);
          actions.notifyReferenceFailure?.(result?.reason);
        },
      }
    : undefined;
  useLayoutEffect(() => {
    const retain = registerDraft?.(
      documentKey,
      node.id,
      () => {
        const document = latest.current.getDocument?.();
        return {
          basePrompt: latest.current.params.prompt,
          value: promptRef.current?.getValue(),
          writable:
            latest.current.writable &&
            (!document ||
              document.documentKey !== documentKey ||
              document.nodes.some((item) => item.id === node.id)),
        };
      },
      'default',
      (value) => promptRef.current?.acceptCommittedValue?.(value),
    );
    return () => retain?.();
  }, [documentKey, node.id, registerDraft]);
  useLayoutEffect(
    () => () => {
      const current = latest.current;
      const document = current.getDocument?.();
      if (
        !document ||
        (document.documentKey === documentKey &&
          document.ready &&
          document.nodes.some((item) => item.id === node.id))
      ) {
        promptRef.current?.flush();
      }
      promptRef.current?.cancelPending();
    },
    [documentKey, node.id],
  );
  const changeWithDraft = (next) => {
    const value = promptRef.current?.flush();
    return changeParams(typeof value === 'string' ? { ...next, prompt: value } : next);
  };
  return (
    <GeneratorFrame
      key={documentKey + ':' + node.id}
      label={
        (node.data?.name || '节点').endsWith('生成器')
          ? node.data.name
          : (node.data?.name || '节点') + '生成器'
      }
      readonly={readonly}
      ready={ready}
      expandedSize={node.data?.generatorExpandedSize}
      onBeforeTransition={() => promptRef.current?.flush()}
      onExpandedSizeChange={(size) => update(node.id, { generatorExpandedSize: size })}
      placement={{ node, position, coordinateOrigin, zoom, view, board, documentKey }}
    >
      {({ portalTarget, collapse }) => (
        <>
          <div className="cv-inline-generator-body">
            {node.type === 'video' && !readonly && roleLibrary.availability.visible && (
              <div className="cv-role-entry-row">
                <button
                  type="button"
                  className="cv-role-entry"
                  aria-haspopup="dialog"
                  aria-expanded={roleLibrary.open}
                  disabled={roleLibrary.availability.disabled}
                  onKeyDown={(event) => {
                    if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
                  }}
                  onClick={roleLibrary.toggle}
                >
                  <ShieldCheck size={12} />
                  角色库
                </button>
              </div>
            )}
            <GeneratorReferences
              references={references}
              mixed={mixed}
              asset={asset}
              blocked={blocked}
              onPreview={onPreview}
              onFocus={onFocusReference}
              onInsert={(reference) => promptRef.current?.insertReference(reference)}
              onDelete={(sourceId) => {
                const current = latest.current;
                if (!current.writable) return false;
                const accepted = current.graphActions?.deleteReference(
                  node.id,
                  sourceId,
                  promptRef.current?.getValue(),
                );
                if (accepted) {
                  const graph = current.getDocument?.();
                  if (graph?.documentKey === documentKey) {
                    const value = graph.nodes.find((item) => item.id === node.id)?.data?.params
                      ?.prompt;
                    if (typeof value === 'string') promptRef.current?.acceptCommittedValue(value);
                  }
                }
                return accepted;
              }}
              onReorder={(listType, order) => {
                const current = latest.current;
                if (!current.writable) return false;
                const accepted = current.graphActions?.reorderReference(
                  node.id,
                  listType,
                  order,
                  promptRef.current?.getValue(),
                );
                if (accepted) {
                  const graph = current.getDocument?.();
                  if (graph?.documentKey === documentKey) {
                    const value = graph.nodes.find((item) => item.id === node.id)?.data?.params
                      ?.prompt;
                    if (typeof value === 'string') promptRef.current?.acceptCommittedValue(value);
                  }
                }
                return accepted;
              }}
            />
            {!readonly && (
              <MarkAttachment
                available={markMode?.canTarget(node.id) === true}
                active={markMode?.active}
                disabled={blocked || state.configLocked || markMode?.loadingEntry}
                onToggle={() => {
                  if (markMode.active) markMode.exit();
                  else
                    markMode.enter(node.id, {
                      cursorOffset: promptRef.current?.getSelectionOffset?.() ?? null,
                    });
                }}
              />
            )}
            {!readonly && (
              <FocusAttachment
                available={focusMode?.canTarget(node.id) === true}
                active={focusMode?.active}
                region={params.focusRegion}
                asset={asset}
                disabled={blocked || state.configLocked}
                onEnter={() => {
                  if (focusMode.active) focusMode.exit();
                  else {
                    collapse();
                    focusMode.enter(node.id);
                  }
                }}
                onEdit={() => {
                  collapse();
                  focusMode.enter(node.id);
                }}
                onDelete={() => focusMode.removeRegion(node.id)}
              />
            )}
            <NodeGeneratorPrompt
              ref={promptRef}
              sessionKey={`${documentKey}:${node.id}`}
              canvasMentions={canvasMentions}
              mentionEnabled={mentionEnabled}
              suggestionAvailable={['image', 'video'].includes(node.type)}
              mentionListType={mixed ? 'mixed' : 'separate'}
              value={params.prompt}
              magicList={params.magicList}
              onMagicSuggestionChange={(id, index) => markMode?.syncSuggestion(id, index, node.id)}
              onSelectionOffset={(offset) => markMode?.setCursorOffset(node.id, offset)}
              references={references}
              asset={asset}
              portalTarget={portalTarget}
              readonly={readonly}
              disabled={!ready || !schema}
              placeholder={prompt.placeholder || '描述你想要生成的画面内容，@引用素材'}
              onHistoryBoundary={onHistoryBoundary}
              onChange={(value) => changeParams({ prompt: value })}
            />
            {!schema && (
              <div className="cv-generator-media-status" role="status">
                <p>
                  {modelContent?.error
                    ? '模型配置加载失败'
                    : !models
                      ? '模型配置加载中…'
                      : '当前模型配置不可用'}
                </p>
                {modelContent?.error && (
                  <button type="button" onClick={() => modelContent.reload().catch(() => {})}>
                    重新加载模型配置
                  </button>
                )}
              </div>
            )}
            {mediaProbe.pending && (
              <p role="status" className="cv-generator-media-status">
                正在读取参考素材…
              </p>
            )}
            {!mediaProbe.pending && mediaValidation.unresolved.length > 0 && (
              <div role="status" className="cv-generator-media-status">
                参考素材元数据尚未验证{' '}
                <button type="button" onClick={mediaProbe.retry}>
                  重新读取素材
                </button>
              </div>
            )}
            {mediaValidation.warnMessages.map((message) => (
              <p key={message} className="cv-generator-media-status">
                {message}
              </p>
            ))}
            {node.data?.generationError && (
              <p className="cv-generation-error">{node.data.generationError}</p>
            )}
            {roleLibrary.open && (
              <RoleLibraryDialog
                source={roleLibrary.source}
                context={roleLibrary.context}
                ownerKey={roleLibrary.owner}
                asset={asset}
                onConfirm={roleLibrary.confirm}
                onNotice={notify}
                onClose={roleLibrary.close}
              />
            )}
          </div>
          {!readonly && (
            <footer className="cv-inline-generator-footer">
              <GeneratorModelMenu
                model={model}
                models={modelList}
                modelKeys={state.modelKeys}
                disabled={!ready || !models}
                portalTarget={portalTarget}
                onChange={(next) => changeWithDraft({ ...params, model: next })}
              />
              {modeSelectable && (
                <select
                  aria-label="生成模式"
                  value={params.modeType}
                  disabled={blocked || locks.modeLocked}
                  onChange={(event) => changeWithDraft({ ...params, modeType: event.target.value })}
                >
                  {!mediaModes.visible.some((mode) => mode.key === params.modeType) && (
                    <option value={params.modeType}>
                      {audioLabel[params.modeType] || params.modeType}
                    </option>
                  )}
                  {mediaModes.visible.map((mode) => (
                    <option
                      key={mode.key}
                      value={mode.key}
                      disabled={!mode.enabled}
                      title={mode.disabledReason || mode.warningReason}
                    >
                      {audioLabel[mode.key] || mode.label}
                      {mode.badge ? ` · ${mode.badge}` : ''}
                    </option>
                  ))}
                </select>
              )}
              <GeneratorSettings
                portalTarget={portalTarget}
                params={params}
                schema={schema}
                type={node.type}
                locks={locks}
                inputCounts={inputCounts}
                voiceSource={voiceSource}
                disabled={blocked || state.configLocked}
                countUnit={node.type === 'video' ? '份' : undefined}
                onChange={changeWithDraft}
              />
              <button
                type="button"
                aria-label="生成"
                title={!schema ? '模型配置尚未加载' : '生成'}
                className="cv-inline-generate"
                disabled={blocked}
                onClick={() => {
                  const promptValue = promptRef.current?.flush();
                  generateNode(
                    node.id,
                    mediaProbe.metadata,
                    typeof promptValue === 'string' ? promptValue : undefined,
                  );
                }}
              >
                <ArrowUp size={16} />
              </button>
            </footer>
          )}
        </>
      )}
    </GeneratorFrame>
  );
}
