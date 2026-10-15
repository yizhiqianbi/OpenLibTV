import { forwardRef, useImperativeHandle } from 'react';
import { Sparkles } from 'lucide-react';
import SkillPicker from '../../../components/skills/SkillPicker.jsx';
import SkillLibraryModal from '../../../components/skills/SkillLibraryModal.jsx';
import SkillDetailModal from '../../../components/skills/SkillDetailModal.jsx';
import { isSkillFavorite } from '../../../services/skill-presentation.js';
import { useCanvasSkills } from '../hooks/useCanvasSkills.js';

const CanvasSkillSelector = forwardRef(function CanvasSkillSelector(props, ref) {
  const { user, login, toast, readOnly } = props;
  const controller = useCanvasSkills(props);
  useImperativeHandle(ref, () => ({ open: controller.openPicker }));
  const common = {
    catalogue: controller.catalogue,
    recommended: controller.recommended,
    drafts: controller.drafts,
    favorites: controller.favorites,
    mineError: controller.mineError,
    user,
    login,
    onSelect: controller.select,
    onDetail: controller.showDetail,
    loading: controller.loading,
    error: controller.error,
    onRetry: controller.retry,
  };
  return (
    <div className="cv-agent-skill-selector" ref={controller.root}>
      <button
        ref={controller.trigger}
        type="button"
        title="Skill"
        aria-haspopup="dialog"
        aria-expanded={controller.open || controller.all}
        disabled={readOnly}
        onClick={() => (controller.open ? controller.setOpen(false) : controller.openPicker())}
      >
        <Sparkles size={15} /> Skill
      </button>
      {controller.open && (
        <SkillPicker
          {...common}
          commonIds={controller.commonIds}
          triggerRef={controller.trigger}
          onAll={controller.showAll}
          onCreate={controller.create}
        />
      )}
      {controller.all && (
        <SkillLibraryModal
          {...common}
          onFavorite={controller.favorite}
          onClose={() => controller.setAll(false)}
        />
      )}
      {controller.detail && (
        <SkillDetailModal
          key={controller.detail.skillUuid || controller.detail.templateUuid}
          detail={controller.visibleDetail}
          favorite={isSkillFavorite(controller.visibleDetail, controller.favorites)}
          onFavorite={() => controller.favorite(controller.visibleDetail)}
          onUse={controller.select}
          onClose={() => controller.setDetail(null)}
          toast={toast}
          loading={controller.detailLoading}
          error={controller.detailError}
          onRetry={controller.retryDetail}
        />
      )}
    </div>
  );
});
export default CanvasSkillSelector;
