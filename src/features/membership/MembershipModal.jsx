import React, { useState, useRef } from 'react';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import { useContent } from '../../data.js';

export default function Membership({ onClose, login, user, toast, mode = 'member' }) {
  const memberResource = useContent('member', {});
  const data = memberResource.data;
  const [type, setType] = useState(mode === 'points' ? '积分超市' : '创作会员'),
    [period, setPeriod] = useState(4),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState(null);
  const row = useRef();
  const hasMemberContent =
    data &&
    typeof data === 'object' &&
    ['packages', 'powers', 'faqs'].some((key) => Object.prototype.hasOwnProperty.call(data, key));
  const retry = () => void memberResource.reload().catch(() => undefined);
  if (memberResource.error && !hasMemberContent) {
    return (
      <Modal title="开通会员" onClose={onClose} className="membership-modal">
        <div className="empty-state">
          <p role="alert">会员信息加载失败，请重试</p>
          <button className="soft-button" onClick={retry}>
            重试
          </button>
        </div>
      </Modal>
    );
  }
  if (memberResource.loading && !hasMemberContent) {
    return (
      <Modal title="开通会员" onClose={onClose} className="membership-modal">
        <div className="empty-state" role="status">
          <span className="spinner" />
          <p>加载会员信息...</p>
        </div>
      </Modal>
    );
  }
  const plans = data.packages || [];
  const powers = data.powers || [];
  const groups = ['标准版', '进阶版', '高级版', '豪华版', '至尊版'];
  const visible = groups
    .map(
      (g) =>
        plans.find(
          (p) =>
            p.packageLevelDesc === g && p.packageShopType === period && p.displayConfig?.defaultSku,
        ) || plans.find((p) => p.packageLevelDesc === g && p.packageShopType === period),
    )
    .filter(Boolean);
  return (
    <Modal title="开通会员" onClose={onClose} className="membership-modal">
      <div className="membership-tabs">
        {['创作会员', '团队版会员', '积分超市'].map((t) => (
          <button onClick={() => setType(t)} className={type === t ? 'active' : ''} key={t}>
            {t}
          </button>
        ))}
      </div>
      {type === '创作会员' ? (
        <>
          <div className="billing-tabs">
            {[
              [4, '连续包年', '限时45折'],
              [15, '连续包季', '76折'],
              [3, '连续包月', '88折'],
            ].map(([id, t, tag]) => (
              <button
                className={period === id ? 'active' : ''}
                onClick={() => setPeriod(id)}
                key={id}
              >
                {t}
                <small>{tag}</small>
              </button>
            ))}
          </div>
          <div className="plans-wrap">
            <button
              className="plans-prev icon-button"
              aria-label="上一组套餐"
              onClick={() => row.current.scrollBy({ left: -280, behavior: 'smooth' })}
            >
              <Icon name="left-s" />
            </button>
            <div className="membership-plans" ref={row}>
              {visible.map((p) => (
                <article
                  className={`member-plan ${p.packageLevelDesc === '至尊版' ? 'supreme' : ''}`}
                  key={p.id}
                >
                  <h3>{p.packageLevelDesc}</h3>
                  <div className="plan-price">
                    <span>¥</span>
                    <strong>{p.firstMonthPrice / 100}</strong>
                    <span>/{period === 4 ? '年' : period === 15 ? '季' : '月'}</span>
                    <del>¥{p.originalPrice / 100}</del>
                  </div>
                  <small>
                    次{period === 4 ? '年' : period === 15 ? '季' : '月'}续费 ¥{p.price / 100}{' '}
                    可随时取消
                  </small>
                  <p className="plan-credit">
                    <strong>{p.attr?.totalPower?.toLocaleString()}</strong> 积分/月
                  </p>
                  <p className="muted">
                    最多生成约 {((p.attr?.totalPower || 0) * 4).toLocaleString()} 张图片
                  </p>
                  <button
                    className="white-button full-width"
                    onClick={() => (user ? setSelected(p) : login())}
                  >
                    {p.btnText || '立即开通'}
                  </button>
                  <h4>
                    <Icon name="gift" size={15} /> 限时活动
                  </h4>
                  <div className="plan-offer">
                    <strong>Seedance 2.5 狂欢季</strong>
                    <p>Seedance 2.5（有参） 限时5折</p>
                    <p>Wan 3 系列限时8折</p>
                    <p>Happy Horse 1.1 限时4折</p>
                  </div>
                  <ul>
                    {[
                      `${p.attr?.concurrent || '无限'}个并发任务`,
                      `云端存储空间${Math.round((p.attr?.totalSpace || 0) / 1073741824)}GB`,
                      '去除品牌水印，商用无忧',
                      '会员专享无限次加速',
                      '登录每日赠送20积分',
                      '训练专属权益',
                    ].map((t) => (
                      <li key={t}>
                        <Icon name="check" size={14} />
                        {t}
                      </li>
                    ))}
                  </ul>
                  <h4>独家功能</h4>
                  <ul>
                    {[
                      '全能视频Agent',
                      '3D导演台',
                      '脚本策划',
                      '智能分镜（Kling3.0/O3）',
                      '9/4/25 宫格生成',
                      '宫格切分',
                      '镜头聚焦',
                      '多模态主体库',
                      '视频剪辑',
                      '720 度全景',
                    ]
                      .slice(0, more ? 10 : 4)
                      .map((t) => (
                        <li key={t}>
                          <Icon name="check" size={14} />
                          {t}
                        </li>
                      ))}
                  </ul>
                </article>
              ))}
            </div>
            <button
              className="plans-next icon-button"
              aria-label="下一组套餐"
              onClick={() => row.current.scrollBy({ left: 280, behavior: 'smooth' })}
            >
              <Icon name="right-s" />
            </button>
          </div>
          <button className="more-benefits" onClick={() => setMore(!more)}>
            {more ? '收起权益' : '查看更多权益'} <Icon name={more ? 'up-s' : 'down-s'} size={14} />
          </button>
          <p className="membership-notice">
            免费用户登录每日赠送20积分，云端存储空间3GB。
            <br />
            订阅积分每31天进行重置。
          </p>
          <h2>每月生成数量</h2>
          <div className="generation-table">
            <table>
              <thead>
                <tr>
                  <th>视频模型（含参数）</th>
                  {visible.map((p) => (
                    <th key={p.id}>
                      {p.packageLevelDesc}
                      <br />
                      {(p.attr?.totalPower / 1000).toFixed(1)}k
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Seedance 2.5（720P）', 45.99, '秒'],
                  ['Seedance 2.0（720P）', 27, '秒'],
                  ['Kling 3.0（720P）', 8, '秒'],
                  ['Lib Image', 2, '张'],
                  ['General image Pro', 14, '张'],
                ].map(([m, c, u]) => (
                  <tr key={m}>
                    <td>{m}</td>
                    {visible.map((p) => (
                      <td key={p.id}>
                        {Math.floor(p.attr?.totalPower / c).toLocaleString()} {u}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : type === '积分超市' ? (
        <div className="points-market">
          <h2>积分超市</h2>
          <p className="muted">选择适合你的积分包</p>
          <div className="points-grid">
            {powers.map((p) => (
              <button
                className="points-item"
                key={p.id}
                onClick={() => (user ? setSelected(p) : login())}
              >
                <Icon name="member-store" size={32} />
                <strong>{p.displayName || p.name}</strong>
                <span>¥ {p.price / 100}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="team-member">
          <h2>团队版会员</h2>
          <p>共享资产库 · 多人协作 · 统一管理</p>
          <button className="white-button" onClick={login}>
            联系开通
          </button>
        </div>
      )}
      <h2>常见问题</h2>
      {(data.faqs || []).map((f) => (
        <details className="faq" key={f.question}>
          <summary>
            {f.question}
            <Icon name="down-s" />
          </summary>
          <p>{f.answer}</p>
        </details>
      ))}
      {selected && (
        <div className="purchase-inline">
          <h3>{selected.name}</h3>
          <p>应付金额 ¥{(selected.firstMonthPrice || selected.price) / 100}</p>
          <p className="muted">支付服务尚未连接，此处仅为套餐选择预览。</p>
          <button className="soft-button" onClick={() => setSelected(null)}>
            返回套餐
          </button>
        </div>
      )}
    </Modal>
  );
}
