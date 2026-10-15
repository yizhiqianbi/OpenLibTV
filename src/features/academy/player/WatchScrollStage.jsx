import React from 'react';
import { X } from 'lucide-react';
import { usePlayerViewport } from './usePlayerViewport.js';
import { useWatchScrollStage } from './useWatchScrollStage.js';
import { SCROLL_STAGE_FALLBACK_WIDTH } from './watch-stage-model.js';
import './watch-stage.css';

export default function WatchScrollStage({
  player,
  meta,
  below,
  floatingEnabled = true,
  onFloatingClose,
}) {
  const { mobile } = usePlayerViewport();
  const state = useWatchScrollStage(floatingEnabled && !mobile, !mobile);
  const size = mobile
    ? { width: '100%', aspectRatio: '16 / 9' }
    : state.size || { width: SCROLL_STAGE_FALLBACK_WIDTH, aspectRatio: '16 / 9' };
  return (
    <div ref={state.stage} className={`academy-watch-scroll-stage ${mobile ? 'is-mobile' : ''}`}>
      <div ref={state.anchor} className="academy-watch-player-anchor" style={size}>
        {state.floating && <div className="academy-watch-player-placeholder" aria-hidden="true" />}
        <div className={`academy-watch-player-frame ${state.floating ? 'is-floating' : ''}`}>
          {player}
          {state.floating && (
            <button
              type="button"
              className="academy-watch-floating-close"
              aria-label="关闭浮动播放器"
              onClick={(event) => {
                const focused = document.activeElement === event.currentTarget;
                onFloatingClose?.();
                state.dismiss();
                if (focused)
                  event.currentTarget.parentElement
                    .querySelector('[tabindex="0"]')
                    ?.focus({ preventScroll: true });
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>
      <div
        className="academy-watch-scroll-content"
        style={!mobile && state.size ? { maxWidth: state.size.width } : undefined}
      >
        <div ref={state.meta}>{meta}</div>
        {below}
      </div>
    </div>
  );
}
