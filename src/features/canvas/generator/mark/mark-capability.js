const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const RESOURCE_ACTIONS = new Set([
  'image_resource',
  'video_resource',
  'video_clip_resource',
  'audio_resource',
  'text_resource',
  'script_resource',
  'video_story_resource',
]);

function hasMarkGenerator(node) {
  if (!['image', 'video'].includes(node?.type) || !record(node.data)) return false;
  const data = node.data;
  if (
    ['enhance', 'picture_edit', 'subtitle_erase', 'picture-edit', 'subtitle-erase'].includes(
      data.generatorType,
    )
  )
    return false;
  if (node.type === 'video')
    return (
      !RESOURCE_ACTIONS.has(data.action) ||
      ((!!data.assetVideoAssetId || !!data.assetVideoCompliantExempt) &&
        !data.assetVideoCertifiedInPlace)
    );
  const assetSourced =
    (!!data.portraitAssetId || !!data.portraitCompliantExempt) && !data.portraitCertifiedInPlace;
  return !!(
    (!RESOURCE_ACTIONS.has(data.action) || assetSourced || data.showGenerator) &&
    (data.showGenerator ?? data.action !== 'image_edit')
  );
}

/** IMAGE attachments and the independently evidenced default VIDEO action share magic capability. */
export function markGeneratorCapability({
  node,
  schema,
  isAssetBoardMode = false,
  onlyFineTune = false,
  slashPreset,
} = {}) {
  return !!(
    hasMarkGenerator(node) &&
    schema?.properties?.magic === true &&
    !isAssetBoardMode &&
    (node.type === 'video' || (!onlyFineTune && !slashPreset))
  );
}
