import React from 'react';
import { X, Plus, Sparkles, Link2 } from 'lucide-react';
import { typeInfo } from '../catalog.js';
import GeneratorSettings from '../generator/GeneratorSettings.jsx';
import { generatorPrompt } from '../generator/schema.js';
import { resolveNodeGenerator } from '../generator/node-generator.js';

export function NodeSettingsPanel({
  activeNode,
  copyCanvas,
  edges,
  generate,
  generatorState,
  modelContent,
  mediaProbe,
  voiceSource,
  models,
  nodes,
  openLibrary,
  onParamsChange,
  readonly,
  setPanel,
  update,
}) {
  const state = generatorState || resolveNodeGenerator(activeNode, nodes, edges, models);
  const {
    modelList,
    model: currentModel,
    schema,
    params: resolved,
    inputCounts,
    mediaModes,
    mediaValidation,
    locks,
    modelKeys,
    configLocked,
  } = state;
  const promptConfig = generatorPrompt(schema, resolved.modeType);
  const changeParams = (next) => {
    if (onParamsChange) return onParamsChange(next);
    if (readonly) return;
    const nextState = resolveNodeGenerator(
      { ...activeNode, data: { ...activeNode.data, params: next } },
      nodes,
      edges,
      models,
      { metadata: mediaProbe?.metadata },
    );
    if (!nextState.schema) return false;
    const normalized = nextState.params;
    update(activeNode.id, {
      params: normalized,
      generationError: '',
      ...(activeNode.type === 'text' ? { text: normalized.prompt } : {}),
    });
  };
  const selectableModes =
    activeNode.type === 'video' ||
    (activeNode.type === 'audio' &&
      schema?.config?.textModes?.length > 1 &&
      !Object.values(inputCounts).some(Boolean));
  const modeLabel = (mode) =>
    ({
      text2audio: '描述生音乐',
      lyrics2audio: '歌词生音乐',
      image2audio: '图片生音频',
      audio2audio: '音频参考',
    })[mode.key] || mode.label;
  const warning = mediaModes.all.find((mode) => mode.key === resolved.modeType)?.warningReason;
  return (
    <aside className="cv-settings">
      <header>
        <div>
          {React.createElement(typeInfo(activeNode.type).icon, { size: 17 })}
          <strong>
            {typeInfo(activeNode.type).label}
            {activeNode.type === 'text' ? '节点' : '生成器'}
          </strong>
        </div>
        <button aria-label="关闭节点设置" onClick={() => setPanel(null)}>
          <X size={18} />
        </button>
      </header>
      <label>
        名称
        <input
          value={activeNode.data.name || ''}
          readOnly={readonly}
          onChange={(e) => update(activeNode.id, { name: e.target.value })}
        />
      </label>
      <label>
        提示词
        <textarea
          rows={7}
          placeholder={promptConfig.placeholder || '描述你想生成的内容'}
          maxLength={promptConfig.maxLength > 0 ? promptConfig.maxLength : undefined}
          value={resolved.prompt}
          readOnly={readonly || !schema}
          onChange={(e) => changeParams({ ...resolved, prompt: e.target.value })}
        />
      </label>
      <div className="cv-settings-refs">
        <span>参考素材</span>
        <button disabled={readonly} onClick={openLibrary}>
          <Plus size={15} />
          从资产库添加
        </button>
        <p>连接画布上的节点作为参考素材</p>
        {edges
          .filter((e) => e.target === activeNode.id)
          .map((e) => (
            <div key={e.id}>
              <Link2 size={14} />
              {nodes.find((n) => n.id === e.source)?.data?.name || '参考节点'}
            </div>
          ))}
      </div>
      <label>
        模型
        <select
          value={currentModel}
          disabled={readonly || !models}
          onChange={(e) => changeParams({ ...resolved, model: e.target.value })}
        >
          {(!modelList[currentModel] || (modelKeys && !modelKeys.includes(currentModel))) && (
            <option value={currentModel}>{currentModel || '模型配置加载中'}</option>
          )}
          {Object.entries(modelList)
            .filter(([key]) => !modelKeys || modelKeys.includes(key))
            .map(([k, m]) => (
              <option value={k} key={k}>
                {m.modelName || k}
              </option>
            ))}
        </select>
      </label>
      {(!schema || modelContent?.error) && (
        <div role="status" className="cv-generator-media-status">
          <p>
            {modelContent?.error
              ? '模型配置加载失败'
              : !models
                ? '模型配置加载中…'
                : '当前模型配置不可用，请选择其他模型'}
          </p>
          {modelContent?.error && (
            <button type="button" onClick={() => modelContent.reload().catch(() => {})}>
              重新加载模型配置
            </button>
          )}
        </div>
      )}
      {selectableModes && mediaModes.visible.length > 0 && (
        <label>
          生成模式
          <select
            value={resolved.modeType}
            disabled={readonly || locks.modeLocked}
            onChange={(event) => changeParams({ ...resolved, modeType: event.target.value })}
          >
            {!mediaModes.visible.some((mode) => mode.key === resolved.modeType) && (
              <option value={resolved.modeType}>
                {modeLabel(
                  mediaModes.all.find((mode) => mode.key === resolved.modeType) || {
                    key: resolved.modeType,
                    label: resolved.modeType,
                  },
                )}
              </option>
            )}
            {mediaModes.visible.map((mode) => (
              <option
                key={mode.key}
                value={mode.key}
                disabled={!mode.enabled}
                title={mode.disabledReason || mode.warningReason}
              >
                {modeLabel(mode)}
                {mode.badge ? ` · ${mode.badge}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {warning && <p className="cv-generator-media-status">{warning}</p>}
      {mediaProbe?.pending && (
        <p role="status" className="cv-generator-media-status">
          正在读取参考素材…
        </p>
      )}
      {!mediaProbe?.pending && mediaValidation.unresolved.length > 0 && (
        <div className="cv-generator-media-status" role="status">
          <p>参考素材元数据尚未验证</p>
          {mediaProbe && (
            <button type="button" onClick={mediaProbe.retry}>
              重新读取素材
            </button>
          )}
        </div>
      )}
      {mediaValidation.warnMessages.map((message) => (
        <p key={message} className="cv-generator-media-status">
          {message}
        </p>
      ))}
      <GeneratorSettings
        key={activeNode.id + ':' + currentModel + ':' + resolved.modeType}
        params={resolved}
        locks={locks}
        voiceSource={voiceSource}
        schema={schema}
        type={activeNode.type}
        inputCounts={inputCounts}
        disabled={readonly || configLocked}
        onChange={changeParams}
      />
      {activeNode.data.generationError && (
        <p className="cv-generation-error">{activeNode.data.generationError}</p>
      )}
      <footer>
        {readonly ? (
          <button className="cv-primary" onClick={copyCanvas}>
            复制画布开始创作
          </button>
        ) : (
          <button className="cv-primary" onClick={generate} disabled={!schema}>
            <Sparkles size={16} />
            生成 <span>积分</span>
          </button>
        )}
      </footer>
    </aside>
  );
}
