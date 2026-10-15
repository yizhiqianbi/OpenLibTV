const cells = Array.from({ length: 576 }, (_, index) => {
  const raw = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return {
    x: ((index % 32) / 32) * 100,
    y: (Math.floor(index / 32) / 18) * 100,
    threshold: ((raw % 1) + 1) % 1,
  };
});

/** Source u1 uses deterministic 32×18 SVG masks for the inspector, not GPU burn. */
function mask(progress, burn) {
  const rects = cells
    .filter((cell) =>
      burn
        ? cell.threshold > progress && cell.threshold <= progress + 0.1
        : cell.threshold <= progress,
    )
    .map(
      (cell) =>
        `<rect x="${cell.x.toFixed(3)}" y="${cell.y.toFixed(3)}" width="3.125" height="5.556" fill="white"/>`,
    )
    .join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">${rects}</svg>`)}")`;
}

export function describeTransitionInspectorStyle(type, progress) {
  const at = Math.max(0, Math.min(1, progress));
  const dissolve = type === 'dissolve';
  const fill = type === 'fadeblack' || type === 'fadewhite';
  return {
    fromOpacity: type === 'fade' ? 1 - at : dissolve ? 1 : Number(at < 0.5),
    toOpacity: type === 'fade' ? at : dissolve ? 1 : Number(at >= 0.5),
    fillColor: type === 'fadewhite' ? '#fff' : '#000',
    fillOpacity: fill ? (at <= 0.5 ? 2 * at : 2 * (1 - at)) : 0,
    toMask: dissolve ? mask(at, false) : '',
    burnMask: dissolve ? mask(at, true) : '',
  };
}
