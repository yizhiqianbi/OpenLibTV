import React, { useState, useRef } from 'react';
import Icon from '../../../components/Icon.jsx';
import { asset } from '../../../data.js';
import { CHAT_MODEL_CATALOGUE } from '../../../services/agent-model-catalogue.js';
import { groupChatModels, resolveModelDisable } from '../domain/model-picker.js';

export default function ModelMenu({
  onPick,
  support = CHAT_MODEL_CATALOGUE,
  allowlist,
  lang = 'zh',
}) {
  const [type, setType] = useState('image');
  const list = useRef();
  const groups = groupChatModels(support, allowlist);
  const pickType = (modality) => {
    setType(modality);
    const section = list.current?.querySelector(`[data-model-section="${modality}"]`);
    if (section)
      list.current.scrollTo?.({
        top:
          list.current.scrollTop +
          section.getBoundingClientRect().top -
          list.current.getBoundingClientRect().top,
        behavior: 'smooth',
      });
  };
  return (
    <div className="popover model-menu">
      <strong>选择模型</strong>
      <div className="segmented">
        {[
          ['image', '图片'],
          ['video', '视频'],
        ].map(([key, label]) => (
          <button className={key === type ? 'active' : ''} onClick={() => pickType(key)} key={key}>
            {label}
          </button>
        ))}
      </div>
      <div className="model-options" ref={list}>
        {Object.entries(groups).flatMap(([modality, models]) => [
          <strong key={modality} data-model-section={modality}>
            {modality === 'image' ? '图片' : '视频'}
          </strong>,
          ...models.map((model) => {
            const { disabled, reason } = resolveModelDisable(model.disable, lang);
            return (
              <button
                disabled={disabled}
                title={reason || undefined}
                aria-label={`添加 ${model.modelName}`}
                onClick={() =>
                  onPick({
                    modelKey: model.modelKey,
                    label: model.modelName,
                    modality,
                    description: model.description,
                    icon: model.icon,
                  })
                }
                key={model.modelKey}
              >
                <span className="model-glyph">
                  {/^https?:\/\//.test(model.icon || '') ? (
                    <img src={asset(model.icon)} alt="" width="18" height="18" />
                  ) : (
                    <Icon name="computing" size={24} />
                  )}
                </span>
                <span>
                  {model.modelName}
                  {model.vip && (
                    <span title="会员专属" aria-label="会员专属">
                      {' '}
                      ♛
                    </span>
                  )}
                  <small>{model.description}</small>
                </span>
                <Icon name="add" size={16} />
              </button>
            );
          }),
        ])}
        {!groups.image.length && !groups.video.length && <p>暂无可用模型</p>}
      </div>
    </div>
  );
}
