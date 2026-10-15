import { outlineLeaves } from './model.js';

export const COURSE_MEMBER_REFRESH_EVENT = 'libtv_refresh_member_power';
export const marketingScenes = {
  firstClipDone: 'first_video_complete',
  progressHalf: 'chapter_half_progress',
};
const fraction = (value) => (Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.5);

export function resolveMarketingPopup(touch, courseId) {
  if (!touch?.enabled || (touch.courseUuids?.length && !touch.courseUuids.includes(courseId)))
    return null;
  const popup = touch.popup;
  return popup && (popup.title || popup.imgUrl || popup.content) ? popup : null;
}
export function resolveClipMinuteSec(touch, courseId, sectionId) {
  if (!touch?.enabled || !touch.text || !sectionId) return undefined;
  const clip = touch.courses
    ?.find((entry) => entry.courseUuid === courseId)
    ?.clips?.find((entry) => entry.clipUuid === sectionId);
  const minutes = clip?.minute ?? touch.defaultMinute;
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : undefined;
}
export const resolveDailyPopupLimit = (config) =>
  Number.isFinite(config?.dailyPopupLimit) && config.dailyPopupLimit > 0
    ? config.dailyPopupLimit
    : 2;
export const resolveFollowupGate = ({ marketingOpen, marketingTookOver, holding }) =>
  marketingOpen || marketingTookOver ? 'deny' : holding ? 'hold' : 'allow';
export function completionMarketingCandidates(config, course, completedSection) {
  const entries = [];
  const half = resolveMarketingPopup(config?.progressHalf, course.courseId);
  if (
    half &&
    course.clipTotal > 0 &&
    course.clipDone / course.clipTotal >= fraction(config.progressHalf.threshold)
  )
    entries.push({ touch: 'progressHalf', content: half });
  const first = resolveMarketingPopup(config?.firstClipDone, course.courseId);
  if (first && completedSection === outlineLeaves(course.units)[0]?.sectionId)
    entries.push({ touch: 'firstClipDone', content: first });
  return entries;
}
export function marketingDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
