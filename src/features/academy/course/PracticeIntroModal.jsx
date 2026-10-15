import React from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import Modal from '../../../components/Modal.jsx';
import CourseOverlayPortal from './CourseOverlayPortal.jsx';
import './marketing.css';

const points = [
  '课程逐节对应，跟着老师一步步出片',
  '同款参数一键填好，0 积分出片',
  '改词换模型，做属于你的版本',
  '练完提交，上作品墙、参与结课赛',
];
export default function PracticeIntroModal({ course, onClose, onStart, error }) {
  return (
    <CourseOverlayPortal>
      <Modal
        title="练习画布"
        className="academy-practice-intro-modal"
        onClose={onClose}
        closeButton={false}
      >
        <div className="academy-practice-intro-layout">
          <button className="academy-practice-intro-close" aria-label="取消" onClick={onClose}>
            <X size={10} />
          </button>
          <div className="academy-practice-intro-visual" aria-hidden="true" />
          <div className="academy-practice-intro-copy">
            <span className="academy-practice-intro-course">{course.title}</span>
            <div>
              <h2>练习画布</h2>
              {course.creditsGrant > 0 && (
                <p>
                  学员礼包赠 <strong>{course.creditsGrant} 练习积分</strong>
                </p>
              )}
            </div>
            <ul>
              {points.map((point) => (
                <li key={point}>
                  <Check size={12} />
                  {point}
                </li>
              ))}
            </ul>
            <div className="academy-practice-intro-actions">
              <button onClick={onStart}>
                开始跟练
                <ArrowRight size={16} />
              </button>
              <p>学完可前往 PenStudio 画布创作，跟练工程一键导入</p>
              {error && <p role="alert">{error}</p>}
            </div>
          </div>
        </div>
      </Modal>
    </CourseOverlayPortal>
  );
}
