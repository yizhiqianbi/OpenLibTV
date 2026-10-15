export type ArchiveEntry = {
  name: string;
  url?: string;
  content?: string;
  mimeType?: string;
  protectionType?: string;
};
export type ArchiveProgress = { finished: number; total: number; bytes: number };
const abortError = () => new DOMException('下载已取消', 'AbortError');
const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

export function archiveEntryNames(entries: readonly ArchiveEntry[]): string[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const clean =
      Array.from(entry.name)
        .map((character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '_' : character,
        )
        .join('')
        .replace(/[\\/<>:"|?*]/g, '_')
        .replace(/^\.+/, '')
        .slice(0, 200) || '文件';
    const dot = clean.lastIndexOf('.'),
      stem = dot > 0 ? clean.slice(0, dot) : clean,
      extension = dot > 0 ? clean.slice(dot) : '';
    let name = clean,
      count = 1;
    while (seen.has(name.toLocaleLowerCase())) name = `${stem} (${++count})${extension}`;
    seen.add(name.toLocaleLowerCase());
    return name;
  });
}

/** The caller supplies already authorised content URLs; this never creates export service URLs. */
export async function createDownloadArchive(
  entries: readonly ArchiveEntry[],
  {
    signal,
    asset,
    fetcher = fetch,
    onProgress,
    maxBytes = 512 * 1024 * 1024,
  }: {
    signal?: AbortSignal;
    asset?: (url: string) => string;
    fetcher?: typeof fetch;
    onProgress?: (progress: ArchiveProgress) => void;
    maxBytes?: number;
  } = {},
): Promise<Blob> {
  assertActive(signal);
  if (!entries.length) throw new Error('所选节点没有可下载内容');
  if (entries.some((entry) => entry.protectionType === 'watermark'))
    throw new Error('水印资源需要连接导出服务，未下载原始文件');
  const names = archiveEntryNames(entries),
    files: Record<string, Uint8Array> = Object.create(null);
  let next = 0,
    finished = 0,
    bytes = 0;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const consumeBytes = (size: number) => {
    bytes += size;
    if (bytes > maxBytes) throw new Error('下载内容超出本机打包容量，请减少选择后重试');
  };
  const readEntry = async (entry: ArchiveEntry): Promise<Uint8Array> => {
    assertActive(controller.signal);
    if (typeof entry.content === 'string') {
      const data = new TextEncoder().encode(entry.content);
      consumeBytes(data.byteLength);
      return data;
    }
    if (!entry.url) throw new Error(`缺少下载地址：${entry.name}`);
    const url = asset?.(entry.url) || entry.url;
    const response = await fetcher(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) throw new Error(`下载失败：${entry.name}（${response.status}）`);
    const reader = response.body?.getReader();
    if (!reader) {
      const data = new Uint8Array(await response.arrayBuffer());
      consumeBytes(data.byteLength);
      return data;
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        assertActive(controller.signal);
        const { value, done } = await reader.read();
        if (done) break;
        consumeBytes(value.byteLength);
        chunks.push(value);
        length += value.byteLength;
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return data;
  };
  try {
    const workers = Array.from({ length: Math.min(3, entries.length) }, async () => {
      while (next < entries.length) {
        assertActive(controller.signal);
        const index = next++;
        files[names[index]] = await readEntry(entries[index]);
        assertActive(controller.signal);
        onProgress?.({ finished: ++finished, total: entries.length, bytes });
      }
    });
    try {
      await Promise.all(workers);
    } catch (error) {
      controller.abort();
      await Promise.allSettled(workers);
      throw error;
    }
    assertActive(controller.signal);
    const { zip } = await import('fflate');
    assertActive(controller.signal);
    const data = await new Promise<Uint8Array>((resolve, reject) => {
      let terminate = () => {};
      const aborted = () => {
        terminate();
        reject(abortError());
      };
      controller.signal.addEventListener('abort', aborted, { once: true });
      terminate = zip(files, { level: 0 }, (error, result) => {
        controller.signal.removeEventListener('abort', aborted);
        if (controller.signal.aborted) reject(abortError());
        else if (error) reject(error);
        else resolve(result);
      });
    });
    assertActive(controller.signal);
    return new Blob([new Uint8Array(data).buffer], { type: 'application/zip' });
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
