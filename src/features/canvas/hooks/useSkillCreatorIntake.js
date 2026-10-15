import { useEffect, useRef } from 'react';
import { updateAgentDraftText } from '../domain/agent-draft.js';
import {
  createSkillCreatorIntent,
  cleanSkillCreatorHref,
  skillCreatorRequest,
} from '../domain/skill-creator.js';

/** The real Agent is not connected; persist the creation request instead of faking a Skill. */
export function useSkillCreatorIntake({
  path,
  documentKey,
  requested,
  ready,
  readonly,
  context,
  prompt,
  draft,
  setDraft,
  navigate,
  setAgentOpen,
}) {
  const consumed = useRef(new Set());
  const latest = useRef({ context, prompt, draft, setDraft, navigate, setAgentOpen });
  latest.current = { context, prompt, draft, setDraft, navigate, setAgentOpen };
  useEffect(() => {
    if (!requested || !ready || readonly || consumed.current.has(documentKey)) return;
    consumed.current.add(documentKey);
    const current = latest.current;
    current.setAgentOpen(true);
    if (!current.draft?.skillCreatorIntent) {
      const intent = createSkillCreatorIntent(current.context);
      current.setDraft((previous) => ({
        ...updateAgentDraftText(previous, current.prompt),
        skillCreatorIntent: intent,
      }));
    }
    current.navigate?.(cleanSkillCreatorHref(path), { replace: true });
  }, [path, documentKey, requested, ready, readonly]);

  const intent = draft?.skillCreatorIntent;
  const submit = (action) => {
    if (!ready || readonly || !intent?.options.some((option) => option.key === action)) return;
    setDraft((previous) => ({
      ...previous,
      skillCreatorIntent: {
        ...previous.skillCreatorIntent,
        status: 'blocked',
        action,
        request: skillCreatorRequest(action, intent.context),
        attempts: (intent.attempts || 0) + 1,
        submittedAt: Date.now(),
      },
    }));
  };
  const dismiss = () => {
    if (!intent) return;
    setDraft((previous) => ({
      ...previous,
      skillCreatorIntent: { ...previous.skillCreatorIntent, status: 'dismissed' },
    }));
  };
  return { intent, submit, dismiss };
}
