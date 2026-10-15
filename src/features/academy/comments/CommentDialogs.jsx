import { useId, useRef, useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import { REPORT_REASONS, validateReport } from './comment-model.js';

export function DeleteCommentDialog({ onClose, onConfirm }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (failure) {
      setError(failure.message || '删除失败，请重试');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="删除评论"
      className="academy-comment-confirm"
      onClose={busy ? undefined : onClose}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
    >
      <h2>删除评论</h2>
      <p>确定删除该评论吗？</p>
      <small>仅删除本机保存的评论，不会修改原站内容。</small>
      {error && (
        <p role="alert" className="academy-comment-error">
          {error}
        </p>
      )}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          className="academy-comment-confirm-primary"
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? '删除中…' : '确认'}
        </button>
      </footer>
    </Modal>
  );
}

export function ReportCommentDialog({ onClose, onSubmit }) {
  const phoneErrorId = useId();
  const [reason, setReason] = useState(''),
    [detail, setDetail] = useState(''),
    [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [phoneError, setPhoneError] = useState('');
  const pending = useRef(false);
  const submit = async () => {
    if (pending.current || !reason) return;
    setError('');
    setPhoneError('');
    let payload;
    try {
      payload = validateReport({ reason, detail, phone });
    } catch (failure) {
      (failure.code === 'phone' ? setPhoneError : setError)(failure.message);
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (failure) {
      setError(failure.message || '举报失败，请稍后重试');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="举报"
      className="academy-comment-report"
      onClose={busy ? undefined : onClose}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
    >
      <h2>举报</h2>
      <div className="academy-comment-report-fields">
        <label>
          举报原因
          <select
            value={reason}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value;
              setReason(next);
              if (next !== 'other') setDetail('');
              setError('');
            }}
          >
            <option value="">请选择投诉原因</option>
            {REPORT_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {reason === 'other' && (
          <label>
            举报具体信息
            <textarea
              rows={4}
              maxLength={100}
              placeholder="请输入介绍"
              value={detail}
              disabled={busy}
              onChange={(event) => setDetail(event.target.value.slice(0, 100))}
            />
          </label>
        )}
        <label>
          联系方式
          <input
            type="tel"
            aria-label="联系方式"
            aria-describedby={phoneError ? phoneErrorId : undefined}
            placeholder="请输入手机号"
            value={phone}
            disabled={busy}
            aria-invalid={Boolean(phoneError)}
            onChange={(event) => {
              setPhone(event.target.value);
              setPhoneError('');
            }}
          />
          {phoneError && (
            <span id={phoneErrorId} role="alert" className="academy-comment-error">
              {phoneError}
            </span>
          )}
        </label>
        <p className="academy-comment-local-note">举报信息仅保存在本机，未提交服务器审核。</p>
        {error && (
          <p role="alert" className="academy-comment-error">
            {error}
          </p>
        )}
      </div>
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          className="academy-comment-confirm-primary"
          type="button"
          disabled={!reason || busy}
          onClick={() => void submit()}
        >
          {busy ? '保存中…' : '确认举报'}
        </button>
      </footer>
    </Modal>
  );
}
