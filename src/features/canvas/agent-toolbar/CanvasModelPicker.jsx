import { useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import { CHAT_MODEL_CATALOGUE } from '../../../services/agent-model-catalogue.js';
import {
  AGENT_TOOLBAR_MODALITIES,
  getAgentToolbarModels,
  getAgentToolbarBenefits,
  resolveToolbarModelDisable,
} from '../../../services/agent-toolbar-models.js';
import ToolbarIcon from './ToolbarIcon.jsx';
import ToolbarTooltip from './ToolbarTooltip.jsx';
import './toolbar.css';

const labels = { image: '图片', video: '视频' };
function ModelIcon({ icon, modality, asset }) {
  const [failed, setFailed] = useState(false);
  const url = asset ? asset(icon) : icon;
  return icon && !failed && /^(https?:|data:|\/)/.test(url || '') ? (
    <img src={url} alt="" onError={() => setFailed(true)} />
  ) : (
    <ToolbarIcon name={modality === 'image' ? 'image' : 'video'} size={18} />
  );
}

/** Each selection inserts a prompt model tag; there is deliberately no selected-model state. */
export default function CanvasModelPicker({
  onSelect,
  models = CHAT_MODEL_CATALOGUE,
  allowlist,
  benefits = [],
  onRefreshBenefits,
  asset,
  language = 'zh',
  disabled = false,
  trigger = 'click',
}) {
  const titleId = useId();
  const scrollRef = useRef(null);
  const sections = useRef({});
  const [modality, setModality] = useState('image');
  const groups = useMemo(() => getAgentToolbarModels(models, allowlist), [models, allowlist]);
  const badges = useMemo(
    () =>
      getAgentToolbarBenefits(
        AGENT_TOOLBAR_MODALITIES.flatMap((type) => groups[type].map((model) => model.modelKey)),
        benefits,
      ),
    [groups, benefits],
  );
  const popover = useAgentToolbarPopover({
    width: 370,
    maxHeight: 384,
    trigger,
    disabled,
    onOpen: onRefreshBenefits,
  });
  const changeTab = (value) => {
    setModality(value);
    queueMicrotask(() => {
      const scroll = scrollRef.current;
      const section = sections.current[value];
      if (!scroll || !section) return;
      const top =
        scroll.scrollTop + section.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      scroll.scrollTo?.({ top, behavior: 'smooth' });
    });
  };
  const select = (model, type) => {
    onSelect?.({
      modelKey: model.modelKey,
      label: model.modelName,
      modality: type,
      description: model.description,
      icon: model.icon,
    });
    popover.close();
  };
  const total = AGENT_TOOLBAR_MODALITIES.reduce((sum, type) => sum + groups[type].length, 0);
  return (
    <>
      <ToolbarTooltip label="选择模型" withArrow>
        <button
          type="button"
          ref={popover.triggerRef}
          className="cv-agent-toolbar-trigger"
          aria-label="选择模型"
          disabled={disabled}
          {...popover.triggerProps}
        >
          <ToolbarIcon name="prompt-composer-model" />
        </button>
      </ToolbarTooltip>
      {popover.open &&
        createPortal(
          <div
            ref={popover.popoverRef}
            {...popover.popoverProps}
            role="dialog"
            aria-labelledby={titleId}
            className="cv-agent-toolbar-popover cv-agent-model-picker"
            style={popover.popoverStyle}
          >
            <div className="cv-agent-model-content">
              <span id={titleId} className="cv-agent-model-title">
                选择模型
              </span>
              <div className="cv-agent-model-tabs" role="group" aria-label="模型类型">
                {AGENT_TOOLBAR_MODALITIES.map((type) => (
                  <button
                    type="button"
                    key={type}
                    aria-pressed={modality === type}
                    onClick={() => changeTab(type)}
                  >
                    {labels[type]}
                  </button>
                ))}
              </div>
              <div ref={scrollRef} className="cv-agent-model-scroll">
                {total === 0 ? (
                  <div className="cv-agent-model-empty">暂无模型</div>
                ) : (
                  <div className="cv-agent-model-sections">
                    {AGENT_TOOLBAR_MODALITIES.map((type) => (
                      <section
                        key={type}
                        ref={(element) => {
                          sections.current[type] = element;
                        }}
                      >
                        <div className="cv-agent-model-section-title">{labels[type]}</div>
                        <div className="cv-agent-model-rows">
                          {groups[type].length === 0 ? (
                            <div className="cv-agent-model-empty-group">暂无模型</div>
                          ) : (
                            groups[type].map((model) => {
                              const state = resolveToolbarModelDisable(model.disable, language);
                              const badge = badges.get(model.modelKey);
                              return (
                                <ToolbarTooltip
                                  key={`${type}-${model.modelKey}`}
                                  label={state.reason}
                                  position="right"
                                  maxWidth={240}
                                  withArrow
                                  className="cv-agent-model-row-wrap"
                                >
                                  <button
                                    type="button"
                                    className="cv-agent-model-row"
                                    disabled={state.disabled}
                                    aria-label={`添加模型 ${model.modelName}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!state.disabled) select(model, type);
                                    }}
                                  >
                                    <span className="cv-agent-model-icon">
                                      <ModelIcon icon={model.icon} modality={type} asset={asset} />
                                    </span>
                                    <span className="cv-agent-model-copy">
                                      <span className="cv-agent-model-name-line">
                                        <span className="cv-agent-model-name">
                                          {model.modelName}
                                        </span>
                                        {model.vip && (
                                          <ToolbarIcon
                                            name="icon-premium-filled"
                                            size={14}
                                            className="cv-agent-model-vip"
                                          />
                                        )}
                                        {badge?.label && (
                                          <ToolbarTooltip label={badge.badgeTooltip}>
                                            <span className="cv-agent-model-benefit">
                                              {badge.label}
                                            </span>
                                          </ToolbarTooltip>
                                        )}
                                      </span>
                                      {model.description && (
                                        <span className="cv-agent-model-description">
                                          {model.description}
                                        </span>
                                      )}
                                    </span>
                                    <span className="cv-agent-model-add">
                                      <ToolbarIcon name="plus-s" size={8} />
                                    </span>
                                  </button>
                                </ToolbarTooltip>
                              );
                            })
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
