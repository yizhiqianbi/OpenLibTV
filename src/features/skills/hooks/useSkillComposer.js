import { useState, useRef, useEffect } from 'react';
import { useLocalState } from '../../../hooks/useLocalState.ts';
import {
  agentContentFromJSON,
  agentContentToJSON,
  agentPlainText,
} from '../../../services/agent-content.js';
import { skillReferenceId } from '../../../services/agent-handoff.js';
import { isSkillUsable } from '../../../services/skill-presentation.js';
import { skillCreateCanvasHref } from '../domain/skill-picker.js';
import { createSkillHandoff, writeSkillHandoff } from '../domain/handoff.js';
import { useSkillAgentAttachments } from './useSkillAgentAttachments.js';
import { pickerAssetReferences, pickerAssetText } from '../../../services/asset-picker/model.ts';
import { canInsertAgentAssets, CHAT_ASSET_MAX_PER_KIND } from '../../../services/agent-assets.ts';

// Owns the live editor identity, query handoff, popovers and attachment lifecycle.
// The page owns catalogue/list and Mine state; the view only renders this controller.
export function useSkillComposer({ search, user, login, navigate, toast }) {
  const initialQuery = useRef(new URLSearchParams(search).toString());
  const [parts, setParts] = useState(() => {
    const query = new URLSearchParams(search);
    const skillKey = query.get('useSkillKey');
    return agentContentFromJSON(
      agentContentToJSON(
        skillKey
          ? createSkillHandoff({
              skill: {
                skillKey,
                namespace: query.get('useSkillNs') || 'libtv-user-generated',
                name: query.get('useSkillName') || skillKey,
              },
            }).parts
          : [{ type: 'text', text: '' }],
      ),
    );
  });
  const prompt = agentPlainText(parts);
  const liveParts = useRef(parts);
  liveParts.current = parts;
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const [assetPicker, setAssetPicker] = useState(false);
  const focusAfterAssetPick = useRef(false);
  const [preview, setPreview] = useState(null);
  const [allSkills, setAllSkills] = useState(false);
  const [dryRun, setDryRun] = useLocalState('libtv-agent-dry-run', true);
  const input = useRef();
  const file = useRef();
  const composer = useRef();
  const skillTrigger = useRef();
  const selectSkill = (i) => {
    if (!isSkillUsable(i)) {
      toast?.('该 Skill 尚未审核通过，暂不可使用');
      return false;
    }
    input.current?.insertReference({
      type: 'skill',
      id: skillReferenceId(i),
      name: i.name || i.skillKey,
      ...(i.localDemo ? { draft: true } : {}),
    });
    setMenu(null);
    setAllSkills(false);
    setTimeout(() => input.current?.focus(), 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  };
  const createSkill = (action) => {
    if (!user) return login();
    const href = action === 'custom' ? '/skill/create' : skillCreateCanvasHref(crypto.randomUUID());
    const opened = window.open(href, '_blank');
    if (!opened) toast?.('请允许打开新标签页后重试');
    else setMenu(null);
  };
  const send = () => {
    if (!user) return login();
    try {
      const handoff = createSkillHandoff({
        parts,
        dryRunIntent: dryRun,
      });
      const id = writeSkillHandoff(handoff);
      const query = new URLSearchParams({ forceAgent: '1', draftPromptId: id, prompt });
      navigate('/canvas?' + query.toString());
    } catch {
      toast?.('创作内容保存失败，附件过大或本机存储空间不足，请移除附件后重试');
    }
  };
  const { attached, uploadAttachment, uploadFiles, addAttachments, removeAttachment } =
    useSkillAgentAttachments({ parts, input, user, login, toast });
  const pickAssets = (items) => {
    if (!user) {
      login?.();
      return false;
    }
    if (!input.current?.getEditor()) return false;
    const references = pickerAssetReferences(items);
    if (!canInsertAgentAssets(references)) {
      toast?.(`单次最多各选 ${CHAT_ASSET_MAX_PER_KIND} 个图片 / 视频 / 音频`);
      return false;
    }
    if (references.length) {
      if (!addAttachments(references, false)) return false;
    } else {
      const text = pickerAssetText(items);
      if (!text) {
        toast?.('素材内容不可用');
        return false;
      }
      input.current.insertPlainText(text);
    }
    focusAfterAssetPick.current = true;
    setAssetPicker(false);
    return true;
  };
  useEffect(() => {
    if (!assetPicker && focusAfterAssetPick.current) {
      focusAfterAssetPick.current = false;
      input.current?.focus();
    }
  }, [assetPicker]);
  useEffect(() => {
    const query = new URLSearchParams(search);
    const skillKey = query.get('useSkillKey');
    if (!skillKey) {
      initialQuery.current = '';
      return;
    }
    if (initialQuery.current !== query.toString()) {
      input.current?.insertReference({
        type: 'skill',
        id: skillReferenceId({
          skillKey,
          namespace: query.get('useSkillNs') || 'libtv-user-generated',
        }),
        name: query.get('useSkillName') || skillKey,
      });
    }
    initialQuery.current = query.toString();
    ['useSkillKey', 'useSkillNs', 'useSkillName'].forEach((key) => query.delete(key));
    navigate('/skill' + (query.size ? '?' + query.toString() : '') + location.hash, {
      replace: true,
    });
  }, [search, navigate]);
  useEffect(() => {
    const close = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setMenu(null);
      if (menuRef.current === 'skill') skillTrigger.current?.focus();
    };
    const outside = (e) => {
      if (!composer.current?.contains(e.target)) setMenu(null);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('wheel', outside, { passive: true });
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('wheel', outside);
    };
  }, []);
  return {
    parts,
    setParts,
    prompt,
    liveParts,
    input,
    file,
    composer,
    skillTrigger,
    menu,
    setMenu,
    assetPicker,
    setAssetPicker,
    preview,
    setPreview,
    allSkills,
    setAllSkills,
    dryRun,
    setDryRun,
    attached,
    uploadAttachment,
    uploadFiles,
    addAttachments,
    pickAssets,
    removeAttachment,
    selectSkill,
    createSkill,
    send,
  };
}
