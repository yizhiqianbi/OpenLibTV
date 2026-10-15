import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon.jsx';

export default function PromoBanner({ onClose, onClick }) {
  const [seconds, setSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date('2026-10-13T00:00:00+08:00').getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const parts = [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
  return (
    <div className="promo-banner">
      <button className="promo-banner-main" onClick={onClick}>
        <span className="countdown">
          {parts.map((n, i) => (
            <React.Fragment key={i}>
              {i > 0 && <i>:</i>}
              <span>
                {String(n)
                  .padStart(2, '0')
                  .split('')
                  .map((v, j) => (
                    <b key={j}>{v}</b>
                  ))}
              </span>
            </React.Fragment>
          ))}
        </span>
        <span className="promo-copy">
          节后回归特惠｜年会员最高立减300元，Seedance 2.5 720P 生成低至 0.35元/秒
        </span>
        <span className="promo-cta">限时抢购</span>
      </button>
      <button className="icon-button" aria-label="关闭优惠横幅" onClick={onClose}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
