export async function readClipTextHtml(url, { signal, requireComposition = true } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`文字HTML读取失败（${response.status}）`);
  const text = await response.text();
  if (requireComposition && !text.includes('data-composition-id'))
    throw new Error('文字来源不是有效的composition HTML，原数据已保留');
  return text;
}
