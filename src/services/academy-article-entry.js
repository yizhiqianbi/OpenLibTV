/**
 * Builds the URL used by the public Academy article canvas CTA.
 *
 * The source article renderer preserves the existing canvas share parameters
 * and adds an attribution source plus the tutorial key before opening a new
 * tab. Keeping this in a pure service makes the navigation contract easy to
 * verify without mounting the Markdown page or touching login state.
 */
export function academyArticleCanvasUrl(canvasUrl, tutorialKey) {
  if (!canvasUrl) return '';
  if (!/^(?:https?:|\/)/i.test(canvasUrl)) return canvasUrl;

  try {
    const url = new URL(canvasUrl, 'http://localhost');
    url.searchParams.set('source', 'academy_tutorial');
    if (tutorialKey) url.searchParams.set('itemKey', tutorialKey);
    // Preserve relative URLs for local fixtures while retaining absolute URLs
    // from the public snapshot exactly as the source does.
    return /^[a-z][a-z\d+.-]*:/i.test(canvasUrl)
      ? url.toString()
      : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return canvasUrl;
  }
}
