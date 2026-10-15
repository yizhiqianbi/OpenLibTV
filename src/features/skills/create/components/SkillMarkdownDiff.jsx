import { useMemo } from 'react';
import { skillDiffLines, skillDiffStats } from '../editor-diff.js';
import '../styles/markdown-editor.css';

export default function SkillMarkdownDiff({ original, modified, emptyHint, showStat = false }) {
  const lines = useMemo(() => skillDiffLines(original, modified), [original, modified]);
  const stats = skillDiffStats(lines);
  return (
    <div className="secondary-skill-diff" aria-label="Markdown 改动比较">
      {showStat && (
        <div className="secondary-skill-diff-stat">
          <span className="added">+{stats.addedLines}</span>
          <span className="removed">−{stats.removedLines}</span>
        </div>
      )}
      {!stats.hasChanges && emptyHint ? (
        <div className="secondary-skill-diff-empty">{emptyHint}</div>
      ) : (
        <div className="secondary-skill-diff-lines">
          {lines.map((line, index) => {
            const kind =
              line.status === 'modified'
                ? line.originalLineNum === null
                  ? 'added'
                  : 'removed'
                : line.status;
            return (
              <div key={index} className={`secondary-skill-diff-line ${kind}`}>
                <span aria-hidden="true" className="secondary-skill-diff-number">
                  {kind === 'removed' ? line.originalLineNum : line.newLineNum}
                </span>
                <span>{line.text || ' '}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
