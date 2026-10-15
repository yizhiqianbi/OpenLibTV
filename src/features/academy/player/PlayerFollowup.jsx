import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';

export default function PlayerFollowup({
  followup,
  hasNext,
  training,
  onNext,
  onTraining,
  onReplay,
}) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose: followup.close });
  return (
    <div className="academy-player-followup-overlay" onClick={followup.close}>
      <section
        ref={ref}
        className="academy-player-followup"
        role="dialog"
        aria-modal="true"
        aria-label="播放完毕"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={() => followup.hover(true)}
        onMouseLeave={() => followup.hover(false)}
      >
        <button
          className="academy-player-followup-close"
          aria-label="关闭播放完毕提示"
          onClick={followup.close}
        >
          <X size={14} />
        </button>
        <h3>本节学习完成</h3>
        <p>
          {training
            ? '去跟练室实战一下吧～'
            : hasNext
              ? `${followup.remaining} 秒后自动播放下一节`
              : '再看一遍，巩固本节内容'}
        </p>
        <div>
          {!training && <button onClick={onReplay}>重新播放</button>}
          {hasNext && (
            <button onClick={onNext}>
              下一节{followup.remaining > 0 ? `（${followup.remaining}s）` : ''}
            </button>
          )}
          {training && <button onClick={onTraining}>去跟练</button>}
        </div>
      </section>
    </div>
  );
}
