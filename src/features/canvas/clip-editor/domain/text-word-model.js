/** Source an: CJK code points, otherwise words; punctuation/spacing stays attached. */
export function timedTextWordTokens(text) {
  const words = [],
    pattern =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
  let offset = 0,
    prefix = '';
  for (const match of text.matchAll(pattern)) {
    const gap = text.slice(offset, match.index);
    if (gap) {
      if (words.length) words[words.length - 1] += gap;
      else prefix += gap;
    }
    words.push(prefix + match[0]);
    prefix = '';
    offset = match.index + match[0].length;
  }
  const tail = text.slice(offset);
  if (tail) {
    if (words.length) words[words.length - 1] += tail;
    else words.push(tail);
  }
  return words;
}
