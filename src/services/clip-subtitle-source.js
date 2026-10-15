/** Read-only subtitle transport. Source scripts and server writers are never run. */
export async function readClipSubtitleVtt(url, { signal, fetcher = globalThis.fetch } = {}) {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`字幕文件加载失败（${response.status}）`);
  const text = await response.text();
  if (!/^\s*\uFEFF?WEBVTT\b/.test(text) && !/\d\s+-->\s+\d/.test(text))
    throw new Error('字幕文件格式无法读取，原数据已保留');
  return text;
}
