import { describe, expect, it } from 'vitest';
import { planClipTimelineExport } from './clip-export-model.js';

const timeline = {
  clips: [
    { id: 'video', type: 'video', sourceNodeId: 'video-source', duration: 2 },
    { id: 'audio', type: 'audio', sourceNodeId: 'audio-source', duration: 2 },
  ],
};

describe('clip timeline local export', () => {
  it('serializes timeline, asset URLs and edit fields for a ready project', () => {
    const result = planClipTimelineExport(
      timeline,
      new Map([
        [
          'video-source',
          { name: 'video.mp4', url: 'https://cdn.example/video.mp4', kind: 'video' },
        ],
        [
          'audio-source',
          { name: 'music.mp3', url: 'https://cdn.example/music.mp3', kind: 'audio' },
        ],
      ]),
      '示例项目',
    );
    expect(result.status).toBe('ready');
    expect(result.filename).toBe('示例项目.libtv.json');
    expect(JSON.parse(result.content)).toMatchObject({
      format: 'penstudio-clip-timeline',
      version: 1,
      assets: [{ sourceNodeId: 'video-source' }, { sourceNodeId: 'audio-source' }],
      timeline,
    });
  });

  it.each([
    ['empty', { clips: [] }, '时间轴为空，无法导出工程文件'],
    [
      'missing-url',
      new Map([
        ['video-source', { url: '' }],
        ['audio-source', { url: 'https://cdn.example/music.mp3' }],
      ]),
      '部分素材缺少可导出的 URL，请先完成素材准备',
    ],
    [
      'blob-url',
      new Map([
        ['video-source', { url: 'blob:local' }],
        ['audio-source', { url: 'https://cdn.example/music.mp3' }],
      ]),
      '浏览器本地 blob 素材不能导出工程，请先上传素材',
    ],
  ])('blocks %s exports with a source-aligned message', (status, media, message) => {
    const result = planClipTimelineExport(
      status === 'empty' ? media : timeline,
      status === 'empty' ? new Map() : media,
    );
    expect(result).toMatchObject({ status, message });
  });
});
