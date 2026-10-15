import {
  applyScriptPromptEdit,
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
  reconcileScriptPromptRefsForTextEdit,
} from '../storyboard/prompt-compose-model.js';
import { patchScriptV2GeneratorPrompt } from '../storyboard/script-generator-model.js';
import { patchCanvasMagicPrompt } from '../generator/magic-metadata-model.js';

/** Drafts only project while their saved baseline still matches the current node. */
export function pendingCanvasDraft(node, draft) {
  if (!node || !draft?.writable) return null;
  if (draft.kind === 'clip-timeline') {
    if (node.type !== 'video-clip' || !Array.isArray(draft.value?.clips)) return null;
    const saved = JSON.stringify(node.data?.clipTimelineData ?? null);
    return saved === draft.baseFingerprint && saved !== JSON.stringify(draft.value) ? draft : null;
  }
  if (draft.kind === 'clip-composer') {
    if (node.type !== 'video-clip') return null;
    const prompt = node.data?.agentComposerData?.prompt ?? '';
    return typeof draft.value === 'string' && prompt === draft.basePrompt && prompt !== draft.value
      ? draft
      : null;
  }
  if (Array.isArray(draft.scriptPrompts)) {
    if ((node.data?.type || node.type) !== 'script-v2') return null;
    const scriptPrompts = draft.scriptPrompts.filter((entry) => {
      if (!['image', 'video'].includes(entry.track) || typeof entry.value !== 'string')
        return false;
      const row = node.data?.rows?.find((item) => item.id === entry.rowId);
      if (!row) return false;
      const bundle = getScriptPromptBundle(row, entry.track);
      return (
        bundle.text !== entry.value &&
        fingerprintScriptPromptBundle(bundle) === entry.baseFingerprint
      );
    });
    return scriptPrompts.length ? { ...draft, scriptPrompts } : null;
  }
  const prompt = node.data?.params?.prompt ?? node.data?.text ?? '';
  return typeof draft.value === 'string' && prompt === draft.basePrompt && prompt !== draft.value
    ? draft
    : null;
}

export function projectCanvasNodeDraft(node, snapshot) {
  const draft = pendingCanvasDraft(node, snapshot);
  if (!draft) return node;
  if (draft.kind === 'clip-timeline')
    return { ...node, data: { ...node.data, clipTimelineData: draft.value } };
  if (draft.kind === 'clip-composer')
    return {
      ...node,
      data: {
        ...node.data,
        agentComposerData: { ...node.data?.agentComposerData, prompt: draft.value },
      },
    };
  if (draft.scriptPrompts) {
    const rows = node.data.rows.map((row) =>
      draft.scriptPrompts.reduce((current, entry) => {
        if (entry.rowId !== row.id) return current;
        const bundle = getScriptPromptBundle(current, entry.track);
        return applyScriptPromptEdit(current, entry.track, {
          text: entry.value,
          entityRefs: reconcileScriptPromptRefsForTextEdit({
            oldText: bundle.text,
            newText: entry.value,
            oldRefs: bundle.entityRefs,
            assets: node.data.assets,
          }),
        });
      }, row),
    );
    return { ...node, data: { ...node.data, rows } };
  }
  return {
    ...node,
    data: {
      ...node.data,
      params:
        node.type === 'script-v2' || node.data?.type === 'script-v2'
          ? patchScriptV2GeneratorPrompt({ params: node.data?.params || {}, prompt: draft.value })
          : patchCanvasMagicPrompt(node.data?.params || {}, draft.value),
      ...(node.type === 'text' ? { text: draft.value } : {}),
    },
  };
}
