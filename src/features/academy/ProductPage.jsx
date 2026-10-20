import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { asset as defaultAsset } from '../../data.js';
import CoursePlayer from './player/CoursePlayer.jsx';
import { academyRepository } from './course/repository.js';
import { useAcademyResource } from './course/useAcademyResource.js';
import { productAction } from './course/model.js';
import { AcademyState } from './course/AcademyState.jsx';
import { timeLabel } from '../shared/secondary/media.js';
import './course/course.css';

const price = (cents) => (cents / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
export default function ProductPage({
  path,
  skuCode: suppliedSku,
  navigate,
  asset = defaultAsset,
  user,
  login,
  repository = academyRepository,
}) {
  const sku = suppliedSku || path?.split('/')[3] || '';
  const info = useAcademyResource(`${sku}:${user?.id || user?.uuid || 'guest'}`, (options) =>
    repository.product(sku, options),
  );
  const intro = useAcademyResource(
    info.data?.courseId ? `${sku}:${info.data.courseId}` : '',
    (options) => repository.intro(info.data.courseId, options),
  );
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const description = useRef(null);
  const infoFailed = !info.loading && !info.data;
  const introFailed = infoFailed || intro.error || (!intro.loading && info.data && !intro.data);
  const failureText =
    intro.error?.code === 60001
      ? '课程不存在'
      : intro.error?.code === 60002
        ? '课程已下架'
        : '内容加载失败，请刷新重试';
  const retryProduct = () => {
    if (infoFailed) info.reload();
    else intro.reload();
  };
  const action = info.data ? productAction(user, info.data) : null;
  useLayoutEffect(() => {
    const element = description.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [intro.data, expanded]);
  async function buy() {
    if (action.action === 'learn') {
      navigate(`/academy/course/${info.data.courseId}`);
      return;
    }
    if (action.action === 'login') {
      login?.();
      return;
    }
    setCheckout(true);
    setCheckoutError('');
    try {
      await repository.checkout({ skuCode: sku, kind: 'course' });
    } catch (error) {
      setCheckoutError(error.message || '购买失败，请稍后重试');
    }
  }
  const benefits = info.data
    ? [
        `${info.data.clipTotal} 节 ${info.data.title}`,
        `${info.data.creditsGrant} 分专属练习积分`,
        ...(info.data.materialPkgCount > 0
          ? [`${info.data.materialPkgCount} 份课程素材大礼包`]
          : []),
        info.data.validDays === 0 ? '课程永久有效' : `课程有效期 ${info.data.validDays} 天`,
      ]
    : [];
  const button = action && (
    <button
      className="academy-product-buy"
      disabled={introFailed && action.action !== 'learn'}
      onClick={buy}
    >
      {action.label}
    </button>
  );
  return (
    <div className="academy-product-page">
      <header className="academy-product-mobile-header">
        <button aria-label="返回" onClick={() => navigate('/academy')}>
          <ArrowLeft size={18} />
        </button>
        <strong>学院</strong>
      </header>
      <button className="academy-product-back" onClick={() => navigate('/academy')}>
        <ArrowLeft size={14} />
        返回
      </button>
      <div className="academy-product-columns">
        <main>
          {introFailed ? (
            <AcademyState retry={retryProduct}>{failureText}</AcademyState>
          ) : !intro.data ? (
            <div className="academy-product-skeleton" role="status" aria-label="内容加载中">
              <div className="academy-course-shimmer" />
              <i className="academy-course-shimmer" />
              <i className="academy-course-shimmer" />
            </div>
          ) : (
            <>
              <div className="academy-product-cover">
                {intro.data.introVideoUrl ? (
                  <CoursePlayer
                    item={{ videoUrl: intro.data.introVideoUrl, cover: intro.data.cover }}
                    asset={asset}
                    showFollowup={false}
                  />
                ) : (
                  <img src={asset(intro.data.cover)} alt={intro.data.title} />
                )}
              </div>
              <h1>{intro.data.title}</h1>
              {info.data && (
                <div className="academy-product-mobile-price">
                  <strong>¥{price(info.data.priceCurrent)}</strong>
                  {info.data.priceOriginal !== info.data.priceCurrent && (
                    <s>¥{price(info.data.priceOriginal)}</s>
                  )}
                </div>
              )}
              <p
                ref={description}
                className={`academy-product-intro ${expanded ? '' : 'collapsed'}`}
              >
                {intro.data.intro}
              </p>
              {(overflow || expanded) && (
                <button
                  className="academy-product-expand"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? '收起' : '展开'}
                  <ChevronDown size={12} />
                </button>
              )}
              <div className="academy-product-tags">
                {intro.data.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <ul className="academy-product-mobile-benefits">
                {benefits.map((benefit) => (
                  <li key={benefit}>
                    <Check size={13} />
                    {benefit}
                  </li>
                ))}
              </ul>
              <h2>课程大纲</h2>
              <ol className="academy-product-outline">
                {intro.data.outline.map((leaf, index) => (
                  <li key={`${leaf.displayNo}-${index}`}>
                    <small>课程{leaf.displayNo}</small>
                    <span>{leaf.title}</span>
                    <time>{timeLabel(leaf.durationSec)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </main>
        <aside>
          {infoFailed ? (
            <AcademyState retry={() => info.reload()}>课程信息加载失败，请刷新重试</AcademyState>
          ) : !info.data ? (
            <div className="academy-course-shimmer academy-product-card-skeleton" />
          ) : (
            <div className="academy-product-card">
              <p>创作者入门计划</p>
              <div>
                <h1>{info.data.title}</h1>
                <div className="academy-product-price">
                  <strong>¥{price(info.data.priceCurrent)}</strong>
                  {info.data.priceOriginal !== info.data.priceCurrent && (
                    <s>¥{price(info.data.priceOriginal)}</s>
                  )}
                </div>
                <p>
                  适合想开始创作的你
                  <br />
                  内容创作者 / 设计师 / 影视爱好者
                  <br />
                  以及每一个脑海里有故事的人
                </p>
                <hr />
                <h3>购买后，你将获得</h3>
                <ul>
                  {benefits.map((benefit) => (
                    <li key={benefit}>
                      <Check size={13} />
                      {benefit}
                    </li>
                  ))}
                </ul>
                {button}
              </div>
            </div>
          )}
        </aside>
      </div>
      {button && <footer className="academy-product-mobile-cta">{button}</footer>}
      {checkout && (
        <Modal
          title="购买课程"
          className="academy-course-checkout"
          onClose={() => setCheckout(false)}
        >
          <h2>购买课程</h2>
          <p role={checkoutError ? 'alert' : 'status'}>{checkoutError || '加载中…'}</p>
          <button onClick={() => setCheckout(false)}>知道了</button>
        </Modal>
      )}
    </div>
  );
}
