import { useEffect, useState } from 'react';
import { Sparkles, Play, Pause } from 'lucide-react';
import { mediaUrl } from '../model.js';
import AgentReferencePreview from '../../../components/agent/AgentReferencePreview.jsx';
import { CanvasAgentMessageContent } from './CanvasAgentMessage.jsx';

export function ChatReplayPanel({
  chatMessages,
  nodes,
  replay,
  replayPlaying,
  setReplay,
  setReplayPlaying,
  sharedMessages,
  src,
  title,
}) {
  const [preview, setPreview] = useState(null);
  useEffect(() => setPreview(null), [sharedMessages]);
  return (
    <aside className="cv-chat-drawer">
      <header>{title}</header>
      <div ref={chatMessages} className="cv-chat-messages">
        {sharedMessages.slice(0, replay + 1).map((m, i) => (
          <div key={i} className={'cv-chat-message ' + m.role}>
            {m.role === 'assistant' && <Sparkles size={16} />}
            <CanvasAgentMessageContent message={m} onPreview={setPreview} />
          </div>
        ))}
        {replay === sharedMessages.length - 1 &&
          nodes
            .filter((n) => n.type === 'video' && n.data?.action?.includes('generate'))
            .map((n) => (
              <video key={n.id} controls tabIndex={0} preload="none" src={src(mediaUrl(n))} />
            ))}
      </div>
      <div className="cv-chat-playback">
        <button
          title={replayPlaying ? '暂停回放' : '播放回放'}
          aria-label={replayPlaying ? '暂停回放' : '播放回放'}
          onClick={() => {
            if (replay >= sharedMessages.length - 1) setReplay(0);
            setReplayPlaying(!replayPlaying);
          }}
        >
          {replayPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <input
          aria-label="回放进度"
          type="range"
          min={0}
          max={Math.max(0, sharedMessages.length - 1)}
          value={replay}
          onChange={(e) => {
            setReplay(Number(e.target.value));
            setReplayPlaying(false);
          }}
        />
        <button
          onClick={() => {
            setReplayPlaying(false);
            setReplay(sharedMessages.length - 1);
          }}
        >
          查看结果
        </button>
      </div>
      {preview && <AgentReferencePreview reference={preview} onClose={() => setPreview(null)} />}
    </aside>
  );
}
