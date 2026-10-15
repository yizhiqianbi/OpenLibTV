import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AudioLines,
  Copy,
  Filter,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import Modal from '../../../../components/Modal.jsx';
import { useDialogBehavior } from '../../../../hooks/useDialogBehavior.js';
import { writeTextToClipboard } from '../../../../services/clipboard-text.js';
import {
  countVoiceFilters,
  emptyVoiceFilters,
  emptyVoiceOptions,
  removeVoiceFilter,
  voiceFilterChips,
  voiceLabel,
  voiceMetadata,
} from './model.ts';
import { sampleVoiceSource } from './source.ts';
import { useVoiceLibrary } from './useVoiceLibrary.ts';
import { useVoicePlayer } from './useVoicePlayer.ts';
import VoiceFilterDialog from './VoiceFilterDialog.jsx';
import './voices.css';

const tabs = [
  { key: 'library', label: '音色库' },
  { key: 'my', label: '我的音色' },
  { key: 'favorite', label: '收藏音色' },
];
const searchLabels = { library: '搜索音色库', my: '搜索我的音色', favorite: '搜索收藏音色' };
const emptyLabels = {
  library: '暂无音色数据',
  my: '暂无可用音色，快去克隆你的新音色吧～',
  favorite: '暂无收藏音色',
};
function VoiceCopyMenu({ onCopy, onClose }) {
  const ref = useRef(null);
  useDialogBehavior(ref, { onClose });
  return (
    <div ref={ref} className="cv-voice-copy-menu" role="dialog" aria-label="音色操作" tabIndex={-1}>
      <button type="button" onClick={onCopy}>
        <Copy size={15} />
        复制音色ID
      </button>
    </div>
  );
}
export default function VoicePickerDialog({
  value,
  onChange,
  onClose,
  source = sampleVoiceSource,
  playback,
}) {
  const library = useVoiceLibrary(source);
  const localPlayback = useVoicePlayer();
  const player = playback || localPlayback;
  const { stop } = player;
  const [filterOpen, setFilterOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [moreVoice, setMoreVoice] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [selecting, setSelecting] = useState(false);
  const alive = useRef(true);
  const operation = useRef(0);
  const previousSource = useRef(source);
  const [jump, setJump] = useState('');
  const options = source.options || emptyVoiceOptions;
  const chips = voiceFilterChips(library.filters, options);
  const pages = Math.max(1, Math.ceil(library.total / library.pageSize));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);
  useEffect(() => {
    operation.current++;
    setMoreVoice(null);
    setFilterOpen(false);
    setCloneOpen(false);
    setJump('');
    setFeedback('');
    setSelecting(false);
    if (previousSource.current !== source) {
      previousSource.current = source;
      stop();
    }
  }, [source, stop]);
  const select = async (voice) => {
    if (voice.voiceId === value || selecting) return;
    const token = ++operation.current;
    setSelecting(true);
    setFeedback('');
    try {
      const result = await onChange?.(voice.voiceId, voiceMetadata(voice));
      if (!alive.current || token !== operation.current) return;
      if (result === false) throw new Error('音色设置未保存，请重试');
      onClose();
    } catch (cause) {
      if (alive.current && token === operation.current)
        setFeedback(cause instanceof Error ? cause.message : '音色设置未保存，请重试');
    } finally {
      if (alive.current && token === operation.current) setSelecting(false);
    }
  };
  const copy = async (voice) => {
    const token = operation.current;
    try {
      await writeTextToClipboard(voice.voiceId);
      if (alive.current && token === operation.current) setFeedback('音色ID已复制');
    } catch (cause) {
      if (alive.current && token === operation.current)
        setFeedback(cause instanceof Error ? cause.message : '复制音色ID失败');
    }
    if (alive.current && token === operation.current) setMoreVoice(null);
  };
  return createPortal(
    <>
      <Modal title="音色选择" className="cv-voice-dialog" onClose={onClose}>
        <h2>音色选择</h2>
        <div className="cv-voice-toolbar">
          <div className="cv-voice-tabs" role="tablist" aria-label="音色分类">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={library.tab === tab.key}
                onClick={() => {
                  setMoreVoice(null);
                  library.changeTab(tab.key);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="cv-voice-search-tools">
            {library.tab !== 'favorite' && (
              <button className="cv-voice-clone" type="button" onClick={() => setCloneOpen(true)}>
                克隆新音色
              </button>
            )}
            <div className="cv-voice-search">
              <input
                aria-label={searchLabels[library.tab]}
                placeholder={searchLabels[library.tab]}
                value={library.query}
                onChange={(e) => library.changeQuery(e.target.value)}
                onCompositionStart={() => library.setComposing(true)}
                onCompositionEnd={(e) => {
                  library.changeQuery(e.currentTarget.value);
                  library.setComposing(false);
                }}
              />
              {library.query && (
                <button aria-label="清除搜索" type="button" onClick={() => library.changeQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              className="cv-voice-filter-trigger"
              type="button"
              aria-label="筛选"
              onClick={() => setFilterOpen(true)}
            >
              <Filter size={16} />
              筛选
              {countVoiceFilters(library.filters) > 0 && (
                <span>{countVoiceFilters(library.filters)}</span>
              )}
            </button>
          </div>
        </div>
        {source.mode === 'sample-local' && (
          <p className="cv-voice-source-note">公开音色代表样本；收藏仅保存在本机。</p>
        )}
        {chips.length > 0 && (
          <div className="cv-voice-chips">
            {chips.map((chip) => (
              <span key={chip.key}>
                {chip.label}
                <button
                  aria-label={`移除过滤器 ${chip.label}`}
                  type="button"
                  onClick={() => library.applyFilters(removeVoiceFilter(library.filters, chip.key))}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              aria-label="清除全部过滤器"
              type="button"
              onClick={() => library.applyFilters(emptyVoiceFilters())}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        )}
        {(feedback || player.error || library.favoriteError) && (
          <p role="status" className="cv-voice-feedback">
            {feedback || player.error?.message || library.favoriteError?.message}
          </p>
        )}
        <div className="cv-voice-list" aria-busy={library.loading}>
          {library.loading ? (
            <p className="cv-voice-empty" role="status">
              加载中…
            </p>
          ) : (
            <>
              {library.error && (
                <div className="cv-voice-error" role="alert">
                  {library.error.message}
                  <button type="button" onClick={library.reload}>
                    重试
                  </button>
                </div>
              )}
              {!library.list.length && !library.error && (
                <p className="cv-voice-empty">{emptyLabels[library.tab]}</p>
              )}
              {library.list.map((voice) => (
                <div
                  key={voice.voiceId}
                  className={`cv-voice-row ${value === voice.voiceId ? 'is-selected' : ''}`}
                >
                  <button
                    className="cv-voice-play"
                    type="button"
                    aria-label={`${player.playingId === voice.voiceId || player.loadingId === voice.voiceId ? '暂停' : '试听'} ${voice.name}`}
                    disabled={!voice.voiceUrl}
                    onClick={() => player.toggle(voice)}
                  >
                    {player.playingId === voice.voiceId ? (
                      <Pause size={16} />
                    ) : player.loadingId === voice.voiceId ? (
                      <span className="cv-voice-audio-loading" />
                    ) : (
                      <>
                        <AudioLines className="cv-voice-audio-lines" size={16} />
                        <Play className="cv-voice-audio-play" size={16} />
                      </>
                    )}
                  </button>
                  <div className="cv-voice-description">
                    <strong>{voice.name}</strong>
                    {voice.description && <p>{voice.description}</p>}
                  </div>
                  <div className="cv-voice-tags">
                    {library.tab === 'my' && <span className="cv-voice-clone-tag">音色克隆</span>}
                    {['language', 'accent', 'gender']
                      .filter((kind) => voice[kind])
                      .map((kind) => (
                        <span key={kind}>{voiceLabel(kind, voice[kind], options)}</span>
                      ))}
                  </div>
                  <button
                    className="cv-voice-select cv-voice-primary"
                    type="button"
                    disabled={voice.voiceId === value || selecting}
                    onClick={() => select(voice)}
                    aria-label={`${voice.voiceId === value ? '已选择' : '选择'} ${voice.name}`}
                  >
                    {voice.voiceId === value ? '已选择' : '选择'}
                  </button>
                  <button
                    className="cv-voice-favorite"
                    type="button"
                    aria-label={`${voice.isFavorited ? '取消收藏' : '收藏'} ${voice.name}`}
                    aria-pressed={Boolean(voice.isFavorited)}
                    title={!source.setFavorite ? '音色收藏服务未接入' : undefined}
                    disabled={!source.setFavorite || Boolean(library.favoritePending)}
                    onClick={() => library.toggleFavorite(voice.voiceId, !voice.isFavorited)}
                  >
                    <Star size={16} fill={voice.isFavorited ? 'currentColor' : 'none'} />
                  </button>
                  <div className="cv-voice-more">
                    <button
                      aria-label={`更多 ${voice.name}`}
                      aria-expanded={moreVoice === voice.voiceId}
                      type="button"
                      onClick={() =>
                        setMoreVoice((old) => (old === voice.voiceId ? null : voice.voiceId))
                      }
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {moreVoice === voice.voiceId && (
                      <VoiceCopyMenu
                        onClose={() => setMoreVoice(null)}
                        onCopy={() => copy(voice)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <footer className="cv-voice-pagination">
          {library.total > 0 && (
            <>
              <button
                aria-label="上一页"
                type="button"
                disabled={library.loading || library.page <= 1}
                onClick={() => library.changePage(library.page - 1)}
              >
                ‹
              </button>
              <span>
                {library.page} / {pages}
              </span>
              <button
                aria-label="下一页"
                type="button"
                disabled={library.loading || library.page >= pages}
                onClick={() => library.changePage(library.page + 1)}
              >
                ›
              </button>
              <select
                aria-label="每页条数"
                value={library.pageSize}
                onChange={(e) => library.changePageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}条/页
                  </option>
                ))}
              </select>
              {pages > 1 && (
                <label>
                  跳至
                  <input
                    aria-label="跳转页码"
                    inputMode="numeric"
                    value={jump}
                    onChange={(e) => setJump(e.target.value.replace(/[^\d]/g, ''))}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.nativeEvent.isComposing &&
                        e.nativeEvent.keyCode !== 229
                      ) {
                        const next = Number(jump);
                        if (next >= 1 && next <= pages) library.changePage(next);
                        setJump('');
                      }
                    }}
                  />
                  页
                </label>
              )}
              <span className="cv-voice-total">共{library.total}条</span>
            </>
          )}
        </footer>
      </Modal>
      {filterOpen && (
        <VoiceFilterDialog
          filters={library.filters}
          options={options}
          onApply={library.applyFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {cloneOpen && (
        <Modal
          title="克隆新音色"
          className="cv-voice-unavailable"
          onClose={() => setCloneOpen(false)}
        >
          <h2>克隆新音色</h2>
          <p>音色克隆需要认证、声音样本上传和生成服务。目前未接入，无法生成或登记音色。</p>
          <button type="button" onClick={() => setCloneOpen(false)}>
            返回音色选择
          </button>
        </Modal>
      )}
    </>,
    document.body,
  );
}
