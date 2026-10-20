const BLOB_URL = /^blob:/i;

export function planClipTimelineExport(timeline, mediaBySourceId, title = 'PenStudio 剪辑时间轴') {
  const clips = timeline?.clips || [];
  const videoClips = clips.filter((clip) => clip.type !== 'audio');
  if (videoClips.length === 0) return { status: 'empty', message: '时间轴为空，无法导出工程文件' };
  const sourceIds = [...new Set(clips.map((clip) => clip.sourceNodeId).filter(Boolean))];
  const assets = sourceIds.map((sourceNodeId) => {
    const media = mediaBySourceId?.get?.(sourceNodeId);
    return {
      sourceNodeId,
      name: media?.name || sourceNodeId,
      url: media?.url || '',
      kind: media?.kind || 'video',
    };
  });
  if (assets.some((asset) => !asset.url))
    return { status: 'missing-url', message: '部分素材缺少可导出的 URL，请先完成素材准备' };
  if (assets.some((asset) => BLOB_URL.test(asset.url)))
    return { status: 'blob-url', message: '浏览器本地 blob 素材不能导出工程，请先上传素材' };
  return {
    status: 'ready',
    filename: `${title.replace(/[\\/:*?"<>|]+/g, '_') || 'PenStudio 剪辑时间轴'}.libtv.json`,
    content: JSON.stringify(
      {
        format: 'penstudio-clip-timeline',
        version: 1,
        title,
        exportedAt: new Date().toISOString(),
        assets,
        timeline,
      },
      null,
      2,
    ),
  };
}
