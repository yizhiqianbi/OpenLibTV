import { readLocalFile } from '../../../services/browser-file-read.ts';
import { createLocalId } from '../../editor/model.js';

export async function readCanvasUploadNode(
  file,
  { position, index = 0, signal, makeId = createLocalId } = {},
) {
  const type = file.type.startsWith('image')
    ? 'image'
    : file.type.startsWith('video')
      ? 'video'
      : file.type.startsWith('audio')
        ? 'audio'
        : 'text';
  const content = await readLocalFile(file, {
    signal,
    mode: type === 'text' ? 'text' : 'data-url',
  });
  return {
    id: makeId(),
    type,
    position: { x: (position?.x ?? 50) + index * 370, y: position?.y ?? 50 },
    width: 350,
    height: 230,
    ...(type !== 'text'
      ? {
          resourceMeta: {
            items: [
              {
                kind: type,
                sourceUrl: content,
                byteSize: file.size,
                extension: file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase(),
                mimeType: file.type,
              },
            ],
          },
        }
      : {}),
    data: {
      name: file.name,
      type,
      localMediaReady: type !== 'text',
      url: type === 'text' ? [] : [content],
      text: type === 'text' ? content : '',
      params: { prompt: '', settings: {} },
    },
  };
}
