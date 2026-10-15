import { readTextStyle, textStylePatches } from './document-model.js';
import { readWordHighlight } from './highlight-document.js';
export function readHtmlSubtitleStyle(model, cueId, output) {
  return {
    ...readTextStyle(model, cueId, output),
    ...readWordHighlight(model.cues.find((cue) => cue.cueId === cueId)?.element),
  };
}
export function htmlSubtitleStylePatches(cueId, fields, current, scale) {
  const patches = textStylePatches(cueId, fields, current, scale);
  const keys = Object.keys(fields || {}).filter((key) => fields[key] != null);
  if (
    keys.some((key) =>
      ['wordHighlightEnabled', 'highlightTextColor', 'highlightBackgroundColor'].includes(key),
    )
  ) {
    if (
      !(keys.length === 1 && keys[0] === 'wordHighlightEnabled') &&
      !patches.some((patch) => patch.kind === 'textPresetId')
    )
      patches.unshift({ kind: 'textPresetId', cueId, presetId: null });
    patches.push({
      kind: 'wordHighlight',
      cueId,
      enabled: fields.wordHighlightEnabled,
      textColor: fields.highlightTextColor,
      backgroundColor: fields.highlightBackgroundColor,
    });
  }
  return patches;
}
