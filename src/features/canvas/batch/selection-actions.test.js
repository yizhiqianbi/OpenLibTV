// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeAssetLibrary } from '../../../services/asset-library/model.ts';
import {
  normalizePickerAsset,
  pickerAssetReferences,
  pickerAssetText,
} from '../../../services/asset-picker/model.ts';
import {
  canvasDownloadEntries,
  canvasMaterialData,
  canvasSelectionChatReferences,
  canvasSelectionDownloadItems,
  canvasSelectionLibraryAssets,
  canvasSelectionMaterialItems,
  canvasSelectionSkillRequest,
} from './selection-actions.js';

const image = {
  id: 'image',
  type: 'image',
  data: {
    type: 'image',
    action: 'image_resource',
    name: '画面',
    url: ['/actual.jpg', '/second.png'],
    taskInfo: { loading: false, taskId: 'original-task' },
    isStale: true,
    params: { prompt: '保留配置' },
  },
};
const text = {
  id: 'text',
  type: 'text',
  data: { type: 'text', action: 'text_resource', name: '文本', content: ['第一行', '第二行'] },
};
const video = {
  id: 'video',
  type: 'video',
  data: {
    type: 'video',
    action: 'video_resource',
    name: '视频',
    url: ['/actual.mp4'],
    poster: '/poster.png',
  },
};
describe('canvas selection action payloads', () => {
  it('inserts node identities in canvas order, rejects pending uploads and preserves source-only image previews', () => {
    const pending = {
      id: 'pending',
      type: 'image',
      data: { type: 'image', url: ['blob:temporary'], uploadStatus: 'uploading' },
    };
    const group = { id: 'group', type: 'group', data: { name: '分组' } };
    const references = canvasSelectionChatReferences(
      [image, video, pending, group],
      ['group', 'video', 'image', 'image', 'pending'],
      'project',
    );
    expect(references.map((reference) => reference.id)).toEqual(['image', 'video', 'group']);
    expect(references[0]).toMatchObject({
      type: 'node',
      nodeKey: 'image',
      projectId: 'project',
      mediaType: 'image',
      url: '/actual.jpg',
    });
    expect(references[1]).not.toHaveProperty('url');
    expect(references[2]).toMatchObject({ nodeType: 'group' });
    expect(references.every((reference) => !reference.source)).toBe(true);
  });
  it('creates the original selected-node Skill request rather than a full-canvas intake flag', () => {
    const request = canvasSelectionSkillRequest([image, video], ['video', 'image'], 'p');
    expect(request.parts[0]).toEqual({
      type: 'text',
      text: '{{ node:image }}{{ node:video }}根据这些画布节点总结 Skill',
    });
    expect(request.parts.slice(1).map((reference) => reference.id)).toEqual(['image', 'video']);
    expect(request).not.toHaveProperty('context');
    expect(canvasSelectionSkillRequest([image], ['missing'], 'p')).toBeNull();
  });
  it('builds a separate v2 asset per real selected resource, keeps names bounded, and never mutates source nodes', () => {
    const generatorOnly = {
      id: 'empty',
      type: 'image',
      data: { type: 'image', url: [], params: { prompt: '仅提示词' } },
    };
    const nodes = [image, text, video, generatorOnly];
    const before = JSON.stringify(nodes);
    const items = canvasSelectionMaterialItems(nodes, ['image', 'text', 'empty'], {
      now: 123,
      renames: { image: '长'.repeat(55) },
    });
    expect(items).toHaveLength(2);
    expect(items[0].name).toHaveLength(50);
    const payload = JSON.parse(items[0].assetData);
    expect(payload).toMatchObject({
      version: 2,
      items: [
        {
          data: { url: ['/actual.jpg', '/second.png'], params: { prompt: '保留配置' } },
          addedAt: 123,
        },
      ],
    });
    expect(payload.items[0].data).not.toHaveProperty('taskInfo');
    expect(payload.items[0].data).not.toHaveProperty('isStale');
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('sanitizes enhance output and blob URLs using the material source rules', () => {
    const enhanced = {
      ...image,
      data: {
        ...image.data,
        generatorType: 'enhance',
        action: 'image_edit',
        url: ['blob:pending', '/final.png'],
        label: '高清',
      },
    };
    const data = canvasMaterialData(enhanced, 10).items[0].data;
    expect(data.action).toBe('image_resource');
    expect(data.url).toEqual(['/final.png']);
    expect(data).not.toHaveProperty('params');
    expect(data).not.toHaveProperty('generatorType');
    expect(data).not.toHaveProperty('label');
    expect(
      canvasMaterialData({ ...image, data: { type: 'image', url: ['blob:pending'] } }),
    ).toBeNull();
  });
  it('produces atomic-library-compatible media and standalone text with reusable picker v2 payloads', () => {
    let nextId = 0;
    const assets = canvasSelectionLibraryAssets([image, text], ['image', 'text'], {
      now: 10,
      makeId: () => `asset-${++nextId}`,
      tags: ['验收'],
    });
    const library = normalizeAssetLibrary({ assets, folders: [], tags: ['验收'] });
    expect(library.assets[0]).toMatchObject({
      id: 'asset-1',
      type: 'image',
      url: '/actual.jpg',
      mimeType: 'image/jpeg',
      sourceNodeId: 'image',
    });
    expect(library.assets[1]).toMatchObject({
      id: 'asset-2',
      type: 'document',
      content: '第一行\n第二行',
      mimeType: 'text/markdown',
    });
    expect(library.assets[1].url).toContain('data:text/markdown');
    const picker = library.assets.map(normalizePickerAsset);
    expect(picker.every(Boolean)).toBe(true);
    expect(pickerAssetReferences([picker[0]])).toHaveLength(2);
    expect(pickerAssetText([picker[1]])).toBe('第一行\n第二行');
  });
  it('expands groups once and exports each media URL, true multiline Markdown and source CSV columns', () => {
    const group = {
      id: 'group',
      type: 'group',
      data: { childNodeIds: ['image', 'video', 'text', 'script'] },
    };
    const script = {
      id: 'script',
      type: 'script',
      parentId: 'group',
      data: {
        type: 'script',
        name: '分镜',
        rows: [
          {
            shotNumber: 1,
            durationSeconds: 2,
            plotDescription: '画面,含逗号',
            dialogue: '他说"你好"',
            videoReference: { referenceFrameImage: '/frame.png' },
            characters: [
              {
                characterName: '角色',
                characterDescription: '描述\n换行',
                characterImageUrl: '/character.png',
              },
            ],
          },
        ],
        shotColumns: [{ field: 'shot_number', label: '自定义镜号' }],
      },
    };
    const nodes = [
      group,
      { ...image, parentId: 'group' },
      { ...video, parentId: 'group', data: { ...video.data, protectionType: 'watermark' } },
      { ...text, parentId: 'group' },
      script,
    ];
    const downloads = canvasSelectionDownloadItems(nodes, ['group', 'image']);
    expect(downloads.map((item) => item.nodeId)).toEqual(['image', 'video', 'text', 'script']);
    const entries = canvasDownloadEntries(downloads);
    expect(entries).toHaveLength(5);
    expect(entries[0]).toMatchObject({ name: '画面(1).jpg', url: '/actual.jpg' });
    expect(entries[2]).toHaveProperty('protectionType', 'watermark');
    expect(entries[3]).toMatchObject({ name: '文本.md', content: '第一行\n第二行' });
    expect(entries[4].content).toContain('自定义镜号,时长,画面描述,角色1,角色描述1,角色图1');
    expect(entries[4].content).toContain('"画面,含逗号"');
    expect(entries[4].content).toContain('"他说""你好"""');
    expect(entries[4].content).toContain('/frame.png');
  });
  it('preserves real URL and uploaded File suffixes without guessing from MIME or unsafe names', () => {
    const dataUrl = 'data:image/webp;base64,YWN0dWFs';
    const uploads = [
      {
        ...image,
        data: {
          ...image.data,
          name: '参考图',
          url: ['https://media.test/actual.WEBP?token=.png#x', '/actual.jpeg'],
        },
        resourceMeta: {
          items: [
            {
              kind: 'image',
              sourceUrl: 'https://media.test/actual.WEBP?token=.png#x',
              extension: 'png',
            },
          ],
        },
      },
      {
        id: 'local',
        type: 'image',
        data: { type: 'image', name: '本地图片', url: [dataUrl] },
        resourceMeta: { items: [{ kind: 'image', sourceUrl: dataUrl, extension: 'webp' }] },
      },
      {
        id: 'old',
        type: 'audio',
        data: { type: 'audio', name: '录音.wav', url: ['data:audio/wav;base64,YWJj'] },
      },
      { id: 'video', type: 'video', data: { type: 'video', name: '视频', url: ['/actual.webm'] } },
      {
        id: 'unknown',
        type: 'image',
        data: {
          type: 'image',
          name: '不可信.exe',
          url: ['/download?filename=actual.webp'],
          mimeType: 'image/webp',
        },
        resourceMeta: { items: [{ kind: 'image', sourceUrl: '/other', extension: 'webp' }] },
      },
    ];
    const entries = canvasDownloadEntries(
      canvasSelectionDownloadItems(
        uploads,
        uploads.map((node) => node.id),
      ),
    );
    expect(entries.map((entry) => entry.name)).toEqual([
      '参考图(1).webp',
      '参考图(2).jpeg',
      '本地图片.webp',
      '录音.wav',
      '视频.webm',
      '不可信.exe.png',
    ]);
    expect(
      canvasDownloadEntries([
        {
          nodeId: 'x',
          type: 'image',
          label: '无法判断',
          urls: ['data:image/webp;base64,YWJj'],
          extensions: ['../../webp'],
        },
      ])[0].name,
    ).toBe('无法判断.png');
  });
});
