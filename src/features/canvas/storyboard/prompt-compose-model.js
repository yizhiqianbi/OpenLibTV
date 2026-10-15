/** Public ScriptV2 oi/op/om/oh and workspace rules; no store, clock, or IO. */
export const SCRIPT_PROMPT_UNDO_MS = 20_000;
const tracks = {
  image: {
    text: 'imageGenerationPrompt',
    refs: 'finalImagePromptEntityRefs',
    state: 'imagePromptState',
  },
  video: {
    text: 'videoMotionPrompt',
    refs: 'finalVideoPromptEntityRefs',
    state: 'videoPromptState',
  },
};
const normalize = (value) => value?.trim().replace(/\s+/g, ' ') || undefined;
const buckets = (assets) => ({
  characters: Array.isArray(assets?.characters) ? assets.characters : [],
  scenes: Array.isArray(assets?.scenes) ? assets.scenes : [],
  props: Array.isArray(assets?.props) ? assets.props : [],
});
const byId = (items) =>
  new Map(
    items
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => [item.id, item]),
  );
const assetName = (asset) => (typeof asset?.name === 'string' ? normalize(asset.name) : undefined);

/** Module 16353 uses sorted keys and two FNV-1a seeds, unlike row textHash/payloadHash. */
export function stableScriptPromptFingerprint(namespace, value) {
  const serialize = (item) => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(',')}]`;
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(item[key])}`)
      .join(',')}}`;
  };
  const input = serialize(value);
  const hash = (seed) => {
    let result = seed;
    for (let index = 0; index < input.length; index += 1) {
      result ^= input.charCodeAt(index);
      result = Math.imul(result, 0x1000193);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  };
  return `${namespace}:${hash(0x811c9dc5)}${hash(0x9e3779b9)}`;
}

export function readScriptPromptInput(row, assets, visualStyle) {
  const groups = buckets(assets);
  const diagnostics = [];
  const resolveIds = (ids, items, role) => {
    const itemsById = byId(items);
    const seen = new Set();
    const result = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const item = itemsById.get(id);
      const name = assetName(item);
      if (!item || !name) diagnostics.push({ code: 'unresolved-asset', role, assetId: id });
      else result.push({ assetId: id, name, role });
    }
    return result;
  };
  const charactersById = byId(groups.characters);
  const seen = new Set();
  const characters = [];
  for (const character of row.characters ?? []) {
    const id = character.characterAssetId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = assetName(charactersById.get(id)) ?? normalize(character.characterName);
    if (!name) diagnostics.push({ code: 'unresolved-asset', role: 'character', assetId: id });
    else characters.push({ assetId: id, name, role: 'character' });
  }
  const dialogue = [];
  const voiceover = [];
  if (row.dialogueLines?.length) {
    for (const line of row.dialogueLines) {
      const text = normalize(line.text);
      if (!text) continue;
      const speaker = line.characterRef
        ? assetName(charactersById.get(line.characterRef))
        : undefined;
      if (line.kind === 'voiceover')
        voiceover.push(`${speaker ? `[旁白·${speaker}]` : '[旁白]'}：${text}`);
      else dialogue.push(speaker ? `${speaker}：${text}` : text);
    }
    // Structured dialogue suppresses legacy dialogue, but absent voiceover still falls back.
    if (!voiceover.length && normalize(row.voiceover))
      voiceover.push(`[旁白]：${normalize(row.voiceover)}`);
  } else {
    if (normalize(row.dialogue)) dialogue.push(normalize(row.dialogue));
    if (normalize(row.voiceover)) voiceover.push(`[旁白]：${normalize(row.voiceover)}`);
  }
  const audio = normalize(row.audioEffects);
  return {
    durationSeconds: row.durationSeconds > 0 ? row.durationSeconds : undefined,
    plot: normalize(row.plotDescription),
    shotSize: normalize(row.shotSize) ?? normalize(row.cinematics?.shotSize),
    characters,
    scenes: resolveIds(row.sceneAssetIds ?? [], groups.scenes, 'scene'),
    props: resolveIds(row.propAssetIds ?? [], groups.props, 'prop'),
    lighting: normalize(row.lightingAndAtmosphere) ?? normalize(row.cinematics?.lighting),
    cameraMovement: normalize(row.cinematics?.cameraMovement),
    dialogue,
    voiceover,
    sounds: audio ? [audio] : [normalize(row.bgm), normalize(row.sfx)].filter(Boolean),
    visualStyle: normalize(visualStyle),
    diagnostics,
  };
}

export function fingerprintScriptPromptInput(row, assets, visualStyle, track) {
  const { diagnostics: _diagnostics, ...input } = readScriptPromptInput(row, assets, visualStyle);
  return stableScriptPromptFingerprint(`prompt-input-${track}-v1`, input);
}

// Module 892147 preserves internal name whitespace and later buckets win duplicate names.
export function buildScriptAssetNameMap(assets) {
  const result = new Map();
  for (const items of Object.values(buckets(assets))) {
    for (const item of items) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.name !== 'string'
      )
        continue;
      const name = item.name.trim();
      if (name) result.set(name, item.id);
    }
  }
  return result;
}

export function buildScriptAssetIdToNameMap(assets) {
  const result = new Map();
  for (const item of Object.values(buckets(assets)).flat()) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof item.id === 'string' &&
      item.id.trim() &&
      typeof item.name === 'string' &&
      item.name.trim()
    )
      result.set(item.id, item.name);
  }
  return result;
}

/** 892147 f: longest names, ASCII boundaries, and the source ASCII-@ scanner. */
export function parseScriptAssetMentions(text, assets) {
  const map = assets instanceof Map ? assets : buildScriptAssetNameMap(assets);
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!names.length) return [{ type: 'text', value: text }];
  const result = [];
  const ascii = (char) => /^[a-zA-Z0-9]$/.test(char);
  let index = 0;
  while (index < text.length) {
    if (text[index] === '@' || text[index] === '＠') {
      if (!(index > 0 && ascii(text[index - 1]))) {
        const name = names.find((name) => {
          if (!text.startsWith(name, index + 1)) return false;
          const after = text[index + 1 + name.length] ?? '';
          return !(ascii(name.at(-1) ?? '') && ascii(after));
        });
        if (name) {
          result.push({ type: 'mention', value: `@${name}`, assetId: map.get(name) });
          index += name.length + 1;
          continue;
        }
      }
    }
    const next = text.indexOf('@', index + 1);
    const end = next === -1 ? text.length : next;
    result.push({ type: 'text', value: text.slice(index, end) });
    index = end;
  }
  return result;
}

/** 892147 u: UTF-16 ranges include an immediately preceding @/＠. */
export function findScriptPromptRefMatches(text, refs) {
  if (!text || !refs?.length) return [];
  const matches = [];
  const seen = new Set();
  const ascii = (char) => /^[a-zA-Z0-9]$/.test(char);
  for (const ref of refs) {
    const value = ref.text.trim();
    if (!value) continue;
    let offset = 0;
    while (offset < text.length) {
      const index = text.indexOf(value, offset);
      if (index === -1) break;
      const end = index + value.length;
      const before = index > 0 ? text[index - 1] : '';
      const after = end < text.length ? text[end] : '';
      if (!(ascii(value.at(-1) ?? '') && ascii(after))) {
        const start = before === '@' || before === '＠' ? index - 1 : index;
        const key = `${ref.assetId}\0${ref.text}\0${start}\0${end}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({ ref, start, end, sourceText: text.slice(start, end) });
        }
      }
      offset = end;
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const result = [];
  let end = 0;
  for (const match of matches) {
    if (match.start < end) continue;
    result.push(match);
    end = match.end;
  }
  return result;
}

