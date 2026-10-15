/** Source image renderer t7 and standalone handle helper 722330 use distinct gates. */
export function canvasImageGroupChrome(node, parent) {
  const empty = { hideTitleBar: false, hideTargetHandle: false, hideSourceHandle: false };
  if (node?.type !== 'image' || parent?.type !== 'group') return empty;
  const data = parent.data;
  const scripted =
    typeof data?.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0;
  const hideTitleBar =
    data?.storyboardGroupType !== 'video' &&
    (data?.storyboardGroupType === 'image' ||
      data?.standaloneStoryboardImageGrid === true ||
      scripted);
  const standalone =
    data?.storyboardGroupType === 'image' &&
    data.standaloneStoryboardImageGrid === true &&
    !scripted;
  return {
    hideTitleBar,
    hideSourceHandle: standalone,
    hideTargetHandle: standalone && node.data?._characterLibraryStaticPreview !== true,
  };
}
