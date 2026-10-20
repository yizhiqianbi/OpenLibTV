import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, MessageCircle, Plus, Save, Send, Sparkles } from 'lucide-react';
import { serverConnected } from '../../services/api-client.ts';
import {
  createXumengAgentApi,
  normalizeXumengCard,
  validateXumengCharacterInput,
  xumengCharacterPrompt,
  xumengErrorMessage,
} from '../../services/xumeng-agent.ts';
import './xumeng.css';

const emptyCharacter = {
  name: '新角色',
  introduction: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  messageExamples: '',
  alternateGreetings: [],
  suggestedReplies: [],
  characterBook: { entries: [] },
};

const api = createXumengAgentApi();

function cardFromServer(value) {
  return {
    ...emptyCharacter,
    ...value,
    characterBook: value?.characterBook || { entries: [] },
    alternateGreetings: Array.isArray(value?.alternateGreetings) ? value.alternateGreetings : [],
    suggestedReplies: Array.isArray(value?.suggestedReplies) ? value.suggestedReplies : [],
  };
}

export default function XumengAgentPage({ toast }) {
  const [characters, setCharacters] = useState([]);
  const [character, setCharacter] = useState(emptyCharacter);
  const [characterId, setCharacterId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState({});
  const [memory, setMemory] = useState([]);
  const [status, setStatus] = useState(serverConnected ? 'loading' : 'offline');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const abortRef = useRef(null);
  const importRef = useRef(null);
  const canChat = useMemo(
    () => Boolean(characterId && draft.trim() && !sending && serverConnected),
    [characterId, draft, sending],
  );

  useEffect(() => {
    if (!serverConnected) return undefined;
    const controller = new AbortController();
    void api.characters
      .list('', controller.signal)
      .then((page) => {
        const items = Array.isArray(page?.items) ? page.items : [];
        setCharacters(items);
        if (items[0]) {
          setCharacter(cardFromServer(items[0]));
          setCharacterId(items[0].id);
        }
        setStatus('ready');
      })
      .catch((failure) => {
        if (failure?.name === 'AbortError') return;
        setError(xumengErrorMessage(failure));
        setStatus('error');
      });
    return () => controller.abort();
  }, []);

  const update = (key, value) => setCharacter((previous) => ({ ...previous, [key]: value }));
  const chooseCharacter = (value) => {
    setCharacter(cardFromServer(value));
    setCharacterId(value.id);
    setMessages([]);
    setState({});
    setMemory([]);
    setError('');
  };
  const newCharacter = () => {
    setCharacter(emptyCharacter);
    setCharacterId(null);
    setMessages([]);
    setState({});
    setMemory([]);
  };

  async function saveCharacter() {
    setError('');
    try {
      const input = validateXumengCharacterInput(character);
      const saved = characterId
        ? await api.characters.update(characterId, input)
        : await api.characters.create(input);
      setCharacter(cardFromServer(saved));
      setCharacterId(saved.id);
      setCharacters((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      toast?.('角色卡已保存到叙梦服务');
    } catch (failure) {
      setError(xumengErrorMessage(failure));
    }
  }

  async function send() {
    if (!canChat) return;
    const content = draft.trim();
    const userMessage = { role: 'user', content, createdAt: new Date().toISOString() };
    setDraft('');
    setMessages((items) => [
      ...items,
      userMessage,
      { role: 'assistant', content: '', pending: true },
    ]);
    setSending(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = '';
    try {
      await api.chatStream(
        {
          characterId,
          character: xumengCharacterPrompt(character),
          messages: [...messages, userMessage],
          state,
          memory,
          model: 'balanced',
          maxTokens: 2048,
        },
        (delta) => {
          reply += delta;
          setMessages((items) => {
            const next = [...items];
            next[next.length - 1] = { role: 'assistant', content: reply, pending: true };
            return next;
          });
        },
        controller.signal,
        (event) => {
          if (event.statePatch) setState((previous) => ({ ...previous, ...event.statePatch }));
          if (event.memoryAppend?.length)
            setMemory((previous) => [...new Set([...previous, ...event.memoryAppend])].slice(-24));
        },
      );
      setMessages((items) => {
        const next = [...items];
        next[next.length - 1] = { role: 'assistant', content: reply || '服务返回了空回复' };
        return next;
      });
    } catch (failure) {
      if (failure?.name !== 'AbortError') {
        setError(xumengErrorMessage(failure));
        setMessages((items) => items.slice(0, -1));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function exportCharacter() {
    if (!characterId) return;
    try {
      const value = await api.exportCard(characterId);
      const body = JSON.stringify(
        value?.spec === 'chara_card_v2' ? value : { spec: 'chara_card_v2', data: value },
        null,
        2,
      );
      const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${value.name || 'xumeng-character'}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setError(xumengErrorMessage(failure));
    }
  }

  async function importCharacter(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const card = normalizeXumengCard(JSON.parse(await file.text()));
      const saved = await api.importCard(card);
      setCharacter(cardFromServer(saved));
      setCharacterId(saved.id);
      setCharacters((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      toast?.('角色卡已导入叙梦服务');
    } catch (failure) {
      setError(xumengErrorMessage(failure));
    }
  }

  return (
    <main className="xumeng-page">
      <header className="xumeng-header">
        <div>
          <span className="xumeng-kicker">
            <Sparkles size={14} /> XUMENG AGENT
          </span>
          <h1>叙梦 Agent</h1>
          <p>角色卡、世界书、状态与对话统一通过服务端 API 运行。</p>
        </div>
        <div className="xumeng-header-actions">
          <button type="button" onClick={newCharacter}>
            <Plus size={15} /> 新建角色
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={!serverConnected}
          >
            <Download size={15} /> 导入卡片
          </button>
          <input
            ref={importRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={importCharacter}
          />
          <button type="button" onClick={exportCharacter} disabled={!characterId}>
            <Download size={15} /> 导出卡片
          </button>
        </div>
      </header>
      {!serverConnected && (
        <div className="xumeng-banner">
          尚未配置 API。填写 <code>VITE_API_BASE_URL</code> 和服务端的{' '}
          <code>XUMENG_BACKEND_URL</code> 后，角色保存与对话才会启用。
        </div>
      )}
      {error && (
        <div className="xumeng-error" role="alert">
          {error}
        </div>
      )}
      <div className="xumeng-layout">
        <aside className="xumeng-library">
          <div className="xumeng-section-title">
            <span>角色库</span>
            <small>{status === 'loading' ? '读取中' : `${characters.length} 个角色`}</small>
          </div>
          {characters.map((item) => (
            <button
              type="button"
              className={`xumeng-character-row${item.id === characterId ? ' is-active' : ''}`}
              key={item.id}
              onClick={() => chooseCharacter(item)}
            >
              <strong>{item.name}</strong>
              <span>{item.introduction || item.description || '未填写简介'}</span>
            </button>
          ))}
          {!characters.length && <p className="xumeng-muted">保存第一个角色后，它会出现在这里。</p>}
        </aside>
        <section className="xumeng-editor">
          <div className="xumeng-section-title">
            <span>角色卡</span>
            <small>{characterId ? `版本 ${character.revision || 1}` : '未保存'}</small>
          </div>
          <label>
            名称
            <input
              value={character.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            简介
            <textarea
              value={character.introduction}
              onChange={(event) => update('introduction', event.target.value)}
            />
          </label>
          <label>
            描述
            <textarea
              value={character.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
          <label>
            性格
            <textarea
              value={character.personality}
              onChange={(event) => update('personality', event.target.value)}
            />
          </label>
          <label>
            场景
            <textarea
              value={character.scenario}
              onChange={(event) => update('scenario', event.target.value)}
            />
          </label>
          <label>
            开场白
            <textarea
              value={character.firstMessage}
              onChange={(event) => update('firstMessage', event.target.value)}
            />
          </label>
          <label>
            系统提示（可选）
            <textarea
              value={character.systemPrompt}
              onChange={(event) => update('systemPrompt', event.target.value)}
            />
          </label>
          <div className="xumeng-editor-actions">
            <button
              type="button"
              className="xumeng-primary"
              disabled={!serverConnected}
              onClick={saveCharacter}
            >
              <Save size={15} /> 保存角色卡
            </button>
          </div>
        </section>
        <section className="xumeng-chat">
          <div className="xumeng-section-title">
            <span>
              <MessageCircle size={15} /> 对话
            </span>
            <small>
              {Object.keys(state).length || memory.length
                ? `状态 ${Object.keys(state).length} · 记忆 ${memory.length}`
                : '服务端会话'}
            </small>
          </div>
          <div className="xumeng-messages" aria-live="polite">
            {!messages.length && (
              <div className="xumeng-empty-chat">
                <Sparkles size={20} />
                <p>{character.firstMessage || '保存角色卡后开始一段对话。'}</p>
              </div>
            )}
            {messages.map((message, index) => (
              <div
                className={`xumeng-message ${message.role}`}
                key={`${message.createdAt || index}-${index}`}
              >
                <span>{message.role === 'user' ? '你' : character.name}</span>
                <p>{message.content || (message.pending ? '正在回复…' : '')}</p>
              </div>
            ))}
          </div>
          <div className="xumeng-composer">
            <textarea
              value={draft}
              disabled={!characterId || sending || !serverConnected}
              placeholder={characterId ? '输入你想说的话…' : '先保存角色卡'}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="xumeng-send"
              disabled={!sending && !canChat}
              onClick={sending ? stop : () => void send()}
            >
              {sending ? (
                '停止'
              ) : (
                <>
                  <Send size={15} /> 发送
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
