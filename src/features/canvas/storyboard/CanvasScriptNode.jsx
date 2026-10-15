import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Expand, Image, Video, X } from 'lucide-react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { useStoryboardTable } from './useStoryboardTable.js';
import { StoryboardTableView } from './StoryboardTable.jsx';
import { isScriptV2 } from './script-model.js';
import { scriptWorkflowState, normalizeScriptStep, scriptAssetProgress } from './workflow-model.js';
import { createScriptV2ManualPatch, projectScriptV2Card } from './script-card-model.js';
import ScriptCompactProgress from './ScriptCompactProgress.jsx';
import ScriptCardSurface from './ScriptCardSurface.jsx';
import { ScriptStageProgress } from './ScriptStageProgress.jsx';
import ScriptAssetsView from './ScriptAssetsView.jsx';
import { useScriptPromptCompose } from './useScriptPromptCompose.js';
import { useScriptMediaHistory } from './useScriptMediaHistory.js';
import {
  ScriptPromptComposeDialog,
  ScriptPromptComposeConfirmation,
  ScriptPromptComposeNotice,
} from './ScriptPromptComposeDialog.jsx';
import { storyboardViews } from './rows.js';
import { buildStoryboardImageGraphPlan, buildStoryboardVideoGraphPlan } from './graph-plans.js';
import { initialStoryboardVideoConfig, storyboardVideoSettingsSchema } from './video-model.js';
import { resolveGeneratorParams } from '../generator/schema.js';
import GeneratorSettings from '../generator/GeneratorSettings.jsx';
import { useScriptV2VideoConfiguration } from './useScriptV2VideoConfiguration.js';
import ScriptV2VideoConfiguration from './ScriptV2VideoConfiguration.jsx';
import { useScriptV2ImageConfiguration } from './useScriptV2ImageConfiguration.js';
import ScriptV2ImageConfiguration from './ScriptV2ImageConfiguration.jsx';
import { useScriptV2Presets } from './useScriptV2Presets.js';
import { resolveScriptV2VideoCatalogue } from './v2-video-config-model.js';
import { useScriptNodeToolbar } from './useScriptNodeToolbar.js';
import ScriptNodeToolbar from './ScriptNodeToolbar.jsx';
import { ScriptRegenerateConfirmation } from './ScriptRegenerateConfirmation.jsx';
import { buildScriptV2Csv } from './export-csv.js';
import { download } from '../../editor/browser.js';
import './storyboard.css';

function ScriptGroupDialog({
  kind,
  node,
  controller,
  nodes,
  models,
  documentKey,
  onApplyGraphPlan,
  onClose,
}) {
  const type = kind === 'image' ? 'image' : 'video';
  const initial = () =>
    kind === 'video'
      ? initialStoryboardVideoConfig({
          models,
          value: node.data.videoGenConfig,
          initialImageSettings: node.data.imageGenConfig?.settings,
        })
      : {
          ...node.data.imageGenConfig,
          model: node.data.imageGenConfig?.model || models?.default?.image || '',
          modeType: 'text2image',
          settings: { ...node.data.imageGenConfig?.settings },
          advancedSettings: { ...node.data.imageGenConfig?.advancedSettings },
        };
  const [config, setConfig] = useState(initial),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const operation = useRef(null),
    owner = useRef(null);
  owner.current = { documentKey, node, disabled: controller.disabled };
  useEffect(() => () => operation.current?.abort(), [documentKey, node.id]);
  useEffect(() => {
    if (controller.disabled) operation.current?.abort();
  }, [controller.disabled]);
  const schema = models?.[type + 'Models']?.[config.model];
  const save = async () => {
    const current = owner.current;
    if (current.disabled || pending || !schema || !onApplyGraphPlan) return;
    const abort = new AbortController();
    operation.current = abort;
    setError('');
    setPending(true);
    try {
      const script = { ...current.node, data: controller.data };
      const builder =
        kind === 'image' ? buildStoryboardImageGraphPlan : buildStoryboardVideoGraphPlan;
      const plan = builder({
        script,
        nodes,
        config: resolveGeneratorParams(config, schema, type),
        schema,
        selectedHiddenUuids: controller.selected,
      });
      if (!plan.ok) throw new Error(plan.reason);
      const result = await onApplyGraphPlan(plan, {
        signal: abort.signal,
        documentKey: current.documentKey,
        nodeId: current.node.id,
        expectedNode: current.node,
      });
      if (abort.signal.aborted || owner.current.documentKey !== current.documentKey) return;
      if (result !== true) throw new Error('图组未保存，请重试');
      onClose();
    } catch (failure) {
      if (!abort.signal.aborted && owner.current.documentKey === current.documentKey)
        setError(failure.message || '图组未保存，请重试');
    } finally {
      if (operation.current === abort) {
        operation.current = null;
        setPending(false);
      }
    }
  };
  return (
    <EditorDialog title={kind === 'image' ? '生成分镜图' : '生成分镜视频'} onClose={onClose}>
      <div className="cv-script-dialog-form">
        <label>
          模型
          <select
            value={config.model}
            disabled={pending || controller.disabled}
            onChange={(event) => setConfig({ ...config, model: event.target.value })}
          >
            {Object.entries(models?.[type + 'Models'] || {})
              .filter(([, value]) => value.config && !value.disabled)
              .map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name || key}
                </option>
              ))}
          </select>
        </label>
        <GeneratorSettings
          params={config}
          schema={
            kind === 'video' ? storyboardVideoSettingsSchema(schema, config.modeType) : schema
          }
          type={type}
          disabled={!schema || pending || controller.disabled}
          onChange={setConfig}
        />
        <p>
          {controller.selected.size
            ? `已选 ${controller.selected.size} 个镜头`
            : `全部 ${controller.rows.length} 个镜头`}
          。创建本地生成节点；生成服务未连接，未提交任务。
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="cv-storyboard-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={!schema || pending || controller.disabled} onClick={save}>
            {pending ? '正在保存…' : '创建图组'}
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}

