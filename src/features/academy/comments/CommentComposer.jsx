import { useEffect, useRef, useState } from 'react';
import { Send, UserRound } from 'lucide-react';

export function CommentAvatar({ viewer, size = 32, asset = (value) => value }) {
  return viewer?.avatar ? (
    <img
      className="academy-comment-user-avatar"
      width={size}
      height={size}
      src={asset(viewer.avatar)}
      alt=""
    />
  ) : (
    <span
      className="academy-comment-user-avatar academy-comment-avatar-fallback"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {viewer?.nickName?.slice(0, 1) || <UserRound size={size * 0.5} />}
    </span>
  );
}

export function CommentComposer({
  viewer,
  asset,
  ensureLogin,
  onSubmit,
  onCancel,
  onDirtyChange,
  maxLength = 500,
  placeholder = '写下你的评论，对我们很重要',
  reply = false,
  disabled = false,
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const field = useRef(null),
    active = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    if (reply) field.current?.focus();
    return () => {
      active.current = false;
    };
  }, [reply]);
  useEffect(() => {
    onDirtyChange?.(Boolean(text.trim()));
  }, [text, onDirtyChange]);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = '24px';
    element.style.height = `${Math.min(96, Math.max(24, element.scrollHeight))}px`;
    element.style.overflowY = element.scrollHeight > 96 ? 'auto' : 'hidden';
  }, [text]);
  const submit = async () => {
    if (submitting.current || disabled || !ensureLogin()) return;
    if (!text.trim()) {
      setError('请输入评论内容');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      if (await onSubmit(text.trim())) {
        if (active.current) setText('');
      }
    } catch (failure) {
      if (active.current) setError(failure.message || '评论发布失败，请重试');
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  };
  return (
    <div className="academy-comment-compose" data-comment-reply={reply ? '' : undefined}>
      <CommentAvatar viewer={viewer} size={36} asset={asset} />
      <div className="academy-comment-compose-body">
        <div className="academy-comment-compose-field">
          <textarea
            ref={field}
            rows={1}
            maxLength={maxLength}
            aria-label={reply ? placeholder : '评论内容'}
            placeholder={placeholder}
            value={text}
            disabled={disabled || busy}
            onFocus={ensureLogin}
            onChange={(event) => {
              setText(event.target.value.slice(0, maxLength));
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === 'Escape' && onCancel) {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              } else if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {reply && (
            <button
              type="button"
              aria-label="发布回复"
              disabled={!text.trim() || disabled || busy}
              onClick={() => void submit()}
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="academy-comment-compose-status">
          <span>
            {text.length}/{maxLength}
          </span>
          {reply && (
            <button type="button" onClick={onCancel}>
              取消
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="academy-comment-error">
            {error}
          </p>
        )}
      </div>
      {!reply && (
        <button
          className="academy-comment-publish"
          type="button"
          disabled={!text.trim() || disabled || busy}
          onClick={() => void submit()}
        >
          {busy ? '发布中…' : '发布'}
        </button>
      )}
    </div>
  );
}