/** 421201 backfills canonical names and unambiguous suffixes, including bare names. */
function resolveComposedEntityRefs(text, assets) {
  const canonical = buildScriptAssetNameMap(assets);
  const names = new Map(canonical);
  const suffixes = new Map();
  for (const [name, id] of canonical) {
    const points = Array.from(name);
    const minimum = Math.max(2, Math.ceil(0.6 * points.length));
    for (let index = 1; index < points.length; index += 1) {
      const suffix = points.slice(index).join('');
      if (Array.from(suffix).length < minimum) continue;
      const candidates = suffixes.get(suffix) ?? [];
      candidates.push({ name, id });
      suffixes.set(suffix, candidates);
    }
  }
  for (const [suffix, candidates] of suffixes) {
    if (names.has(suffix)) continue;
    candidates.sort((a, b) => Array.from(b.name).length - Array.from(a.name).length);
    if (
      candidates.length === 1 ||
      Array.from(candidates[0].name).length > Array.from(candidates[1].name).length
    )
      names.set(suffix, candidates[0].id);
  }
  const points = Array.from(text);
  const occupied = Array(points.length).fill(false);
  const found = [];
  const candidates = [...names].map(([name, id]) => ({ name, id, points: Array.from(name) }));
  candidates.sort((a, b) => b.points.length - a.points.length);
  for (const candidate of candidates) {
    for (let index = 0; index <= points.length - candidate.points.length;) {
      const matches = candidate.points.every((point, offset) => point === points[index + offset]);
      if (!matches) {
        index += 1;
        continue;
      }
      const end = index + candidate.points.length;
      if (!occupied.slice(index, end).some(Boolean)) {
        found.push({ text: candidate.name, assetId: candidate.id });
        occupied.fill(true, index, end);
      }
      index = end;
    }
  }
  const pointIndex = (name) => {
    const chars = Array.from(name);
    return points.findIndex((_, index) =>
      chars.every((char, offset) => points[index + offset] === char),
    );
  };
  found.sort((a, b) => pointIndex(a.text) - pointIndex(b.text));
  const ids = new Set();
  return found.filter((ref) => {
    if (ids.has(ref.assetId)) return false;
    ids.add(ref.assetId);
    return true;
  });
}

