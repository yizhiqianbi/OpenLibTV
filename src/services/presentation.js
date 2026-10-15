export function localHref(url) {
  if (!url) return '/';
  try {
    const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
    const parsed = new URL(url, origin);
    return parsed.hostname === 'www.liblib.tv' || parsed.origin === origin
      ? parsed.pathname + parsed.search + parsed.hash
      : url;
  } catch {
    return url;
  }
}

export function shortCount(value) {
  return value >= 10000
    ? (value / 10000).toFixed(1) + 'w'
    : value >= 1000
      ? (value / 1000).toFixed(1) + 'k'
      : value || 0;
}
