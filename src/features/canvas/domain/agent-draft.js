import { updateAgentContentText, removeAgentReference } from '../../../services/agent-content.js';

/** Keep the structured references when the plain-text composer is edited. */
export function updateAgentDraftText(draft, prompt) {
  return updateAgentContentText(draft, prompt);
}

export function removeAgentDraftReference(draft, reference) {
  return removeAgentReference(draft, reference);
}

export function agentDraftReferences(draft) {
  return Array.isArray(draft?.parts)
    ? draft.parts.filter((part) => part && part.type !== 'text')
    : [];
}
