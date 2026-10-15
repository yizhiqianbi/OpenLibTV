import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Flame } from 'lucide-react';
import Modal from '../../../components/Modal.jsx';
import { academyRepository } from './repository.js';
import { useAcademyResource } from './useAcademyResource.js';
import CourseOverlayPortal from './CourseOverlayPortal.jsx';
import './member.css';

const cls = (name) => `academy-course-member-${name}`;
const money = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });

function PlanCard({ pkg, level, costs, ordering, onPurchase }) {
  const year = pkg.type === 4;
  const available = pkg.state === 2 || pkg.state === 3;
  return (
    <article className={`${cls('card')} ${year ? cls('cardYear') : ''}`}>
      {level?.topBannerText && (
        <div
          className={`${cls('promoBanner')} ${level.topBannerVariant === 'secondary' ? cls('promoBannerSecondary') : ''}`}
        >
          <Flame size={16} />
          {level.topBannerText}
        </div>
      )}
      <div className={`${cls('headerCard')} ${cls(year ? 'yearHeader' : 'monthHeader')}`}>
        <div className={cls('identity')}>
          <div className={cls('nameBlock')}>
            <div className={cls('nameRow')}>
              <span className={cls('skuName')}>
                {pkg.name}·{year ? '年包' : '月包'}
              </span>
              <span className={`${cls('skuTag')} ${!year ? cls('skuTagMuted') : ''}`}>
                {pkg.cornerMark}
              </span>
            </div>
            {level?.subtitle && <div className={cls('skuSubtitle')}>{level.subtitle}</div>}
          </div>
          <div className={cls('priceRow')}>
            <span className={cls('priceCurrency')}>¥</span>
            <span className={cls('priceNumber')}>{money(pkg.firstMonthPrice)}</span>
            <span className={cls('pricePeriod')}>/{year ? '年' : '月'}</span>
            {pkg.originalPrice !== pkg.firstMonthPrice && (
              <s className={cls('priceOriginal')}>¥{money(pkg.originalPrice)}</s>
            )}
          </div>
          <p className={cls('renewLine')}>
            次{year ? '年' : '月'}续费 ¥{money(pkg.price)} 可随时取消
          </p>
        </div>
        <div className={cls('purchase')}>
          <div className={cls('creditBlock')}>
            <div className={cls('creditRow')}>
              <span className={cls('creditNumber')}>
                {Number(pkg.powerCount).toLocaleString('zh-CN')}
              </span>
              <span className={cls('creditUnit')}>积分/月</span>
            </div>
            <div className={cls('estimateRow')}>
              <span className={cls('estimateLabel')}>最多可生成约</span>
              <span>
                {Math.floor(pkg.powerCount / (costs?.image || 0.25)).toLocaleString('zh-CN')} 张图片
              </span>
              <span className={cls('estimateDivider')} />
              <span>
                {Math.floor(pkg.powerCount / (costs?.video || 8)).toLocaleString('zh-CN')} 个视频
              </span>
            </div>
          </div>
          <button
            disabled={!available || ordering}
            className={`${cls('cta')} ${year ? cls('ctaTopTier') : ''}`}
            onClick={() => onPurchase(pkg)}
          >
            {ordering ? '处理中…' : pkg.buttonText || '立即开通'}
          </button>
          <p className={cls('exclusiveNote')}>专属价格，仅限购买一次</p>
        </div>
      </div>
      <ul className={cls('benefitsCard')}>
        {level?.benefits
          ?.filter((benefit) => benefit.text)
          .map((benefit) => (
            <li key={benefit.text}>
              <Check size={14} />
              {benefit.text}
            </li>
          ))}
      </ul>
    </article>
  );
}

