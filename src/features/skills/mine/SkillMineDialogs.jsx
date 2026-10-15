import { useRef, useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import { asset } from '../../../data.js';
import {
  localSkillId,
  skillPublishForm,
  skillPublishCategories,
  validatePublishForm,
  SKILL_CASE_ACCEPT,
} from './skill-mine-model.js';
import { useSkillCaseFiles } from './useSkillCaseFiles.js';
import './mine.css';

function CasePreview({ item, resultType }) {
  if (!item.url) return <span>{item.status === 'reading' ? '读取中…' : '案例读取失败'}</span>;
  const type = item.type || resultType;
  if (type === 2) return <img src={asset(item.url)} alt={item.name} />;
  if (type === 3) return <video src={asset(item.url)} controls tabIndex={0} playsInline />;
  if (type === 4) return <audio src={asset(item.url)} controls tabIndex={0} />;
  return (
    <a href={asset(item.url)} target="_blank" rel="noreferrer">
      {item.name || 'Markdown 案例'}
    </a>
  );
}

export function SkillPublishDialog({ item, categories = [], controller }) {
  const initial = useRef(skillPublishForm(item)).current;
  const resultType = item.resultType || 2;
  const cases = useSkillCaseFiles(initial.caseItems, resultType);
  const [category, setCategory] = useState(initial.category);
  const [showMarkdown, setShowMarkdown] = useState(initial.showMarkdown);
  const [agreement, setAgreement] = useState(initial.agreement);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const file = useRef(null),
    replacement = useRef(null),
    replacing = useRef(null);
  const available = skillPublishCategories(categories);
  const id = localSkillId(item);
  const updating = Boolean(item.templateUuid);
  const submit = () => {
    const form = { caseItems: cases.items, category, showMarkdown, agreement };
    const errors = validatePublishForm(form, available);
    setErrors(errors);
    if (Object.keys(errors).length) return;
    if (!controller.savePublishRequest(id, form))
      setFailure('本地保存失败，当前表单和案例仍保留，可重试。');
    else setFailure('');
  };
  return (
    <Modal
      title={updating ? '更新发布' : '发布 Skill'}
      className="sk-mine-publish-dialog"
      onClose={controller.closeDialog}
      closeOnClickOutside={false}
    >
      <h2>{updating ? '更新发布' : '发布 Skill'}</h2>
      <p>作品名称：{item.name || item.title}</p>
      <section className="sk-mine-cases" aria-label="精选案例">
        <header>
          <span>精选案例</span>
          <button
            type="button"
            disabled={cases.items.length >= 4}
            onClick={() => file.current?.click()}
          >
            上传作品 {cases.items.length}/4
          </button>
        </header>
        <input
          ref={file}
          type="file"
          aria-label="上传 Skill 案例"
          accept={SKILL_CASE_ACCEPT[item.resultType || 2]}
          multiple
          hidden
          onChange={(event) => {
            cases.addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={replacement}
          type="file"
          aria-label="替换 Skill 案例"
          accept={SKILL_CASE_ACCEPT[item.resultType || 2]}
          hidden
          onChange={(event) => {
            cases.replace(replacing.current, event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div className="sk-mine-case-grid">
          {cases.items.map((item, index) => (
            <article key={item.id}>
              <div className="sk-mine-case-preview">
                <CasePreview item={item} resultType={resultType} />
              </div>
              <div className="sk-mine-case-actions">
                <button
                  type="button"
                  disabled={item.status === 'reading'}
                  onClick={() => {
                    replacing.current = item.id;
                    replacement.current?.click();
                  }}
                >
                  替换
                </button>
                <button
                  type="button"
                  aria-label={'移除案例 ' + (index + 1)}
                  onClick={() => cases.remove(item.id)}
                >
                  移除
                </button>
              </div>
              {item.status === 'reading' && <p role="status">案例读取中…</p>}
              {item.status === 'error' && (
                <div role="alert">
                  <p>{item.error}</p>
                  <button type="button" onClick={() => cases.retry(item.id)}>
                    重试
                  </button>
                </div>
              )}
              <input
                type="url"
                aria-label={'案例作品链接 ' + (index + 1)}
                placeholder="输入作品链接 (非必填)"
                title="在 Agent 对话右上角点击并复制分享链接"
                value={item.link}
                onChange={(event) => cases.setLink(item.id, event.target.value)}
              />
              {errors.links?.[index] && <p role="alert">{errors.links[index]}</p>}
            </article>
          ))}
        </div>
        {(cases.error || errors.caseItems) && <p role="alert">{cases.error || errors.caseItems}</p>}
      </section>
      <label className="sk-mine-field">
        Skill 分类
        <select
          aria-label="Skill 分类"
          value={category ?? ''}
          onChange={(event) => setCategory(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">点击选择</option>
          {available.map((tag) => (
            <option value={tag.id} key={tag.id}>
              {tag.tagLabel || tag.name}
            </option>
          ))}
        </select>
      </label>
      {errors.category && <p role="alert">{errors.category}</p>}
      <label className="sk-mine-field-inline">
        Skill 内容公开可见
        <input
          type="checkbox"
          checked={showMarkdown}
          onChange={(event) => setShowMarkdown(event.target.checked)}
        />
      </label>
      <label className="sk-mine-agreement">
        <input
          type="checkbox"
          checked={agreement}
          onChange={(event) => setAgreement(event.target.checked)}
        />
        我已阅读并同意{' '}
        <a
          href="https://www.liblib.art/activities/4b7ea7f1dbbf41669d9e05cd25a3fa77"
          target="_blank"
          rel="noreferrer"
        >
          作者协议
        </a>
      </label>
      {errors.agreement && <p role="alert">{errors.agreement}</p>}
      {failure && <p role="alert">{failure}</p>}
      {item.localPublishRequest && (
        <div className="sk-mine-blocked" role="status">
          已保存为本地待提交请求。发布服务尚未连接，未提交审核。
          {item.localPublishRequest.linkValidation === 'service-required' &&
            '案例作品链接的会话及积分校验尚未执行。'}
        </div>
      )}
      <footer>
        <button type="button" onClick={controller.closeDialog}>
          关闭
        </button>
        {item.localPublishRequest && (
          <button
            type="button"
            onClick={() => {
              if (!controller.cancelPublishRequest(id)) setFailure('取消失败，待提交请求仍保留。');
            }}
          >
            取消待提交请求
          </button>
        )}
        <button type="button" className="white-button" disabled={cases.pending} onClick={submit}>
          {item.localPublishRequest ? '重试提交' : '发布'}
        </button>
      </footer>
    </Modal>
  );
}

function SkillDeleteDialog({ item, controller }) {
  const [error, setError] = useState('');
  return (
    <Modal
      title="删除 Skill"
      className="sk-mine-delete-dialog"
      onClose={controller.closeDialog}
      closeOnClickOutside={false}
    >
      <h2>删除 Skill</h2>
      <p>确定删除「{item.name || item.title}」吗？</p>
      <p>本地演示会保留记录，可从“已删除的 Skill”恢复。</p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={controller.closeDialog}>
          取消
        </button>
        <button
          type="button"
          className="sk-mine-danger"
          onClick={() => {
            if (controller.remove(localSkillId(item))) controller.closeDialog();
            else setError('删除失败，原 Skill 仍保留，可重试。');
          }}
        >
          删除
        </button>
      </footer>
    </Modal>
  );
}

export default function SkillMineDialogs({ controller, categories = [] }) {
  const { dialog, dialogItem } = controller;
  if (!dialog) return null;
  if (!dialogItem || dialogItem.localDeletedAt)
    return (
      <Modal title="Skill 不可用" onClose={controller.closeDialog}>
        <p>Skill 已不存在或已被删除，原表单未提交。</p>
      </Modal>
    );
  if (dialog.type === 'delete')
    return <SkillDeleteDialog key={dialog.id} item={dialogItem} controller={controller} />;
  return (
    <SkillPublishDialog
      key={dialog.id}
      item={dialogItem}
      categories={categories}
      controller={controller}
    />
  );
}

export function SkillMineDeleted({ controller }) {
  return (
    <details className="sk-mine-deleted">
      <summary>已删除的 Skill ({controller.deletedSkills.length})</summary>
      {controller.deletedSkills.map((item) => (
        <div key={localSkillId(item)}>
          <span>{item.name || item.title}</span>
          <button type="button" onClick={() => controller.restore(localSkillId(item))}>
            恢复
          </button>
        </div>
      ))}
    </details>
  );
}
