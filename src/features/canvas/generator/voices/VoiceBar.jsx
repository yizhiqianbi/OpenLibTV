import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowLeftRight, Copy, Pause, Play } from 'lucide-react';
import { writeTextToClipboard } from '../../../../services/clipboard-text.js';
import { currentVoice, emptyVoiceOptions, voiceLabel } from './model.ts';
import { sampleVoiceSource } from './source.ts';
import { useVoicePlayer } from './useVoicePlayer.ts';
import VoicePickerDialog from './VoicePickerDialog.jsx';
import './voices.css';

export default function VoiceBar({
  value,
  meta,
  onChange,
  source = sampleVoiceSource,
  disabled = false,
  className = '',
}) {
  const [opened, setOpened] = useState(false);
  const [feedback, setFeedback] = useState('');
  const player = useVoicePlayer();
  const { stop } = player;
  const previousSource = useRef(source);
  useEffect(() => {
    if (previousSource.current !== source) {
      previousSource.current = source;
      stop();
      setFeedback('');
    }
    if (disabled) {
      setOpened(false);
      stop();
    }
  }, [source, disabled, stop]);
  const voice = currentVoice(value, meta);
  // Clipboard completion is shown inside the strip only if its DOM still exists.
  const bar = useRef(null);
  const playing =
    voice && (player.playingId === voice.voiceId || player.loadingId === voice.voiceId);
  const label = voice?.accent
    ? voiceLabel('accent', voice.accent, source.options || emptyVoiceOptions)
    : voiceLabel('language', voice?.language, source.options || emptyVoiceOptions);
  const copy = async () => {
    if (!voice?.voiceId) return;
    try {
      await writeTextToClipboard(voice.voiceId);
      if (bar.current?.isConnected) setFeedback('音色ID已复制');
    } catch (cause) {
      if (bar.current?.isConnected)
        setFeedback(cause instanceof Error ? cause.message : '复制失败');
    }
  };
  return (
    <>
      <div ref={bar} className={`cv-voice-bar ${className}`}>
        <button
          type="button"
          className="cv-voice-play"
          aria-label={playing ? '暂停音色试听' : '试听音色'}
          disabled={disabled || !voice?.voiceUrl}
          onClick={() => player.toggle(voice)}
        >
          {player.playingId ? (
            <Pause size={16} />
          ) : (
            <>
              <AudioLines className="cv-voice-audio-lines" size={16} />
              <Play className="cv-voice-audio-play" size={16} />
            </>
          )}
        </button>
        <div className="cv-voice-bar-name">
          <strong>{voice?.name || '选择音色'}</strong>
          {voice && (
            <button type="button" aria-label="复制音色ID" onClick={copy}>
              <Copy size={14} />
            </button>
          )}
        </div>
        {label && <span className="cv-voice-bar-tag">{label}</span>}
        <button
          aria-label="切换音色"
          type="button"
          disabled={disabled}
          onClick={() => setOpened(true)}
        >
          <ArrowLeftRight size={16} />
        </button>
      </div>
      {(feedback || player.error) && (
        <p className="cv-voice-feedback" role="status">
          {feedback || player.error?.message}
        </p>
      )}
      {opened && !disabled && (
        <VoicePickerDialog
          value={value}
          source={source}
          playback={player}
          onChange={(_id, metadata) => onChange?.(metadata)}
          onClose={() => setOpened(false)}
        />
      )}
    </>
  );
}
