import React, { useState } from 'react';
import { academyRepository } from './course/repository.js';
import { useAcademyResource } from './course/useAcademyResource.js';
import { AcademyState } from './course/AcademyState.jsx';
import './course/course.css';

export default function PracticePage({
  path,
  courseId: suppliedId,
  search = '',
  navigate,
  user,
  repository = academyRepository,
  renderPracticeCanvas,
}) {
  const courseId = suppliedId || path?.split('/')[3] || '';
  const query = new URLSearchParams(search || path?.split('?')[1] || '');
  const detail = useAcademyResource(courseId, (options) =>
    repository.practiceCourse(courseId, options),
  );
  const [selection, setSelection] = useState({ owner: courseId, id: '' });
  const requested = query.get('sectionId') || query.get('section');
  const sections = detail.data?.sections || [];
  const id =
    (selection.owner === courseId && selection.id) ||
    (sections.some((section) => section.sectionId === requested)
      ? requested
      : detail.data?.lastSectionId) ||
    '';
  const section = useAcademyResource(id ? `${courseId}:${id}` : '', (options) =>
    repository.practiceSection(id, options),
  );
  const blocked = user?.isTeamUser || user?.accountType === 'team';
  const failed =
    detail.error ||
    (!detail.loading && !detail.data) ||
    (section.error && section.error.code !== 60011);
  const locked = section.error?.code === 60011 || section.data?.status === 'locked';
  function retry() {
    if (detail.error || !detail.data) detail.reload();
    else section.reload();
  }
  if (blocked)
    return (
      <div className="academy-practice-page">
        <AcademyState>
          <strong>课程暂不支持团队账号操作</strong>
          <br />
          PenStudio学院-AI跟练室暂不支持团队账号操作，请切换个人账号进行操作
        </AcademyState>
      </div>
    );
  if (failed)
    return (
      <div className="academy-practice-page">
        <AcademyState retry={retry}>跟练配置加载失败</AcademyState>
      </div>
    );
  if (detail.loading || section.loading || !id)
    return (
      <div className="academy-practice-page">
        <AcademyState loading label="正在准备你的跟练画布…" />
      </div>
    );
  const index = sections.findIndex((entry) => entry.sectionId === id);
  const previous = index > 0 ? sections[index - 1] : null;
  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : null;
  return (
    <div className="academy-practice-page">
      <header className="academy-practice-header">
        <button onClick={() => navigate('/academy')}>PenStudio 学院</button>
        <span>{detail.data.courseTitle}</span>
        <button onClick={() => navigate(`/academy/course/${courseId}`)}>前往视频课</button>
      </header>
      <aside className="academy-practice-sidebar">
        <h1>AI 跟练室</h1>
        {sections.map((entry) => (
          <button
            key={entry.sectionId}
            aria-current={entry.sectionId === id ? 'true' : undefined}
            onClick={() => setSelection({ owner: courseId, id: entry.sectionId })}
          >
            {entry.order} {entry.title}
            {entry.simulatedDone && <small>已完成</small>}
          </button>
        ))}
        <footer className="academy-practice-section-nav">
          <button
            type="button"
            disabled={!previous}
            onClick={() => previous && setSelection({ owner: courseId, id: previous.sectionId })}
          >
            上一节
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && setSelection({ owner: courseId, id: next.sectionId })}
          >
            下一节
          </button>
        </footer>
      </aside>
      <main className="academy-practice-content">
        {locked ? (
          <div className="academy-practice-locked">
            <p>完成上一小节学习后解锁本次跟练</p>
            <div>
              <button onClick={() => navigate(`/academy/course/${courseId}`)}>前往视频课</button>
              {index > 0 && (
                <button
                  onClick={() =>
                    setSelection({ owner: courseId, id: sections[index - 1].sectionId })
                  }
                >
                  上一小节
                </button>
              )}
            </div>
          </div>
        ) : renderPracticeCanvas && section.data ? (
          renderPracticeCanvas({
            course: detail.data,
            section: section.data,
            mode: query.get('mode') === 'free' ? 'free' : 'simulated',
          })
        ) : (
          <AcademyState retry={section.reload}>跟练画布暂不可用</AcademyState>
        )}
      </main>
    </div>
  );
}