export function composeScriptPromptTracks(
  row,
  assets,
  visualStyle,
  selectedTracks = ['image', 'video'],
) {
  const input = readScriptPromptInput(row, assets, visualStyle);
  const empty = !(
    input.durationSeconds ||
    input.plot ||
    input.shotSize ||
    input.characters.length ||
    input.scenes.length ||
    input.props.length ||
    input.lighting ||
    input.cameraMovement ||
    input.dialogue.length ||
    input.voiceover.length ||
    input.sounds.length ||
    input.visualStyle
  );
  const { diagnostics, ...fingerprintInput } = input;
  const mentionList = (items) => items.map((item) => `@${item.name}`).join('，') || undefined;
  const endSentence = (text) => (/[。！？.!?]$/.test(text) ? text : `${text}。`);
  return Object.fromEntries(
    selectedTracks.map((track) => {
      if (empty) return [track, { status: 'empty', diagnostics }];
      const sections = [];
      const field = (label, value) => {
        if (value !== undefined && value !== '')
          sections.push(`${label}：${endSentence(String(value))}`);
      };
      const duration = input.durationSeconds ? `${input.durationSeconds} 秒` : undefined;
      if (track === 'image')
        field('镜头规格', [input.shotSize, duration].filter(Boolean).join('，'));
      else field('时序规格', duration);
      field('画面内容', input.plot);
      field('角色', mentionList(input.characters));
      field('场景', mentionList(input.scenes));
      field('道具', mentionList(input.props));
      if (track === 'image') field('光影氛围', input.lighting);
      field('运镜', input.cameraMovement);
      const spoken = [...input.dialogue, ...input.voiceover];
      if (spoken.length)
        sections.push(`对白与旁白：\n${spoken.map((line) => `- ${endSentence(line)}`).join('\n')}`);
      field('声音', input.sounds.length ? input.sounds.join('；') : undefined);
      if (track === 'video') {
        field('景别', input.shotSize);
        field('光影氛围', input.lighting);
      }
      field('视觉风格', input.visualStyle);
      const text = sections.join('\n\n');
      const entityRefs = resolveComposedEntityRefs(text, assets);
      return [
        track,
        {
          status: 'composed',
          bundle: { text, entityRefs: entityRefs.length ? entityRefs : undefined },
          inputFingerprint: stableScriptPromptFingerprint(
            `prompt-input-${track}-v1`,
            fingerprintInput,
          ),
          diagnostics: [
            ...diagnostics,
            ...(text.length > 5000 ? [{ code: 'prompt-too-long', length: text.length }] : []),
          ],
        },
      ];
    }),
  );
}

export function getScriptPromptBundle(row, track) {
  const fields = tracks[track];
  return { text: row[fields.text] ?? '', entityRefs: row[fields.refs] };
}
export function fingerprintScriptPromptBundle(bundle) {
  return stableScriptPromptFingerprint('prompt-bundle-v1', {
    text: bundle.text,
    entityRefs: bundle.entityRefs?.length
      ? [...bundle.entityRefs].sort(
          (a, b) => a.assetId.localeCompare(b.assetId) || a.text.localeCompare(b.text),
        )
      : [],
  });
}
export function applyScriptPromptEdit(row, track, bundle) {
  const fields = tracks[track];
  return {
    ...row,
    [fields.text]: bundle.text,
    [fields.refs]: bundle.entityRefs?.length ? [...bundle.entityRefs] : undefined,
  };
}
export const getScriptPromptState = (row, track) => row[tracks[track].state];
export const withScriptPromptState = (row, track, state) => ({
  ...row,
  [tracks[track].state]: state,
});
export const applyScriptComposedSnapshot = (row, track, bundle) =>
  withScriptPromptState(applyScriptPromptEdit(row, track, bundle), track, 'synced');

