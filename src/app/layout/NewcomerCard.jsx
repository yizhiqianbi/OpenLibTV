import React from 'react';
import Icon from '../../components/Icon.jsx';
import { asset } from '../../data.js';

export default function NewcomerCard({ ui }) {
  const { dismissNewcomer, config, login } = ui;
  return (
    <div className="newcomer-card">
      <button
        className="newcomer-close"
        aria-label="关闭新人红包"
        onClick={() => {
          dismissNewcomer();
        }}
      >
        <Icon name="close-s" size={14} />
      </button>
      <div
        className="newcomer-image"
        style={{
          backgroundImage: `url(${asset(config.newcomer?.imageUrl || '/assets/4c54f0d1b5adb74e.webp')})`,
        }}
      />
      <div className="newcomer-content">
        <strong>
          新人限时红包
          <br />
          注册立领 <span>100 积分</span>
        </strong>
        <button className="white-button full-width" onClick={login}>
          <Icon name="login" size={16} />
          注册新用户
        </button>
      </div>
    </div>
  );
}