/** 272776: legacy renders a table; V2 renders stages and expands to its own table/assets views. */
export default function CanvasScriptNode({
  node,
  nodes = [],
  edges = [],
  documentKey,
  ready = true,
  readonly = false,
  models,
  onChange,
  onApplyGraphPlan,
  videoConfiguration,
  imageConfiguration,
  presetConfiguration,
  toolbar,
  onMutateAsset,
  onJumpToNode,
  getDocument,
  registerDraft,
  openRequest = 0,
  shouldSuppressClick,
  src = (url) => url,
}) {
  const v2 = isScriptV2(node);
  const scriptViews = storyboardViews(node.data);
  const tableViewId = v2
    ? (scriptViews.find((view) => view.type === 'table') || scriptViews[0])?.id
    : undefined;
  const controller = useStoryboardTable({
    node,
    documentKey,
    ready,
    readonly,
    onChange,
    activeViewId: tableViewId,
  });
  const [expanded, setExpanded] = useState(false),
    [groupKind, setGroupKind] = useState(null),
    [batchPromptOpen, setBatchPromptOpen] = useState(false),
    [localView, setLocalView] = useState(null),
    [currentStep, setCurrentStep] = useState('confirm-shots');
  useEffect(() => {
    setExpanded(false);
    setGroupKind(null);
    setBatchPromptOpen(false);
    setLocalView(null);
    setCurrentStep('confirm-shots');
  }, [documentKey, node.id]);
  useEffect(() => {
    if (!ready || readonly) setGroupKind(null);
  }, [ready, readonly]);
  const assetProgress = scriptAssetProgress(controller.data, nodes);
  const workflow = scriptWorkflowState(controller.data, {
    getNodeUrl: (id) => nodes.find((item) => item.id === id)?.data?.url?.[0],
    assetProgress,
  });
  const card = projectScriptV2Card({
    node: { ...node, data: { ...controller.data, taskInfo: node.data.taskInfo } },
    nodes,
    edges,
    readonly,
    workflow,
    assetProgress,
  });
  // The table publishes its projection in a layout effect. An external open
  // request must use the new raw owner even during that preceding render.
  const requestCard = projectScriptV2Card({
    node,
    nodes,
    edges,
    readonly,
    workflow,
    assetProgress,
  });
  const fullGenerationBusy = v2 && card.fullGenerationBusy;
  const consumedOpenRequest = useRef(0);
  useEffect(() => {
    if (openRequest === consumedOpenRequest.current) return;
    consumedOpenRequest.current = openRequest;
    if (openRequest && ready && (!v2 || requestCard.canOpen)) setExpanded(true);
  }, [openRequest, ready, v2, requestCard.canOpen]);
  const promptCompose = useScriptPromptCompose({
    node,
    documentKey,
    ready,
    readonly,
    disabled: controller.pending || Boolean(controller.error),
    fullGenerationBusy,
    getDocument,
    registerDraft,
    onChange,
  });
  const mediaHistory = useScriptMediaHistory({
    node,
    documentKey,
    ready,
    readonly,
    disabled: controller.pending || Boolean(controller.error) || fullGenerationBusy,
    getDocument,
    onChange,
    onJumpToNode,
    onBeforeJump: promptCompose.flushAll,
    onBeforeSetActive: promptCompose.flushAll,
  });
  const videoConfig = useScriptV2VideoConfiguration({
    ...videoConfiguration,
    scriptId: node.id,
    documentKey,
    nodes,
    ready,
    readonly,
    enabled: v2 && !controller.disabled && !controller.error && !fullGenerationBusy,
    getDocument,
    onCreated: () => {
      setBatchPromptOpen(false);
      setExpanded(false);
    },
  });
  const imageConfig = useScriptV2ImageConfiguration({
    ...imageConfiguration,
    scriptId: node.id,
    documentKey,
    nodes,
    ready,
    readonly,
    selectionEligible: toolbar?.selectionEligible,
    enabled: v2 && !controller.disabled && !controller.error && !fullGenerationBusy,
    getDocument,
  });
  const presets = useScriptV2Presets({
    ...presetConfiguration,
    scriptId: node.id,
    documentKey,
    ready,
    readonly,
    enabled: v2 && card.kind === 'empty_generate' && !controller.disabled && !controller.error,
    getDocument,
  });
  const emptyEntryOwner = useMemo(() => ({ documentKey, nodeId: node.id }), [documentKey, node.id]);
  const emptyEntryAccess = useRef(null);
  emptyEntryAccess.current = {
    owner: emptyEntryOwner,
    ready,
    readonly,
    blocked:
      controller.disabled ||
      Boolean(controller.error) ||
      presets.busy ||
      presets.pendingSave ||
      card.kind !== 'empty_generate',
  };
  const modelData = videoConfiguration?.modelContent?.data;
  const modelError = videoConfiguration?.modelContent?.error;
  const supportData = videoConfiguration?.supportContent?.data;
  const supportError = videoConfiguration?.supportContent?.error;
  const videoAvailable = useMemo(() => {
    if (modelError || supportError || !modelData || !supportData) return false;
    const catalogue = resolveScriptV2VideoCatalogue({
      models: modelData,
      support: supportData.items,
      requiredRefs: 1,
    });
    return catalogue.valid && catalogue.keys.length > 0;
  }, [modelData, modelError, supportData, supportError]);
  const toolbarController = useScriptNodeToolbar({
    node,
    workflow,
    documentKey,
    ready,
    readonly,
    getDocument,
    selectionEligible: Boolean(toolbar?.selectionEligible),
    tablePending: controller.pending,
    tableError: Boolean(controller.error),
    videoAvailable,
    beforeAction: promptCompose.flushAll,
    onCreateImages: ({ opener }) => imageConfig.open(opener),
    onCreateVideos: ({ opener }) => videoConfig.open(opener),
    onDownload: ({ node: latestNode }) => {
      const descriptor = buildScriptV2Csv(latestNode.data);
      if (!descriptor) return false;
      download(descriptor.name, descriptor.content, descriptor.type);
      return true;
    },
    notify: videoConfiguration?.notify,
  });
  const closeExpanded = async () => {
    if (await promptCompose.flushAll()) {
      setBatchPromptOpen(false);
      setExpanded(false);
    }
  };
  const setStep = (step) => setCurrentStep(normalizeScriptStep(step));
  const openExpanded = () => {
    if (ready && (!v2 || card.canOpen)) setExpanded(true);
  };
  const viewMode = localView || controller.data.viewMode || 'table';
  const setView = (mode) => {
    setLocalView(mode);
    if (!readonly && ready) controller.setView(mode);
  };
  const viewController = { ...controller, data: { ...controller.data, viewMode } };
  const actions = (
    <div className="cv-storyboard-actions">
      <button
        type="button"
        disabled={
          controller.disabled ||
          fullGenerationBusy ||
          !controller.rows.length ||
          (v2 && !workflow.outputGenerationReady)
        }
        onClick={async (event) => {
          if (!v2) {
            setGroupKind('image');
            return;
          }
          const opener = event.currentTarget;
          try {
            if (await promptCompose.flushAll()) {
              opener.focus({ preventScroll: true });
              imageConfig.open(opener);
            }
          } catch {
            imageConfiguration?.notify?.('当前提示词未保存，请重试');
          }
        }}
      >
        <Image size={14} />
        生成分镜图
      </button>
      <button
        type="button"
        disabled={
          controller.disabled ||
          fullGenerationBusy ||
          (v2 ? !controller.rows.length : !node.data?.linkedImageGroupId) ||
          (v2 && !workflow.outputGenerationReady)
        }
        onClick={async (event) => {
          if (!v2) {
            setGroupKind('video');
            return;
          }
          const opener = event.currentTarget;
          try {
            if (await promptCompose.flushAll()) videoConfig.open(opener);
          } catch {
            videoConfiguration?.notify?.('当前提示词未保存，请重试');
          }
        }}
      >
        <Video size={14} />
        生成分镜视频
      </button>
    </div>
  );
  const table = (footer, emphasizePromptColumn = false) => (
    <StoryboardTableView
      controller={
        v2
          ? {
              ...controller,
              data: { ...controller.data, viewMode: 'table', activeViewId: tableViewId },
            }
          : viewController
      }
      identity={`${documentKey}:${node.id}`}
      readonly={readonly}
      ready={ready}
      hideHeader
      hideViewSwitcher
      emphasizePromptColumn={emphasizePromptColumn}
      promptCompose={v2 ? promptCompose : undefined}
      mediaHistory={v2 ? mediaHistory : undefined}
      footer={footer}
    />
  );
  const views = v2 ? (
    currentStep === 'prepare-assets' ? (
      <ScriptAssetsView
        {...{
          node,
          nodes,
          edges,
          documentKey,
          ready,
          readonly,
          getDocument,
          onMutateAsset,
          onJumpToNode,
          src,
        }}
        onNextStep={() => setStep('compose-prompts')}
      />
    ) : (
      <div className="cv-script-table-stage" data-script-step={currentStep}>
        {table(
          currentStep === 'confirm-shots' ? (
            <button
              type="button"
              className="cv-script-next-step"
              onClick={() => setStep('prepare-assets')}
            >
              → 下一步：准备资产
            </button>
          ) : (
            actions
          ),
          currentStep === 'compose-prompts',
        )}
        {currentStep === 'compose-prompts' && (
          <button
            type="button"
            className="cv-script-compose"
            disabled={
              controller.disabled ||
              fullGenerationBusy ||
              !controller.rows.length ||
              Boolean(controller.error)
            }
            onClick={() => setBatchPromptOpen(true)}
          >
            一键合成全部提示词
          </button>
        )}
      </div>
    )
  ) : (
    <>
      <div className="cv-storyboard-actions">
        <button
          type="button"
          aria-pressed={viewMode !== 'asset' && viewMode !== 'creative'}
          disabled={controller.pending}
          onClick={() => setView('table')}
        >
          脚本视图
        </button>
        <button
          type="button"
          aria-pressed={viewMode === (v2 ? 'asset' : 'creative')}
          disabled={controller.pending}
          onClick={() => setView(v2 ? 'asset' : 'creative')}
        >
          {v2 ? '资产视图' : '创意视图'}
        </button>
      </div>
      {table(actions)}
    </>
  );
  return (
    <div
      className="cv-script-node"
      data-script-card-kind={v2 ? card.kind : undefined}
      onPointerDown={(event) => {
        if (!v2) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (
          !event.currentTarget.contains(event.target) ||
          event.target.closest('[data-script-text-cell="true"]') ||
          shouldSuppressClick?.(event)
        )
          return;
        openExpanded();
      }}
    >
      {v2 ? (
        <ScriptCardSurface
          card={card}
          taskInfo={node.data.taskInfo}
          documentKey={documentKey}
          nodeId={node.id}
          onOpen={ready && card.canOpen ? openExpanded : undefined}
          readonly={readonly}
          emptyDisabled={controller.disabled || presets.busy || presets.pendingSave}
          disabledEmptyActions={presets.disabledActions}
          onEmptyAction={async (kind) => {
            const access = emptyEntryAccess.current;
            if (
              access.owner !== emptyEntryOwner ||
              !access.ready ||
              access.readonly ||
              access.blocked
            )
              return;
            if (kind !== 'writeStoryboard') {
              presets.create(kind);
              return;
            }
            if (getDocument) {
              const graph = getDocument();
              const script = graph?.nodes?.find((item) => item.id === emptyEntryOwner.nodeId);
              const freshCard = projectScriptV2Card({
                node: script,
                nodes: graph?.nodes,
                edges: graph?.edges,
              });
              if (
                graph?.documentKey !== emptyEntryOwner.documentKey ||
                !graph.ready ||
                graph.readonly ||
                !freshCard.valid ||
                freshCard.kind !== 'empty_generate'
              )
                return;
            }
            const patch = createScriptV2ManualPatch({ makeId: () => crypto.randomUUID() });
            const applied = await controller.apply(patch);
            if (
              applied &&
              emptyEntryAccess.current.owner === emptyEntryOwner &&
              emptyEntryAccess.current.ready &&
              !emptyEntryAccess.current.readonly
            ) {
              setStep('confirm-shots');
              setExpanded(true);
            }
          }}
          compact={
            <ScriptCompactProgress
              workflow={workflow}
              generatingLabel={card.generatingLabel}
              onOpen={ready && card.showOpenButton ? openExpanded : undefined}
            />
          }
        >
          {controller.error && <p role="alert">{controller.error}</p>}
          {presets.error && <p role="alert">{presets.error}</p>}
          {presets.pendingSave && (
            <button type="button" disabled={presets.busy} onClick={presets.retrySave}>
              重试保存参考节点
            </button>
          )}
          {!readonly && card.kind === 'empty_generate' && presets.catalogStatus === 'loading' && (
            <p role="status">正在加载参考示例…</p>
          )}
          {!readonly && card.kind === 'empty_generate' && presets.catalogStatus === 'error' && (
            <div className="cv-script-service-note" role="alert">
              参考示例加载失败，仍可自己编写分镜脚本
              <button type="button" onClick={presets.reload}>
                重试加载参考示例
              </button>
            </div>
          )}
          {!readonly && card.kind === 'pending' && <p>脚本生成服务尚未接入，未提交任务</p>}
          {toolbarController.error && <p role="alert">{toolbarController.error}</p>}
          {toolbarController.projection.visible && videoConfig.props.catalogStatus === 'error' && (
            <div className="cv-script-service-note" role="alert">
              视频模型加载失败
              <button type="button" onClick={videoConfig.props.onRetryCatalog}>
                重试加载视频模型
              </button>
            </div>
          )}
          {!expanded && <ScriptPromptComposeNotice compose={promptCompose} />}
        </ScriptCardSurface>
      ) : (
        <>
          <button type="button" aria-label="展开分镜脚本" onClick={() => setExpanded(true)}>
            <Expand size={14} />
          </button>
          {views}
        </>
      )}
      {expanded &&
        createPortal(
          <div
            className={v2 ? 'cv-script-fullscreen' : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <EditorDialog
              title={controller.data.title || controller.data.name || '分镜脚本'}
              wide
              onClose={closeExpanded}
            >
              {v2 && (
                <div className="cv-script-fullscreen-header">
                  <ScriptStageProgress
                    workflow={workflow}
                    currentStep={currentStep}
                    onStepChange={setStep}
                  />
                  <span className="cv-script-fullscreen-summary">
                    {workflow.readyCount}/3 完成后可批量生视频
                  </span>
                  <button type="button" aria-label="关闭分镜脚本" onClick={closeExpanded}>
                    <X size={12} />
                  </button>
                </div>
              )}
              <div className={v2 ? 'cv-script-fullscreen-content' : undefined}>{views}</div>
              {v2 && <ScriptPromptComposeNotice compose={promptCompose} />}
            </EditorDialog>
          </div>,
          document.body,
        )}
      {v2 && batchPromptOpen && (
        <ScriptPromptComposeDialog
          kind="batch"
          rows={controller.rows}
          compose={promptCompose}
          onClose={() => setBatchPromptOpen(false)}
        />
      )}
      {v2 && <ScriptPromptComposeConfirmation compose={promptCompose} />}
      {groupKind &&
        createPortal(
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ScriptGroupDialog
              kind={groupKind}
              {...{ node, nodes, models, documentKey, onApplyGraphPlan }}
              controller={{
                ...controller,
                disabled: controller.disabled || fullGenerationBusy,
              }}
              onClose={() => {
                setGroupKind(null);
              }}
            />
          </div>,
          document.body,
        )}
      {videoConfig.request && <ScriptV2VideoConfiguration {...videoConfig.props} />}
      {imageConfig.request && <ScriptV2ImageConfiguration {...imageConfig.props} src={src} />}
      {v2 && <ScriptNodeToolbar {...toolbar} nodeId={node.id} {...toolbarController} />}
      {toolbarController.regeneration && (
        <ScriptRegenerateConfirmation onClose={toolbarController.closeRegeneration} />
      )}
    </div>
  );
}
