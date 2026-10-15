const clean = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
export const AGENT_TOOLBAR_MODALITIES = ['image', 'video'];

export function resolveToolbarModelDisable(value, language = 'zh') {
  if (value === true) return { disabled: true };
  const reason = clean(value);
  if (reason) return { disabled: true, reason };
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
    const translated = clean(value[language]) || clean(value.en);
    return translated ? { disabled: true, reason: translated } : { disabled: true };
  }
  return { disabled: false };
}

export function getAgentToolbarModels(models, allowlist) {
  const allowed =
    allowlist === undefined
      ? null
      : new Set(Array.isArray(allowlist) ? allowlist.filter(clean) : []);
  return Object.fromEntries(
    AGENT_TOOLBAR_MODALITIES.map((modality) => {
      const seen = new Set();
      const rows = [];
      for (const value of Array.isArray(models?.[modality]) ? models[modality] : []) {
        const modelKey = clean(value?.modelKey);
        if (!modelKey || seen.has(modelKey) || (allowed && !allowed.has(modelKey))) continue;
        seen.add(modelKey);
        rows.push({
          modelKey,
          modelName: clean(value.modelName) || modelKey,
          description: clean(value.description),
          icon: clean(value.icon),
          disable: value.disable,
          vip: value.vip === true,
        });
      }
      return [modality, rows];
    }),
  );
}

const parse = (value) => {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
function benefitLabel(record, extra = '') {
  const unit = clean(parse(record.showContent).unit) || '次';
  switch (record.benefitType) {
    case 'powerZero':
      return `${extra}免积分`;
    case 'powerFixed':
      return `${extra}限时 ${record.benefitValue} 积分/${unit}`;
    case 'powerDiscount':
    case 'powerDiscountTimes':
      return `${extra}限时${record.benefitValue % 10 === 0 ? record.benefitValue / 10 : record.benefitValue}折`;
    case 'freeTimes':
    case 'freeRunTimes':
      return `${extra}限免${record.freeTimes?.totalTimes - (record.freeTimes?.usedTimes ?? 0)}条`;
    default:
      return `未知权益:${record.benefitType}`;
  }
}
const benefitBadge = (record, extra) => {
  const show = parse(record.showContent);
  return {
    label: benefitLabel(record, extra),
    badgeTooltip: clean(
      (show.libtv && typeof show.libtv === 'object' ? show.libtv : show).badgeTooltip,
    ),
  };
};

/** First matching real benefit wins. VIP decoration alone grants or denies no capability. */
export function getAgentToolbarBenefits(keys, benefits = []) {
  const requested = new Set(keys);
  const result = new Map();
  const records = Array.isArray(benefits)
    ? benefits.filter((value) => value && typeof value === 'object')
    : [];
  for (const record of records) {
    const params = parse(record.targetParams);
    if (requested.has(params.modelKey) && !result.has(params.modelKey)) {
      result.set(params.modelKey, benefitBadge(record, params.extraLabel ?? undefined));
      continue;
    }
    const target = String(record.targetKey);
    if (requested.has(target) && !result.has(target))
      result.set(target, benefitBadge(record, params.extraLabel ?? undefined));
  }
  const aliases = {
    'star_2.0_720p_no_video': 'star-video2',
    'star_2.0_fast_720p_no_video': 'star-video2-fast',
  };
  for (const record of records) {
    const target = aliases[record.targetKey];
    if (requested.has(target) && !result.has(target))
      result.set(target, benefitBadge(record, '720P'));
  }
  return result;
}

export function chatModelPickReference(pick) {
  const id = clean(pick?.modelKey);
  if (!id || !AGENT_TOOLBAR_MODALITIES.includes(pick?.modality)) return null;
  return { type: 'model', id, name: clean(pick.label) || id, modality: pick.modality };
}