export default function CourseMemberModal({
  onClose,
  courseId,
  touchpointScene,
  user,
  login,
  repository = academyRepository,
}) {
  const state = useAcademyResource('course-member', (options) =>
    repository.memberPackages(options),
  );
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const packages = useMemo(
    () =>
      [...(state.data?.packages || [])].sort(
        (a, b) => (a.packageLevelRank || 0) - (b.packageLevelRank || 0),
      ),
    [state.data?.packages],
  );
  useEffect(() => {
    if (!state.data || window.innerWidth > 768) return;
    const index = packages.findIndex((pkg) => pkg.type === 4);
    if (index < 0) return;
    setActive(index);
    list.current?.children[index]?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [state.data, packages]);
  async function purchase(pkg) {
    if (!user) {
      login?.();
      return;
    }
    setOrdering(true);
    setError('');
    try {
      await repository.checkout({
        courseId,
        packageId: pkg.id,
        kind: 'course-member',
        ...(touchpointScene ? { touchpointScene } : {}),
      });
    } catch (failure) {
      if (alive.current) setError(failure.message || '购买失败，请稍后重试');
    } finally {
      if (alive.current) setOrdering(false);
    }
  }
  return (
    <CourseOverlayPortal>
      <Modal
        className="academy-course-member-modal"
        title={state.data?.display?.title || '课程专属会员'}
        onClose={onClose}
      >
        <div className={cls('root')}>
          <div className={cls('scrollBody')}>
            <div className={cls('content')}>
              {state.data?.promotion &&
                Date.now() >= state.data.promotion.startTime &&
                Date.now() < state.data.promotion.endTime && (
                  <div className={cls('activityBanner')}>
                    <div
                      className="academy-course-promotion"
                      style={{
                        backgroundImage: `url(${state.data.promotion.bgUrl})`,
                        '--activity-banner-width': `${state.data.promotion.bgImageWidth}px`,
                        '--activity-banner-height': `${state.data.promotion.bgImageHeight}px`,
                      }}
                    >
                      <div>
                        <h3>{state.data.promotion.title}</h3>
                        <p>{state.data.promotion.subtitle}</p>
                      </div>
                    </div>
                  </div>
                )}
              <header className={cls('header')}>
                <h2 className={cls('title')}>{state.data?.display?.title || '课程专属会员'}</h2>
                <p className={cls('subtitle')}>{state.data?.display?.subtitle}</p>
              </header>
              {state.loading && (
                <p className={cls('state')} role="status">
                  加载中…
                </p>
              )}
              {state.error && (
                <div className={cls('state')}>
                  <p>会员套餐加载失败，请稍后重试</p>
                  <button onClick={state.reload}>重试</button>
                </div>
              )}
              {!state.loading && !state.error && !packages.length && (
                <p className={cls('state')}>暂无可购套餐</p>
              )}
              {error && (
                <p className="academy-course-member-error" role="alert">
                  {error}
                </p>
              )}
              <div
                ref={list}
                className={cls('cardList')}
                onScroll={() => {
                  const host = list.current;
                  if (!host) return;
                  const center = host.getBoundingClientRect().left + host.clientWidth / 2;
                  const distances = [...host.children].map((card) =>
                    Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - center),
                  );
                  setActive(distances.indexOf(Math.min(...distances)));
                }}
              >
                {packages.map((pkg) => (
                  <PlanCard
                    key={pkg.id}
                    pkg={pkg}
                    costs={state.data.estimateCosts}
                    level={state.data.membershipLevels?.find((level) =>
                      level.level?.includes(pkg.id),
                    )}
                    ordering={ordering}
                    onPurchase={purchase}
                  />
                ))}
              </div>
              <div className={cls('indicator')}>
                {packages.map((pkg, index) => (
                  <button
                    key={pkg.id}
                    aria-label={pkg.name}
                    className={`${cls('indicatorDot')} ${index === active ? cls('indicatorDotActive') : ''}`}
                    onClick={() =>
                      list.current?.children[index]?.scrollIntoView?.({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center',
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </div>
          <div className={cls('bottomFade')} />
        </div>
      </Modal>
    </CourseOverlayPortal>
  );
}
