import React from 'react';
import Icon from '../../../components/Icon.jsx';
import RichAgentInput from '../../../components/agent/RichAgentInput.jsx';
import ModelMenu from './ModelMenu.jsx';
import SkillPicker from '../../../components/skills/SkillPicker.jsx';
import { canSubmitSkill, SKILL_ATTACHMENT_ACCEPT } from '../domain/handoff.js';
import { isAgentReference } from '../../../services/agent-content.js';
import { CHAT_MODEL_CATALOGUE } from '../../../services/agent-model-catalogue.js';
import { searchAgentSkills } from '../../../services/agent-catalogue.js';
import { skillReferenceId } from '../../../services/agent-handoff.js';

export default function SkillComposer({
  controller,
  catalogueResource,
  data,
  recommended,
  drafts,
  favs,
  openDetail,
  user,
  login,
  toast,
}) {
  const {
    parts,
    setParts,
    liveParts,
    input,
    file,
    composer,
    skillTrigger,
    menu,
    setMenu,
    dryRun,
    setDryRun,
    setAssetPicker,
    setAllSkills,
    setPreview,
    attached,
    uploadAttachment,
    uploadFiles,
    removeAttachment,
    selectSkill,
    createSkill,
    send,
  } = controller;
  return (
    <section className="skill-hero">
      <h1>说个想法。或者，选个 Skill</h1>
      <div className="prompt-box" ref={composer}>
        <RichAgentInput
          ref={input}
          parts={parts}
          placeholder="请输入你的创作灵感，或从下方挑选一个 Skill 开始"
          onChange={setParts}
          onPreview={setPreview}
          onSubmit={() => {
            if (canSubmitSkill({ parts: liveParts.current })) send();
          }}
          onFiles={(files) => uploadFiles({ target: { files, value: '' } })}
          searchSkills={async (query) =>
            searchAgentSkills(data.items, recommended, query).map((item) => ({
              type: 'skill',
              id: skillReferenceId(item),
              name: item.name,
            }))
          }
          mentionItems={[
            ...Object.entries(CHAT_MODEL_CATALOGUE).flatMap(([modality, models]) =>
              models.map((item) => ({
                type: 'model',
                id: item.modelKey,
                name: item.modelName,
                modality,
              })),
            ),
            ...parts.filter(isAgentReference),
          ]}
        />
        {attached.some((item) => item.status !== 'ready') && (
          <div className="attached-chips">
            {attached
              .filter((item) => item.status !== 'ready')
              .map((f) => (
                <span key={f.id}>
                  {f.name}
                  {f.status === 'uploading'
                    ? ' · 上传中...'
                    : f.status === 'error'
                      ? ` · ${f.error}`
                      : ''}
                  {f.status === 'error' && (
                    <button aria-label={`重试 ${f.name}`} onClick={() => uploadAttachment(f)}>
                      重试
                    </button>
                  )}
                  <button aria-label={`移除 ${f.name}`} onClick={() => removeAttachment(f.id)}>
                    <Icon name="close-s" size={12} />
                  </button>
                </span>
              ))}
          </div>
        )}
        <div className="prompt-tools">
          <div className="prompt-tool-left">
            <div className="popover-anchor">
              <button
                title="添加附件"
                className="icon-button"
                onClick={() => setMenu(menu === 'attach' ? null : 'attach')}
              >
                <Icon name="add" size={22} />
              </button>
              {menu === 'attach' && (
                <div className="popover attachment-menu">
                  <button
                    onClick={() => {
                      if (!user) return login();
                      file.current?.click();
                      setMenu(null);
                    }}
                  >
                    <Icon name="file-input" />
                    本地上传
                  </button>
                  <button
                    aria-haspopup="dialog"
                    onClick={() => {
                      if (!user) return login();
                      setAssetPicker(true);
                      setMenu(null);
                    }}
                  >
                    <Icon name="assets" />
                    从资产库添加
                  </button>
                </div>
              )}
            </div>
            <input
              type="file"
              multiple
              accept={SKILL_ATTACHMENT_ACCEPT}
              hidden
              ref={file}
              onChange={uploadFiles}
            />
            <div className="popover-anchor">
              <button
                title="选择模型"
                className="icon-button"
                onClick={() => setMenu(menu === 'model' ? null : 'model')}
              >
                <Icon name="computing" />
              </button>
              {menu === 'model' && (
                <ModelMenu
                  onPick={(m) => {
                    input.current?.insertReference({
                      type: 'model',
                      id: m.modelKey,
                      name: m.label,
                      modality: m.modality,
                    });
                    setMenu(null);
                  }}
                />
              )}
            </div>
            {user && (
              <div className="popover-anchor">
                <button
                  className="icon-button"
                  aria-label="生成模式"
                  onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
                >
                  {dryRun ? '手动生成' : '自动生成'}
                </button>
                {menu === 'mode' && (
                  <div className="popover attachment-menu">
                    {[
                      [true, '手动生成', 'Agent 每次生成前询问'],
                      [false, '自动生成', 'Agent 可直接消耗积分'],
                    ].map(([value, label, description]) => (
                      <button
                        key={label}
                        title={description}
                        aria-pressed={dryRun === value}
                        onClick={() => {
                          if (!setDryRun(value)) toast?.('本地保存失败');
                          setMenu(null);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="popover-anchor">
              <button
                ref={skillTrigger}
                title="Skill"
                aria-haspopup="dialog"
                aria-expanded={menu === 'skill'}
                className="icon-button"
                onClick={() => setMenu(menu === 'skill' ? null : 'skill')}
              >
                <Icon name="skill" />
              </button>
              {menu === 'skill' && (
                <SkillPicker
                  catalogue={data.items}
                  recommended={recommended}
                  drafts={drafts}
                  favorites={favs}
                  commonIds={data.commonSkillTemplateUuids}
                  user={user}
                  login={login}
                  triggerRef={skillTrigger}
                  onSelect={selectSkill}
                  onDetail={openDetail}
                  onAll={() => {
                    skillTrigger.current?.focus();
                    setMenu(null);
                    setAllSkills(true);
                  }}
                  onCreate={createSkill}
                  loading={catalogueResource.loading && !catalogueResource.data}
                  error={catalogueResource.error}
                  onRetry={() => void catalogueResource.reload().catch(() => undefined)}
                />
              )}
            </div>
          </div>
          <button
            className="send-button"
            aria-label="发送"
            disabled={!canSubmitSkill({ parts })}
            onClick={send}
          >
            <Icon name="arrow" size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
