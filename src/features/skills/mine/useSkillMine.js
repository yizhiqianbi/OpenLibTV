import { useState } from 'react';
import { useStoredState } from '../../../hooks/useLocalState.ts';
import { createSkillHandoff, writeSkillHandoff } from '../../../services/agent-handoff.js';
import {
  LOCAL_SKILLS_KEY,
  localSkillId,
  validateLocalSkills,
  resolveSkillMineActionState,
  deleteLocalSkill,
  restoreLocalSkill,
  updateLocalSkill,
  createLocalPublishRequest,
} from './skill-mine-model.js';

export function useSkillMine({
  user,
  login,
  navigate,
  toast,
  isTeamUser = false,
  currentUserId = user?.uuid ?? user?.id ?? null,
}) {
  const stored = useStoredState(LOCAL_SKILLS_KEY, []);
  const [dialog, setDialog] = useState(null);
  let all = [],
    validationError = null;
  try {
    all = validateLocalSkills(stored.value);
  } catch (error) {
    validationError = error;
  }
  const error = stored.error || validationError;
  const authorize = () => {
    if (user) return true;
    login?.();
    return false;
  };
  const state = (item) => resolveSkillMineActionState(item, { isTeamUser, currentUserId });
  const commit = (operation) => {
    try {
      if (error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(error.code))
        throw new Error('Skill 未正确加载，原数据未被覆盖');
      const saved = stored.setValue((previous) => operation(validateLocalSkills(previous)));
      if (!saved) toast?.('本地保存失败，请检查浏览器存储空间');
      return saved;
    } catch (error) {
      toast?.(error.message || '操作失败，请重试');
      return false;
    }
  };
  const checked = (id, action) => {
    const item = all.find((item) => localSkillId(item) === id);
    if (!item || item.localDeletedAt) throw new Error('Skill 已不存在，请重新加载');
    const permissions = state(item);
    if (permissions[action + 'Disabled']) throw new Error(permissions[action + 'Reason']);
    return item;
  };
  const open = (type, item) => {
    if (!authorize()) return;
    try {
      checked(localSkillId(item), type === 'delete' ? 'delete' : 'publish');
      setDialog({ type, id: localSkillId(item) });
    } catch (error) {
      toast?.(error.message);
    }
  };
  const edit = (item) => {
    if (!authorize()) return;
    try {
      checked(localSkillId(item), 'edit');
      navigate?.('/skill/create?skillUuid=' + encodeURIComponent(localSkillId(item)));
    } catch (error) {
      toast?.(error.message);
    }
  };
  const editInChat = (item) => {
    if (!authorize()) return;
    try {
      checked(localSkillId(item), 'edit');
      const payload = createSkillHandoff({
        prompt: '更新我的 Skill',
        // The original editor inserts a reference only when a published key exists.
        skill: item.skillKey?.trim() ? item : undefined,
      });
      const id = writeSkillHandoff(payload);
      const href = `/canvas?forceAgent=1&draftPromptId=${encodeURIComponent(id)}&guideSource=skill&entryItemKey=skill_edit`;
      const tab = window.open(href, '_blank');
      if (!tab) navigate?.(href);
    } catch (error) {
      toast?.(error.message || '创作交接失败，原 Skill 已保留');
    }
  };
  const remove = (id) => {
    if (!authorize()) return false;
    try {
      checked(id, 'delete');
      return commit((all) => deleteLocalSkill(all, id));
    } catch (error) {
      toast?.(error.message);
      return false;
    }
  };
  const restore = (id) => {
    if (!authorize()) return false;
    const item = all.find((item) => localSkillId(item) === id);
    if (!item || state(item).deleteDisabled) {
      toast?.('无权限恢复 Skill');
      return false;
    }
    return commit((all) => restoreLocalSkill(all, id));
  };
  const savePublishRequest = (id, form) => {
    if (!authorize()) return false;
    try {
      checked(id, 'publish');
      return commit((all) =>
        updateLocalSkill(all, id, (item) => ({
          ...item,
          localPublishRequest: createLocalPublishRequest(item, form),
        })),
      );
    } catch (error) {
      toast?.(error.message);
      return false;
    }
  };
  const cancelPublishRequest = (id) => {
    if (!authorize()) return false;
    try {
      checked(id, 'publish');
      return commit((all) =>
        updateLocalSkill(all, id, ({ localPublishRequest: _request, ...item }) => item),
      );
    } catch (error) {
      toast?.(error.message);
      return false;
    }
  };
  return {
    skills: all.filter((item) => !item.localDeletedAt),
    deletedSkills: all.filter((item) => item.localDeletedAt),
    error,
    dialog,
    dialogItem: all.find((item) => localSkillId(item) === dialog?.id),
    closeDialog: () => setDialog(null),
    openPublish: (item) => open('publish', item),
    openDelete: (item) => open('delete', item),
    remove,
    restore,
    savePublishRequest,
    cancelPublishRequest,
    edit,
    editInChat,
    cardActions: (item, { onDetail, onAdd } = {}) => ({
      state: state(item),
      onDetail,
      onAdd,
      onEdit: () => edit(item),
      onEditInChat: () => editInChat(item),
      onPublish: () => open('publish', item),
      onDelete: () => open('delete', item),
    }),
  };
}
