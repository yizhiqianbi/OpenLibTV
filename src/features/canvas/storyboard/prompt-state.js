// Public module 939279: separate image/video state; hashes are source-compatible FNV-1a.
const hash = (value) => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x1000193);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};
const refs = (values) => (values || []).map((value) => `${value.text}|${value.assetId}`).join(',');
const ids = (values) => [...(values || [])].sort().join(',');
const inferred = (row, track) =>
  (track === 'image' ? row.imageGenerationPrompt : row.videoMotionPrompt)?.trim()
    ? 'synced'
    : 'none';
export function storyboardRowHashes(row) {
  const cinematics = row.cinematics;
  return {
    textHash: hash(
      [
        row.plotDescription ?? '',
        refs(row.plotDescriptionEntityRefs),
        row.shotSize ?? '',
        cinematics
          ? [
              cinematics.shotSize ?? '',
              cinematics.cameraMovement ?? '',
              cinematics.lighting ?? '',
            ].join('|')
          : '',
        (row.dialogueLines || [])
          .map(
            (line) =>
              `${line.characterRef ?? ''}|${line.kind ?? ''}|${line.text ?? ''}|${JSON.stringify(line.entityRefs ?? [])}`,
          )
          .join('\n'),
        ids(row.sceneAssetIds),
        ids(row.propAssetIds),
        row.lightingAndAtmosphere ?? '',
        row.audioEffects ?? '',
        row.dialogue ?? '',
        row.voiceover ?? '',
        row.bgm ?? '',
        row.sfx ?? '',
        refs(row.finalVideoPromptEntityRefs),
        refs(row.finalImagePromptEntityRefs),
      ].join(''),
    ),
    payloadHash: hash(
      [
        (row.characters || [])
          .map((character) => character.characterImageUrl ?? '')
          .filter(Boolean)
          .join(''),
        row.videoReference?.referenceFrameImage ?? '',
        ids(row.sceneAssetIds),
        ids(row.propAssetIds),
      ].join(''),
    ),
  };
}
export function initializeStoryboardPromptState(row) {
  const { promptState, ...rest } = row;
  const value = promptState == null ? row : rest;
  const state = (track) => {
    let current = value[`${track}PromptState`];
    if (current == null && ['none', 'synced', 'stale'].includes(promptState)) current = promptState;
    return ['none', 'synced', 'stale', 'generating'].includes(current)
      ? current
      : inferred(value, track);
  };
  return {
    ...value,
    ...storyboardRowHashes(value),
    imagePromptState: state('image'),
    videoPromptState: state('video'),
  };
}
export function reconcileStoryboardPromptState(previous, rows) {
  const byId = new Map(previous.filter((row) => row.id).map((row) => [row.id, row]));
  return rows.map((row) => {
    const old = byId.get(row.id);
    if (!old) return initializeStoryboardPromptState(row);
    const hashes = storyboardRowHashes(row);
    const changed =
      (old.textHash != null && old.textHash !== hashes.textHash) ||
      (old.payloadHash != null && old.payloadHash !== hashes.payloadHash);
    const state = (track) => {
      const key = `${track}PromptState`;
      if (row[key] != null && row[key] !== old[key]) return row[key];
      const value = old[key] ?? inferred(row, track);
      return changed && ['synced', 'stale'].includes(value) ? 'stale' : value;
    };
    return {
      ...row,
      ...hashes,
      imagePromptState: state('image'),
      videoPromptState: state('video'),
    };
  });
}
