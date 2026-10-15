import { canvasMessageRole } from '../domain/canvas-agent-message.ts';
import { isMessageFeedbackControl } from './message-action-model.js';

/** A completed local transcript groups assistant records between user prompts. */
export function assistantTurnScopes(messages) {
  const scopes = new Map();
  let turn = [];
  const flush = () => {
    if (!turn.length) return;
    const last = turn.at(-1);
    scopes.set(last.index, {
      messages: turn.map(({ message }) => message),
      targetMessageId: last.message.id,
      canCopy: true,
    });
    turn = [];
  };
  messages.forEach((message, index) => {
    if (isMessageFeedbackControl(message)) return;
    const role = canvasMessageRole(message);
    if (role === 'user') flush();
    else if (role === 'assistant') turn.push({ message, index });
  });
  flush();
  return scopes;
}
