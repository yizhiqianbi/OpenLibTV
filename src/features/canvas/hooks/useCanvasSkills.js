import { useEffect, useRef, useState } from 'react';
import { useContent } from '../../../hooks/useContent.ts';
import { useLocalState, useStoredState } from '../../../hooks/useLocalState.ts';
import { skillReferenceId } from '../../../services/agent-handoff.js';
import { LOCAL_SKILLS_KEY, validateLocalSkills } from '../../../services/local-skills.js';
import {
  isSkillUsable,
  pickerCatalogue,
  resolveSkillDetail,
  toggleSkillFavorite,
} from '../../../services/skill-presentation.js';

/** The Canvas owns insertion; catalogue UI remains shared with the Skills page. */
export function useCanvasSkills({
  inputRef,
  user,
  login,
  toast,
  readOnly,
  onCreateWithAgent,
  onOpen,
}) {
  const catalogue = useContent('skills', null);
  const recommended = useContent('skills-recommended', null);
  const details = useContent('skill-details', {});
  const local = useStoredState(LOCAL_SKILLS_KEY, []);
  const [favorites, setFavorites] = useLocalState('libtv-skill-favorites', []);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const [detail, setDetail] = useState(null);
  const root = useRef();
  const trigger = useRef();
  const focusTimer = useRef();
  let drafts = [],
    mineError = local.error;
  try {
    drafts = validateLocalSkills(local.value).filter(
      (item) => !item.localDeletedAt && isSkillUsable(item),
    );
  } catch (error) {
    mineError = error;
  }
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  useEffect(() => {
    if (readOnly) {
      setOpen(false);
      setAll(false);
      setDetail(null);
    }
  }, [readOnly]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('wheel', closeOutside, { passive: true });
    document.addEventListener('scroll', closeOutside, true);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('wheel', closeOutside);
      document.removeEventListener('scroll', closeOutside, true);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);
  const openPicker = () => {
    if (readOnly) return;
    onOpen?.();
    setOpen(true);
  };
  const select = (item) => {
    if (readOnly) return false;
    if (!isSkillUsable(item)) {
      toast?.('该 Skill 尚未审核通过，暂不可使用');
      return false;
    }
    if (!inputRef.current?.insertReference) return false;
    inputRef.current.insertReference({
      type: 'skill',
      id: skillReferenceId(item),
      name: item.name || item.skillKey,
      ...(item.localDemo ? { draft: true } : {}),
    });
    setOpen(false);
    setAll(false);
    setDetail(null);
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => inputRef.current?.focus(), 0);
    return true;
  };
  const favorite = (item) => {
    if (!user) return login?.();
    if (!setFavorites((previous) => toggleSkillFavorite(item, previous)))
      toast?.('本地保存失败，请检查浏览器存储空间');
  };
  const showDetail = (item) => {
    if (open) trigger.current?.focus();
    setOpen(false);
    setDetail(item);
  };
  const showAll = () => {
    if (readOnly) return;
    trigger.current?.focus();
    setOpen(false);
    setAll(true);
  };
  const create = (action) => {
    if (readOnly) return;
    if (!user) return login?.();
    if (action === 'custom') {
      const tab = window.open('/skill/create', '_blank');
      if (!tab) {
        toast?.('请允许打开新标签页后重试');
        return;
      }
    } else if (!onCreateWithAgent?.({ hasSkill: drafts.length > 0 })) return;
    setOpen(false);
  };
  const resources = [catalogue, recommended];
  return {
    root,
    trigger,
    open,
    setOpen,
    openPicker,
    all,
    setAll,
    detail,
    setDetail,
    catalogue: pickerCatalogue(catalogue.data?.items, recommended.data),
    recommended: recommended.data,
    commonIds: catalogue.data?.commonSkillTemplateUuids,
    drafts,
    mineError,
    favorites,
    loading: resources.some((resource) => resource.loading && !resource.data),
    error: resources.find((resource) => resource.error)?.error || null,
    retry: () => void Promise.allSettled(resources.map((resource) => resource.reload())),
    visibleDetail: detail && resolveSkillDetail(detail, details.data),
    detailLoading: details.loading && !detail?.localDemo,
    detailError: !detail?.localDemo && details.error,
    retryDetail: () => void details.reload().catch(() => undefined),
    select,
    favorite,
    showDetail,
    showAll,
    create,
  };
}
