import { describe, expect, it } from 'vitest';
import {
  canvasMessageRole,
  canvasMessageTokens,
  messageNodeThumbnail,
  messagePreviewReference,
  messageReferenceLabel,
  type CanvasMessageReference,
  type CanvasMessageToken,
} from './canvas-agent-message.ts';

function visible(tokens: CanvasMessageToken[]): string[] {
  return tokens.map((token) =>
    token.kind === 'text' ? token.text : messageReferenceLabel(token.reference),
  );
}

describe('Canvas sent-message display protocol', () => {
  it('retains original text positions, newlines and independently ordered duplicate occurrences', () => {
    const first = Object.freeze({
      type: 'skill',
      id: 'director/story',
      name: '第一次引用',
      referenceKey: 'first',
    });
    const second = Object.freeze({ ...first, name: '第二次引用', referenceKey: 'second' });
    const image = Object.freeze({
      type: 'image',
      id: 'p',
      name: '图片',
      referenceKey: 'picture',
      source: { type: 'url', value: '/picture.png' },
    });
    const node = Object.freeze({ type: 'node', id: 'n1', nodeKey: 'n1', name: '节点' });
    const parts = Object.freeze([
      {
        type: 'text',
        text: '  开{{skill:director/story}}\n{{ image:p }}中{{skill:director/story}}尾{{node:n1}}  ',
      },
      image,
      first,
      node,
      second,
    ] as const);
    const tokens = canvasMessageTokens({ parts });
    expect(visible(tokens)).toEqual([
      '开',
      '第一次引用',
      '\n',
      '图片',
      '中',
      '第二次引用',
      '尾',
      '节点',
    ]);
    expect(tokens.filter((token) => token.kind === 'reference').map((token) => token.key)).toEqual([
      'first:0',
      'picture:0',
      'second:0',
      'legacy-node:n1:3:0',
    ]);
    expect(tokens[1].kind === 'reference' && tokens[1].reference).toBe(first);
    expect(parts[0].text).toBe(
      '  开{{skill:director/story}}\n{{ image:p }}中{{skill:director/story}}尾{{node:n1}}  ',
    );
    expect(canvasMessageTokens({ parts })).toEqual(tokens);
  });

  it('preserves legacy repeated references without key collisions or payload mutation', () => {
    const reference = { type: 'model', id: 'm', name: '模型', referenceKey: 'copied' };
    const message = {
      parts: [
        { type: 'text', text: '{{model:m}}/{{model:m}}/{{model:m}}' },
        reference,
        { ...reference },
      ],
    };
    const before = JSON.stringify(message);
    const tokens = canvasMessageTokens(message);
    expect(visible(tokens)).toEqual(['模型', '/', '模型', '/', '模型']);
    const keys = tokens.filter((token) => token.kind === 'reference').map((token) => token.key);
    expect(new Set(keys).size).toBe(3);
    expect(canvasMessageTokens(message).map((token) => token.key)).toEqual(
      tokens.map((token) => token.key),
    );
    expect(JSON.stringify(message)).toBe(before);
  });

  it('keeps interleaved arrays in physical order and leaves unknown placeholders as literal text', () => {
    expect(
      visible(
        canvasMessageTokens({
          parts: [
            { type: 'text', text: '前' },
            { type: 'skill', id: 's', name: 'Skill' },
            { type: 'hidden', id: 'private' },
            { type: 'text', text: '\n后{{ unknown:x }}' },
            { type: 'model', id: 'm', name: '模型' },
          ],
        }),
      ),
    ).toEqual(['前', 'Skill', '后{{ unknown:x }}', '模型']);
    expect(
      visible(
        canvasMessageTokens({
          parts: [{ type: 'text', text: 'a{{context:private}}b{{vfs:file}}c{{ mystery:x }}d' }],
        }),
      ),
    ).toEqual(['abc{{ mystery:x }}d']);
  });

  it('accepts original serialized content and retains the recoverable shape of old plain-text messages', () => {
    const ref = { type: 'audio', id: 'a', name: '声音' };
    const original = [{ type: 'text', text: '前{{ audio:a }}后' }, ref];
    expect(visible(canvasMessageTokens({ content: JSON.stringify(original) }))).toEqual([
      '前',
      '声音',
      '后',
    ]);
    expect(visible(canvasMessageTokens({ text: '原纯文本\n', parts: [ref] }))).toEqual([
      '原纯文本 ',
      '声音',
    ]);
    expect(visible(canvasMessageTokens({ content: '"一\\n二"' }))).toEqual(['一\n二']);
    expect(visible(canvasMessageTokens({ content: 'false' }))).toEqual(['false']);
    expect(visible(canvasMessageTokens({ content: '{"unknown":true}' }))).toEqual([
      '{"unknown":true}',
    ]);
    expect(canvasMessageTokens({ content: 'null' })).toEqual([]);
    expect(
      canvasMessageTokens({ parts: original, text: '旧衍生文字', content: '旧序列化内容' }),
    ).toEqual(canvasMessageTokens({ parts: original }));
    expect(canvasMessageRole({ role: 'tool' })).toBe('other');
  });

  it('only supplies ready media previews and normalizes raw source base64 without changing metadata', () => {
    const image: CanvasMessageReference = Object.freeze({
      type: 'image',
      id: 'p',
      name: '图片',
      referenceKey: 'occurrence',
      status: 'ready',
      source: Object.freeze({ type: 'data', value: 'YQ==', mimeType: 'image/png' }),
    });
    expect(messagePreviewReference(image)).toEqual({
      ...image,
      source: { type: 'data', value: 'data:image/png;base64,YQ==', mimeType: 'image/png' },
    });
    expect((image.source as { value: string }).value).toBe('YQ==');
    expect(messagePreviewReference({ ...image, status: 'uploading' })).toBeNull();
    expect(
      messagePreviewReference({ ...image, source: { type: 'data', value: 'YQ==' } }),
    ).toBeNull();
    expect(
      messagePreviewReference({ ...image, source: { type: 'url', value: ' javascript:alert(1)' } }),
    ).toBeNull();
    expect(
      messagePreviewReference({
        ...image,
        source: { type: 'url', value: 'java\nscript:alert(1)' },
      }),
    ).toBeNull();
    expect(messagePreviewReference({ type: 'skill', id: 's', source: image.source })).toBeNull();
  });

  it('treats node images as read-only snapshots instead of attachment sources or inferred video media', () => {
    const node = {
      type: 'node',
      id: 'n',
      nodeKey: 'n',
      name: '画布图',
      projectId: 'p',
      nodeType: 'image',
      url: '/node.png',
      mediaType: 'image',
    };
    expect(messageNodeThumbnail(node)).toBe('/node.png');
    expect(messagePreviewReference(node)).toBeNull();
    expect(messageNodeThumbnail({ ...node, mediaType: undefined })).toBeNull();
    expect(messageNodeThumbnail({ ...node, mediaType: 'video' })).toBeNull();
    expect(messageNodeThumbnail({ ...node, url: ['not-wire-shape'] })).toBeNull();
    expect(messageNodeThumbnail({ ...node, url: 'javascript:bad' })).toBeNull();
  });
});
