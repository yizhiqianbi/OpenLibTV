import { useMemo, useRef, useState } from 'react';
import CanvasSkillSelector from './CanvasSkillSelector.jsx';
import CanvasAssetSelector from './CanvasAssetSelector.jsx';
import CanvasModelPicker from '../agent-toolbar/CanvasModelPicker.jsx';
import CanvasAgentModePicker from '../agent-toolbar/CanvasAgentModePicker.jsx';
import AgentReferencePreview from '../../../components/agent/AgentReferencePreview.jsx';
import { CanvasAgentMessage } from './CanvasAgentMessage.jsx';
import { assistantTurnScopes } from '../message-actions/assistant-turn-scopes.js';
import RichAgentInput from '../../../components/agent/RichAgentInput.jsx';
import { agentContentReady } from '../../../services/agent-content.js';
import { chatModelPickReference } from '../../../services/agent-toolbar-models.js';
import { asset } from '../../../services/assets.ts';
import { useContent } from '../../../hooks/useContent.ts';
import { canSubmitSkill, skillReferenceId } from '../../../services/agent-handoff.js';
import { searchAgentSkills } from '../../../services/agent-catalogue.js';
import { useCanvasMentions } from '../hooks/useCanvasMentions.js';
import { ArrowRight, ChevronDown, X, Sparkles, Check } from 'lucide-react';

export function CanvasAgentPanel({
  agentMode,
  agentDraft,
  inputRef,
  onPartsChange,
  onFiles,
  fileInput,
  menu,
  messages,
  prompt,
  send,
  setAgentMode,
  setAgentOpen,
  setMenu,
  setPrompt,
  readOnly = false,
  isShareReplay = false,
  loading = false,
  attachmentPending = [],
  attachmentErrors = [],
  children,
  user,
  login,
  toast,
  onCreateSkill,
  nodes,
  projectId,
  view,
  board,
  agentConfig,
  onAgentConfigChange,
}) {
  const [preview, setPreview] = useState(null);
  const skillSelector = useRef();
  const mentions = useCanvasMentions({ nodes, projectId, view, board });
  const catalogue = useContent('skills', null).data;
  const recommended = useContent('skills-recommended', null).data;
  const parts = agentDraft?.parts || [{ type: 'text', text: prompt }];
  const actionScopes = useMemo(() => assistantTurnScopes(messages), [messages]);
  return (
    <aside className="cv-agent">
      <div className="cv-agent-header">
        <Sparkles size={17} />
        <strong>PenStudio Agent</strong>
        <button onClick={() => setMenu(menu === 'agent' ? null : 'agent')}>
          {agentMode}
          <ChevronDown size={12} />
        </button>
        <button aria-label="关闭 Agent" onClick={() => setAgentOpen(false)}>
          <X size={17} />
        </button>
      </div>
      {menu === 'agent' && (
        <div className="cv-agent-modes">
          {['全能创作', '剧本创编', '导演执导'].map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setAgentMode(mode);
                setMenu(null);
              }}
            >
              {mode}
              {agentMode === mode && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
      <div className="cv-agent-body">
        {messages.length ? (
          messages.map((message, index) => (
            <CanvasAgentMessage
              key={message.id ?? index}
              {...{ message, readOnly, isShareReplay, projectId }}
              assistantActions={actionScopes.get(index)}
              onPreview={setPreview}
              onNotify={toast}
            />
          ))
        ) : (
          <div className="cv-agent-welcome">
            <div className="cv-agent-star">✦</div>
            <h2>说个想法。或者，选个 Skill</h2>
            <p>和 PenStudio Agent 一起创作吧！</p>
            <div className="cv-agent-suggestions">
              {['一键生成短 / 漫剧', '一键生成微电影', '角色造型室', '批量创建分镜'].map((x) => (
                <button key={x} disabled={readOnly} onClick={() => setPrompt(x)}>
                  <Sparkles size={14} />
                  {x}
                  <ArrowRight size={13} />
                </button>
              ))}
            </div>
            <button
              className="cv-find-skill"
              disabled={readOnly}
              onClick={() => skillSelector.current?.open()}
            >
              选择 Skill 开始创作 <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="cv-agent-composer">
        {children}
        {loading && <p role="status">项目加载中，完成后即可创作</p>}
        {attachmentPending.length > 0 && (
          <p role="status">
            正在读取参考素材：{attachmentPending.map((file) => file.name).join('、')}
          </p>
        )}
        {attachmentErrors.length > 0 && (
          <div role="alert">
            {attachmentErrors.map((file) => (
              <p key={file.id}>
                {file.name}：{file.message}
              </p>
            ))}
            <button disabled={readOnly} onClick={() => fileInput.current?.click()}>
              重新选择参考素材
            </button>
          </div>
        )}
        <RichAgentInput
          ref={inputRef}
          disabled={readOnly}
          parts={parts}
          onChange={onPartsChange}
          onPreview={setPreview}
          onFiles={onFiles}
          onSubmit={() => {
            if (
              !readOnly &&
              !attachmentPending.length &&
              canSubmitSkill({ parts: inputRef?.current?.getParts() || parts })
            )
              send();
          }}
          searchSkills={async (query) =>
            searchAgentSkills(catalogue?.items, recommended, query).map((item) => ({
              type: 'skill',
              id: skillReferenceId(item),
              name: item.name,
            }))
          }
          mentionSource={mentions.source}
          onMentionOpen={mentions.onOpen}
          onMentionLoadMore={mentions.onLoadMore}
          mentionRefreshKey={mentions.refreshKey}
        />
        <div className="cv-agent-tools">
          <CanvasAssetSelector
            key={projectId}
            {...{ inputRef, fileInput, readOnly, user, login, toast }}
            onOpen={() => setMenu(null)}
          />
          <CanvasSkillSelector
            ref={skillSelector}
            {...{ inputRef, user, login, toast, readOnly }}
            onCreateWithAgent={onCreateSkill}
            onOpen={() => setMenu(null)}
          />
          <CanvasModelPicker
            disabled={readOnly}
            asset={asset}
            onSelect={(pick) => {
              if (!readOnly) inputRef.current?.insertReference(chatModelPickReference(pick));
            }}
          />
          <CanvasAgentModePicker
            agentName="TV Director"
            disabled={readOnly}
            dryRun={agentConfig?.dryRun}
            onSelect={(dryRun) => {
              if (!readOnly) onAgentConfigChange?.({ dryRun });
            }}
          />
          <button
            className="cv-send"
            aria-label="发送创作想法"
            disabled={
              readOnly ||
              !!attachmentPending.length ||
              !agentContentReady(parts) ||
              !canSubmitSkill({ parts })
            }
            onClick={send}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      {preview && <AgentReferencePreview reference={preview} onClose={() => setPreview(null)} />}
      <small className="cv-agent-footnote">AI 生成内容仅供参考</small>
    </aside>
  );
}
