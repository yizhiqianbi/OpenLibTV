import { withSecondaryData } from '../../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useState } from 'react';
import { Code, Share2, Eye, Star, Users } from 'lucide-react';
import SkillShareMedia from './components/SkillShareMedia.jsx';
import SkillFileMenu from './components/SkillFileMenu.jsx';
import { normalizeSkillCases } from './skill-share-model.js';
import Markdown from '../../shared/secondary/Markdown.jsx';
import { template } from '../../shared/secondary/text.js';
import { SecondaryLoadError } from '../../shared/secondary/SecondaryLayout.jsx';
import { useContent } from '../../../data.js';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';

function SkillShare({ data, asset, login, user, navigate, toast }) {
  const { data: details, loading, error, reload } = useContent('skill-details', null);
  const [favorites, setFavorites] = useState(
      () => readStoredValue('libtv-skill-favorites', []) || [],
    ),
    [filePath, setFilePath] = useState(null),
    [mode, setMode] = useState('preview');
  const uuid = new URLSearchParams(location.search).get('uuid') || '',
    t = data.commonLocale,
    item = details?.[uuid]?.skill;
  let snapshot = {};
  try {
    snapshot = JSON.parse(item?.snapshotData || '{}');
  } catch {
    // Invalid legacy snapshot JSON falls back to the public Skill fields.
  }
  const files = item?.skillFiles?.length ? item.skillFiles : snapshot.skillFiles,
    markdown = item?.markdownContent?.trim()
      ? item.markdownContent
      : snapshot.markdownContent || '',
    visibleMarkdown = item?.showMarkdown !== false && ((files?.length || 0) > 0 || !!markdown),
    current =
      files?.find((f) => f.path === filePath) ||
      files?.find((f) => !f.path.includes('/')) ||
      files?.[0];
  useEffect(() => {
    setFilePath(null);
    setMode('preview');
  }, [uuid]);
  function toggleFavorite() {
    if (!user) {
      login({ closeOnClickOutside: false });
      return;
    }
    const key = item.templateUuid || uuid,
      favoriteKeys = [key, item.skillUuid].filter(Boolean),
      next = favoriteKeys.some((favorite) => favorites.includes(favorite))
        ? favorites.filter((favorite) => !favoriteKeys.includes(favorite))
        : [...favorites, key];
    try {
      writeStoredValue('libtv-skill-favorites', next);
      setFavorites(next);
    } catch {
      toast?.('本地保存失败，请检查浏览器存储空间');
    }
  }
  function useSkill() {
    if (item.auditStatus === 0 || item.auditStatus === 2) {
      toast?.(t.skillNotApprovedYet);
      return;
    }
    const q = new URLSearchParams();
    if (item.skillKey) q.set('useSkillKey', item.skillKey);
    if (item.namespace) q.set('useSkillNs', item.namespace);
    q.set('useSkillName', item.name);
    navigate(item.skillKey ? '/skill?' + q.toString() : '/skill');
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(
        location.origin + '/skill/share?uuid=' + encodeURIComponent(uuid),
      );
      toast?.(t.linkCopied);
    } catch {
      toast?.('复制失败，请手动复制链接');
    }
  }
  if (uuid && error && !details) return <SecondaryLoadError reload={reload} />;
  if (uuid && (loading || details === null))
    return (
      <div className="secondary-skill-share secondary-skill-share-loading">
        <span />
        <span />
        <span />
      </div>
    );
  if (!uuid || !item)
    return (
      <div className="secondary-skill-share">
        <p className="secondary-skill-invalid">{t.skillShareInvalidLink}</p>
      </div>
    );
  const short = (n) =>
      n >= 1e4
        ? (n / 1e4).toFixed(1) + 'w'
        : n >= 1e3
          ? (n / 1e3).toFixed(1) + 'k'
          : String(n || 0),
    fav = [item.templateUuid || uuid, item.skillUuid].some((key) => favorites.includes(key)),
    examples = normalizeSkillCases(item);
  return (
    <main className="secondary-skill-share">
      <header>
        <div>
          <h1>{item.name}</h1>
          <p>
            <img src={asset(item.ownerAvatar || item.avatar)} alt="" />
            <span>{item.ownerName || item.nickname}</span>
            {item.tags?.[0] && (
              <>
                <i />
                <span>{item.tags[0].tagLabel || item.tags[0].name}</span>
              </>
            )}
            <i />
            <span>
              <Users size={13} />
              {short(item.useUv ?? item.usePv)}
            </span>
            <i />
            <span>
              <Star size={13} />
              {short(item.likeCount)}
            </span>
          </p>
        </div>
        <div>
          {item.templateUuid && item.auditStatus === 1 && (
            <button aria-label={t.skillShareAction} title={t.skillShareAction} onClick={share}>
              <Share2 size={16} />
            </button>
          )}
          <button
            aria-label={fav ? t.skillFavorited : t.favorite}
            title={fav ? t.skillFavorited : t.favorite}
            onClick={toggleFavorite}
          >
            <Star size={16} fill={fav ? 'currentColor' : 'none'} />
          </button>
          <button className="use" onClick={useSkill}>
            {t.skillAddSkill}
          </button>
        </div>
      </header>
      <div className="secondary-skill-share-body">
        {examples.length > 0 && (
          <SkillShareMedia
            key={uuid}
            items={examples}
            cover={item.coverUrl}
            asset={asset}
            templateUuid={item.templateUuid || uuid}
          />
        )}{' '}
        {(item.useScenario || item.inputType || item.outputContent) && (
          <section className="secondary-skill-intro">
            <h2>{t.skillIntro}</h2>
            {[
              [t.skillDescriptionLabel, item.description],
              [t.createSkillFieldUseScenario, item.useScenario],
              [t.createSkillFieldHowToUse, item.inputType],
              [t.createSkillFieldOutput, item.outputContent],
            ].map(
              ([label, content]) =>
                content && (
                  <p key={label}>
                    <span>{label}</span>
                    <span>{content}</span>
                  </p>
                ),
            )}
          </section>
        )}
        {visibleMarkdown && (
          <section className="secondary-skill-read-markdown">
            <header>
              <h2>{t.skillContentTitle}</h2>
              {files?.length > 0 && (
                <div>
                  <span>{template(t.skillFileCount, { count: files.length })}</span>
                  <SkillFileMenu
                    key={uuid}
                    files={files}
                    current={current}
                    onSelect={(path) => {
                      setFilePath(path);
                      setMode('preview');
                    }}
                  />
                </div>
              )}
            </header>
            <div className="secondary-skill-markdown">
              <div className="secondary-skill-read-mode">
                <button
                  className={mode === 'preview' ? 'active' : ''}
                  aria-label="预览"
                  onClick={() => setMode('preview')}
                >
                  <Eye size={14} />
                </button>
                <button
                  className={mode === 'code' ? 'active' : ''}
                  aria-label="源代码"
                  onClick={() => setMode('code')}
                >
                  <Code size={14} />
                </button>
              </div>
              {mode === 'preview' ? (
                <Markdown content={current?.content ?? markdown} asset={asset} />
              ) : (
                <pre>{current?.content ?? markdown}</pre>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

const SkillSharePage = withSecondaryData(SkillShare);
export default SkillSharePage;
