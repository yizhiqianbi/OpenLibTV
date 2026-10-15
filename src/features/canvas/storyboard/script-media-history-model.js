import { reconcileScriptPromptRefsForTextEdit } from './prompt-compose-model.js';
import { storyboardRowHashes } from './prompt-state.js';

const versionField = (kind) =>
  kind === 'image' ? 'imageVersions' : kind === 'video' ? 'videoVersions' : null;

const inferredState = (row, track) =>
  (track === 'image' ? row.imageGenerationPrompt : row.videoMotionPrompt)?.trim()
    ? 'synced'
    : 'none';

// 52013 strips only recognized markers. Spoken text has a stricter trailing boundary
// than the prompt lexer: even a Chinese name followed by an ASCII letter is rejected.
function stripSpokenAssetMarkers(text, refs, assets) {
  if (!text) return text;
  const names = new Set((refs ?? []).map((ref) => ref.text.trim()).filter(Boolean));
  for (const bucket of ['characters', 'scenes', 'props'])
    for (const asset of Array.isArray(assets?.[bucket]) ? assets[bucket] : [])
      if (typeof asset?.name === 'string' && asset.name.trim()) names.add(asset.name.trim());
  const ordered = [...names].sort((a, b) => b.length - a.length);
  const ascii = (value) => /^[a-zA-Z0-9]$/.test(value);
  let output = '';
  let index = 0;
  while (index < text.length) {
    if ((text[index] === '@' || text[index] === '＠') && !ascii(text[index - 1] ?? '')) {
      const name = ordered.find(
        (name) => text.startsWith(name, index + 1) && !ascii(text[index + 1 + name.length] ?? ''),
      );
      if (name) {
        output += name;
        index += 1 + name.length;
        continue;
      }
    }
    output += text[index];
    index += 1;
  }
  return output;
}

function syncSpokenText(row, assets) {
  const dialogue = [];
  const voiceover = [];
  for (const line of row.dialogueLines ?? []) {
    const text = stripSpokenAssetMarkers(line.text, line.entityRefs, assets);
    if (text) (line.kind === 'voiceover' ? voiceover : dialogue).push(text);
  }
  const spoken = { dialogue: dialogue.join('\n'), voiceover: voiceover.join('\n') };
  return (row.dialogue ?? '') === spoken.dialogue && (row.voiceover ?? '') === spoken.voiceover
    ? row
    : { ...row, ...spoken };
}

function initializeHistoryPromptState(row) {
  let value = row;
  if (row.promptState != null) {
    const { promptState, ...rest } = row;
    value = rest;
    if (row.imagePromptState == null && row.videoPromptState == null) {
      const legacy = ['none', 'synced', 'stale'].includes(promptState) ? promptState : undefined;
      value = {
        ...rest,
        imagePromptState: legacy ?? inferredState(row, 'image'),
        videoPromptState: legacy ?? inferredState(row, 'video'),
      };
    }
  }
  const state = (track) => {
    const current = value[`${track}PromptState`];
    return ['none', 'synced', 'stale', 'generating'].includes(current)
      ? current
      : inferredState(value, track);
  };
  const hashes = storyboardRowHashes(value);
  const imagePromptState = state('image');
  const videoPromptState = state('video');
  return value === row &&
    row.textHash === hashes.textHash &&
    row.payloadHash === hashes.payloadHash &&
    row.imagePromptState === imagePromptState &&
    row.videoPromptState === videoPromptState
    ? row
    : { ...value, ...hashes, imagePromptState, videoPromptState };
}

