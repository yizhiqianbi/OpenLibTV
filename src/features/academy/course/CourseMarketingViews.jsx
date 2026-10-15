import React, { useRef } from 'react';
import { Gift } from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import { DialogFocusBoundary } from '../../../components/DialogFocusBoundary.jsx';
import CourseOverlayPortal from './CourseOverlayPortal.jsx';
import './marketing.css';

export function CourseMinuteBar({ text, onClick }) {
  return (
    <button className="academy-course-minute-bar" onClick={onClick}>
      <Gift size={18} />
      <span>{text}</span>
    </button>
  );
}
function MarketingDialog({ content, onPrimary, onDismiss, asset }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose: onDismiss });
  return (
    <div
      className="academy-course-marketing-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <section
        className="academy-course-marketing-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={content.title || '课程优惠'}
        tabIndex={-1}
        ref={ref}
      >
        <DialogFocusBoundary edge="start" />
        {content.imgUrl && (
          <div className="academy-course-marketing-image">
            <img src={asset(content.imgUrl)} alt="" />
            <i aria-hidden="true" />
          </div>
        )}
        <div className="academy-course-marketing-copy">
          <header>
            <h3>{content.title}</h3>
            {content.cornerMark && <span>{content.cornerMark}</span>}
          </header>
          {content.content && <p>{content.content}</p>}
          <div className="academy-course-marketing-actions">
            <button onClick={onDismiss}>继续看课</button>
            <button onClick={onPrimary}>{content.btnText || '立即抢订'}</button>
          </div>
        </div>
        <DialogFocusBoundary edge="end" />
      </section>
    </div>
  );
}
export function CourseMarketingModal(props) {
  return (
    <CourseOverlayPortal>
      <MarketingDialog {...props} />
    </CourseOverlayPortal>
  );
}
