import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import VideoPlayer from '../VideoPlayer.jsx';
import { asset } from '../../services/assets.ts';
import { skillCaseType } from '../../services/skill-presentation.js';

function SkillDocumentCase({ url }) {
  const [text, setText] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setText(null);
    setError(false);
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('内容加载失败');
        return response.text();
      })
      .then((content) => {
        if (!controller.signal.aborted) setText(content);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [url, attempt]);
  return (
    <div className="secondary-skill-document">
      {error ? (
        <div role="alert">
          内容加载失败<button onClick={() => setAttempt((value) => value + 1)}>重试</button>
        </div>
      ) : text === null ? (
        <p role="status">加载中...</p>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      )}
    </div>
  );
}

export default function SkillCaseMedia({ item, title, cover, onZoom }) {
  const type = skillCaseType(item.productionCaseUrl);
  const src = asset(item.productionCaseUrl);
  if (type === 'video') return <VideoPlayer src={src} poster={asset(cover)} title={title} />;
  if (type === 'audio')
    return (
      <div className="secondary-skill-audio-background">
        <p>音频作品</p>
        <audio src={src} controls preload="metadata" aria-label={title} />
      </div>
    );
  if (type === 'document') return <SkillDocumentCase url={src} />;
  return (
    <button className="secondary-skill-media-image" onClick={onZoom} aria-label="查看原图">
      <img src={src} alt={title} />
    </button>
  );
}
