import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  lineNumberMarkers,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { skillDiffDecorations, skillDiffLines } from './editor-diff.js';

class RemovedLines extends WidgetType {
  constructor(lines) {
    super();
    this.lines = lines;
  }
  eq(other) {
    return (
      this.lines.length === other.lines.length &&
      this.lines.every(
        (line, index) =>
          line.text === other.lines[index].text &&
          line.originalLineNum === other.lines[index].originalLineNum,
      )
    );
  }
  toDOM() {
    const element = document.createElement('div');
    element.className = 'cm-skillDiffRemoved';
    element.setAttribute('contenteditable', 'false');
    for (const line of this.lines) {
      const row = document.createElement('div');
      row.className = 'cm-skillDiffRemovedLine';
      row.textContent = line.text || ' ';
      element.appendChild(row);
    }
    return element;
  }
  ignoreEvent() {
    return false;
  }
  get estimatedHeight() {
    return 20 * this.lines.length;
  }
}

class ChangedLineNumber extends GutterMarker {
  elementClass = 'cm-skillDiffChangedGutter';
}

function decorations(state, original) {
  const diff = skillDiffDecorations(skillDiffLines(original, state.doc.toString()));
  const changes = [];
  const gutter = [];
  for (const block of diff.removed) {
    const trailing = block.beforeNewLineNum === null;
    const position = trailing ? state.doc.length : state.doc.line(block.beforeNewLineNum).from;
    changes.push(
      Decoration.widget({
        widget: new RemovedLines(block.lines),
        block: true,
        side: trailing ? 1 : -1,
      }).range(position),
    );
  }
  for (const lineNumber of diff.changedLines) {
    if (lineNumber > state.doc.lines) continue;
    const position = state.doc.line(lineNumber).from;
    changes.push(Decoration.line({ class: 'cm-skillDiffChanged' }).range(position));
    gutter.push(new ChangedLineNumber().range(position));
  }
  return { decorations: Decoration.set(changes, true), gutter: RangeSet.of(gutter, true) };
}

export function skillCodeDiff(original) {
  const recompute = StateEffect.define();
  const field = StateField.define({
    create: (state) => decorations(state, original),
    update(value, transaction) {
      if (transaction.effects.some((effect) => effect.is(recompute)))
        return decorations(transaction.state, original);
      return transaction.docChanged
        ? {
            decorations: value.decorations.map(transaction.changes),
            gutter: value.gutter.map(transaction.changes),
          }
        : value;
    },
  });
  const updates = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.timer = null;
      }
      update(update) {
        if (!update.docChanged) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.view.dispatch({ effects: recompute.of(null) }), 250);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
  );
  return [
    field,
    EditorView.decorations.from(field, (value) => value.decorations),
    lineNumberMarkers.from(field, (value) => value.gutter),
    updates,
  ];
}
