import { useMemo, useRef, useState } from 'react';
import { useLocalState } from '../../../hooks/useLocalState.ts';
import { createLocalId } from '../../editor/model.js';
import {
  resolveAgentModeConfig,
  buildAgentModeMetadata,
} from '../../../services/agent-mode-config.js';
import { canSubmitSkill } from '../../../services/agent-handoff.js';
import {
  agentDraftFromParts,
  agentPlainText,
  appendAgentReferences,
} from '../../../services/agent-content.js';
import { updateAgentDraftText } from '../domain/agent-draft.js';
import { createSkillCreatorIntent } from '../domain/skill-creator.js';
import { serverConnected, ServiceError } from '../../../services/api-client.ts';
import { createAgentRunRequest, runAgent } from '../../../services/agent-api.js';

/** These setters also form the document loader's restoration boundary. */
export function useCanvasAgentState(projectId) {
  const [prompt, setPrompt] = useState('');
  const [agentDraft, setAgentDraft] = useState(null);
  const [agentConfig, setAgentConfig] = useState({});
  const [messages, setMessages] = useState([]);
  const [preference] = useLocalState('libtv-agent-dry-run', true);
  const currentAgentDraft = useMemo(
    () => (agentDraft || prompt.trim() ? updateAgentDraftText(agentDraft, prompt) : null),
    [agentDraft, prompt],
  );
  const resolvedAgentConfig = resolveAgentModeConfig({
    preference,
    sessionId: messages.length ? projectId : undefined,
    sessionExtra: messages.find((message) => message.role === 'user')?.metadata,
    override: agentConfig,
    draft: {
      ...(typeof agentDraft?.dryRunIntent === 'boolean' ? { dryRun: agentDraft.dryRunIntent } : {}),
      ...agentConfig,
    },
  });
  return {
    prompt,
    setPrompt,
    agentDraft,
    setAgentDraft,
    agentConfig,
    setAgentConfig,
    messages,
    setMessages,
    currentAgentDraft,
    resolvedAgentConfig,
  };
}

