import React from 'react';
import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import './player-drawers.css';

export default function LandscapeTopBar({ title, subtitle, onBack, onOpenSettings }) {
  return (
    <div className="academy-player-landscape-top">
      <button type="button" onClick={onBack} aria-label="返回">
        <ArrowLeft size={16} />
      </button>
      <p>
        {title}
        {subtitle && <span> ｜ {subtitle}</span>}
      </p>
      {onOpenSettings && (
        <button type="button" onClick={onOpenSettings} aria-label="设置">
          <MoreHorizontal size={16} />
        </button>
      )}
    </div>
  );
}
