// Line comparison used by the source-backed read-only and editable diff views.
// Hirschberg's LCS keeps memory linear for the allowed 20,000-character files.
function lcsRow(a, start, end, b, left, right, reverse = false) {
  const width = right - left;
  let previous = new Uint32Array(width + 1);
  for (let index = 0; index < end - start; index += 1) {
    const next = new Uint32Array(width + 1);
    const line = a[reverse ? end - index - 1 : start + index];
    for (let column = 1; column <= width; column += 1) {
      next[column] =
        line === b[reverse ? right - column : left + column - 1]
          ? previous[column - 1] + 1
          : Math.max(previous[column], next[column - 1]);
    }
    previous = next;
  }
  return previous;
}

function matchingLines(a, start, end, b, left, right, matches) {
  if (start === end || left === right) return;
  if (end - start === 1) {
    for (let index = right - 1; index >= left; index -= 1) {
      if (a[start] === b[index]) {
        matches.push([start, index]);
        return;
      }
    }
    return;
  }
  const middle = start + Math.floor((end - start) / 2);
  const forward = lcsRow(a, start, middle, b, left, right);
  const backward = lcsRow(a, middle, end, b, left, right, true);
  let best = -1;
  let split = 0;
  for (let index = 0; index <= right - left; index += 1) {
    const score = forward[index] + backward[right - left - index];
    if (score >= best) {
      best = score;
      split = index;
    }
  }
  matchingLines(a, start, middle, b, left, left + split, matches);
  matchingLines(a, middle, end, b, left + split, right, matches);
}

export function skillDiffLines(original, modified) {
  const oldLines = original === '' ? [] : original.split('\n');
  const newLines = modified === '' ? [] : modified.split('\n');
  const matches = [];
  let prefix = 0;
  while (
    prefix < Math.min(oldLines.length, newLines.length) &&
    oldLines[prefix] === newLines[prefix]
  ) {
    matches.push([prefix, prefix]);
    prefix += 1;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  matchingLines(oldLines, prefix, oldEnd, newLines, prefix, newEnd, matches);
  for (let index = 0; index < oldLines.length - oldEnd; index += 1)
    matches.push([oldEnd + index, newEnd + index]);
  matches.push([oldLines.length, newLines.length]);

  const result = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (const [oldMatch, newMatch] of matches) {
    for (; oldIndex < oldMatch; oldIndex += 1)
      result.push({
        text: oldLines[oldIndex],
        status: 'removed',
        originalLineNum: oldIndex + 1,
        newLineNum: null,
      });
    for (; newIndex < newMatch; newIndex += 1)
      result.push({
        text: newLines[newIndex],
        status: 'added',
        originalLineNum: null,
        newLineNum: newIndex + 1,
      });
    if (oldMatch < oldLines.length && newMatch < newLines.length) {
      result.push({
        text: oldLines[oldMatch],
        status: 'unchanged',
        originalLineNum: oldMatch + 1,
        newLineNum: newMatch + 1,
      });
      oldIndex += 1;
      newIndex += 1;
    }
  }
  // Preserve the original renderer's removed/added pair representation.
  for (let index = 0; index < result.length - 1; index += 1) {
    if (result[index].status === 'removed' && result[index + 1].status === 'added') {
      result[index].status = 'modified';
      result[index].newLineNum = result[index + 1].newLineNum;
      result[index + 1].status = 'modified';
      index += 1;
    }
  }
  return result;
}

export function skillDiffStats(lines) {
  let addedLines = 0;
  let removedLines = 0;
  for (const line of lines) {
    if (line.status === 'added' || (line.status === 'modified' && line.originalLineNum === null))
      addedLines += 1;
    if (line.status === 'removed' || (line.status === 'modified' && line.originalLineNum !== null))
      removedLines += 1;
  }
  return { addedLines, removedLines, hasChanges: addedLines + removedLines > 0 };
}

export function skillDiffDecorations(lines) {
  const changedLines = new Set();
  const removed = [];
  let group = [];
  for (const line of lines) {
    if (
      line.status === 'removed' ||
      (line.status === 'modified' && line.originalLineNum !== null)
    ) {
      group.push(line);
      continue;
    }
    if (group.length) {
      removed.push({ beforeNewLineNum: line.newLineNum, lines: group });
      group = [];
    }
    if (line.status !== 'unchanged' && line.newLineNum !== null) changedLines.add(line.newLineNum);
  }
  if (group.length) removed.push({ beforeNewLineNum: null, lines: group });
  return { changedLines, removed };
}
