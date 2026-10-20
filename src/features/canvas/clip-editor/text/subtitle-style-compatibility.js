import { readSubtitleHtml, serializeTextHtml } from './html-document.js';

// Archived source rs/ru/ln/ld/aZ: eight injectable properties, with font shorthand
// and animated declarations reserving the original style instead of guessing.
const bindings = [
  ['font-family', ['--libtvSubtitleFontFamily'], ['inherit']],
  ['font-size', ['--libtvSubtitleFontSize'], ['inherit']],
  ['font-weight', ['--libtvSubtitleFontWeight'], ['inherit']],
  ['line-height', ['--libtvSubtitleLineHeight'], ['inherit']],
  ['color', ['--libtvSubtitleColor'], ['inherit']],
  ['letter-spacing', ['--libtvSubtitleLetterSpacing'], ['inherit']],
  ['text-shadow', ['--libtvSubtitleTextShadow'], ['inherit']],
  [
    '-webkit-text-stroke',
    ['--libtvSubtitleStrokeWidth', '--libtvSubtitleStrokeColor'],
    ['0', 'transparent'],
  ],
];
const shorthand = ['font-family', 'font-size', 'font-weight', 'line-height'];
const ranks = { absent: 0, var: 1, retrofitted: 2, blocked: 3 };
const overrideId = 'libtv-subtitle-overrides';
const dimension =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:px|em|rem|pt|vw|vh|vmin|vmax|%|q|cm|mm|in|pc|ex|ch)?$/i;
const fields = {
  fontFamily: 'font-family',
  fontSizePx: 'font-size',
  fontWeight: 'font-weight',
  lineHeightPct: 'line-height',
  color: 'color',
  letterSpacingPx: 'letter-spacing',
  shadowColor: 'text-shadow',
  shadowOpacityPct: 'text-shadow',
  shadowXPx: 'text-shadow',
  shadowYPx: 'text-shadow',
  shadowBlurPx: 'text-shadow',
  textShadow: 'text-shadow',
  strokeColor: '-webkit-text-stroke',
  strokeWidthPx: '-webkit-text-stroke',
};

