import { withSecondaryData, routeParts } from '../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import WatchHeader from './components/WatchHeader.jsx';
import Markdown from '../shared/secondary/Markdown.jsx';
import { academyArticleCanvasUrl } from '../../services/academy-article-entry.js';

function ArticleDetail({ id, data, asset, navigate, login, user, articleSource }) {
  const snapshotItem = data.details.articles[id],
    [active, setActive] = useState('academy-article-section-0'),
    [remote, setRemote] = useState(() =>
      articleSource ? { status: 'loading', detail: null, error: null } : null,
    ),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!articleSource?.load) {
      setRemote(null);
      return undefined;
    }
    let live = true;
    setRemote({ status: 'loading', detail: null, error: null });
    Promise.resolve()
      .then(() => articleSource.load(id))
      .then((result) => {
        if (!live) return;
        if (result?.status === 'ok' && result.detail) {
          setRemote({ status: 'ok', detail: result.detail, error: null });
        } else if (['notFound', 'offline', 'error'].includes(result?.status)) {
          setRemote({ status: result.status, detail: null, error: result.error || null });
        } else {
          setRemote({ status: 'error', detail: null, error: '教程读取失败' });
        }
      })
      .catch((error) => {
        if (live)
          setRemote({ status: 'error', detail: null, error: error?.message || '教程读取失败' });
      });
    return () => {
      live = false;
    };
  }, [articleSource, id, retry]);
  const item = articleSource ? remote?.detail : snapshotItem;
  const status = articleSource ? remote?.status : item ? 'ok' : 'notFound';
  const headings = useMemo(
    () =>
      [...(item?.contentMd || '').matchAll(/^##\s+(.+)$/gm)].map((m, i) => ({
        id: `academy-article-section-${i}`,
        text: m[1].replace(/\*\*/g, ''),
      })),
    [item],
  );
  const title = useRef(null);
  useEffect(() => {
    const onScroll = () => {
      let next = headings[0]?.id;
      const offset = 64 + (title.current?.offsetHeight || 60) + 24;
      for (const h of headings) {
        if ((document.getElementById(h.id)?.getBoundingClientRect().top ?? Infinity) <= offset)
          next = h.id;
      }
      setActive(next);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);
  const openCanvas = () => {
    if (!user) return login();
    const target = academyArticleCanvasUrl(item.canvasUrl, id);
    if (target) window.open(target, '_blank', 'noopener,noreferrer');
  };
  function selectSection(section) {
    const e = document.getElementById(section);
    if (e)
      window.scrollTo({
        top: Math.max(
          0,
          e.getBoundingClientRect().top +
            window.scrollY -
            64 -
            (title.current?.offsetHeight || 60) -
            24,
        ),
        behavior: 'smooth',
      });
  }
  return (
    <div className="academy-article-detail">
      <WatchHeader title="图文教程" navigate={navigate} />
      {status === 'loading' ? (
        <p className="secondary-empty" role="status">
          正在加载教程…
        </p>
      ) : status === 'notFound' ? (
        <p className="secondary-empty" role="alert">
          图文教程不存在或已下架
        </p>
      ) : status === 'offline' ? (
        <div className="secondary-empty" role="alert">
          <p>图文教程暂时无法加载</p>
          <button className="soft-button" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : status === 'error' ? (
        <div className="secondary-empty" role="alert">
          <p>{remote?.error || '图文教程加载失败'}</p>
          <button className="soft-button" onClick={() => setRetry((value) => value + 1)}>
            重试
          </button>
        </div>
      ) : item ? (
        <main>
          <article>
            <div className="academy-article-title" ref={title}>
              <h1>{item.title}</h1>
            </div>
            <div className="academy-article-meta">
              <div>
                {[...item.tags, `阅读约 ${item.readingMinutes} 分钟`].map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {item.source && <p>内容来源 · {item.source}</p>}
            </div>
            <Markdown content={item.contentMd} asset={asset} />
            <nav className="academy-article-pagination">
              {item.prev ? (
                <button onClick={() => navigate(`/academy/article/${item.prev.articleUuid}`)}>
                  <small>
                    <ChevronLeft size={14} />
                    上一篇
                  </small>
                  <span>{item.prev.title}</span>
                </button>
              ) : (
                <span />
              )}
              {item.next && (
                <button onClick={() => navigate(`/academy/article/${item.next.articleUuid}`)}>
                  <small>
                    下一篇
                    <ChevronRight size={14} />
                  </small>
                  <span>{item.next.title}</span>
                </button>
              )}
            </nav>
            {item.canvasUrl && (
              <button
                className="academy-canvas-banner"
                onClick={openCanvas}
                aria-label="专注创作 尽情创意 · 预制画布已为你准备"
              >
                <img
                  src={asset(
                    'https://libtv-res.liblib.art/upload-images/976652348270470eba25b9d8ca891fda/26cfdb7f95eecc09b2abb83c3339460d14382f53.webp',
                  )}
                  alt="专注创作 尽情创意 · 预制画布已为你准备"
                />
              </button>
            )}
          </article>
          <aside>
            <nav aria-label="功能导览">
              {headings.map((h) => (
                <button
                  key={h.id}
                  aria-current={active === h.id ? 'true' : undefined}
                  className={active === h.id ? 'active' : ''}
                  onClick={() => selectSection(h.id)}
                >
                  {h.text}
                </button>
              ))}
            </nav>
            {item.canvasUrl && (
              <button className="academy-canvas-entry" onClick={openCanvas}>
                <span>
                  <strong>前往画布练习本课知识点</strong>
                  <small>一键打开制作过程</small>
                </span>
                <ChevronRight size={18} />
              </button>
            )}
          </aside>
        </main>
      ) : null}
    </div>
  );
}

const ArticlePage = withSecondaryData(ArticleDetail, (props) => ({
  id: props.id ?? routeParts(props.path)[3],
}));
export default ArticlePage;
