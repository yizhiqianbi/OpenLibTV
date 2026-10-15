import React from 'react';
import { ArrowUpRight, AudioLines, CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { PlayerDrawer } from './PlayerSettings.jsx';

function Episode({ section, currentSectionId, onSelect, onGoPractice }) {
  const current = section.sectionId === currentSectionId;
  const Icon = current
    ? AudioLines
    : section.status === 'done'
      ? CheckCircle2
      : section.status === 'learning'
        ? CircleDot
        : Circle;
  return (
    <>
      <button
        type="button"
        className={`academy-player-drawer-episode ${current ? 'is-current' : ''}`}
        disabled={!section.available}
        aria-current={current ? 'true' : undefined}
        onClick={() => onSelect(section.sectionId)}
      >
        <Icon size={16} />
        <span>{section.title}</span>
        {!section.available && <small>即将更新</small>}
      </button>
      {current &&
        section.practiceNodes?.map((node) => (
          <div key={node.practiceNodeUuid} className="academy-player-drawer-practice">
            <span>{node.title}</span>
            {node.done ? (
              <small>已完成</small>
            ) : (
              <button type="button" onClick={() => onGoPractice?.(node.practiceNodeUuid)}>
                去跟练
                <ArrowUpRight size={8} />
              </button>
            )}
          </div>
        ))}
    </>
  );
}

/** Original module 449199 catalog contract. Caller retains authorization/selection. */
export default function LandscapeEpisodeDrawer({
  detail,
  currentSectionId,
  onSelect,
  onGoPractice,
  onClose,
}) {
  return (
    <PlayerDrawer title="课程选集" onClose={onClose}>
      {detail?.units.map((unit) => (
        <div className="academy-player-drawer-unit" key={unit.id}>
          {!unit.implicit && <h4>{unit.title}</h4>}
          {unit.groups.map((group) => (
            <div key={group.id}>
              {!group.implicit && (
                <p className="academy-player-drawer-group">
                  {group.order} {group.title}
                </p>
              )}
              {group.leaves.map((section) => (
                <Episode
                  key={section.sectionId}
                  {...{ section, currentSectionId, onSelect, onGoPractice }}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </PlayerDrawer>
  );
}
