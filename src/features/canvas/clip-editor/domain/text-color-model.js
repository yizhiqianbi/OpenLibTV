const byte = (value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
const hex = (value) => byte(value).toString(16).padStart(2, '0');
function hexParts(value) {
  const match = String(value)
    .trim()
    .match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!match) return null;
  const expanded =
    match[1].length <= 4 ? [...match[1]].map((part) => part + part).join('') : match[1];
  return expanded.match(/../g).map((part) => parseInt(part, 16));
}
function rgbParts(value) {
  const match = String(value)
    .trim()
    .match(/^rgba?\(([^)]*)\)$/i);
  return match ? match[1].split(/[,/]|\s+/).filter(Boolean) : null;
}
/** Source aE/aP: alpha is displayed as an integer percentage. */
export function textColor(value = 'transparent') {
  const raw = String(value).trim(),
    parts = hexParts(raw),
    rgb = rgbParts(raw);
  let opacity = 100;
  if (raw.toLowerCase() === 'transparent') opacity = 0;
  else if (rgb?.[3] != null) {
    const alpha = Number(rgb[3].replace('%', ''));
    opacity = Number.isFinite(alpha)
      ? Math.max(0, Math.min(100, Math.round(rgb[3].endsWith('%') ? alpha : alpha * 100)))
      : 100;
  } else if (parts?.[3] != null) opacity = Math.round((parts[3] / 255) * 100);
  const color = parts
    ? `#${parts.slice(0, 3).map(hex).join('')}`.toUpperCase()
    : rgb && rgb.length >= 3
      ? `#${rgb.slice(0, 3).map(hex).join('')}`.toUpperCase()
      : raw;
  return { color: color.toLowerCase() === 'transparent' ? '#000000' : color, opacityPct: opacity };
}
/** Source aN keeps unparseable colors and removes old hexadecimal alpha at 100%. */
export function textColorWithOpacity(color, opacityPct) {
  const parts = hexParts(color);
  if (!Number.isFinite(opacityPct)) return color;
  if (opacityPct >= 100)
    return parts ? `#${parts.slice(0, 3).map(hex).join('')}`.toUpperCase() : color;
  return parts
    ? `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Math.max(0, opacityPct) / 100})`
    : color;
}
