const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Original source supports the older `dryrun` key without overwriting a valid `dryRun`. */
export function normalizeAgentModeConfig(value) {
  const { dryrun, ...config } = object(value);
  if (typeof config.dryRun !== 'boolean') {
    delete config.dryRun;
    if (typeof dryrun === 'boolean') config.dryRun = dryrun;
  }
  return config;
}

/** Default preference -> session metadata -> current-session override (or unsent draft). */
export function resolveAgentModeConfig({
  preference = true,
  sessionExtra,
  override,
  draft,
  sessionId,
} = {}) {
  const preferenceConfig =
    typeof preference === 'boolean' ? { dryRun: preference } : normalizeAgentModeConfig(preference);
  const base = {
    ...preferenceConfig,
    dryRun: typeof preferenceConfig.dryRun === 'boolean' ? preferenceConfig.dryRun : true,
  };
  if (!sessionId) return { ...base, ...normalizeAgentModeConfig(draft) };
  const extra = object(sessionExtra);
  const stored = {};
  if (typeof extra.dryRunIntent === 'boolean') stored.dryRun = extra.dryRunIntent;
  if (typeof extra.scriptModel === 'string' && extra.scriptModel.trim())
    stored.scriptModel = extra.scriptModel.trim();
  return { ...base, ...stored, ...normalizeAgentModeConfig(override) };
}

/** Session metadata is independent of the ordered prompt parts and inline model references. */
export function buildAgentModeMetadata(config) {
  const normalized = normalizeAgentModeConfig(config);
  const metadata = {
    dryRunIntent: typeof normalized.dryRun === 'boolean' ? normalized.dryRun : true,
  };
  if (typeof normalized.scriptModel === 'string' && normalized.scriptModel.trim())
    metadata.scriptModel = normalized.scriptModel.trim();
  return metadata;
}
