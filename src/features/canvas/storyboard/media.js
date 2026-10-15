/** Existing storyboard surface: retain document order and only actual media output. */
export function storyboardMediaShots(nodes = []) {
  return nodes.flatMap((node) => {
    if (!['image', 'video'].includes(node?.type)) return [];
    const values = Array.isArray(node.data?.url) ? node.data.url : [node.data?.url];
    // Match the historical mediaUrl contract: the first output is the visible shot.
    const url = values[0];
    return typeof url === 'string' && url
      ? [{ node, url, name: node.data?.name || '', prompt: node.data?.params?.prompt || '' }]
      : [];
  });
}
