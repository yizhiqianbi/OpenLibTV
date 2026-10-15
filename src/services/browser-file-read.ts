export function readLocalFile(
  file: File,
  { signal, mode = 'data-url' }: { signal?: AbortSignal; mode?: 'data-url' | 'text' } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('File read cancelled', 'AbortError'));
      return;
    }
    const reader = new FileReader();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      reader.onload = reader.onerror = reader.onabort = null;
      if (error) reject(error);
      else if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(`${file.name}：读取失败`));
    };
    const cancel = () => {
      reader.abort();
      finish(new DOMException('File read cancelled', 'AbortError'));
    };
    reader.onload = () => finish();
    reader.onerror = () => finish(new Error(`${file.name}：读取失败，请重新选择文件`));
    reader.onabort = () => finish(new DOMException('File read cancelled', 'AbortError'));
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (mode === 'text') reader.readAsText(file);
      else reader.readAsDataURL(file);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(`${file.name}：读取失败`));
    }
  });
}
