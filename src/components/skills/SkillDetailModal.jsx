import React, { useRef, useState } from 'react';
import './selector.css';
import Icon from '../Icon.jsx';
import Modal from '../Modal.jsx';
import SkillCaseMedia from './SkillCaseMedia.jsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { asset } from '../../services/assets.ts';
import { shortCount, localHref } from '../../services/presentation.js';
import { isSkillUsable } from '../../services/skill-presentation.js';
import { skillPublicContent, skillCaseType } from '../../services/skill-presentation.js';
import { normalizeSkillCases, skillCaseLink } from '../../services/skill-presentation.js';

export default function SkillDetailModal({
  detail,
  favorite,
  onFavorite,
  onUse,
  onClose,
  toast,
  loading = false,
  error = null,
  onRetry,
}) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [filePath, setFilePath] = useState(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [source, setSource] = useState(false);
  const description = useRef();
  const { markdown, files, primaryPath, visible } = skillPublicContent(detail);
  const cases = normalizeSkillCases(detail);
  const caseItem = cases[caseIndex];
  const currentFile =
    files.find((file) => file.path === filePath) ||
    files.find((file) => file.path === primaryPath) ||
    files[0];
  const canShare = detail.templateUuid && detail.auditStatus === 1;
  return (
    <Modal className="skill-detail-modal" onClose={onClose} title={detail.name}>
      <header className="skill-modal-heading">
        <div>
          <h2>{detail.name}</h2>
          <div className="skill-modal-meta">
            {(detail.ownerAvatar || detail.avatar) && (
              <img src={asset(detail.ownerAvatar || detail.avatar)} alt="" />
            )}
            <span>{detail.ownerName || detail.nickname}</span>
            <i>·</i>
            <span>{detail.tags?.map((t) => t.tagLabel).join(' · ')}</span>
            <i>·</i>
            <Icon name="team" size={14} />
            <span>{shortCount(detail.useUv)}</span>
            <i>·</i>
            <Icon name="star" size={14} />
            <span>{shortCount(detail.likeCount)}</span>
          </div>
        </div>
        <div className="skill-modal-actions">
          {canShare && (
            <button
              className="soft-button"
              aria-label="分享 Skill"
              onClick={() =>
                Promise.resolve()
                  .then(() =>
                    navigator.clipboard.writeText(
                      location.origin +
                        '/skill/share?uuid=' +
                        encodeURIComponent(detail.templateUuid),
                    ),
                  )
                  .then(() => toast?.('链接已复制'))
                  .catch(() => toast?.('请手动复制链接'))
              }
            >
              <Icon name="share" size={18} />
            </button>
          )}
          {!detail.localDemo && (
            <button
              className="soft-button"
              aria-label={favorite ? '取消收藏' : '收藏'}
              onClick={onFavorite}
            >
              <Icon name={favorite ? 'star-f' : 'star'} size={18} />
            </button>
          )}
          <button
            className="white-button"
            onClick={() => {
              if (!isSkillUsable(detail)) {
                toast?.('该 Skill 尚未审核通过，暂不可使用');
                return;
              }
              if (onUse(detail) !== false) onClose();
            }}
          >
            添加 Skill
          </button>
        </div>
      </header>
      <div className="skill-modal-scroll">
        {loading && <p role="status">加载 Skill 详情...</p>}
        {error && (
          <div role="alert">
            <p>Skill 详情加载失败</p>
            <button onClick={onRetry}>重试</button>
          </div>
        )}
        {(caseItem || detail.coverUrl) && (
          <div className="skill-case-media">
            {caseItem ? (
              <SkillCaseMedia
                key={caseIndex}
                item={caseItem}
                cover={detail.coverUrl}
                title={detail.name}
                onZoom={() => setZoom(true)}
              />
            ) : (
              <img src={asset(detail.coverUrl)} alt={detail.name} />
            )}{' '}
            {cases.length > 1 && (
              <div className="skill-case-switch">
                <button
                  aria-label="上一个"
                  disabled={caseIndex === 0}
                  onClick={() => setCaseIndex((n) => n - 1)}
                >
                  <Icon name="left-s" size={14} />
                </button>
                <span>
                  {caseIndex + 1}/{cases.length}
                </span>
                <button
                  aria-label="下一个"
                  disabled={caseIndex === cases.length - 1}
                  onClick={() => setCaseIndex((n) => n + 1)}
                >
                  <Icon name="right-s" size={14} />
                </button>
              </div>
            )}
            {caseItem && (caseItem.canvasCasePower > 0 || caseItem.canvasCaseUrl) && (
              <div className="secondary-skill-case-link">
                {caseItem.canvasCasePower > 0 && <span>ϟ {caseItem.canvasCasePower}积分</span>}
                {caseItem.canvasCaseUrl && (
                  <a
                    href={localHref(skillCaseLink(caseItem.canvasCaseUrl, detail.templateUuid))}
                    target="_blank"
                    rel="noreferrer"
                  >
                    创作详情 ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        <section ref={description} className="skill-introduction">
          <h4>简介</h4>
          <dl>
            {[
              ['介绍', detail.description],
              ['使用场景', detail.useScenario],
              ['如何使用', detail.inputType],
              ['输出内容', detail.outputContent],
            ].map(
              ([label, value]) =>
                value && (
                  <React.Fragment key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </React.Fragment>
                ),
            )}
          </dl>
          {visible && (files.length || markdown) ? (
            <>
              <h4>Skill 内容</h4>
              {files.length > 0 && (
                <div className="secondary-skill-content-toolbar">
                  <div className="popover-anchor">
                    <button
                      className="soft-button"
                      aria-expanded={filesOpen}
                      aria-label="选择 Skill 文件"
                      onClick={() => setFilesOpen((value) => !value)}
                    >
                      {currentFile?.path} ▾
                    </button>
                    {filesOpen && (
                      <div className="popover attachment-menu">
                        {files.map((file) => (
                          <button
                            key={file.path}
                            onClick={() => {
                              setFilePath(file.path);
                              setFilesOpen(false);
                            }}
                          >
                            {file.path}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="segmented">
                    <button className={!source ? 'active' : ''} onClick={() => setSource(false)}>
                      预览
                    </button>
                    <button className={source ? 'active' : ''} onClick={() => setSource(true)}>
                      源码
                    </button>
                  </div>
                </div>
              )}
              {source ? (
                <pre>
                  <code>{currentFile?.content || markdown}</code>
                </pre>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentFile?.content || markdown}
                </ReactMarkdown>
              )}
            </>
          ) : null}
        </section>
      </div>
      <button
        className="skill-scroll-down round-button"
        aria-label="向下滚动"
        onClick={() => description.current?.scrollIntoView({ behavior: 'smooth' })}
      >
        <Icon name="down-s" size={15} />
      </button>
      {zoom && skillCaseType(caseItem.productionCaseUrl) === 'image' && (
        <Modal className="secondary-skill-zoom" title="查看原图" onClose={() => setZoom(false)}>
          <img src={asset(caseItem.productionCaseUrl)} alt={detail.name} />
          {caseIndex > 0 && (
            <button
              className="prev"
              aria-label="上一张"
              onClick={() => setCaseIndex((value) => value - 1)}
            >
              <Icon name="left-s" />
            </button>
          )}
          {caseIndex < cases.length - 1 && (
            <button
              className="next"
              aria-label="下一张"
              onClick={() => setCaseIndex((value) => value + 1)}
            >
              <Icon name="right-s" />
            </button>
          )}
        </Modal>
      )}
    </Modal>
  );
}
