export type VoiceTab = 'library' | 'my' | 'favorite';
export interface VoiceMeta {
  voiceId: string;
  name: string;
  language?: string;
  accent?: string;
  gender?: string;
  voiceUrl?: string;
}
export interface VoiceRecord extends VoiceMeta {
  id?: string | number;
  description?: string;
  ageGroup?: string | string[];
  isFavorited?: boolean;
  isSystem?: boolean;
}
export interface VoiceFilters {
  language: string;
  accent: string;
  gender: string;
  ageGroup: string[];
}
export interface VoiceOption {
  value: string;
  label: string;
}
export interface VoiceFilterOptions {
  languages: readonly VoiceOption[];
  accents: Readonly<Record<string, readonly VoiceOption[]>>;
  genders: readonly VoiceOption[];
  ageGroups: readonly VoiceOption[];
}
export interface VoiceRequest {
  tab: VoiceTab;
  page: number;
  pageSize: number;
  query?: string;
  language?: string;
  accent?: string;
  gender?: string;
  ageGroup?: string[];
  isSystem?: false;
}
export interface VoicePage {
  list: VoiceRecord[];
  total: number;
}
export const emptyVoiceFilters = (): VoiceFilters => ({
  language: '',
  accent: '',
  gender: '',
  ageGroup: [],
});
export const emptyVoiceOptions: VoiceFilterOptions = {
  languages: [],
  accents: {},
  genders: [],
  ageGroups: [],
};
export function voiceMetadata(voice: VoiceMeta): VoiceMeta {
  return {
    voiceId: voice.voiceId,
    name: voice.name,
    language: voice.language,
    accent: voice.accent,
    gender: voice.gender,
    voiceUrl: voice.voiceUrl,
  };
}
export function currentVoice(value?: string, meta?: VoiceMeta | null): VoiceMeta | undefined {
  return meta && meta.voiceId === value
    ? meta
    : value
      ? { voiceId: value, name: value }
      : undefined;
}
export function voiceSelectionPatch(
  property: { originalField?: string },
  voice: VoiceMeta,
): Record<string, string | VoiceMeta> {
  if (!voice.voiceId || !voice.name) throw new Error('音色信息不完整');
  const key = property.originalField || 'voice_setting_voice_id';
  return { [key]: voice.voiceId, [`_${key}_meta`]: voiceMetadata(voice) };
}
export function voiceRequest(
  tab: VoiceTab,
  filters: VoiceFilters,
  query: string,
  page: number,
  pageSize: number,
): VoiceRequest {
  return {
    tab,
    page,
    pageSize,
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(filters.language ? { language: filters.language } : {}),
    ...(filters.accent ? { accent: filters.accent } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.ageGroup.length ? { ageGroup: [...filters.ageGroup] } : {}),
    ...(tab === 'my' ? { isSystem: false as const } : {}),
  };
}
export function validateVoicePage(value: VoicePage): VoicePage {
  if (
    !value ||
    !Array.isArray(value.list) ||
    !Number.isInteger(value.total) ||
    value.total < 0 ||
    value.list.some(
      (v) => !v || typeof v.voiceId !== 'string' || !v.voiceId || typeof v.name !== 'string',
    )
  )
    throw new Error('音色列表数据格式错误');
  return { total: value.total, list: [...new Map(value.list.map((v) => [v.voiceId, v])).values()] };
}
export function voiceLabel(
  kind: 'language' | 'accent' | 'gender' | 'age',
  value: string | undefined,
  options: VoiceFilterOptions,
): string {
  if (!value) return '';
  const entries =
    kind === 'language'
      ? options.languages
      : kind === 'accent'
        ? Object.values(options.accents).flat()
        : kind === 'gender'
          ? options.genders
          : options.ageGroups;
  return entries.find((option) => option.value === value)?.label ?? value;
}
export function voiceFilterChips(filters: VoiceFilters, options: VoiceFilterOptions) {
  const chips: { key: string; label: string }[] = [];
  if (filters.language)
    chips.push({
      key: 'language',
      label: `语言: ${voiceLabel('language', filters.language, options)}`,
    });
  if (filters.accent)
    chips.push({ key: 'accent', label: `口音: ${voiceLabel('accent', filters.accent, options)}` });
  if (filters.gender)
    chips.push({ key: 'gender', label: `性别: ${voiceLabel('gender', filters.gender, options)}` });
  filters.ageGroup.forEach((age) =>
    chips.push({ key: `age:${age}`, label: `年龄: ${voiceLabel('age', age, options)}` }),
  );
  return chips;
}
export function removeVoiceFilter(filters: VoiceFilters, key: string): VoiceFilters {
  if (key === 'language') return { ...filters, language: '', accent: '' };
  if (key === 'accent' || key === 'gender') return { ...filters, [key]: '' };
  return { ...filters, ageGroup: filters.ageGroup.filter((age) => `age:${age}` !== key) };
}
export function countVoiceFilters(filters: VoiceFilters) {
  return (
    Number(Boolean(filters.language)) +
    Number(Boolean(filters.accent)) +
    Number(Boolean(filters.gender)) +
    Number(filters.ageGroup.length > 0)
  );
}
/** Local sample matching may compare a public default's display label; metadata is never rewritten. */
export function filterSampleVoices(
  records: readonly VoiceRecord[],
  request: VoiceRequest,
  options: VoiceFilterOptions,
) {
  const languageLabels = [
    request.language,
    ...(options.accents[request.language || ''] || []).map((o) => o.label),
  ];
  const accentLabel = Object.values(options.accents)
    .flat()
    .find((o) => o.value === request.accent)?.label;
  return records.filter(
    (v) =>
      (!request.query ||
        `${v.name} ${v.description || ''} ${v.voiceId}`
          .toLocaleLowerCase()
          .includes(request.query.toLocaleLowerCase())) &&
      (!request.language || languageLabels.includes(v.language)) &&
      (!request.accent || v.accent === request.accent || v.language === accentLabel) &&
      (!request.gender || v.gender === request.gender) &&
      (!request.ageGroup?.length ||
        request.ageGroup.some((age) =>
          Array.isArray(v.ageGroup) ? v.ageGroup.includes(age) : v.ageGroup === age,
        )),
  );
}
