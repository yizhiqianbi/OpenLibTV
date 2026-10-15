import { asset } from '../../../services/assets.ts';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function resourceFileName(item) {
  const mime = item.mimeType || '';
  const extension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
  }[mime];
  const name = item.name.replace(/[\\/:*?"<>|]/g, '_') || '资产';
  return extension && !name.toLowerCase().endsWith(`.${extension}`) ? `${name}.${extension}` : name;
}
export async function downloadLibraryAssets(items, signal) {
  if (!items.length) throw new Error('所选资产暂无可下载内容');
  const entries = await Promise.all(
    items.map(async (item) => {
      const response = await fetch(asset(item.url), { signal });
      if (!response.ok) throw new Error(`${item.name}：下载失败，请重试`);
      return { item, blob: await response.blob() };
    }),
  );
  if (signal?.aborted) return;
  if (entries.length === 1) {
    saveBlob(entries[0].blob, resourceFileName(entries[0].item));
    return;
  }
  // Reuse the MIT fflate build shipped with the existing Three.js dependency.
  const { zipSync } = await import('three/addons/libs/fflate.module.js');
  const files = Object.create(null);
  for (const { item, blob } of entries) {
    const base = resourceFileName(item);
    let name = base;
    let index = 2;
    while (Object.hasOwn(files, name))
      name = base.replace(/(\.[^.]+)?$/, (suffix) => ` (${index++})${suffix}`);
    files[name] = new Uint8Array(await blob.arrayBuffer());
  }
  if (!signal?.aborted)
    saveBlob(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), '资产.zip');
}
