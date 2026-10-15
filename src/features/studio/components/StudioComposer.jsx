import { ChevronDown, Plus, Sparkles, Check } from 'lucide-react';
export function StudioComposer({
  active,
  conversation,
  fileInput,
  menu,
  messages,
  notify,
  prompt,
  send,
  setConversation,
  setMenu,
  setPrompt,
  title,
}) {
  return (
    <div className={'cv-studio-composer ' + (conversation ? 'expanded' : '')}>
      <div className="cv-studio-conversation-head" onClick={() => setConversation(!conversation)}>
        <Sparkles size={15} />
        <span>{title}</span>
        <button title={conversation ? '收起对话面板' : '展开历史对话'}>
          <ChevronDown size={15} />
        </button>
      </div>
      {conversation && (
        <div className="cv-studio-messages">
          {messages.length ? (
            messages.map((m, i) => (
              <p key={i} className={m.role}>
                {m.text}
              </p>
            ))
          ) : (
            <p>描述你想象中的场景…</p>
          )}
        </div>
      )}
      <textarea
        placeholder={active ? '选中一个元素或机位，描述如何调整…' : '自由描述你想搭建的场景…'}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="cv-studio-composer-actions">
        <button title="添加附件" onClick={() => fileInput.current?.click()}>
          <Plus size={18} />
        </button>
        <button
          className="cv-studio-menu-trigger"
          onClick={() => setMenu(menu === 'model' ? null : 'model')}
        >
          3D-BOX Model Pro
          <ChevronDown size={10} />
        </button>
        <span />
        <button
          title="生成场景"
          className="cv-studio-send"
          disabled={!prompt.trim()}
          onClick={send}
        >
          <Sparkles size={17} />
        </button>
      </div>
      {menu === 'model' && (
        <div className="cv-studio-model-menu cv-studio-popover">
          <button
            onClick={() => {
              setMenu(null);
              notify('已选择 3D-BOX Model Pro');
            }}
          >
            3D-BOX Model Pro
            <Check size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
