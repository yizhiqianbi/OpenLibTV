import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import GeneratorModelMenu from '../generator/GeneratorModelMenu.jsx';
import GeneratorReferences from '../generator/GeneratorReferences.jsx';
import NodeGeneratorPrompt from '../generator/NodeGeneratorPrompt.jsx';
import '../generator/inline-generator.css';
import './ScriptV2GeneratorView.css';

const EMPTY_REFERENCES = {
  textList: [],
  imageList: [],
  videoList: [],
  audioList: [],
  mixedList: [],
};
const MENTION_TYPES = ['image', 'video', 'audio'];
const addActions = [
  { kind: 'canvas', label: '在当前画布中添加参考' },
  { kind: 'upload', label: '本地上传' },
  { kind: 'assets', label: '个人资产库' },
];
const artStyleReminder =
  '提交前请确认「美术风格」已填写——全局美术风格首次合成后即锁定，后续不可再改。';
const isolate = (event) => event.stopPropagation();
const textPreview = (content) =>
  (Array.isArray(content) ? content : typeof content === 'string' ? [content] : [])
    .filter((item) => typeof item === 'string' && item.trim().length > 0)
    .join('\n')
    .slice(0, 200);

/** Source module327466 content only; its caller owns frame, drafts, graph and service lifecycle. */
export default function ScriptV2GeneratorView({
  projection,
  readonly = false,
  ready = false,
  expanded = false,
  isCanvasLight = false,
  catalogStatus = 'loading',
  error,
  pendingSave = false,
  busy = false,
  onRetryCatalog,
  onRetrySave,
  onModelChange,
  onPromptChange,
  onSubmit,
  onReferenceDelete,
  onReferenceReorder,
  onReferencePreview,
  onReferenceFocus,
  onAddReference,
  disabledReferenceActions,
  onTranslate,
  voiceAvailable = false,
  onVoiceStart,
  asset,
  promptRef,
  sessionKey,
  portalTarget,
  onHistoryBoundary,
}) {
  const references = projection?.references || EMPTY_REFERENCES;
  const hasReferences = ['textList', 'imageList', 'videoList', 'audioList'].some(
    (key) => references[key]?.length,
  );
  const params = projection?.params || {};
  const blocked = readonly || !ready || busy || catalogStatus !== 'ready' || !projection?.valid;
  const addMenu = useAgentToolbarPopover({
    width: 196,
    maxHeight: 180,
    offset: 4,
    disabled: blocked || typeof onAddReference !== 'function',
  });
  const [menuLeft, setMenuLeft] = useState(8);
  useLayoutEffect(() => {
    if (!addMenu.open) return;
    const anchor = addMenu.triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setMenuLeft(
      Math.max(8, Math.min(anchor.left, window.innerWidth - addMenu.popoverStyle.width - 8)),
    );
  }, [addMenu.open, addMenu.popoverStyle, addMenu.triggerRef]);
  const models = Object.fromEntries(
    (projection?.modelList || []).map((item) => [
      item.modelKey,
      { ...item, aliasName: item.modelName },
    ]),
  );
  const generateDisabled = blocked || !projection?.canGenerate || typeof onSubmit !== 'function';
  const generateReason = blocked
    ? '当前脚本生成器不可编辑'
    : projection?.error || (typeof onSubmit !== 'function' ? '脚本生成服务尚未接入' : '');
  return (
    <div
      className={`cv-script-generator-view${expanded ? ' is-expanded' : ''}${isCanvasLight ? ' is-light' : ''}`}
      data-testid="scriptv2-generator-view"
      data-canvas-generator-root=""
      data-generator-type="script"
      onPointerDown={isolate}
      onMouseDown={isolate}
      onClick={isolate}
      onDoubleClick={isolate}
      onKeyDown={(event) => {
        if (event.code === 'Space' || event.key === ' ') event.stopPropagation();
      }}
    >
      {!readonly && (
        <div className="cv-script-generator-add-row">
          <button
            type="button"
            ref={addMenu.triggerRef}
            {...addMenu.triggerProps}
            className="cv-script-generator-add"
            data-testid="add-reference-trigger"
            aria-label="添加参考图"
            aria-haspopup="menu"
            aria-expanded={addMenu.open}
            disabled={blocked || typeof onAddReference !== 'function'}
          >
            <span className="cv-script-generator-plus" aria-hidden="true" />
            <span>参考图</span>
          </button>
        </div>
      )}
      {hasReferences && (
        <div className="cv-script-generator-reference-strip" aria-label="生成参考素材">
          {!!references.textList?.length && (
            <div className="cv-script-generator-text-references" aria-label="文本参考">
              {references.textList.map((reference, index) => (
                <div
                  key={reference.nodeId}
                  className="cv-script-generator-text-reference"
                  data-testid="scriptv2-generator-text-reference"
                  title={textPreview(reference.content)}
                >
                  <span className="cv-script-generator-text-icon" aria-hidden="true" />
                  <span className="cv-script-generator-text-index">{index + 1}</span>
                  {!blocked && typeof onReferenceDelete === 'function' && (
                    <button
                      type="button"
                      className="cv-script-generator-text-delete"
                      aria-label={`删除文本参考 ${index + 1}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onReferenceDelete(reference.nodeId)}
                    >
                      <span aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {MENTION_TYPES.map((type) => (
            <GeneratorReferences
              key={type}
              references={{ ...EMPTY_REFERENCES, [`${type}List`]: references[`${type}List`] || [] }}
              mixed={false}
              asset={asset}
              blocked={blocked}
              onDelete={onReferenceDelete}
              onReorder={(listType, ids) => {
                if (blocked || listType !== `${type}List`) return;
                onReferenceReorder?.(type, ids);
              }}
              onInsert={(reference) => {
                if (!blocked) promptRef?.current?.insertReference(reference);
              }}
              onPreview={onReferencePreview}
              onFocus={onReferenceFocus}
            />
          ))}
        </div>
      )}
      <NodeGeneratorPrompt
        ref={promptRef}
        value={params.prompt ?? ''}
        onChange={onPromptChange}
        references={references}
        readonly={readonly}
        disabled={blocked}
        sessionKey={sessionKey}
        placeholder="描述剧情片段、故事，为你生成分镜脚本"
        mentionEnabled
        suggestionAvailable={false}
        mentionListType="separate"
        mentionTypes={MENTION_TYPES}
        asset={asset}
        portalTarget={portalTarget}
        onHistoryBoundary={onHistoryBoundary}
      />
      {!readonly && (
        <div className="cv-script-generator-bottom">
          <GeneratorModelMenu
            model={projection?.model}
            models={models}
            modelKeys={projection?.modelKeys}
            disabled={blocked || typeof onModelChange !== 'function'}
            onChange={(key) => {
              if (key !== projection?.model) onModelChange?.(key);
            }}
            portalTarget={portalTarget}
            menuClassName={`cv-script-generator-model-menu${isCanvasLight ? ' is-light' : ''}`}
            renderIcon={(item) =>
              item?.icon ? (
                <img
                  src={asset?.(item.icon) || item.icon}
                  alt=""
                  width={16}
                  height={16}
                  className="cv-script-generator-model-icon"
                />
              ) : null
            }
          />
          <span className="cv-script-generator-spacer" />
          <div className="cv-script-generator-tools">
            <button
              type="button"
              className="cv-script-generator-translate"
              aria-label="翻译提示词"
              title={typeof onTranslate === 'function' ? '翻译提示词' : '翻译服务尚未接入'}
              disabled={blocked || typeof onTranslate !== 'function'}
              onClick={() => onTranslate?.()}
            >
              <span aria-hidden="true" />
            </button>
            {voiceAvailable && (
              <>
                <span className="cv-script-generator-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="cv-script-generator-voice"
                  aria-label="语音输入"
                  title={typeof onVoiceStart === 'function' ? '语音输入' : '语音输入服务尚未接入'}
                  disabled={blocked || typeof onVoiceStart !== 'function'}
                  onClick={() => onVoiceStart?.()}
                >
                  <Mic size={16} aria-hidden="true" />
                </button>
              </>
            )}
            <button
              type="button"
              className="cv-script-generator-submit"
              aria-label="生成分镜脚本"
              title={generateDisabled ? generateReason : artStyleReminder}
              disabled={generateDisabled}
              onClick={() => onSubmit?.()}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {!readonly && catalogStatus === 'loading' && <p role="status">正在加载脚本模型…</p>}
      {!readonly && catalogStatus === 'error' && (
        <div className="cv-script-generator-local-note" role="alert">
          脚本模型加载失败，原参数已保留
          <button type="button" disabled={busy || !onRetryCatalog} onClick={onRetryCatalog}>
            重试加载脚本模型
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {!readonly && pendingSave && (
        <button
          type="button"
          className="cv-script-generator-retry-save"
          disabled={busy || !ready || !onRetrySave}
          onClick={onRetrySave}
        >
          重试保存脚本参数
        </button>
      )}
      {addMenu.open &&
        createPortal(
          <div
            ref={addMenu.popoverRef}
            {...addMenu.popoverProps}
            className={`cv-script-generator-add-menu${isCanvasLight ? ' is-light' : ''}`}
            role="menu"
            aria-label="添加参考图方式"
            style={{ ...addMenu.popoverStyle, left: menuLeft }}
            onDoubleClick={isolate}
          >
            {addActions.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                disabled={blocked || disabledReferenceActions?.[kind] === true}
                onClick={() => {
                  addMenu.close({ restoreFocus: true });
                  onAddReference?.(kind);
                }}
              >
                {label}
              </button>
            ))}
          </div>,
          portalTarget?.() || document.body,
        )}
    </div>
  );
}
