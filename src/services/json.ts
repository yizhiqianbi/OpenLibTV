export class DataLoadError extends Error {
  readonly url: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    { url, status = 0, cause }: { url: string; status?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'DataLoadError';
    this.url = url;
    this.status = status;
    this.cause = cause;
  }
}

export interface JsonLoadOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  headers?: HeadersInit;
}

/** Fetch only when called. A .gz response can be compressed bytes or transparently decoded JSON. */
export async function fetchJson<T = unknown>(
  url: string,
  options: JsonLoadOptions = {},
): Promise<T> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) throw new DataLoadError('Fetch is unavailable', { url });
  let response: Response;
  try {
    response = await fetcher(url, { signal: options.signal, headers: options.headers });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new DataLoadError('Network request failed', { url, cause });
  }
  if (!response.ok)
    throw new DataLoadError(`Data unavailable: ${response.status}`, {
      url,
      status: response.status,
    });

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    let decoded: ArrayBuffer | Uint8Array = bytes;
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decode gzip data');
      }
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      decoded = await new Response(stream).arrayBuffer();
    }
    return JSON.parse(new TextDecoder().decode(decoded)) as T;
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    throw new DataLoadError('Invalid JSON data', { url, status: response.status, cause });
  }
}
