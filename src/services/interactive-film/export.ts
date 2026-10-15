import { compileFilmDocument } from './document.ts';
import { getFilmMediaBlob } from './media.ts';
import type { FilmDocument } from './types.ts';

export const FILM_RUNTIME_URL = '/film-runtime/v1/player.iife.js';
export const FILM_ARCHIVE_LIMIT = 512 * 1024 * 1024;
export interface FilmExportProgress {
  completed: number;
  total: number;
  message?: string;
}
export interface FilmArchiveEntry {
  path: string;
  content: Blob | string | Uint8Array;
}
interface ExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: FilmExportProgress) => void;
}
const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('影游打包已取消', 'AbortError');
};
const encoder = new TextEncoder();
const htmlText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
const inlineJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

/** A separate archive interface preserves directories without changing generic node downloads. */
export async function createFilmArchive(
  entries: readonly FilmArchiveEntry[],
  { signal, onProgress }: ExportOptions = {},
): Promise<Blob> {
  assertActive(signal);
  const names = new Set<string>();
  const files: Record<string, Uint8Array> = Object.create(null);
  let bytes = 0;
  for (const [index, entry] of entries.entries()) {
    if (
      !entry.path ||
      entry.path.startsWith('/') ||
      /^[a-z]:/i.test(entry.path) ||
      entry.path.includes('\\') ||
      Array.from(entry.path).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      names.has(entry.path.toLocaleLowerCase())
    )
      throw new Error('影游压缩包包含不安全或重复的路径');
    names.add(entry.path.toLocaleLowerCase());
    assertActive(signal);
    const estimatedSize =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content).byteLength
        : entry.content instanceof Uint8Array
          ? entry.content.byteLength
          : entry.content.size;
    if (bytes + estimatedSize > FILM_ARCHIVE_LIMIT)
      throw new Error('影游压缩包超过 512 MiB，请减少素材后重试');
    const content =
      typeof entry.content === 'string'
        ? encoder.encode(entry.content)
        : entry.content instanceof Uint8Array
          ? entry.content
          : new Uint8Array(await entry.content.arrayBuffer());
    assertActive(signal);
    bytes += content.byteLength;
    if (bytes > FILM_ARCHIVE_LIMIT) throw new Error('影游压缩包超过 512 MiB，请减少素材后重试');
    files[entry.path] = content;
    onProgress?.({ completed: index + 1, total: entries.length + 1, message: '正在读取素材' });
  }
  const { zip } = await import('fflate');
  assertActive(signal);
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    let terminate = () => {};
    const cancel = () => {
      terminate();
      reject(new DOMException('影游打包已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    terminate = zip(files, { level: 0 }, (error, result) => {
      signal?.removeEventListener('abort', cancel);
      if (signal?.aborted) reject(new DOMException('影游打包已取消', 'AbortError'));
      else if (error) reject(error);
      else resolve(result);
    });
  });
  assertActive(signal);
  if (data.byteLength > FILM_ARCHIVE_LIMIT)
    throw new Error('影游压缩包超过 512 MiB，请减少素材后重试');
  onProgress?.({
    completed: entries.length + 1,
    total: entries.length + 1,
    message: '离线包已准备好',
  });
  return new Blob([new Uint8Array(data).buffer], { type: 'application/zip' });
}

/** Embed the trusted locally built player; the extracted webpage performs no JSON/network reads. */
export async function exportFilmDocument(
  document: FilmDocument,
  { signal, onProgress }: ExportOptions = {},
): Promise<Blob> {
  assertActive(signal);
  const frozen = JSON.parse(JSON.stringify(document)) as FilmDocument;
  const used = new Set(frozen.nodes.map((node) => node.mediaId).filter(Boolean));
  const records = frozen.media
    .filter((record) => used.has(record.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const urls: Record<string, string> = {};
  records.forEach((record, index) => {
    const extension =
      record.name.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase() ||
      (
        {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
          'video/mp4': 'mp4',
          'video/webm': 'webm',
          'audio/mpeg': 'mp3',
          'audio/mp4': 'm4a',
          'audio/wav': 'wav',
        } as Record<string, string>
      )[record.mimeType] ||
      'bin';
    urls[record.id] = `media/asset-${index + 1}.${extension}`;
  });
  const manifest = compileFilmDocument(frozen, urls);
  const entries: FilmArchiveEntry[] = [];
  const total = records.length + 2;
  let bytes = 0;
  onProgress?.({ completed: 0, total, message: '正在准备离线素材' });
  for (const [index, record] of records.entries()) {
    const blob = await getFilmMediaBlob(record.id, { signal });
    assertActive(signal);
    if (blob.size !== record.bytes)
      throw new Error(`「${record.name}」的文件大小与项目记录不同，请重新导入`);
    bytes += blob.size;
    if (bytes > FILM_ARCHIVE_LIMIT) throw new Error('影游素材超过 512 MiB，请减少素材后重试');
    entries.push({ path: urls[record.id], content: blob });
    onProgress?.({ completed: index + 1, total, message: `已读取 ${record.name}` });
  }
  const response = await fetch(FILM_RUNTIME_URL, { credentials: 'omit', signal });
  if (!response.ok) throw new Error('离线播放器构建尚不可用，请重新构建后重试');
  const bundle = await response.text();
  assertActive(signal);
  if (!bundle.includes('PenFilmPlayer') || /\bimport\s*\(/.test(bundle))
    throw new Error('离线播放器构建格式不兼容');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlText(manifest.title)}</title><style>html,body{margin:0;background:#08090b;height:100%;}#film-root{height:100dvh;min-height:300px;}</style></head><body><main id="film-root"></main><script id="film-manifest" type="application/json">${inlineJson(manifest)}</script><script>${bundle.replace(/<\/script/gi, '<\\/script')}\nPenFilmPlayer.mount(document.getElementById('film-root'),JSON.parse(document.getElementById('film-manifest').textContent));</script></body></html>`;
  entries.unshift({ path: 'index.html', content: html });
  entries.push({
    path: 'README.txt',
    content:
      '解压整个压缩包，再用桌面浏览器打开 index.html。所有媒体均在 media 文件夹内，无需网络或安装服务器。点击开始游玩；空格、Tab 和按钮可用于互动。片段起止点由播放器执行，源媒体按完整文件保存。',
  });
  onProgress?.({ completed: total - 1, total, message: '正在生成离线压缩包' });
  const blob = await createFilmArchive(entries, { signal });
  assertActive(signal);
  onProgress?.({ completed: total, total, message: '离线包已准备好' });
  return blob;
}
