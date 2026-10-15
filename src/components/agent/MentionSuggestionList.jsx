import { useEffect } from 'react';
import { isSelectableMentionRow } from '../../services/agent-mention-rows.js';
import AgentMentionIcon from './AgentMentionIcon.jsx';

export default function MentionSuggestionList({
  suggestion,
  selected,
  onSelect,
  onHover,
  listRoot,
  position,
}) {
  useEffect(() => {
    listRoot.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [selected, suggestion.items, listRoot]);
  return (
    <div
      ref={listRoot}
      className={`agent-rich-suggestions ${suggestion.grouped ? 'is-grouped' : ''}`}
      style={position}
      role="listbox"
      aria-label={suggestion.kind === 'skill' ? 'Skill 建议' : '引用建议'}
      aria-busy={suggestion.loading}
    >
      {!suggestion.grouped && <strong>{suggestion.kind === 'skill' ? 'Skill' : '引用'}</strong>}
      {suggestion.loading && <p role="status">搜索中…</p>}
      {!suggestion.loading && !suggestion.items?.length && (
        <p>未找到相关{suggestion.kind === 'skill' ? ' Skill' : '引用'}</p>
      )}
      {!suggestion.loading &&
        suggestion.items?.map((row, index) => {
          if (row.rowKind === 'header')
            return (
              <div className="agent-mention-header" key={row.id}>
                {row.label}
              </div>
            );
          if (row.rowKind === 'empty')
            return (
              <div className="agent-mention-empty" key={row.id}>
                {row.label}
              </div>
            );
          const image =
            row.reference?.type === 'node' && row.reference.mediaType === 'image'
              ? row.reference.url
              : row.icon;
          return (
            <button
              type="button"
              role="option"
              aria-selected={index === selected}
              aria-disabled={row.disabled || undefined}
              disabled={row.disabled}
              key={`${row.id}:${index}`}
              title={row.disabledReason || row.label}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => isSelectableMentionRow(row) && onHover(index)}
              onClick={() => onSelect(row)}
            >
              {suggestion.grouped &&
                (image ? (
                  <img className="agent-mention-icon" src={image} alt="" />
                ) : (
                  <AgentMentionIcon
                    reference={row.reference}
                    name={row.rowKind === 'loadMore' ? 'more' : undefined}
                  />
                ))}
              <span>
                {row.label}
                {!suggestion.grouped && <small>/{row.reference?.id}</small>}
              </span>
              {suggestion.grouped && row.vip && (
                <AgentMentionIcon name="icon-premium-filled" className="agent-mention-vip" />
              )}
            </button>
          );
        })}
    </div>
  );
}
