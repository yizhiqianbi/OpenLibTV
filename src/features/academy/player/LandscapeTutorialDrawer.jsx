import React from 'react';
import { AudioLines } from 'lucide-react';
import { PlayerDrawer } from './PlayerSettings.jsx';
import { formatPlayerTime } from './player-model.js';

export default function LandscapeTutorialDrawer({
  tutorials = [],
  currentTutorialId,
  onSelect,
  onClose,
  asset = (url) => url,
}) {
  return (
    <PlayerDrawer title="更多教程视频" onClose={onClose}>
      {tutorials.length === 0 ? (
        <p className="academy-player-drawer-empty">暂无更多教程</p>
      ) : (
        tutorials.map((tutorial) => {
          const id = tutorial.tutorialId || tutorial.tutorialUuid;
          const active = id === currentTutorialId;
          return (
            <button
              type="button"
              key={id}
              className={`academy-player-drawer-tutorial ${active ? 'is-current' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(id)}
            >
              <img src={asset(tutorial.cover)} alt="" />
              <span>
                <strong>
                  {active && <AudioLines size={12} />}
                  {tutorial.title}
                </strong>
                <small>{formatPlayerTime(tutorial.durationSec)}</small>
              </span>
            </button>
          );
        })
      )}
    </PlayerDrawer>
  );
}
