import SkillCard from '../../../components/skills/PublicSkillCard.jsx';
import SkillMineMenu from '../mine/SkillMineMenu.jsx';
import { skillAuditLabel } from '../mine/skill-mine-model.js';
import '../mine/mine.css';

export default function SkillCardWithMine({ mineActions, item, onUse, ...props }) {
  const status = mineActions && (
    <div className="sk-mine-card-status">
      <span
        className={'sk-mine-status sk-mine-status-' + item.auditStatus}
        title={item.auditStatus === 2 ? item.rejectReason : undefined}
      >
        {skillAuditLabel(item)}
      </span>
      {item.localPublishRequest && <span>本地待提交</span>}
    </div>
  );
  const actions = mineActions && (
    <>
      <SkillMineMenu actions={mineActions} />
      <button
        type="button"
        className="white-button"
        onClick={(event) => {
          event.stopPropagation();
          (mineActions.onAdd || onUse)?.();
        }}
      >
        添加
      </button>
    </>
  );
  return <SkillCard {...props} item={item} onUse={onUse} status={status} actions={actions} />;
}
