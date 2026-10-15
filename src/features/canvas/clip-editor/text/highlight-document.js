import { timedTextWordTokens } from '../domain/text-word-model.js';
const START = 'data-word-start',
  DURATION = 'data-word-duration',
  UNIT = 'data-libtv-karaoke-unit';
const ENABLED = 'data-libtv-word-highlight',
  COLOR = '--libtv-text-highlight-color',
  BACKGROUND = '--libtv-text-highlight-background-color';
const STYLE = 'libtv-subtitle-karaoke-highlight-style';
const ms = (value) => String(Math.round(value * 1000) / 1000);
function textNodes(element) {
  const result = [];
  const visit = (node) => {
    if (node.nodeType === 3) {
      if (node.textContent?.trim()) result.push(node);
    } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.tagName))
      for (const child of node.childNodes) visit(child);
  };
  visit(element);
  return result;
}
function clearUnits(cue) {
  for (const word of cue.querySelectorAll(`[${UNIT}]`)) {
    word.removeAttribute(UNIT);
    word.style.removeProperty('--libtv-karaoke-start');
    word.style.removeProperty('--libtv-karaoke-duration');
  }
}
function markWord(word) {
  word.setAttribute(UNIT, '');
  word.style.setProperty('--libtv-karaoke-start', `${ms(Number(word.getAttribute(START)))}s`);
  word.style.setProperty(
    '--libtv-karaoke-duration',
    `${ms(Math.max(0.001, Number(word.getAttribute(DURATION))))}s`,
  );
}
function validWord(word) {
  return [START, DURATION].every((attribute) => {
    const raw = word.getAttribute(attribute);
    return (
      raw?.trim() && Number.isFinite(Number(raw)) && (attribute !== DURATION || Number(raw) >= 0)
    );
  });
}
function materializeWords(document, cue) {
  const target = cue.querySelector('[data-libtv-text]') || cue;
  const existing = [...target.querySelectorAll(`[${START}],[${DURATION}]`)];
  if (
    existing.length &&
    existing.every(validWord) &&
    textNodes(target).every((text) => existing.some((word) => word.contains(text)))
  ) {
    existing.forEach(markWord);
    return existing;
  }
  const languages = target.hasAttribute('data-lang')
    ? [target]
    : [...target.querySelectorAll('[data-lang]')].filter((element) => {
        const parent = element.parentElement?.closest('[data-lang]');
        return !parent || !target.contains(parent);
      });
  const groups = languages.map(textNodes);
  const outside = textNodes(target).filter(
    (text) => !languages.some((element) => element.contains(text)),
  );
  if (outside.length) groups.push(outside);
  if (!groups.some((group) => group.length)) return [];
  for (const element of [target, ...target.querySelectorAll('*')]) {
    for (const attr of [START, DURATION, UNIT]) element.removeAttribute(attr);
    element.style?.removeProperty('--libtv-karaoke-start');
    element.style?.removeProperty('--libtv-karaoke-duration');
  }
  const result = [],
    start = Number(cue.getAttribute('data-start')) || 0,
    duration = Number(cue.getAttribute('data-duration')) || 0;
  for (const group of groups) {
    const tokens = group.map((text) => timedTextWordTokens(text.textContent || ''));
    const count = tokens.flat().length;
    let index = 0;
    group.forEach((text, textIndex) => {
      const fragment = document.createDocumentFragment();
      for (const token of tokens[textIndex]) {
        const word = document.createElement('span');
        const from = Math.round((start + (duration * index) / count) * 1000) / 1000;
        const to = Math.round((start + (duration * ++index) / count) * 1000) / 1000;
        word.setAttribute(START, ms(from));
        word.setAttribute(DURATION, ms(to - from));
        word.textContent = token;
        markWord(word);
        fragment.appendChild(word);
        result.push(word);
      }
      text.parentNode.replaceChild(fragment, text);
    });
  }
  if (result.length) cue.setAttribute('data-text-mode', 'words');
  return result;
}
function installStyle(document) {
  if (document.getElementById(STYLE)) return;
  const style = document.createElement('style');
  style.id = STYLE;
  style.textContent = `@keyframes libtv-subtitle-karaoke-highlight-text { to { color: var(${COLOR}, #FFFFFF); } }
@keyframes libtv-subtitle-karaoke-highlight-background { from, to { background-color: var(${BACKGROUND}, #000000); } }
[${ENABLED}] [${UNIT}] { display: inline-block; animation-name: libtv-subtitle-karaoke-highlight-text, libtv-subtitle-karaoke-highlight-background; animation-duration: 1ms, var(--libtv-karaoke-duration); animation-delay: var(--libtv-karaoke-start), var(--libtv-karaoke-start); animation-timing-function: steps(1, end), linear; animation-fill-mode: forwards, none; }`;
  document.head.appendChild(style);
}
/** Source lM/lP: retain valid source words, otherwise tokenize each language separately. */
export function applyWordHighlight(
  document,
  cue,
  { enabled, textColor: color, backgroundColor } = {},
) {
  if (!cue) return;
  const target = cue.querySelector('[data-libtv-text]');
  if (!target) return;
  if (enabled === true) {
    if (materializeWords(document, cue).length) {
      cue.setAttribute(ENABLED, '');
      installStyle(document);
    } else {
      cue.removeAttribute(ENABLED);
      clearUnits(cue);
    }
  } else if (enabled === false) {
    cue.removeAttribute(ENABLED);
    clearUnits(cue);
  }
  if (color != null) target.style.setProperty(COLOR, color);
  if (backgroundColor != null) target.style.setProperty(BACKGROUND, backgroundColor);
}
export function readWordHighlight(cue) {
  const target = cue?.querySelector('[data-libtv-text]');
  return {
    wordHighlightEnabled: cue?.hasAttribute(ENABLED) || false,
    highlightTextColor: target?.style.getPropertyValue(COLOR).trim() || '#FFFFFF',
    highlightBackgroundColor: target?.style.getPropertyValue(BACKGROUND).trim() || '#000000',
  };
}
