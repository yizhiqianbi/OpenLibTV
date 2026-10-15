import { useState } from 'react';
import { useLocalState } from '../../../data.js';
import { useSkillCreatorIntake } from '../hooks/useSkillCreatorIntake.js';
import './skill-creator-intake.css';

export default function SkillCreatorIntake({
  path,
  route,
  ready,
  nodes,
  messages,
  title,
  prompt,
  draft,
  setDraft,
  navigate,
  setAgentOpen,
}) {
  const [skills] = useLocalState('libtv-created-skills', []);
  const { intent, submit, dismiss } = useSkillCreatorIntake({
    path:
      path || (typeof location === 'undefined' ? '/canvas' : location.pathname + location.search),
    documentKey: route.storageKey,
    requested: route.query.get('skillCreatorIntake') === '1',
    ready,
    readonly: route.readonly,
    context: {
      projectId: route.key,
      projectName: title,
      workspaceId: route.query.get('spaceId')?.trim(),
      hasCanvas: nodes.length > 0,
      hasConversation: messages.length > 0,
      hasSkill: skills.length > 0,
    },
    prompt,
    draft,
    setDraft,
    navigate,
    setAgentOpen,
  });
  const [selection, setSelection] = useState(null);
  const identity = route.storageKey + ':' + intent?.createdAt;
  // Defaults are derived in the same render as the card. A later effect must
  // never overwrite an option the user already selected during document load.
  const selected =
    selection?.identity === identity
      ? selection.key
      : intent?.action || intent?.options[0]?.key || null;
  if (!ready || !intent || intent.status === 'dismissed') return null;
  if (intent.status === 'blocked')
    return (
      <section className="cv-skill-intake" aria-label="Skill 创建请求">
        <div role="alert">
          <strong>{intent.options.find((option) => option.key === intent.action)?.label}</strong>
          <p>创建服务尚未连接。已保留你的创建方式、创作想法和参考素材。</p>
        </div>
        <footer>
          <button type="button" onClick={dismiss}>
            忽略
          </button>
          <a href="/skill/create" target="_blank" rel="noreferrer">
            手动创建
          </a>
          <button type="button" onClick={() => submit(intent.action)}>
            重试
          </button>
        </footer>
      </section>
    );
  const choose = (key) => setSelection({ identity, key });
  return (
    <section
      className="cv-skill-intake"
      role="group"
      aria-label="你想做什么？"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.defaultPrevented)
          return;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const index = intent.options.findIndex((option) => option.key === selected);
          const direction = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
          choose(
            intent.options[(index + direction + intent.options.length) % intent.options.length].key,
          );
        } else if (event.key === 'Enter' && event.target === event.currentTarget) {
          event.preventDefault();
          submit(selected);
        }
      }}
    >
      <header>
        <strong>你想做什么？</strong>
      </header>
      <div role="radiogroup" aria-label="Skill 创建方式">
        {intent.options.map((option, index) => (
          <button
            type="button"
            role="radio"
            aria-checked={selected === option.key}
            key={option.key}
            onClick={() => choose(option.key)}
          >
            <span>{index + 1}</span>
            {option.label}
          </button>
        ))}
      </div>
      <footer>
        <button type="button" onClick={dismiss}>
          忽略
        </button>
        <button type="button" disabled={!selected} onClick={() => submit(selected)}>
          提交
        </button>
      </footer>
    </section>
  );
}