function quotedEnd(value, index) {
  if (value.startsWith('/*', index)) {
    const end = value.indexOf('*/', index + 2);
    return end < 0 ? value.length : end + 2;
  }
  const quote = value[index];
  if (quote !== '"' && quote !== "'") return null;
  for (let next = index + 1; next < value.length; next++) {
    if (value[next] === '\\') next++;
    else if (value[next] === quote) return next + 1;
  }
  return value.length;
}
function splitOutside(value, separator) {
  const result = [];
  let depth = 0,
    start = 0;
  for (let index = 0; index < value.length; index++) {
    const end = quotedEnd(value, index);
    if (end != null) {
      index = end - 1;
      continue;
    }
    if (value[index] === '(') depth++;
    else if (value[index] === ')') depth = Math.max(0, depth - 1);
    else if (!depth && separator.test(value[index])) {
      result.push(value.slice(start, index));
      start = index + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}
function declaration(value) {
  const parts = splitOutside(value, /:/);
  if (parts.length < 2) return null;
  return {
    prefix: parts[0],
    property: parts[0]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .toLowerCase(),
    value: parts.slice(1).join(':'),
  };
}
function stroke(value) {
  const tokens = splitOutside(value, /\s/).filter(Boolean);
  const widths = tokens.filter((token) => dimension.test(token));
  if (widths.length !== 1) return null;
  return `var(--libtvSubtitleStrokeWidth, ${widths[0]}) var(--libtvSubtitleStrokeColor, ${tokens.filter((token) => token !== widths[0]).join(' ') || 'currentColor'})`;
}
function binding(property) {
  const exact = bindings.find(([key]) => key === property);
  if (exact && !property.endsWith('text-stroke'))
    return { property, build: (value) => `var(${exact[1][0]}, ${value})` };
  if (/^(?:-webkit-)?text-stroke$/.test(property))
    return { property: '-webkit-text-stroke', build: stroke };
  const part = property.match(/^(?:-webkit-)?text-stroke-(width|color)$/);
  return part
    ? {
        property: '-webkit-text-stroke',
        build: (value) =>
          `var(--libtvSubtitleStroke${part[1] === 'width' ? 'Width' : 'Color'}, ${value})`,
      }
    : null;
}
function declarations(value, record, detect) {
  const parts = splitOutside(value, /;/).map((part) => {
    const item = declaration(part);
    if (!item || item.property.startsWith('--')) return part;
    if (item.property === 'font') {
      shorthand.forEach((key) => record(key, 'blocked'));
      return part;
    }
    const target = binding(item.property);
    if (!target) return part;
    if (detect) {
      record(target.property, 'blocked');
      return part;
    }
    const important = item.value.match(/\s*!\s*important\s*$/i)?.[0] || '';
    const body = important ? item.value.slice(0, -important.length) : item.value;
    const literal = body.trim();
    if (!literal) return part;
    if (/var\(\s*--libtvSubtitle/i.test(literal)) {
      record(target.property, 'var');
      return part;
    }
    const next = target.build(literal);
    if (next == null) {
      record(target.property, 'blocked');
      return part;
    }
    record(target.property, 'retrofitted');
    return `${item.prefix}:${body.slice(0, body.length - body.trimStart().length)}${next}${body.slice(body.trimEnd().length)}${important}`;
  });
  // Both spellings are used by the source; preserve existing matching pairs.
  for (let index = 0; index < parts.length; index++) {
    const item = declaration(parts[index]);
    if (!item || !/^(?:-webkit-)?text-stroke(?:-(?:width|color))?$/.test(item.property)) continue;
    const opposite = item.property.startsWith('-webkit-')
      ? item.property.slice(8)
      : `-webkit-${item.property}`;
    const next = declaration(parts[index + 1] || '');
    if (next?.property === opposite && next.value.trim() === item.value.trim()) {
      index++;
      continue;
    }
    parts[index] += `;${opposite}:${item.value}`;
  }
  return parts.join(';');
}
function stylesheet(value, record) {
  const root = { prelude: '', parts: [], nested: false, mode: 'rewrite' };
  const stack = [root];
  let text = '';
  for (let index = 0; index < value.length; index++) {
    const end = quotedEnd(value, index);
    if (end != null) {
      text += value.slice(index, end);
      index = end - 1;
      continue;
    }
    if (value[index] === '{') {
      const parent = stack.at(-1);
      parent.nested = true;
      const prelude = text.replace(/\/\*[\s\S]*?\*\//g, '').trim();
      const mode =
        parent.mode !== 'rewrite'
          ? parent.mode
          : /^@font-face\b/i.test(prelude)
            ? 'ignore'
            : /^@(?:(?:-[a-z]+-)?keyframes|counter-style|property|page|viewport)\b/i.test(prelude)
              ? 'detect'
              : 'rewrite';
      stack.push({ prelude: text, parts: [], nested: false, mode });
      text = '';
    } else if (value[index] === '}' && stack.length > 1) {
      const frame = stack.pop();
      const body = frame.parts.join('') + text;
      stack
        .at(-1)
        .parts.push(
          `${frame.prelude}{${frame.mode === 'ignore' || frame.nested ? body : declarations(body, record, frame.mode === 'detect')}}`,
        );
      text = '';
    } else text += value[index];
  }
  while (stack.length > 1) {
    const frame = stack.pop();
    stack.at(-1).parts.push(`${frame.prelude}{${frame.parts.join('')}${text}`);
    text = '';
  }
  return root.parts.join('') + text;
}

export function subtitleStyleCompatibility(document, { apply = false } = {}) {
  const properties = Object.fromEntries(bindings.map(([key]) => [key, 'absent']));
  const record = (key, status) => {
    if (ranks[status] > ranks[properties[key]]) properties[key] = status;
  };
  let changed = false;
  for (const element of document.querySelectorAll('style')) {
    if ([overrideId, 'libtv-subtitle-fonts'].includes(element.id)) continue;
    const original = element.textContent || '';
    const next = stylesheet(original, record);
    if (apply && original !== next) {
      element.textContent = next;
      changed = true;
    }
  }
  for (const element of document.querySelectorAll('[style]')) {
    const original = element.getAttribute('style');
    const next = declarations(original, record, false);
    if (apply && original !== next) {
      element.setAttribute('style', next);
      changed = true;
    }
  }
  const disabledStyleProperties = bindings
    .filter(([key]) => properties[key] === 'blocked')
    .map(([key]) => key);
  const level =
    disabledStyleProperties.length === bindings.length
      ? 'L2'
      : disabledStyleProperties.length
        ? 'L1'
        : 'L0';
  const styleText = [...document.querySelectorAll('style')]
    .map((element) => element.textContent || '')
    .join('\n');
  return {
    level,
    readOnly: level === 'L2',
    properties,
    disabledStyleProperties,
    changed,
    hasScript: Boolean(document.querySelector('script')),
    hasAnimation: /@(?:-webkit-)?keyframes\b|\banimation(?:-[\w-]+)?\s*:/i.test(styleText),
    convertible: level === 'L2',
  };
}

function stripAnimationRules(css) {
  let output = css;
  const pattern = /@(?:-webkit-)?keyframes\b[^{}]*\{/gi;
  for (;;) {
    const match = pattern.exec(output);
    if (!match) break;
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < output.length && depth) {
      if (output[index] === '{') depth++;
      else if (output[index] === '}') depth--;
      index++;
    }
    output = `${output.slice(0, match.index)}${output.slice(index)}`;
    pattern.lastIndex = match.index;
  }
  return output.replace(/\banimation(?:-[\w-]+)?\s*:\s*[^;{}]+;?/gi, '');
}

/** Explicit L2 conversion: remove only unsupported script/animation entry points, then retrofit. */
export function convertSubtitleToEditable(html) {
  const model = readSubtitleHtml(html);
  if (!model.ok) return { ok: false, html, issues: model.issues };
  const compatibility = subtitleStyleCompatibility(model.document);
  if (!compatibility.convertible) return { ok: true, html, changed: false, compatibility };
  for (const script of model.document.querySelectorAll('script')) script.remove();
  for (const style of model.document.querySelectorAll('style'))
    style.textContent = stripAnimationRules(style.textContent || '');
  const converted = retrofitSubtitleStyles(serializeTextHtml(model.document));
  return {
    ok: true,
    html: converted.html,
    changed: converted.html !== html,
    compatibility: {
      ...converted.compatibility,
      convertedFrom: 'L2',
      lostAnimation: compatibility.hasAnimation || compatibility.hasScript,
    },
  };
}

export function retrofitSubtitleStyles(html) {
  const model = readSubtitleHtml(html);
  if (!model.ok) throw new Error(model.issues[0].detail);
  const compatibility = subtitleStyleCompatibility(model.document, { apply: true });
  const absent = bindings.filter(([key]) => compatibility.properties[key] === 'absent');
  const previous = model.document.getElementById(overrideId);
  const base =
    ':root, html, body { color-scheme: dark !important; }\n[data-libtv-hidden="true"], [data-libtv-track-hidden="true"] { display: none !important; }';
  const fallback = absent.length
    ? `[data-libtv-cue-id] {\n${absent
        .flatMap(([property, vars, fallbacks]) => {
          const value = vars.map((key, index) => `var(${key}, ${fallbacks[index]})`).join(' ');
          return [
            `  ${property}: ${value};`,
            ...(property === '-webkit-text-stroke' ? [`  text-stroke: ${value};`] : []),
          ];
        })
        .join('\n')}\n}`
    : '';
  const css = [base, fallback].filter(Boolean).join('\n');
  if (previous?.textContent !== css) {
    const style = previous || model.document.createElement('style');
    style.id = overrideId;
    style.textContent = css;
    if (!previous) model.document.head.append(style);
    compatibility.changed = true;
  }
  return { html: compatibility.changed ? serializeTextHtml(model.document) : html, compatibility };
}

export function subtitleFieldAllowed(compatibility, field) {
  return (
    !compatibility?.readOnly &&
    (!fields[field] || compatibility?.properties[fields[field]] !== 'blocked')
  );
}

export function subtitlePatchesAllowed(compatibility, patches = []) {
  if (compatibility.readOnly) return false;
  const blocked = subtitleBlockedVars(compatibility);
  return patches.every((patch) =>
    patch.kind === 'styleVar'
      ? !Object.keys(patch.vars).some((key) => blocked.includes(key))
      : patch.kind !== 'clearTextStyle' ||
        blocked.every((key) => patch.preserveVars?.includes(key)),
  );
}
export function subtitleBlockedVars(compatibility) {
  return bindings
    .filter(([property]) => compatibility.properties[property] === 'blocked')
    .flatMap(([, vars]) => vars);
}