// Source 939279's explicit state branch preserves both incoming tracks if either
// state was intentionally changed. The general table helper has different semantics.
function reconcileHistoryPromptState(previous, rows) {
  const oldById = new Map(previous.filter((row) => row.id).map((row) => [row.id, row]));
  let changed = false;
  const next = rows.map((row) => {
    const old = oldById.get(row.id);
    let value;
    if (!old) value = initializeHistoryPromptState(row);
    else {
      const hashes = storyboardRowHashes(row);
      const explicitState =
        (row.imagePromptState != null && row.imagePromptState !== old.imagePromptState) ||
        (row.videoPromptState != null && row.videoPromptState !== old.videoPromptState);
      if (explicitState) {
        value =
          old.textHash === hashes.textHash &&
          old.payloadHash === hashes.payloadHash &&
          old.imagePromptState === row.imagePromptState &&
          old.videoPromptState === row.videoPromptState
            ? old
            : { ...row, ...hashes };
      } else {
        const inputsChanged =
          (old.textHash != null && old.textHash !== hashes.textHash) ||
          (old.payloadHash != null && old.payloadHash !== hashes.payloadHash);
        const state = (track) => {
          const current = old[`${track}PromptState`];
          if (current == null) return inferredState(row, track);
          return inputsChanged && ['synced', 'stale'].includes(current) ? 'stale' : current;
        };
        const imagePromptState = state('image');
        const videoPromptState = state('video');
        value =
          old === row &&
          old.textHash === hashes.textHash &&
          old.payloadHash === hashes.payloadHash &&
          old.imagePromptState === imagePromptState &&
          old.videoPromptState === videoPromptState
            ? old
            : { ...row, ...hashes, imagePromptState, videoPromptState };
      }
    }
    if (value !== row) changed = true;
    return value;
  });
  return changed ? next : rows;
}

/** Source tk: renumber → text refs → dialogueLines → independent state/hash. */
export function reconcileScriptMediaHistoryRows(previous, rows, assets) {
  if (!rows.length) return rows;
  const normalized = rows.map((row, index) => {
    let value = row.shotNumber === index + 1 ? row : { ...row, shotNumber: index + 1 };
    const old = previous.find((old) => old.id === row.id);
    if (old) {
      const fields = [
        ['plotDescription', 'plotDescriptionEntityRefs', old.plotDescriptionEntityRefs],
        [
          'imageGenerationPrompt',
          'finalImagePromptEntityRefs',
          row.finalImagePromptEntityRefs ?? old.finalImagePromptEntityRefs,
        ],
        [
          'videoMotionPrompt',
          'finalVideoPromptEntityRefs',
          row.finalVideoPromptEntityRefs ?? old.finalVideoPromptEntityRefs,
        ],
      ];
      const patch = {};
      for (const [textField, refField, oldRefs] of fields) {
        const refs = reconcileScriptPromptRefsForTextEdit({
          oldText: textField === 'plotDescription' ? old[textField] : (old[textField] ?? ''),
          newText: textField === 'plotDescription' ? value[textField] : (value[textField] ?? ''),
          oldRefs,
          assets,
        });
        if (refs !== value[refField]) patch[refField] = refs;
      }
      if (Object.keys(patch).length) value = { ...value, ...patch };
    }
    return syncSpokenText(value, assets);
  });
  return reconcileHistoryPromptState(previous, normalized);
}

/** Source tR/tP projects active flags, then commits through the full tk pipeline. */
export function setActiveScriptMediaVersion(rows, rowId, kind, versionId, assets) {
  const field = versionField(kind);
  if (!Array.isArray(rows) || !field || rowId == null || versionId == null) return rows;
  const index = rows.findIndex((row) => row?.id === rowId);
  if (index < 0) return rows;
  const row = rows[index];
  const versions = row[field];
  if (!Array.isArray(versions) || versions.length === 0) return rows;
  const chosen = versions.find((version) => version?.versionId === versionId);
  if (
    !chosen ||
    (chosen.isActive &&
      versions.every((version) => version?.versionId === versionId || !version?.isActive))
  )
    return rows;
  const nextVersions = versions.map((version) => {
    if (!version) return version;
    const isActive = version.versionId === versionId;
    return version.isActive === isActive ? version : { ...version, isActive };
  });
  const next = rows.slice();
  next[index] = { ...row, [field]: nextVersions };
  return reconcileScriptMediaHistoryRows(rows, next, assets);
}

const taskStatusNumber = (status) => {
  if (typeof status === 'number') return Number.isFinite(status) ? status : undefined;
  if (typeof status === 'string' && status.trim() !== '') {
    const value = Number(status);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
};

/** Source 182004 FAILED=3/TIMEOUT=4 and sM/oK hide failure metadata while generating. */
export function scriptPromptFailureInfo(taskInfo, generating = false) {
  const status = taskStatusNumber(taskInfo?.status);
  return !generating && (status === 3 || status === 4)
    ? { taskId: taskInfo.taskId, failedReason: taskInfo.failedReason }
    : null;
}