/** Retains ordered request parts; real task execution remains explicitly unavailable. */
export function useCanvasAgentActions({
  state,
  ready,
  readonly,
  busy,
  input,
  setAgentOpen,
  projectId,
  workspaceId,
  title,
  nodes,
  notify,
  agentMode,
}) {
  const {
    prompt,
    setPrompt,
    agentDraft,
    setAgentDraft,
    setAgentConfig,
    messages,
    setMessages,
    currentAgentDraft,
    resolvedAgentConfig,
  } = state;
  const [running, setRunning] = useState(false);
  const runRef = useRef(0);
  const abortRef = useRef(null);
  const writable = ready && !readonly && agentDraft?.skillCreatorIntent?.status !== 'choosing';
  const addMessagePair = (request, reply) =>
    setMessages((previous) => [
      ...previous,
      {
        id: createLocalId(),
        createdAt: Date.now(),
        role: 'user',
        text: agentPlainText(request.parts),
        parts: request.parts,
        metadata: { ...buildAgentModeMetadata(resolvedAgentConfig), ...request.extra },
      },
      { id: createLocalId(), createdAt: Date.now(), role: 'assistant', text: reply },
    ]);
  const addPendingUser = (request) => {
    const userId = createLocalId();
    setMessages((previous) => [
      ...previous,
      {
        id: userId,
        createdAt: Date.now(),
        role: 'user',
        text: agentPlainText(request.parts),
        parts: request.parts,
        metadata: {
          ...buildAgentModeMetadata(resolvedAgentConfig),
          pending: true,
          ...request.extra,
        },
      },
    ]);
    return userId;
  };
  const setRunMessage = (messageId, update) =>
    setMessages((previous) =>
      previous.map((message) => (message.id === messageId ? { ...message, ...update } : message)),
    );
  const send = async () => {
    if (!writable || busy) return;
    if (!canSubmitSkill({ parts: currentAgentDraft?.parts || [{ type: 'text', text: prompt }] }))
      return;
    const draft = updateAgentDraftText(agentDraft, prompt);
    setAgentDraft(draft);
    if (serverConnected) {
      const request = createAgentRunRequest({
        draft,
        projectId,
        nodes,
        agentConfig: resolvedAgentConfig,
        metadata: {
          ...buildAgentModeMetadata(resolvedAgentConfig),
          mode: 'canvas',
          agentMode,
        },
      });
      const userId = addPendingUser(request);
      const token = ++runRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      let assistantId = null;
      let assistantText = '';
      try {
        await runAgent({
          request,
          signal: controller.signal,
          onEvent: (event) => {
            if (token !== runRef.current) return;
            if (event.type === 'message.delta') {
              assistantText += event.delta || '';
              if (!assistantId) {
                assistantId = createLocalId();
                setMessages((previous) => [
                  ...previous,
                  {
                    id: assistantId,
                    createdAt: Date.now(),
                    role: 'assistant',
                    text: assistantText,
                    metadata: { pending: true },
                  },
                ]);
              } else setRunMessage(assistantId, { text: assistantText });
            } else if (event.type === 'message.completed' && event.message) {
              assistantId ||= event.message.id || createLocalId();
              assistantText = event.message.text || assistantText;
              if (assistantId === event.message.id)
                setRunMessage(assistantId, {
                  ...event.message,
                  metadata: { ...event.message.metadata, pending: false },
                });
              else
                setMessages((previous) => [
                  ...previous,
                  {
                    ...event.message,
                    id: assistantId,
                    metadata: { ...event.message.metadata, pending: false },
                  },
                ]);
            } else if (event.type === 'error') {
              throw new ServiceError(event.error?.message || 'Agent 运行失败', {
                code: event.error?.code || 'AGENT_FAILED',
                details: event.error?.details,
              });
            }
          },
        });
        if (token === runRef.current) {
          setRunMessage(userId, {
            metadata: { ...buildAgentModeMetadata(resolvedAgentConfig), sent: true },
          });
          if (assistantId) setRunMessage(assistantId, { metadata: { pending: false } });
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && token === runRef.current) {
          setRunMessage(userId, {
            metadata: {
              ...buildAgentModeMetadata(resolvedAgentConfig),
              error: error.message || 'Agent 运行失败',
            },
          });
          notify(error.message || 'Agent 运行失败，请稍后重试');
        }
      } finally {
        if (token === runRef.current) setRunning(false);
      }
      return;
    }
    addMessagePair(
      draft,
      '当前生成服务尚未连接，暂时无法运行创作任务。你的创作想法、模型、Skill 和参考素材已保留，可以继续编辑。',
    );
  };
  return {
    send,
    running,
    cancel: () => {
      runRef.current += 1;
      abortRef.current?.abort();
      setRunning(false);
    },
    requestClipCompose: (request, skillUseMeta) => {
      if (
        !writable ||
        busy ||
        request?.type !== 'agent-prompt' ||
        !canSubmitSkill({ parts: request.parts })
      )
        return false;
      setAgentOpen(true);
      addMessagePair(
        { ...request, extra: { ...request.extra, clipComposeSkillUseMeta: skillUseMeta } },
        '剪辑请求已保存在本机。当前生成和视频合成服务尚未连接，你可以继续编辑提示词、模式和参考素材。',
      );
      return true;
    },
    onAgentConfigChange: (changes) => {
      if (writable) setAgentConfig((previous) => ({ ...previous, ...changes }));
    },
    onPartsChange: (parts) => {
      if (!writable) return;
      setAgentDraft((previous) => agentDraftFromParts(previous, parts));
      setPrompt(agentPlainText(parts));
    },
    onPromptChange: (value) => {
      if (writable) setPrompt(value);
    },
    onCreateSkill: ({ hasSkill }) => {
      if (!ready || readonly) return false;
      const intent = createSkillCreatorIntent({
        projectId,
        projectName: title,
        workspaceId,
        hasCanvas: nodes.length > 0,
        hasConversation: messages.length > 0,
        hasSkill,
      });
      setAgentDraft((previous) => ({
        ...updateAgentDraftText(previous, prompt),
        skillCreatorIntent: { ...intent, entrySource: 'other' },
      }));
      setAgentOpen(true);
      return true;
    },
    addToChat: (references) => {
      if (!ready || readonly) return;
      if (!writable) {
        notify('请先选择 Skill 创建方式');
        return;
      }
      if (input.current) input.current.insertReferences(references);
      else setAgentDraft((previous) => appendAgentReferences(previous, prompt, references));
      setAgentOpen(true);
    },
    requestSkill: (request) => {
      if (!writable) return;
      setAgentOpen(true);
      addMessagePair(request, 'Skill 创建服务尚未连接，所选节点与创建请求已保留。');
    },
  };
}
