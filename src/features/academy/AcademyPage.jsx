import { withSecondaryData } from '../shared/secondary/SecondaryContent.jsx';
import React, { useRef, useState } from 'react';
import { Play } from 'lucide-react';

function Academy({ data, login, asset, user, navigate }) {
  const [tab, setTab] = useState('article');
  const learning = useRef(null);
  const course = data.masterclasses[0];
  function changeTab(next) {
    setTab(next);
    learning.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return (
    <div className="secondary-page academy-page">
      <div
        className="academy-background"
        style={{
          backgroundImage: `url(${asset('https://libtv-res.liblib.art/upload-images/8244a30ac2e94d9289e7216922b50a09/e6afcdc14743a4017c2e19ca63e81b12c0a492b3.webp')})`,
        }}
      />
      <div className="academy-content">
        <div className="academy-heading">
          <img
            src="/assets/penstudio-academy-title.svg"
            alt="欢迎来到 PenStudio 学院｜系统掌握 AI 创作，从新手进阶创作高手"
          />
        </div>
        {course && (
          <section className="academy-masterclass">
            <h2>AI 大师公开课</h2>
            <button
              className="academy-master-card"
              onClick={() =>
                user ? navigate(`/academy/masterclass/${course.masterclassUuid}`) : login()
              }
            >
              <div className="academy-master-image">
                <img src={asset(course.cover)} alt={course.cardTitle} />
                <span className="academy-play">
                  <Play size={24} fill="currentColor" />
                </span>
              </div>
              <div className="academy-master-copy">
                <span className="academy-quote">❞</span>
                <div>
                  {course.quoteLines.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
                <div className="academy-lecturer">
                  <img src={asset(course.lecturerAvatar)} alt="" />
                  <span>
                    {course.lecturerName} &nbsp;{course.lecturerTitle}
                  </span>
                </div>
              </div>
            </button>
          </section>
        )}
        <section className="academy-learning" ref={learning}>
          <h2>学习广场</h2>
          <div className="academy-tabs" role="tablist">
            {[
              ['article', '图文教程'],
              ['tutorial', '亮点功能'],
            ].map(([id, text]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'selected' : ''}
                onClick={() => changeTab(id)}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="academy-grid">
            {(tab === 'article' ? data.articles : data.tutorials).map((item) => (
              <button
                className="academy-course-card"
                key={item.articleUuid || item.tutorialUuid}
                onClick={() =>
                  user
                    ? navigate(`/academy/${tab}/${item.articleUuid || item.tutorialUuid}`)
                    : login()
                }
              >
                <div className="academy-course-image">
                  <img src={asset(item.cover)} alt={item.title} />
                  <span className="academy-duration">
                    {tab === 'article'
                      ? `阅读 ${item.readingMinutes}min`
                      : `${Math.max(1, Math.ceil(item.durationSec / 60))}min`}
                  </span>
                  {tab === 'tutorial' && (
                    <span className="academy-play">
                      <Play size={20} fill="currentColor" />
                    </span>
                  )}
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary || item.subtitle}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const AcademyPage = withSecondaryData(Academy);
export default AcademyPage;
