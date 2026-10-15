import { describe, expect, it } from 'vitest';
import {
  agentAssetReferences,
  agentAssetText,
  canInsertAgentAssets,
  parseAgentAssetNodes,
} from './agent-assets.ts';
const payload = (items: unknown[]) => JSON.stringify({ version: 2, items });

describe('source asset-v2 to Agent input', () => {
  it('preserves node and URL order, excludes temporary URLs, and carries operator identity', () => {
    const refs = agentAssetReferences(
      payload([
        { data: { type: 'text', content: '应忽略的文字' } },
        {
          data: { type: 'image', name: '角色', url: ['blob:temporary', '/front.png', '/side.png'] },
        },
        { data: { type: 'video', label: '片段', url: ['/clip.mp4'] } },
        { data: { type: 'audio', url: ['/voice.mp3'] } },
        { data: { type: 'image', url: '/not-an-array.png' } },
      ]),
      { assetName: '  示例资产  ', assetUuid: 'operator-asset' },
    );
    expect(refs.map((item) => [item.type, item.name, item.source.value])).toEqual([
      ['image', '示例资产 · 角色', '/front.png'],
      ['image', '示例资产 · 角色', '/side.png'],
      ['video', '示例资产 · 片段', '/clip.mp4'],
      ['audio', '音频素材 · 示例资产', '/voice.mp3'],
    ]);
    expect(new Set(refs.map((item) => item.id)).size).toBe(4);
    expect(refs.every((item) => item.metadata?.mediaAssetUuid === 'operator-asset')).toBe(true);
  });
  it('falls back to the first node name and joins only nonempty text node content', () => {
    expect(
      agentAssetReferences(
        payload([{ data: { type: 'image', name: '节点名称', url: ['/image.png'] } }]),
      )[0].name,
    ).toBe('节点名称 · 节点名称');
    expect(
      agentAssetText(
        payload([
          { data: { type: 'text', content: ['  <p>文字</p>  ', false, '第二行'] } },
          { data: { type: 'image', content: '不是文本' } },
          { data: { type: 'text', content: '' } },
          { data: { type: 'text', content: '末段' } },
        ]),
      ),
    ).toBe('<p>文字</p>  \n第二行\n\n末段');
  });
  it('limits each incoming media kind to twenty, independent of the combined batch size', () => {
    expect(
      canInsertAgentAssets([
        ...Array.from({ length: 20 }, () => ({ type: 'image' })),
        ...Array.from({ length: 20 }, () => ({ type: 'video' })),
      ]),
    ).toBe(true);
    expect(canInsertAgentAssets(Array.from({ length: 21 }, () => ({ type: 'audio' })))).toBe(false);
    expect(canInsertAgentAssets([{ type: 'model' }, { type: 'text' }], 0)).toBe(true);
  });
  it('rejects malformed collections without treating non-node values as attachments', () => {
    for (const json of ['{bad', 'null', '[]', '{"items":{}}'])
      expect(parseAgentAssetNodes(json)).toEqual([]);
    expect(parseAgentAssetNodes(payload([null, 2, { data: null }, { data: [] }]))).toEqual([]);
  });
});
