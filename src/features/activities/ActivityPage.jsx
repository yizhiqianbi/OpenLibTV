import { withSecondaryData, routeParts } from '../shared/secondary/SecondaryContent.jsx';
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Gift, CircleCheck } from 'lucide-react';
import { PageBack } from '../shared/secondary/SecondaryLayout.jsx';
import Markdown from '../shared/secondary/Markdown.jsx';
import Registration from './components/RegistrationModal.jsx';
import { GalleryCard } from '../../components/Gallery.jsx';
import { readStoredString, writeStoredValue } from '../../services/storage.ts';

function ActivityDetail({ id, data, asset, navigate, login, user, toast, registrationSource }) {
  const item = data.activities.find((a) => String(a.activityId) === id),
    [expanded, setExpanded] = useState(false),
    [register, setRegister] = useState(false),
    [registered, setRegistered] = useState(
      () => !!readStoredString(`libtv-activity-registration-${id}`, null),
    );
  useEffect(() => {
    setExpanded(false);
    setRegister(false);
    setRegistered(!!readStoredString(`libtv-activity-registration-${id}`, null));
  }, [id]);
  const collapse = item?.status >= 4,
    date = (n) => {
      const d = new Date(n);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    },
    days = Math.max(0, Math.round(((item?.endAt || 0) - Date.now()) / 86400000));
  const status =
    item?.status === 2
      ? `预计${days > 0 ? days + '天后' : '今天'}结束`
      : { 1: '预报名', 3: '评审中', 4: '已颁奖', 5: '已结束' }[item?.status];
  return (
    <div className="secondary-page activity-detail">
      <PageBack name="挑战赛" navigate={navigate} to="/activity" />
      {item ? (
        <>
          <div className="activity-detail-heading">
            <div>
              <h1>{item.name}</h1>
              <div className="activity-detail-actions">
                <button onClick={() => (user ? navigate('/canvas') : login())}>去创作</button>
                {item.enableDisplayEntry !== false && (
                  <button
                    disabled={registered || item.status >= 3}
                    onClick={() => (user ? setRegister(true) : login())}
                  >
                    {registered ? '已报名' : item.status >= 3 ? status : '立即报名'}
                  </button>
                )}
              </div>
            </div>
            <p>
              <span className={item.status === 2 ? 'active' : ''}>
                {item.status === 2 ? (
                  <CircleCheck size={14} />
                ) : item.status === 4 ? (
                  <Gift size={14} />
                ) : null}
                {status}
              </span>
              <small>
                活动时间：{date(item.startAt)} - {date(item.endAt)}
              </small>
            </p>
          </div>
          <div className={`activity-description ${collapse && !expanded ? 'collapsed' : ''}`}>
            <div>
              <Markdown content={item.description} asset={asset} />
            </div>
            {collapse && (
              <>
                <div className="activity-description-fade" />
                <button className="activity-expand" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? '收起' : '展开全部'}
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </>
            )}
          </div>
          {item.status === 4 && (
            <section className="activity-awards">
              <h2>获奖作品</h2>
              <p>
                <Gift size={16} />
                {item.rewardDescription}
              </p>
              {item.awardWorks?.length > 0 ? (
                <div>
                  {item.awardWorks.map((work, i) => (
                    <GalleryCard
                      item={work}
                      navigate={navigate}
                      login={login}
                      key={work.templateUuid || i}
                    />
                  ))}
                </div>
              ) : (
                <p className="secondary-empty">暂无获奖作品</p>
              )}
            </section>
          )}
          {register && (
            <Registration
              item={item}
              user={user}
              onSubmit={registrationSource?.submit}
              onClose={() => setRegister(false)}
              onSuccess={(form) => {
                try {
                  writeStoredValue(`libtv-activity-registration-${id}`, form);
                  setRegister(false);
                  setRegistered(true);
                  toast?.('报名信息已保存到本地演示');
                } catch {
                  toast?.('本地保存失败，请检查浏览器存储空间');
                }
              }}
            />
          )}
        </>
      ) : (
        <p className="secondary-empty">活动不存在</p>
      )}
    </div>
  );
}

const ActivityPage = withSecondaryData(ActivityDetail, (props) => ({
  id: props.id ?? routeParts(props.path)[2],
}));
export default ActivityPage;
