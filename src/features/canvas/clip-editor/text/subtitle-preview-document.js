import { prepareTimedTextPreviewHtml, seekTextPreview } from './preview-runtime.js';

/** A source-time subtitle document is sanitized with the same closed, scriptless policy. */
export const prepareSubtitlePreviewHtml = (html) =>
  prepareTimedTextPreviewHtml(html, { subtitle: true });

export function seekSubtitlePreview(document, sourceTime, clipId, trackIndex) {
  const root = document.querySelector('[data-composition-id]');
  const hidden = [...(root?.children || [])].some(
    (element) =>
      element.tagName.toLowerCase() === 'template' &&
      element.getAttribute('data-libtv-clip-meta') === clipId &&
      element.getAttribute('data-libtv-subtitles-hidden') === 'true',
  );
  seekTextPreview(document, sourceTime, (cue) => {
    const owner = cue.closest('[data-libtv-cue-id]') || cue;
    const bound = owner.getAttribute('data-libtv-clip')?.trim();
    return (
      !hidden &&
      bound !== '~' &&
      (!bound || bound === clipId) &&
      (trackIndex == null || Number(owner.getAttribute('data-track-index')) === trackIndex)
    );
  });
}