/** 892147 manual edits retain existing refs by substring, and add explicit @ names. */
export function reconcileScriptPromptRefsForTextEdit({ oldText, newText, oldRefs, assets }) {
  if (oldText === newText) return oldRefs?.length ? oldRefs : undefined;
  const result =
    oldRefs?.length && newText ? oldRefs.filter((ref) => newText.includes(ref.text)) : [];
  const names = buildScriptAssetNameMap(assets);
  if (newText && names.size)
    result.push(
      ...parseScriptAssetMentions(newText, names).flatMap((part) =>
        part.type === 'mention' && part.assetId
          ? [{ text: part.value.slice(1), assetId: part.assetId }]
          : [],
      ),
    );
  const seen = new Set();
  const unique = result.filter((ref) => {
    const key = `${ref.assetId}\0${ref.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length ? unique : undefined;
}

const nonempty = (row, track) => getScriptPromptBundle(row, track).text.trim().length > 0;
export function initialScriptPromptSelection(rows, initialIds) {
  const current = new Set(rows.map((row) => row.id));
  return new Set(
    initialIds === undefined
      ? rows
          .filter((row) => !nonempty(row, 'image') || !nonempty(row, 'video'))
          .map((row) => row.id)
      : initialIds.filter((id) => current.has(id)),
  );
}

export function captureScriptPromptCompose({ rows, rowIds, tracks: selectedTracks }) {
  const selected = new Set(rowIds);
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const overwrite = selectedRows.flatMap((row) =>
    selectedTracks
      .filter((track) => nonempty(row, track))
      .map((track) => ({ rowId: row.id, track })),
  );
  return {
    rowIds: selectedRows.map((row) => row.id),
    tracks: [...selectedTracks],
    bundleFingerprints: Object.fromEntries(
      selectedRows.map((row) => [
        row.id,
        Object.fromEntries(
          selectedTracks.map((track) => [
            track,
            fingerprintScriptPromptBundle(getScriptPromptBundle(row, track)),
          ]),
        ),
      ]),
    ),
    overwrite: {
      shotCount: new Set(overwrite.map((item) => item.rowId)).size,
      trackCount: overwrite.length,
    },
  };
}

/** A projection only. The caller confirms first and commits against the same latest rows. */
export function planScriptPromptCompose({ rows, assets, visualStyle, request }) {
  let successful = 0;
  let skipped = 0;
  let failed = 0;
  const undoEntries = [];
  const replacements = new Map();
  for (const id of request.rowIds) {
    const current = rows.find((row) => row.id === id);
    if (
      !current ||
      request.tracks.some(
        (track) =>
          request.bundleFingerprints[id]?.[track] !==
          fingerprintScriptPromptBundle(getScriptPromptBundle(current, track)),
      )
    ) {
      failed += 1;
      continue;
    }
    try {
      const results = composeScriptPromptTracks(current, assets, visualStyle, request.tracks);
      let next = current;
      for (const track of request.tracks) {
        const result = results[track];
        if (!result || result.status === 'empty') continue;
        const beforeBundle = getScriptPromptBundle(next, track);
        const beforeState = getScriptPromptState(next, track);
        const shouldUndo = nonempty(next, track);
        next = applyScriptComposedSnapshot(next, track, result.bundle);
        if (shouldUndo)
          undoEntries.push({
            rowId: id,
            track,
            beforeBundle,
            beforeState,
            afterFingerprint: fingerprintScriptPromptBundle(getScriptPromptBundle(next, track)),
          });
      }
      if (next === current) skipped += 1;
      else {
        replacements.set(id, next);
        successful += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return {
    status: successful ? 'applied' : failed ? 'failed' : 'empty',
    rows: successful ? rows.map((row) => replacements.get(row.id) ?? row) : rows,
    successful,
    skipped,
    failed,
    undoEntries,
  };
}

export function createScriptPromptUndo(entries, now) {
  return entries.length
    ? { entries: [...entries], expiresAt: now + SCRIPT_PROMPT_UNDO_MS }
    : undefined;
}
export function planScriptPromptUndo({ rows, undo, now }) {
  if (!undo || now >= undo.expiresAt) return { status: 'missing', rows };
  for (const entry of undo.entries) {
    const row = rows.find((row) => row.id === entry.rowId);
    if (
      !row ||
      fingerprintScriptPromptBundle(getScriptPromptBundle(row, entry.track)) !==
        entry.afterFingerprint
    )
      return { status: 'conflict', rows };
  }
  const entriesByRow = new Map();
  for (const entry of undo.entries) {
    const entries = entriesByRow.get(entry.rowId) ?? [];
    entries.push(entry);
    entriesByRow.set(entry.rowId, entries);
  }
  return {
    status: 'applied',
    rows: rows.map((row) => {
      let next = row;
      for (const entry of entriesByRow.get(row.id) ?? [])
        next = withScriptPromptState(
          applyScriptPromptEdit(next, entry.track, entry.beforeBundle),
          entry.track,
          entry.beforeState,
        );
      return next;
    }),
  };
}
