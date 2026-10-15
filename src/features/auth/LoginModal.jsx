import React, { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { asset } from '../../data.js';

export default function LoginModal({ onClose, onLogin, toast, config, options = {} }) {
  const [method, setMethod] = useState('wechat'),
    [phone, setPhone] = useState(''),
    [code, setCode] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [countdown, setCountdown] = useState(0),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setExpired(true), 120000);
    return () => clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);
  const submit = (e) => {
    e.preventDefault();
    if (method === 'phone') {
      if (!/^1\d{10}$/.test(phone)) {
        setError('请输入正确的手机号');
        return;
      }
      if (code !== '000000') {
        setError('前端演示请使用验证码 000000');
        return;
      }
      onLogin({
        name: phone.slice(0, 3) + '****' + phone.slice(-4),
        id: crypto.randomUUID(),
        demo: true,
      });
    } else {
      if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
        setError('请输入正确的邮箱');
        return;
      }
      if (!password) {
        setError('请输入密码');
        return;
      }
      toast('团队邮箱认证需要连接服务端');
    }
  };
  const video =
    config?.login?.slides?.[0]?.src ||
    'https://libtv-res.liblib.art/upload-images/840247d72b114f619bd7056b1e6d8344/09e693eee8c6ef673eef2b4cc5bd63ace2eaabda.webm';
  return (
    <Modal
      title="登录"
      onClose={onClose}
      closeButton={!options.hideCloseButton}
      closeOnClickOutside={options.closeOnClickOutside !== false && !options.hideCloseButton}
      closeOnEscape={!options.hideCloseButton}
      className="login-modal"
    >
      <div className="login-cinema">
        <video autoPlay muted loop playsInline src={asset(video)} preload="metadata" />
        <div>
          <h2>PenStudio 热门作品</h2>
          <p>全网创作者都在用PenStudio ｜登录开启你的创意大片</p>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-center">
          <img className="libtv-logo" src="/assets/penstudio-logo.svg" alt="PenStudio" />
          <h2>
            {method === 'wechat'
              ? '微信一键登录'
              : method === 'phone'
                ? '手机号登录'
                : method === 'qq'
                  ? 'QQ扫码登录'
                  : '团队邮箱登录'}
          </h2>
          {method === 'wechat' || method === 'qq' ? (
            <div className="qr-code">
              <QrPattern />
              {expired && (
                <div className="qr-expired">
                  <p>二维码已过期</p>
                  <button className="soft-button" onClick={() => setExpired(false)}>
                    <Icon name="refresh" /> 点击刷新
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form className="login-form" onSubmit={submit}>
              {method === 'phone' ? (
                <>
                  <div className="login-input">
                    <span>+86</span>
                    <input
                      type="tel"
                      placeholder="请输入手机号"
                      aria-label="手机号"
                      maxLength={11}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, ''));
                        setError('');
                      }}
                    />
                  </div>
                  <div className="login-input">
                    <input
                      placeholder="请输入验证码"
                      aria-label="验证码"
                      value={code}
                      maxLength={6}
                      onChange={(e) => {
                        setCode(e.target.value);
                        setError('');
                      }}
                    />
                    <button
                      type="button"
                      disabled={countdown > 0}
                      onClick={() => {
                        if (!/^1\d{10}$/.test(phone)) {
                          setError('请输入正确的手机号');
                          return;
                        }
                        setCountdown(60);
                        toast('前端演示验证码：000000');
                      }}
                    >
                      {countdown > 0 ? `${countdown}s 后重新获取` : '获取验证码'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="login-input">
                    <input
                      type="email"
                      placeholder="请输入团队邮箱"
                      aria-label="团队邮箱"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="login-input">
                    <input
                      type="password"
                      placeholder="请输入密码"
                      aria-label="密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="white-button full-width" type="submit">
                {method === 'phone' ? '登录 / 注册' : '登录'}
              </button>
            </form>
          )}
          <p className="login-terms">
            继续即表示您同意{' '}
            <a
              href="https://www.liblib.art/activities/468ad794ccc7408d81757fd91be003ec"
              target="_blank"
              rel="noreferrer"
            >
              使用条款
            </a>{' '}
            和{' '}
            <a
              href="https://www.liblib.art/activities/7a354f41ead34f719eb49576e5292d00"
              target="_blank"
              rel="noreferrer"
            >
              隐私政策
            </a>
            {method === 'phone' && '，未注册手机号将自动注册'}
          </p>
        </div>
        <div className="login-methods">
          {[
            ['wechat', '微信登录', 'chat'],
            ['phone', '手机号登录', 'smartphone'],
            ['email', '团队邮箱登录', 'mail'],
            ['qq', 'QQ 登录', 'contact'],
          ]
            .filter(([k]) => k !== method)
            .map(([k, label, icon]) => (
              <button
                key={k}
                onClick={() => {
                  setMethod(k);
                  setError('');
                }}
              >
                <Icon name={icon} size={24} />
                <span>{label}</span>
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}

function QrPattern() {
  const cells = [];
  const finder = (x, y) =>
    [
      [0, 0],
      [22, 0],
      [0, 22],
    ].some(
      ([a, b]) =>
        x >= a &&
        x < a + 7 &&
        y >= b &&
        y < b + 7 &&
        (x === a ||
          x === a + 6 ||
          y === b ||
          y === b + 6 ||
          (x >= a + 2 && x <= a + 4 && y >= b + 2 && y <= b + 4)),
    );
  for (let y = 0; y < 29; y++)
    for (let x = 0; x < 29; x++) {
      const inFinder = [
        [0, 0],
        [22, 0],
        [0, 22],
      ].some(([a, b]) => x >= a - 1 && x < a + 8 && y >= b - 1 && y < b + 8);
      if (finder(x, y) || (!inFinder && (x * x + 3 * x * y + y * 7 + x * 11) % 13 < 6))
        cells.push(<rect key={`${x}-${y}`} x={x + 2} y={y + 2} width="1" height="1" />);
    }
  return (
    <svg viewBox="0 0 33 33" role="img" aria-label="登录二维码界面预览">
      <rect width="33" height="33" fill="white" />
      <g fill="black">{cells}</g>
    </svg>
  );
}
