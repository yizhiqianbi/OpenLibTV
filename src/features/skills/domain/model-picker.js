export function resolveModelDisable(disable, lang = 'zh') {
  const trim = (value) => (typeof value === 'string' ? value.trim() : '');
  const disabled =
    disable === true ||
    Boolean(trim(disable)) ||
    Boolean(
      disable &&
      typeof disable === 'object' &&
      !Array.isArray(disable) &&
      Object.keys(disable).length,
    );
  const reason =
    trim(disable) ||
    (disabled && typeof disable === 'object' ? trim(disable[lang]) || trim(disable.en) : '');
  return { disabled, reason };
}

export function groupChatModels(support, allowlist) {
  const allowed = allowlist ? new Set(allowlist) : null;
  return Object.fromEntries(
    ['image', 'video'].map((modality) => {
      const seen = new Set();
      const models = (Array.isArray(support?.[modality]) ? support[modality] : []).filter(
        (model) => {
          const key = model.modelKey?.trim();
          if (!key || seen.has(key) || (allowed && !allowed.has(key))) return false;
          seen.add(key);
          return true;
        },
      );
      return [modality, models];
    }),
  );
}
