import { disposeObjectTree } from './scene-resources.js';
import { createStudioGltfLoader } from './gltf-loader.js';

export const MAX_GLB_BYTES = 100 * 1024 * 1024;
export const abortImportError = () => new DOMException('模型加载已取消', 'AbortError');
export function throwIfImportAborted(signal) {
  if (signal?.aborted) throw abortImportError();
}

export function validateGlbBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20)
    throw new Error('请使用有效的 GLB 2 文件');
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error('请使用有效的 GLB 2 文件');
  let offset = 12,
    json;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB 文件不完整');
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > buffer.byteLength) throw new Error('GLB 文件不完整');
    if (type === 0x4e4f534a)
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset, length)));
    offset += length;
  }
  if (!json || json.asset?.version !== '2.0') throw new Error('请使用有效的 GLB 2 文件');
  const resources = [...(json.buffers || []), ...(json.images || [])];
  if (resources.some((resource) => resource.uri && !resource.uri.startsWith('data:')))
    throw new Error('请使用已内嵌纹理和缓冲区的 GLB 文件');
  return json;
}

export function glbBufferToDataUrl(buffer) {
  const bytes = new Uint8Array(buffer),
    chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return 'data:model/gltf-binary;base64,' + btoa(chunks.join(''));
}

export function glbDataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:[^,]*;base64,/.test(dataUrl))
    throw new Error('模型文件缺失，请重新导入 GLB');
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

export async function parseGlbBuffer(
  buffer,
  { signal, createLoader = createStudioGltfLoader } = {},
) {
  throwIfImportAborted(signal);
  const json = validateGlbBuffer(buffer);
  const runtime = await createLoader(json);
  try {
    throwIfImportAborted(signal);
    const parsing = runtime.loader.parseAsync(buffer, '').then((gltf) => {
      if (signal?.aborted) {
        disposeObjectTree(gltf.scene);
        throw abortImportError();
      }
      return gltf;
    });
    const gltf = signal
      ? await new Promise((resolve, reject) => {
          const cancel = () => reject(abortImportError());
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted) cancel();
          parsing.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
        })
      : await parsing;
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  } finally {
    runtime.dispose();
  }
}

export const parseGlbDataUrl = (dataUrl, options) =>
  parseGlbBuffer(glbDataUrlToBuffer(dataUrl), options);

export async function readGlbFile(file, { signal } = {}) {
  if (!file?.name?.toLowerCase().endsWith('.glb') || file.size > MAX_GLB_BYTES)
    throw new Error('请选择有效的 GLB 2 文件（不超过 100 MB）');
  throwIfImportAborted(signal);
  const buffer = await file.arrayBuffer();
  throwIfImportAborted(signal);
  if (buffer.byteLength > MAX_GLB_BYTES) throw new Error('GLB 文件不能超过 100 MB');
  validateGlbBuffer(buffer);
  return { buffer, dataUrl: glbBufferToDataUrl(buffer) };
}
