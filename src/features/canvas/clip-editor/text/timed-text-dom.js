export const TEXT_HTML_ATTRIBUTES = Object.freeze({
  contract: 'data-libtv-contract',
  composition: 'data-composition-id',
  width: 'data-width',
  height: 'data-height',
  timeBase: 'data-time-base',
  start: 'data-start',
  duration: 'data-duration',
  cue: 'data-libtv-cue-id',
  track: 'data-track-index',
  z: 'data-z',
  role: 'data-role',
  mode: 'data-text-mode',
  text: 'data-libtv-text',
  wordStart: 'data-word-start',
  wordDuration: 'data-word-duration',
  hidden: 'data-libtv-hidden',
  trackHidden: 'data-libtv-track-hidden',
  clip: 'data-libtv-clip',
  libraryCue: 'data-libtv-library-cue',
  clipMeta: 'data-libtv-clip-meta',
  materialized: 'data-libtv-materialized',
  subtitlesHidden: 'data-libtv-subtitles-hidden',
  sourceAssetKey: 'data-source-asset-key',
});
const A = TEXT_HTML_ATTRIBUTES;
export const canonicalTrack = (raw) =>
  /^(0|[1-9]\d*)$/.test(raw || '') && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
export const subtitleCompositionRoot = (document) =>
  document.querySelector(`[${A.composition}]`) || document.getElementById('root') || document.body;
export function outerTimedElements(root) {
  return [...root.querySelectorAll(`[${A.start}][${A.duration}]`)].filter((element) => {
    for (
      let parent = element.parentElement;
      parent && parent !== root;
      parent = parent.parentElement
    )
      if (parent.hasAttribute(A.start) && parent.hasAttribute(A.duration)) return false;
    return true;
  });
}
export function serializeTextHtml(document) {
  const type = document.doctype;
  const doctype = type
    ? `<!DOCTYPE ${type.name}${type.publicId ? ` PUBLIC "${type.publicId}"` : ''}${type.systemId ? ` "${type.systemId}"` : ''}>`
    : '<!DOCTYPE html>';
  return `${doctype}\n${document.documentElement.outerHTML}`;
}
