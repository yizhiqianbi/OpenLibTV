import React, { useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import {
  buildActivityRegistrationPayload,
  localActivityRegistrationSource,
} from '../activity-registration-model.js';

function Registration({ item, user, onClose, onSuccess, onSubmit }) {
  const [contact, setContact] = useState(''),
    [method, setMethod] = useState('phone'),
    [social, setSocial] = useState(''),
    [work, setWork] = useState(''),
    [authentic, setAuthentic] = useState(false),
    [errors, setErrors] = useState({}),
    [submitting, setSubmitting] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const next = {
      ...(!user?.nickname && !user?.nickName && !user?.name ? { nickname: '请先填写昵称' } : {}),
      ...(!contact.trim() ? { contact: '请填写联系方式' } : {}),
      ...(!social.trim() ? { social: '请填写社媒主页链接' } : {}),
      ...(!authentic ? { authentic: '请确认信息真实性' } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const payload = buildActivityRegistrationPayload({
      item,
      user,
      contact,
      method,
      social,
      work,
    });
    setSubmitting(true);
    setErrors({});
    try {
      const source = onSubmit ? { submit: onSubmit } : localActivityRegistrationSource();
      const result = await source.submit(payload);
      if (result?.success === false) throw new Error(result.error || '报名失败，请重试');
      onSuccess({
        activityId: item.activityId,
        contact,
        method,
        social,
        work,
        payload,
      });
    } catch (error) {
      setErrors({ submit: error?.message || '报名失败，请重试' });
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <Modal title="挑战赛报名" onClose={onClose} className="secondary-registration">
      <h2>挑战赛报名</h2>
      <form onSubmit={submit}>
        <div className="secondary-registration-fields">
          <label>
            活动名称<p>{item.name}</p>
          </label>
          <label>
            昵称
            <input
              readOnly
              aria-invalid={!!errors.nickname}
              value={user?.nickname || user?.nickName || user?.name || ''}
            />
            {errors.nickname && <small>{errors.nickname}</small>}
          </label>
          <label>
            联系方式 <b>*</b>
            <div className="registration-contact">
              <select
                aria-label="联系方式类型"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="phone">手机</option>
                <option value="wechat">微信</option>
              </select>
              <input
                aria-invalid={!!errors.contact}
                placeholder="请输入手机号或微信号"
                value={contact}
                onChange={(e) => {
                  setContact(e.target.value);
                  setErrors((current) => ({ ...current, contact: undefined, submit: undefined }));
                }}
              />
            </div>
            {errors.contact && <small>{errors.contact}</small>}
          </label>
          <label>
            社媒主页链接 <b>*</b>
            <input
              aria-invalid={!!errors.social}
              placeholder="填写您的社媒主页链接，如，小红书、B站、抖音等"
              value={social}
              onChange={(e) => {
                setSocial(e.target.value);
                setErrors((current) => ({ ...current, social: undefined, submit: undefined }));
              }}
            />
            <p className="registration-hint">
              提交您具有相关AI作品的社媒主页，报名后获得启动积分的机会将大大提升！
            </p>
            {errors.social && <small>{errors.social}</small>}
          </label>
          <label>
            添加AI创作的视频作品<span>（可选）</span>
            <textarea
              placeholder="请添加1-3条您使用AI创作的视频作品链接"
              value={work}
              onChange={(e) => setWork(e.target.value)}
            />
          </label>
          <label className="registration-authentic">
            <input
              type="checkbox"
              checked={authentic}
              onChange={(e) => {
                setAuthentic(e.target.checked);
                setErrors((current) => ({
                  ...current,
                  authentic: undefined,
                  submit: undefined,
                }));
              }}
            />
            <span>
              我确认以上信息及作品数据真实有效，如存在虚假数据、侵权作品或冒用账号，平台有权取消预报名评级及后续扶持资格。
              <b>*</b>
            </span>
            {errors.authentic && <small>{errors.authentic}</small>}
          </label>
        </div>
        {errors.submit && (
          <p className="registration-submit-error" role="alert">
            {errors.submit}
          </p>
        )}
        <div className="registration-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="submit" disabled={submitting} aria-busy={submitting}>
            {submitting ? '提交中…' : '提交报名'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default Registration;
